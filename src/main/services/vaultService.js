const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');

function safeRel(input) {
  const raw = String(input || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw || raw.includes('\0')) return '';
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return '';
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
  return [...new Set(base.map(safeRel).filter(Boolean))];
}

async function exists(file) { try { await fsp.access(file); return true; } catch (_) { return false; } }
async function statSafe(file) { try { return await fsp.stat(file); } catch (_) { return null; } }

async function hashFile(file) {
  const h = crypto.createHash('sha256');
  const buf = await fsp.readFile(file); h.update(buf); return h.digest('hex');
}

async function walk(root, rel = '') {
  const full = path.join(root, rel);
  const st = await statSafe(full); if (!st) return [];
  if (st.isFile()) return [{ rel: rel.replace(/\\/g, '/'), size: st.size, mtimeMs: st.mtimeMs, sha256: await hashFile(full) }];
  if (!st.isDirectory()) return [];
  const out = [];
  for (const entry of await fsp.readdir(full, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) out.push(...await walk(root, child));
    else if (entry.isFile()) { const s=await fsp.stat(path.join(root,child)); out.push({rel:child.replace(/\\/g,'/'),size:s.size,mtimeMs:s.mtimeMs,sha256:await hashFile(path.join(root,child))}); }
  }
  return out;
}

async function copyTree(source, target) {
  const st = await statSafe(source); if (!st) return { files:0, bytes:0 };
  if (st.isFile()) { await fsp.mkdir(path.dirname(target), {recursive:true}); await fsp.copyFile(source,target); return {files:1,bytes:st.size}; }
  if (!st.isDirectory()) return {files:0,bytes:0};
  await fsp.mkdir(target,{recursive:true}); let files=0,bytes=0;
  for (const entry of await fsp.readdir(source,{withFileTypes:true})) {
    const r=await copyTree(path.join(source,entry.name),path.join(target,entry.name)); files+=r.files; bytes+=r.bytes;
  }
  return {files,bytes};
}

function vaultRoot(vaultDirectory) { return path.join(vaultDirectory, 'EternalCraftVault'); }

async function buildManifest(root, paths) {
  const files=[];
  for(const rel of paths){const safe=safeRel(rel);if(!safe)continue;const target=path.join(root,safe);const st=await statSafe(target);if(!st)continue;if(st.isFile()){files.push({rel:safe,size:st.size,mtimeMs:st.mtimeMs,sha256:await hashFile(target)});}else if(st.isDirectory()){for(const row of await walk(target,'')){files.push({...row,rel:path.posix.join(safe,row.rel)});}}}
  files.sort((a,b)=>a.rel.localeCompare(b.rel)); return files;
}

async function vaultStatus(instanceRoot, config = {}) {
  const dir = String(config.vaultDirectory || '').trim(); const paths=normalizePaths(config);
  if(!dir) return {configured:false,paths,files:0,bytes:0,lastPush:'',conflicts:[]};
  const root=vaultRoot(dir); const manifestFile=path.join(root,'vault-manifest.json');
  let manifest=null; try{manifest=JSON.parse(await fsp.readFile(manifestFile,'utf8'));}catch(_){}
  const files=Array.isArray(manifest?.files)?manifest.files:[];
  const conflicts=[];
  for(const item of files){const local=path.join(instanceRoot,safeRel(item.rel));const st=await statSafe(local);if(st&&st.isFile()&&st.mtimeMs>Number(item.mtimeMs||0)+1500){conflicts.push({rel:item.rel,localMtimeMs:st.mtimeMs,vaultMtimeMs:Number(item.mtimeMs||0)});}}
  return {configured:true,directory:dir,paths,files:files.length,bytes:files.reduce((n,x)=>n+Number(x.size||0),0),lastPush:manifest?.createdAt||'',sourceDevice:manifest?.device||'',conflicts:conflicts.slice(0,30)};
}

async function pushVault(instanceRoot, config = {}, device = '') {
  const dir=String(config.vaultDirectory||'').trim(); if(!dir) throw new Error('Elegí una carpeta para Personal Vault.');
  const root=vaultRoot(dir); const dataRoot=path.join(root,'data'); const paths=normalizePaths(config);
  await fsp.rm(dataRoot,{recursive:true,force:true}); await fsp.mkdir(dataRoot,{recursive:true}); let files=0,bytes=0;
  for(const rel of paths){const source=path.join(instanceRoot,rel);if(!(await exists(source)))continue;const r=await copyTree(source,path.join(dataRoot,rel));files+=r.files;bytes+=r.bytes;}
  const manifestFiles=await buildManifest(dataRoot,paths); const manifest={schema:1,createdAt:new Date().toISOString(),device:String(device||''),paths,files:manifestFiles};
  await fsp.writeFile(path.join(root,'vault-manifest.json'),JSON.stringify(manifest,null,2),'utf8');
  return {ok:true,directory:dir,files,bytes,createdAt:manifest.createdAt,paths};
}

async function pullVault(instanceRoot, config = {}, force = false) {
  const dir=String(config.vaultDirectory||'').trim(); if(!dir) throw new Error('Elegí una carpeta para Personal Vault.');
  const root=vaultRoot(dir); let manifest; try{manifest=JSON.parse(await fsp.readFile(path.join(root,'vault-manifest.json'),'utf8'));}catch(_){throw new Error('No encontré un perfil guardado en Personal Vault.');}
  const dataRoot=path.join(root,'data'); const files=Array.isArray(manifest.files)?manifest.files:[]; const conflicts=[];
  for(const item of files){const rel=safeRel(item.rel);if(!rel)continue;const local=path.join(instanceRoot,rel);const st=await statSafe(local);if(st&&st.isFile()&&st.mtimeMs>Number(item.mtimeMs||0)+1500)conflicts.push(rel);}
  if(conflicts.length&&!force){return {ok:false,needsConfirmation:true,conflicts:conflicts.slice(0,40),count:conflicts.length};}
  const paths=Array.isArray(manifest.paths)?manifest.paths.map(safeRel).filter(Boolean):normalizePaths(config); let copied=0,bytes=0;
  for(const rel of paths){const source=path.join(dataRoot,rel);if(!(await exists(source)))continue;const r=await copyTree(source,path.join(instanceRoot,rel));copied+=r.files;bytes+=r.bytes;}
  return {ok:true,copied,bytes,conflicts:conflicts.length,createdAt:manifest.createdAt||''};
}

module.exports={safeRel,normalizePaths,vaultStatus,pushVault,pullVault};
