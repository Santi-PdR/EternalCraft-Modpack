const fs = require('fs/promises');
const path = require('path');

const MARKER = path.join('.launcher', 'safe-mode.json');
function officialMods(manifest) {
  return new Set((manifest?.files || []).map((e) => String(e.path || '').replace(/\\/g, '/')).filter((p) => p.startsWith('mods/') && p.endsWith('.jar')));
}
async function readMarker(root) { try { return JSON.parse(await fs.readFile(path.join(root, MARKER), 'utf8')); } catch (_) { return null; } }
async function restoreSafeMode(root) {
  const marker = await readMarker(root);
  if (!marker?.files?.length) { await fs.rm(path.join(root, MARKER), { force: true }).catch(()=>{}); return { restored: [] }; }
  const restored = [];
  for (const item of marker.files) {
    const enabled = path.join(root, item.enabled);
    const disabled = path.join(root, item.disabled);
    try {
      await fs.access(disabled);
      try { await fs.access(enabled); continue; } catch (_) {}
      await fs.rename(disabled, enabled); restored.push(item.enabled);
    } catch (_) {}
  }
  await fs.rm(path.join(root, MARKER), { force: true }).catch(()=>{});
  return { restored };
}
async function prepareSafeMode(root, manifest) {
  await restoreSafeMode(root);
  const official = officialMods(manifest);
  const modsDir = path.join(root, 'mods');
  await fs.mkdir(modsDir, { recursive: true });
  const entries = await fs.readdir(modsDir, { withFileTypes: true }).catch(()=>[]);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.jar$/i.test(entry.name)) continue;
    const relative = `mods/${entry.name}`;
    if (official.has(relative)) continue;
    const enabled = relative;
    const disabled = `${relative}.disabled`;
    try { await fs.access(path.join(root, disabled)); continue; } catch (_) {}
    await fs.rename(path.join(root, enabled), path.join(root, disabled));
    files.push({ enabled, disabled });
  }
  await fs.mkdir(path.join(root, '.launcher'), { recursive: true });
  await fs.writeFile(path.join(root, MARKER), JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2));
  return { disabled: files.map((x) => x.enabled), count: files.length };
}
module.exports = { prepareSafeMode, restoreSafeMode };
