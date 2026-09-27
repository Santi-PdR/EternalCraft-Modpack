const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const crypto = require('crypto');

function safeRel(input) {
  const raw = String(input || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw || raw.includes('\0')) return '';
  const normalized = path.posix.normalize(raw);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return '';
  if (normalized === '.launcher' || normalized.startsWith('.launcher/')) return '';
  if (normalized === 'mods' || normalized.startsWith('mods/')) return '';
  return normalized;
}

function normalizePaths(config = {}) {
  const base = ['options.txt', 'servers.dat'];
  if (config.includeScreenshots !== false) base.push('screenshots');
  if (config.includeSaves === true) base.push('saves');
  for (const item of Array.isArray(config.extraPaths) ? config.extraPaths : []) {
    const rel = safeRel(item);
    if (rel) base.push(rel);
  }
  const unique = new Map();
  for (const value of base.map(safeRel).filter(Boolean)) if (!unique.has(value.toLowerCase())) unique.set(value.toLowerCase(), value);
  return [...unique.values()];
}

async function exists(file) { try { await fsp.access(file); return true; } catch (_) { return false; } }
async function statSafe(file) { try { return await fsp.stat(file); } catch (_) { return null; } }

async function hashFile(file) {
  const h = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => h.update(chunk));
    stream.on('end', resolve);
  });
  return h.digest('hex');
}

async function walk(root, rel = '') {
  const full = path.join(root, rel);
  const st = await fsp.lstat(full).catch(() => null); if (!st || st.isSymbolicLink()) return [];
  if (st.isFile()) return [{ rel: rel.replace(/\\/g, '/'), size: st.size, mtimeMs: st.mtimeMs, sha256: await hashFile(full) }];
  if (!st.isDirectory()) return [];
  const out = [];
  for (const entry of await fsp.readdir(full, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) out.push(...await walk(root, child));
    else if (entry.isFile()) { const file=path.join(root,child); const s=await fsp.lstat(file).catch(()=>null); if(s?.isFile()&&!s.isSymbolicLink())out.push({rel:child.replace(/\\/g,'/'),size:s.size,mtimeMs:s.mtimeMs,sha256:await hashFile(file)}); }
  }
  return out;
}

function isInside(base,candidate){const relative=path.relative(path.resolve(base),path.resolve(candidate));return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
async function copyTree(source, target, excluded = [], safeDestinationRoot = '', relativePath = '') {
  if (excluded.some((dir)=>isInside(dir,source))) return { files:0, bytes:0 };
  if (safeDestinationRoot && relativePath) await assertSafeDestination(safeDestinationRoot,relativePath);
  const st = await fsp.lstat(source).catch(()=>null); if (!st || st.isSymbolicLink()) return { files:0, bytes:0 };
  if (st.isFile()) { await fsp.mkdir(path.dirname(target), {recursive:true}); await fsp.copyFile(source,target); return {files:1,bytes:st.size}; }
  if (!st.isDirectory()) return {files:0,bytes:0};
  await fsp.mkdir(target,{recursive:true}); let files=0,bytes=0;
  for (const entry of await fsp.readdir(source,{withFileTypes:true})) {
    if(entry.isSymbolicLink())continue;
    const childRel=relativePath?`${relativePath}/${entry.name}`:entry.name;
    const r=await copyTree(path.join(source,entry.name),path.join(target,entry.name),excluded,safeDestinationRoot,childRel); files+=r.files; bytes+=r.bytes;
  }
  return {files,bytes};
}

async function assertSafeDestination(root, relativePath) {
  let current=await fsp.realpath(root);
  const parts=relativePath.split('/');
  for(let index=0;index<parts.length;index++){
    current=path.join(current,parts[index]);
    const stat=await fsp.lstat(current).catch((error)=>error.code==='ENOENT'?null:Promise.reject(error));
    if(!stat)break;
    if(stat.isSymbolicLink())throw new Error(`No se puede restaurar Personal Vault sobre un enlace simbólico: ${relativePath}`);
    if(index<parts.length-1&&!stat.isDirectory())throw new Error(`La ruta de restauración está bloqueada por un archivo: ${relativePath}`);
  }
}

function vaultRoot(vaultDirectory) { return path.join(vaultDirectory, 'EternalCraftVault'); }

async function buildManifest(root, paths) {
  const files=[];
  for(const rel of paths){const safe=safeRel(rel);if(!safe)continue;const target=path.join(root,safe);const st=await statSafe(target);if(!st)continue;if(st.isFile()){files.push({rel:safe,size:st.size,mtimeMs:st.mtimeMs,sha256:await hashFile(target)});}else if(st.isDirectory()){for(const row of await walk(target,'')){files.push({...row,rel:path.posix.join(safe,row.rel)});}}}
  files.sort((a,b)=>a.rel.localeCompare(b.rel)); return files;
}

async function validateVaultFiles(dataRoot, manifest, fallbackPaths = []) {
  const declaredPaths=Array.isArray(manifest.paths)?manifest.paths.map((value)=>{
    const rel=safeRel(value);if(!rel)throw new Error('El manifest de Personal Vault contiene una ruta inválida.');return rel;
  }):fallbackPaths;
  const files=manifest.files;
  if(!Array.isArray(files))throw new Error('El manifest de Personal Vault no contiene una lista de archivos válida.');
  const root=await fsp.realpath(dataRoot); const seen=new Set(); const verified=[];
  for(const entry of files){
    const rel=safeRel(entry?.rel);if(!rel)throw new Error('Personal Vault contiene un nombre de archivo inválido.');
    const key=rel.toLowerCase();if(seen.has(key))throw new Error(`Personal Vault contiene una ruta duplicada: ${rel}.`);seen.add(key);
    if(!declaredPaths.some((base)=>rel===base||rel.startsWith(`${base}/`)))throw new Error(`Personal Vault contiene un archivo fuera de las carpetas seleccionadas: ${rel}.`);
    const size=Number(entry.size);if(!Number.isSafeInteger(size)||size<0||! /^[a-f0-9]{64}$/i.test(String(entry.sha256||'')))throw new Error(`La verificación de Personal Vault no es válida para ${rel}.`);
    let full=root;
    for(const segment of rel.split('/')){
      full=path.join(full,segment);const stat=await fsp.lstat(full).catch(()=>null);
      if(!stat||stat.isSymbolicLink())throw new Error(`Falta un archivo guardado o contiene un enlace no permitido: ${rel}.`);
    }
    const stat=await fsp.lstat(full);
    if(!stat.isFile()||stat.size!==size)throw new Error(`El archivo guardado está incompleto: ${rel}.`);
    const sha256=await hashFile(full);
    if(sha256.toLowerCase()!==String(entry.sha256).toLowerCase())throw new Error(`El archivo guardado no pasó la verificación SHA-256: ${rel}.`);
    verified.push({rel,full,size,sha256,mtimeMs:Number(entry.mtimeMs||0)});
  }
  return {paths:declaredPaths,files:verified};
}

async function vaultStatus(instanceRoot, config = {}) {
  const dir = String(config.vaultDirectory || '').trim(); const paths=normalizePaths(config);
  if(!dir) return {configured:false,paths,files:0,bytes:0,lastPush:'',conflicts:[]};
  const root=vaultRoot(dir); const manifestFile=path.join(root,'vault-manifest.json');
  let manifest=null; try{manifest=JSON.parse(await fsp.readFile(manifestFile,'utf8'));}catch(_){}
  const files=Array.isArray(manifest?.files)?manifest.files.filter((item)=>item&&typeof item==='object'&&!Array.isArray(item)&&safeRel(item.rel)&&Number.isSafeInteger(Number(item.size))&&Number(item.size)>=0):[];
  const conflicts=[];
  for(const item of files){const rel=safeRel(item.rel);const local=path.join(instanceRoot,rel);const st=await statSafe(local);const vaultMtime=Number.isFinite(Number(item.mtimeMs))?Number(item.mtimeMs):0;if(st&&st.isFile()&&st.mtimeMs>vaultMtime+1500){conflicts.push({rel,localMtimeMs:st.mtimeMs,vaultMtimeMs:vaultMtime});}}
  const bytes=files.reduce((n,item)=>n+Number(item.size),0);
  return {configured:true,directory:dir,paths,files:files.length,bytes:Number.isSafeInteger(bytes)?bytes:0,lastPush:typeof manifest?.createdAt==='string'?manifest.createdAt:'',sourceDevice:typeof manifest?.device==='string'?manifest.device:'',conflicts:conflicts.slice(0,30)};
}

async function pushVault(instanceRoot, config = {}, device = '') {
  const dir=String(config.vaultDirectory||'').trim(); if(!dir) throw new Error('Elegí una carpeta para Personal Vault.');
  const instance=await fsp.realpath(instanceRoot); const root=vaultRoot(dir); const parent=path.dirname(root);
  const suffix=`${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const staging=`${root}.staging-${suffix}`; const backup=`${root}.backup-${suffix}`; const dataRoot=path.join(staging,'data'); const paths=normalizePaths(config);
  await fsp.mkdir(parent,{recursive:true}); await fsp.mkdir(dataRoot,{recursive:true}); let files=0,bytes=0; let movedOld=false; let committed=false;
  try{
    for(const rel of paths){const source=path.join(instance,rel);if(!(await exists(source)))continue;const target=path.join(dataRoot,rel);const r=await copyTree(source,target,[root,staging,backup]);files+=r.files;bytes+=r.bytes;}
    const manifestFiles=await buildManifest(dataRoot,paths); const manifest={schema:1,createdAt:new Date().toISOString(),device:String(device||''),paths,files:manifestFiles};
    await fsp.writeFile(path.join(staging,'vault-manifest.json'),JSON.stringify(manifest,null,2),'utf8');
    if(await exists(root)){await fsp.rename(root,backup);movedOld=true;}
    await fsp.rename(staging,root);committed=true;
    if(movedOld)await fsp.rm(backup,{recursive:true,force:true}).catch(()=>{});
    return {ok:true,directory:dir,files,bytes,createdAt:manifest.createdAt,paths};
  }catch(error){
    if(committed)await fsp.rm(root,{recursive:true,force:true}).catch(()=>{});
    if(movedOld&&!(await exists(root)))await fsp.rename(backup,root).catch(()=>{});
    throw error;
  }finally{await fsp.rm(staging,{recursive:true,force:true}).catch(()=>{});}
}

async function pullVault(instanceRoot, config = {}, force = false) {
  const dir=String(config.vaultDirectory||'').trim(); if(!dir) throw new Error('Elegí una carpeta para Personal Vault.');
  const root=vaultRoot(dir); let manifest; try{manifest=JSON.parse(await fsp.readFile(path.join(root,'vault-manifest.json'),'utf8'));}catch(_){throw new Error('No encontré un perfil guardado en Personal Vault.');}
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw new Error('El perfil de Personal Vault está dañado.');
  const instance=await fsp.realpath(instanceRoot); const dataRoot=path.join(root,'data'); const verified=await validateVaultFiles(dataRoot,manifest,normalizePaths(config)); const files=verified.files; const conflicts=[];
  for(const item of files){const local=path.join(instance,item.rel);const st=await statSafe(local);if(st&&st.isFile()&&st.mtimeMs>item.mtimeMs+1500)conflicts.push(item.rel);}
  if(conflicts.length&&!force){return {ok:false,needsConfirmation:true,conflicts:conflicts.slice(0,40),count:conflicts.length};}
  let copied=0,bytes=0;
  for(const item of files){await assertSafeDestination(instance,item.rel);const target=path.join(instance,item.rel);await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.copyFile(item.full,target);copied++;bytes+=item.size;}
  return {ok:true,copied,bytes,conflicts:conflicts.length,createdAt:manifest.createdAt||''};
}

module.exports={safeRel,normalizePaths,vaultStatus,pushVault,pullVault};
