const fs = require('fs/promises');
const path = require('path');

const MARKER = path.join('.launcher', 'safe-mode.json');
function officialMods(manifest) {
  return new Set((manifest?.files || []).map((e) => String(e.path || '').replace(/\\/g, '/').toLowerCase()).filter((p) => p.startsWith('mods/') && p.endsWith('.jar')));
}
async function readMarker(root) {
  try { return JSON.parse(await fs.readFile(path.join(root, MARKER), 'utf8')); }
  catch (error) { return error.code === 'ENOENT' ? null : { invalid: true }; }
}
async function restoreSafeMode(root) {
  const marker = await readMarker(root);
  if (!marker) return { restored: [], pending: [] };
  if (marker.invalid || !Array.isArray(marker.files)) return { restored: [], pending: [], error: 'El marcador de modo seguro está dañado; se conservó para no perder la lista de mods pendientes.' };
  if (!marker.files.length) { await fs.rm(path.join(root, MARKER), { force: true }).catch(()=>{}); return { restored: [], pending: [] }; }
  const restored = []; let complete=true;
  const pending=[];
  for (const item of marker.files) {
    const enabledRel=String(item?.enabled||'').replace(/\\/g,'/');
    const disabledRel=String(item?.disabled||'').replace(/\\/g,'/');
    if(!/^mods\/[^/]+\.jar$/i.test(enabledRel)||disabledRel.toLowerCase()!==`${enabledRel}.disabled`.toLowerCase()){complete=false;pending.push(item?.enabled||'ruta inválida');continue;}
    const enabled = path.join(root, 'mods', path.basename(enabledRel));
    const disabled = path.join(root, 'mods', path.basename(disabledRel));
    try {
      await fs.access(disabled);
      try { await fs.access(enabled); complete=false; pending.push(enabledRel); continue; } catch (_) {}
      await fs.rename(disabled, enabled); restored.push(item.enabled);
    } catch (error) { if(error.code!=='ENOENT'){complete=false;pending.push(enabledRel);} }
  }
  if(complete)await fs.rm(path.join(root, MARKER), { force: true }).catch(()=>{});
  return { restored, pending };
}
async function prepareSafeMode(root, manifest) {
  const recovery=await restoreSafeMode(root);
  if(recovery.error||recovery.pending?.length)throw new Error(recovery.error||`No se pudo completar la restauración del modo seguro (${recovery.pending.length} mod${recovery.pending.length===1?'':'s'} pendiente${recovery.pending.length===1?'':'s'}).`);
  const official = officialMods(manifest);
  const modsDir = path.join(root, 'mods');
  await fs.mkdir(modsDir, { recursive: true });
  const entries = await fs.readdir(modsDir, { withFileTypes: true }).catch(()=>[]);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.jar$/i.test(entry.name)) continue;
    const relative = `mods/${entry.name}`;
    if (official.has(relative.toLowerCase())) continue;
    const enabled = relative;
    const disabled = `${relative}.disabled`;
    try { await fs.access(path.join(root, disabled)); continue; } catch (_) {}
    files.push({ enabled, disabled });
  }
  await fs.mkdir(path.join(root, '.launcher'), { recursive: true });
  const marker=path.join(root, MARKER); const temporary=`${marker}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2));
  try { await fs.rename(temporary,marker); } catch(error) { await fs.rm(temporary,{force:true}).catch(()=>{}); throw error; }
  try {
    for(const item of files)await fs.rename(path.join(root,item.enabled),path.join(root,item.disabled));
  } catch(error) {
    await restoreSafeMode(root);
    throw error;
  }
  return { disabled: files.map((x) => x.enabled), count: files.length };
}
module.exports = { prepareSafeMode, restoreSafeMode };
