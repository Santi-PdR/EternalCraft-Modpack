const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const META = path.join('.launcher', 'user-mods.json');


function safeName(name) { return String(name || '').replace(/[^A-Za-z0-9._+()\-\[\] ]/g, '_').trim(); }
function displayName(filename) { return filename.replace(/\.jar\.disabled$/i, '').replace(/\.jar$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function officialSet(manifest) {
  return new Set((manifest?.files || []).map(e => String(e.path || '').replace(/\\/g, '/')).filter(p => p.toLowerCase().startsWith('mods/') && p.toLowerCase().endsWith('.jar')));
}
async function readMeta(root) { try { return JSON.parse(await fsp.readFile(path.join(root, META), 'utf8')); } catch (_) { return { mods: {} }; } }
async function writeMeta(root, meta) { const file = path.join(root, META); await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify(meta, null, 2)); }


async function listMods(root, manifest, sort = 'recent') {
  const modsDir = path.join(root, 'mods');
  await fsp.mkdir(modsDir, { recursive: true });
  const official = officialSet(manifest);
  const meta = await readMeta(root);
  const entries = await fsp.readdir(modsDir, { withFileTypes: true }).catch(() => []);
  const mods = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.jar(?:\.disabled)?$/i.test(entry.name)) continue;
    const full = path.join(modsDir, entry.name);
    const stat = await fsp.stat(full).catch(() => null);
    if (!stat) continue;
    const enabled = !/\.disabled$/i.test(entry.name);
    const base = entry.name.replace(/\.disabled$/i, '');
    const relative = `mods/${base}`;
    const isOfficial = official.has(relative);
    const m = meta.mods?.[base] || {};
    const installedAt = m.installedAt || stat.birthtime?.toISOString?.() || stat.mtime.toISOString();
    mods.push({
      id: entry.name, filename: entry.name, baseFilename: base,
      displayName: m.projectName || displayName(entry.name), enabled, official: isOfficial, userAdded: !isOfficial,
      size: stat.size, modifiedAt: stat.mtime.toISOString(), installedAt,
      provider: m.provider || (isOfficial ? 'official' : 'local'), projectId: m.projectId || '', versionId: m.versionId || '', iconUrl: m.iconUrl || '',
      category: m.category || '', categories: m.categories || [], environment: m.environment || {}, versionName: m.versionName || '', updatedAt: m.updatedAt || '', sourceUrl: m.sourceUrl || '', favorite: Boolean(m.favorite), pinned: Boolean(m.pinned)
    });
  }
  const sorters = {
    recent: (a, b) => new Date(b.installedAt || b.modifiedAt) - new Date(a.installedAt || a.modifiedAt),
    oldest: (a, b) => new Date(a.installedAt || a.modifiedAt) - new Date(b.installedAt || b.modifiedAt),
    az: (a, b) => a.displayName.localeCompare(b.displayName, 'es'),
    size: (a, b) => b.size - a.size,
    updated: (a, b) => new Date(b.updatedAt || b.modifiedAt || 0) - new Date(a.updatedAt || a.modifiedAt || 0),
    favorites: (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.displayName.localeCompare(b.displayName, 'es')
  };
  mods.sort(sorters[sort] || sorters.recent);
  return {
    mods,
    counts: {
      total: mods.length,
      official: mods.filter(m => m.official).length,
      user: mods.filter(m => m.userAdded).length,
      disabled: mods.filter(m => !m.enabled).length,
      favorites: mods.filter(m => m.favorite).length,
      pinned: mods.filter(m => m.pinned).length
    }
  };
}

async function addMods(root, filePaths, manifest) {
  const modsDir = path.join(root, 'mods'); await fsp.mkdir(modsDir, { recursive: true });
  const official = officialSet(manifest); const meta = await readMeta(root); const added = [];
  for (const input of filePaths || []) {
    if (!/\.jar$/i.test(input)) continue;
    const name = safeName(path.basename(input)); if (!name) continue;
    if (official.has(`mods/${name}`)) throw new Error(`${name} ya forma parte del modpack oficial.`);
    const target = path.join(modsDir, name);
    try { await fsp.access(target); throw new Error(`${name} ya está instalado.`); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    await fsp.copyFile(input, target);
    meta.mods[name] = { provider: 'local', projectName: displayName(name), installedAt: new Date().toISOString() };
    added.push(name);
  }
  if (!added.length) throw new Error('No se seleccionaron archivos .jar válidos. Elegí uno o más mods con extensión .jar.');
  await writeMeta(root, meta);
  return { added, ...await listMods(root, manifest, 'recent') };
}

async function toggleMod(root, filename, manifest) {
  const current = safeName(path.basename(filename)); const listing = await listMods(root, manifest);
  const mod = listing.mods.find(m => m.filename === current); if (!mod) throw new Error('No encontré ese mod.');
  if (mod.official) throw new Error('Los mods oficiales no se pueden desactivar desde el launcher.');
  const next = mod.enabled ? `${current}.disabled` : current.replace(/\.disabled$/i, '');
  await fsp.rename(path.join(root, 'mods', current), path.join(root, 'mods', next)); return listMods(root, manifest, 'recent');
}

async function removeMod(root, filename, manifest) {
  const current = safeName(path.basename(filename)); const listing = await listMods(root, manifest);
  const mod = listing.mods.find(m => m.filename === current); if (!mod) throw new Error('No encontré ese mod.');
  if (mod.official) throw new Error('Los mods oficiales pertenecen al modpack.');
  await fsp.rm(path.join(root, 'mods', current), { force: true });
  const meta = await readMeta(root); delete meta.mods?.[mod.baseFilename]; await writeMeta(root, meta); return listMods(root, manifest, 'recent');
}

async function togglePin(root, filename, manifest) {
  const current = safeName(path.basename(filename));
  const listing = await listMods(root, manifest, 'recent');
  const mod = listing.mods.find(m => m.filename === current || m.baseFilename === current.replace(/\.disabled$/i, ''));
  if (!mod) throw new Error('No encontré ese mod.');
  if (mod.official) throw new Error('Los mods oficiales ya están fijados por la versión del modpack.');
  const meta = await readMeta(root); const base = mod.baseFilename; meta.mods = meta.mods || {};
  meta.mods[base] = { ...(meta.mods[base] || {}), pinned: !Boolean(meta.mods[base]?.pinned), projectName: meta.mods[base]?.projectName || mod.displayName };
  await writeMeta(root, meta);
  return { pinned:Boolean(meta.mods[base].pinned), listing:await listMods(root, manifest, 'recent') };
}

async function toggleFavorite(root, filename, manifest) {
  const current = safeName(path.basename(filename));
  const listing = await listMods(root, manifest, 'recent');
  const mod = listing.mods.find(m => m.filename === current || m.baseFilename === current.replace(/\.disabled$/i, ''));
  if (!mod) throw new Error('No encontré ese mod.');
  const meta = await readMeta(root);
  const base = mod.baseFilename;
  meta.mods = meta.mods || {};
  meta.mods[base] = { ...(meta.mods[base] || {}), favorite: !Boolean(meta.mods[base]?.favorite), projectName: meta.mods[base]?.projectName || mod.displayName };
  await writeMeta(root, meta);
  return { favorite: Boolean(meta.mods[base].favorite), listing: await listMods(root, manifest, 'favorites') };
}

async function setAllUserModsEnabled(root, manifest, enabled) {
  const listing = await listMods(root, manifest, 'recent');
  const changed = [];
  for (const mod of listing.mods.filter(m => m.userAdded && m.enabled !== Boolean(enabled))) {
    const from = path.join(root, 'mods', mod.filename);
    const toName = enabled ? mod.filename.replace(/\.disabled$/i, '') : `${mod.filename}.disabled`;
    const to = path.join(root, 'mods', toName);
    await fsp.rename(from, to);
    changed.push({ from: mod.filename, to: toName });
  }
  return { changed, listing: await listMods(root, manifest, 'recent') };
}

async function copyModToRoot(sourceRoot, targetRoot, filename) {
  const sourceName = safeName(path.basename(filename)); if (!sourceName) throw new Error('Archivo de mod inválido.');
  const source = path.join(sourceRoot, 'mods', sourceName); const base = sourceName.replace(/\.disabled$/i, '');
  const target = path.join(targetRoot, 'mods', base); await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.copyFile(source, target); return target;
}

async function auditMods(root, manifest) {
  const listing = await listMods(root, manifest, 'recent');
  const issues = [];
  const byProject = new Map();
  for (const mod of listing.mods) {
    // Personal mods are intentionally outside pack health/update checks. They
    // remain visible as user-added, but only real compatibility failures or a
    // duplicate official project should create an actionable warning.
    if (mod.projectId) {
      const key = `${mod.provider}:${mod.projectId}`;
      const prior = byProject.get(key);
      if (prior && (prior.official || mod.official || !prior.userAdded || !mod.userAdded)) issues.push({ severity:'bad', type:'duplicate-project', mod:mod.displayName, filename:mod.filename, text:`Duplicado con ${prior.filename}` });
      else byProject.set(key, mod);
    }
    if (!mod.official && mod.enabled && mod.environment?.client === 'unsupported') {
      issues.push({ severity:'bad', type:'server-only', mod:mod.displayName, filename:mod.filename, text:'Este proyecto marca el cliente como no compatible.' });
    }
  }
  const fileKeys = new Map();
  for (const mod of listing.mods) {
    const key = String(mod.displayName || '').toLowerCase().replace(/\b(?:forge|mc|minecraft|mod)\b/g,'').replace(/[0-9._+\-]+/g,'').replace(/\s+/g,' ').trim();
    if (!key || key.length < 4) continue;
    const prior = fileKeys.get(key);
    if (prior && prior.filename !== mod.filename && !prior.projectId && !mod.projectId) issues.push({ severity:'warn', type:'possible-duplicate', mod:mod.displayName, filename:mod.filename, text:`Posible duplicado de ${prior.filename}` });
    else if (!prior) fileKeys.set(key, mod);
  }
  const counts = { bad:issues.filter(x=>x.severity==='bad').length, warn:issues.filter(x=>x.severity==='warn').length, info:issues.filter(x=>x.severity==='info').length };
  return { ok:counts.bad===0 && counts.warn===0, counts, issues, checkedAt:new Date().toISOString(), total:listing.mods.length, user:listing.counts.user };
}

module.exports = {
  listMods,
  addMods,
  toggleMod,
  removeMod,
  toggleFavorite,
  togglePin,
  setAllUserModsEnabled,
  copyModToRoot,
  auditMods
};
