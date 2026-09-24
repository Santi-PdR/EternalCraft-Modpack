const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const SNAPSHOT_ROOT = path.join('.launcher', 'snapshots');
const MAX_SNAPSHOTS = 6;

function safeId(value='') { return String(value).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80); }
async function exists(file){ try { await fsp.access(file); return true; } catch (_) { return false; } }
async function readJson(file, fallback){ try { return JSON.parse(await fsp.readFile(file,'utf8')); } catch (_) { return fallback; } }

async function copyIfExists(source, target){
  try {
    const stat = await fsp.stat(source);
    await fsp.mkdir(path.dirname(target), {recursive:true});
    if(stat.isDirectory()) await fsp.cp(source,target,{recursive:true,force:true});
    else await fsp.copyFile(source,target);
    return true;
  } catch(err){ if(err.code==='ENOENT') return false; throw err; }
}

async function listSnapshots(root){
  const dir=path.join(root,SNAPSHOT_ROOT);
  const entries=await fsp.readdir(dir,{withFileTypes:true}).catch(()=>[]);
  const out=[];
  for(const entry of entries){
    if(!entry.isDirectory()) continue;
    const meta=await readJson(path.join(dir,entry.name,'snapshot.json'),null);
    if(!meta) continue;
    out.push({...meta,id:entry.name});
  }
  return out.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}

async function pruneSnapshots(root){
  const items=await listSnapshots(root);
  for(const item of items.slice(MAX_SNAPSHOTS)) await fsp.rm(path.join(root,SNAPSHOT_ROOT,item.id),{recursive:true,force:true});
}

async function createSnapshot(root, manifest, label='Punto de restauración'){
  const now=new Date();
  const id=safeId(`${now.toISOString().replace(/[:.]/g,'-')}-${Math.random().toString(36).slice(2,7)}`);
  const base=path.join(root,SNAPSHOT_ROOT,id);
  await fsp.mkdir(base,{recursive:true});
  const official=new Set([...(manifest?.files||[]).map(f=>String(f.path||'').replace(/\\/g,'/')),...(manifest?.remove||[]).map(p=>String(p||'').replace(/\\/g,'/'))].filter(p=>p.startsWith('mods/')));
  const userMods=[];
  const modsDir=path.join(root,'mods');
  for(const entry of await fsp.readdir(modsDir,{withFileTypes:true}).catch(()=>[])){
    if(!entry.isFile()||!/\.jar(?:\.disabled)?$/i.test(entry.name)) continue;
    const baseName=entry.name.replace(/\.disabled$/i,'');
    if(official.has(`mods/${baseName}`)) continue;
    await copyIfExists(path.join(modsDir,entry.name),path.join(base,'mods',entry.name));
    userMods.push(entry.name);
  }
  await copyIfExists(path.join(root,'config'),path.join(base,'config'));
  await copyIfExists(path.join(root,'options.txt'),path.join(base,'options.txt'));
  await copyIfExists(path.join(root,'.launcher','user-mods.json'),path.join(base,'.launcher','user-mods.json'));
  const meta={id,label:String(label||'Punto de restauración').slice(0,80),createdAt:now.toISOString(),packVersion:manifest?.version||'',userMods:userMods.length};
  await fsp.writeFile(path.join(base,'snapshot.json'),JSON.stringify(meta,null,2));
  await pruneSnapshots(root);
  return meta;
}

async function restoreSnapshot(root, manifest, id){
  const safe=safeId(id); if(!safe) throw new Error('Snapshot inválido.');
  const base=path.join(root,SNAPSHOT_ROOT,safe);
  const meta=await readJson(path.join(base,'snapshot.json'),null); if(!meta) throw new Error('No encontré ese punto de restauración.');
  const official=new Set([...(manifest?.files||[]).map(f=>String(f.path||'').replace(/\\/g,'/')),...(manifest?.remove||[]).map(p=>String(p||'').replace(/\\/g,'/'))].filter(p=>p.startsWith('mods/')));
  const modsDir=path.join(root,'mods'); await fsp.mkdir(modsDir,{recursive:true});
  // Remove only user-added mods. Official pack files remain untouched.
  for(const entry of await fsp.readdir(modsDir,{withFileTypes:true}).catch(()=>[])){
    if(!entry.isFile()||!/\.jar(?:\.disabled)?$/i.test(entry.name)) continue;
    const baseName=entry.name.replace(/\.disabled$/i,'');
    if(!official.has(`mods/${baseName}`)) await fsp.rm(path.join(modsDir,entry.name),{force:true});
  }
  const snapMods=path.join(base,'mods');
  if(await exists(snapMods)){
    for(const entry of await fsp.readdir(snapMods,{withFileTypes:true})) if(entry.isFile()) await fsp.copyFile(path.join(snapMods,entry.name),path.join(modsDir,entry.name));
  }
  if(await exists(path.join(base,'config'))){ await fsp.rm(path.join(root,'config'),{recursive:true,force:true}); await fsp.cp(path.join(base,'config'),path.join(root,'config'),{recursive:true,force:true}); }
  if(await exists(path.join(base,'options.txt'))) await fsp.copyFile(path.join(base,'options.txt'),path.join(root,'options.txt'));
  if(await exists(path.join(base,'.launcher','user-mods.json'))){ await fsp.mkdir(path.join(root,'.launcher'),{recursive:true}); await fsp.copyFile(path.join(base,'.launcher','user-mods.json'),path.join(root,'.launcher','user-mods.json')); }
  return meta;
}

async function deleteSnapshot(root,id){ const safe=safeId(id); if(!safe)return false; await fsp.rm(path.join(root,SNAPSHOT_ROOT,safe),{recursive:true,force:true}); return true; }

module.exports={listSnapshots,createSnapshot,restoreSnapshot,deleteSnapshot};
