const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const MODRINTH = 'https://api.modrinth.com/v2';
const CURSEFORGE = 'https://api.curseforge.com/v1';
const META = path.join('.launcher', 'user-mods.json');

const MODRINTH_CATEGORY_MAP = {
  all: [],
  optimization: ['optimization'],
  client: [],
  qol: ['utility'],
  technology: ['technology'],
  adventure: ['adventure'],
  worldgen: ['worldgen'],
  mobs: ['mobs'],
  magic: ['magic'],
  equipment: ['equipment'],
  decoration: ['decoration'],
  storage: ['storage'],
  library: ['library'],
  food: ['food'],
  transportation: ['transportation']
};

function safeName(name) { return String(name || '').replace(/[^A-Za-z0-9._+()\-\[\] ]/g, '_').trim(); }
function displayName(filename) { return filename.replace(/\.jar\.disabled$/i, '').replace(/\.jar$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function officialSet(manifest) {
  return new Set((manifest?.files || []).map(e => String(e.path || '').replace(/\\/g, '/')).filter(p => p.toLowerCase().startsWith('mods/') && p.toLowerCase().endsWith('.jar')));
}
async function readMeta(root) { try { return JSON.parse(await fsp.readFile(path.join(root, META), 'utf8')); } catch (_) { return { mods: {} }; } }
async function writeMeta(root, meta) { const file = path.join(root, META); await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify(meta, null, 2)); }

async function installedProject(root, provider, projectId) {
  const meta = await readMeta(root);
  return Object.entries(meta.mods || {}).find(([, value]) => String(value?.provider || '') === String(provider || '') && String(value?.projectId || '') === String(projectId || '')) || null;
}

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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'User-Agent': 'EternalCraftLauncher/0.25.0', Accept: 'application/json', ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json();
}
async function download(url, target) {
  const res = await fetch(url, { headers: { 'User-Agent': 'EternalCraftLauncher/0.25.0' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Descarga falló (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer()); await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.writeFile(target, buf); return buf;
}

function modrinthFacets({ category = 'all', environment = 'all' } = {}) {
  const facets = [['project_type:mod'], ['versions:1.20.1'], ['categories:forge']];
  const categories = MODRINTH_CATEGORY_MAP[category] || [];
  if (categories.length) facets.push(categories.map(v => `categories:${v}`));
  if (category === 'client' && environment === 'all') facets.push(['environment:client_only', 'environment:client_only_server_optional']);
  if (environment === 'client') facets.push(['environment:client_only', 'environment:client_only_server_optional']);
  if (environment === 'server') facets.push(['environment:server_only', 'environment:server_only_client_optional', 'environment:dedicated_server_only']);
  if (environment === 'both') facets.push(['environment:client_and_server', 'environment:client_or_server_prefers_both']);
  return facets;
}

async function searchModrinth(query, options = {}) {
  const index = ['relevance', 'downloads', 'newest', 'updated'].includes(options.sort) ? options.sort : 'relevance';
  const params = new URLSearchParams({
    query: String(query || ''), facets: JSON.stringify(modrinthFacets(options)), index, limit: String(Math.max(1, Math.min(48, Number(options.limit || 30)))), offset: String(Math.max(0, Number(options.offset || 0)))
  });
  const data = await fetchJson(`${MODRINTH}/search?${params}`);
  return (data.hits || []).map(x => ({
    provider: 'modrinth', id: x.project_id, slug: x.slug, name: x.title, summary: x.description, author: x.author,
    iconUrl: x.icon_url || '', downloads: x.downloads || 0, updatedAt: x.date_modified || '', createdAt: x.date_created || '',
    categories: x.categories || [], clientSide: x.client_side || '', serverSide: x.server_side || ''
  }));
}
async function pickModrinthVersion(projectId, releaseChannel = 'release') {
  const qs = new URLSearchParams({ loaders: JSON.stringify(['forge']), game_versions: JSON.stringify(['1.20.1']), include_changelog: 'false' });
  const list = await fetchJson(`${MODRINTH}/project/${encodeURIComponent(projectId)}/version?${qs}`);
  const allowed = releaseChannel === 'alpha' ? new Set(['release','beta','alpha']) : releaseChannel === 'beta' ? new Set(['release','beta']) : new Set(['release']);
  const versions = list.filter(v => (v.status === 'listed' || !v.status) && allowed.has(String(v.version_type || 'release'))).sort((a, b) => new Date(b.date_published) - new Date(a.date_published));
  if (!versions.length) throw new Error(`No hay versión Forge 1.20.1 en el canal ${releaseChannel}.`);
  return versions[0];
}

async function installModrinth(root, manifest, project, seen = new Set(), releaseChannel = 'release') {
  if (seen.has(project.id)) return []; seen.add(project.id);
  const existingProject = await installedProject(root, 'modrinth', project.id);
  if (existingProject) throw new Error(`${project.name || 'Este mod'} ya está instalado.`);
  const version = await pickModrinthVersion(project.id, releaseChannel); const file = version.files.find(f => f.primary) || version.files[0];
  if (!file) throw new Error('No hay archivo descargable.');
  if (officialSet(manifest).has(`mods/${file.filename}`)) throw new Error('Ese mod ya es oficial.');
  const target = path.join(root, 'mods', file.filename); const buf = await download(file.url, target);
  if (file.hashes?.sha512 && crypto.createHash('sha512').update(buf).digest('hex') !== file.hashes.sha512) { await fsp.rm(target, { force: true }); throw new Error('El mod no pasó la verificación.'); }
  const meta = await readMeta(root); meta.mods[file.filename] = {
    provider: 'modrinth', projectId: project.id, projectName: project.name, versionId: version.id, iconUrl: project.iconUrl || '',
    installedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sourceUrl: `https://modrinth.com/mod/${project.slug || project.id}`,
    environment: project.clientSide || project.serverSide ? { client: project.clientSide || '', server: project.serverSide || '' } : {}, categories: project.categories || [], versionName: version.name || version.version_number || '', versionType: version.version_type || 'release'
  }; await writeMeta(root, meta);
  const installed = [file.filename];
  for (const dep of version.dependencies || []) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue;
    try { const p = await fetchJson(`${MODRINTH}/project/${dep.project_id}`); installed.push(...await installModrinth(root, manifest, { id: p.id, slug: p.slug, name: p.title, iconUrl: p.icon_url || '', clientSide:p.client_side||'', serverSide:p.server_side||'' }, seen, releaseChannel)); } catch (_) {}
  }
  return installed;
}

const CURSEFORGE_CATEGORY_NAMES = {
  optimization:['performance','server utility'], client:['client side'], qol:['utility','qol'], technology:['technology'], adventure:['adventure','rpg'], worldgen:['world gen'], mobs:['mobs'], magic:['magic'], equipment:['armor','tools','weapons'], decoration:['cosmetic','decoration'], storage:['storage'], library:['library','api'], food:['food'], transportation:['transport']
};
async function curseForgeCategoryId(apiKey, category) {
  const wanted = CURSEFORGE_CATEGORY_NAMES[String(category || 'all')] || [];
  if (!wanted.length || !apiKey) return '';
  try {
    const data = await fetchJson(`${CURSEFORGE}/categories?gameId=432&classId=6`, { headers:{'x-api-key':apiKey} });
    const items = data.data || [];
    const found = items.find((c) => wanted.some((w) => String(c.name || '').toLowerCase().includes(w)));
    return found?.id ? String(found.id) : '';
  } catch (_) { return ''; }
}

async function searchCurseForge(query, apiKey, options = {}, proxyUrl = '') {
  const proxy = String(proxyUrl || '').replace(/\/+$/, '');
  if (proxy) {
    const qs = new URLSearchParams({ q:String(query||''), gameVersion:'1.20.1', loader:'forge', sort:String(options.sort||'updated'), category:String(options.category||'all'), offset:String(Math.max(0,Number(options.offset||0))) });
    const data = await fetchJson(`${proxy}/search?${qs}`);
    return { configured:true, viaProxy:true, results:Array.isArray(data.results)?data.results:[] };
  }
  if (!apiKey) return { configured: false, requiresApiKey: true, reason: 'CurseForge requiere una API key oficial o un proxy configurado por el desarrollador.', results: [] };
  const qs = new URLSearchParams({ gameId: '432', classId: '6', gameVersion: '1.20.1', modLoaderType: '1', searchFilter: String(query || ''), sortField: options.sort === 'downloads' ? '6' : '1', sortOrder: 'desc', pageSize: '30', index: String(Math.max(0,Number(options.offset||0))) });
  const categoryId = await curseForgeCategoryId(apiKey, options.category); if (categoryId) qs.set('categoryId', categoryId);
  const data = await fetchJson(`${CURSEFORGE}/mods/search?${qs}`, { headers: { 'x-api-key': apiKey } });
  return { configured: true, results: (data.data || []).map(x => ({ provider: 'curseforge', id: String(x.id), name: x.name, summary: x.summary || '', author: (x.authors || [])[0]?.name || '', iconUrl: x.logo?.thumbnailUrl || '', downloads: x.downloadCount || 0, updatedAt: x.dateModified || '', websiteUrl:x.links?.websiteUrl||'', categories:(x.categories||[]).map(c=>c.name) })) };
}
async function installCurseForge(root, manifest, project, apiKey, proxyUrl = '') {
  const existingProject = await installedProject(root, 'curseforge', project.id);
  if (existingProject) throw new Error(`${project.name || 'Este mod'} ya está instalado.`);
  const proxy = String(proxyUrl || '').replace(/\/+$/, '');
  let file;
  if (proxy) {
    const data = await fetchJson(`${proxy}/file?projectId=${encodeURIComponent(project.id)}&gameVersion=1.20.1&loader=forge`);
    file = data.file;
    if (!file?.downloadUrl || !file?.fileName) throw new Error(data.error || 'CurseForge no devolvió un archivo compatible.');
  } else {
    if (!apiKey) throw new Error('CurseForge necesita una API key oficial o un proxy configurado por el desarrollador.');
    const qs = new URLSearchParams({ gameVersion: '1.20.1', modLoaderType: '1', pageSize: '50' });
    const data = await fetchJson(`${CURSEFORGE}/mods/${project.id}/files?${qs}`, { headers: { 'x-api-key': apiKey } });
    const raw = (data.data || [])[0]; if (!raw) throw new Error('No hay versión Forge 1.20.1.');
    let url = raw.downloadUrl;
    if (!url) { const r = await fetchJson(`${CURSEFORGE}/mods/${project.id}/files/${raw.id}/download-url`, { headers: { 'x-api-key': apiKey } }); url = r.data; }
    file = { ...raw, downloadUrl:url };
  }
  if (!file.downloadUrl) throw new Error('CurseForge no permite descargar este archivo desde terceros.');
  if (officialSet(manifest).has(`mods/${file.fileName}`)) throw new Error('Ese mod ya es oficial.');
  await download(file.downloadUrl, path.join(root, 'mods', file.fileName));
  const meta = await readMeta(root); meta.mods[file.fileName] = { provider: 'curseforge', projectId: String(project.id), projectName: project.name, versionId: String(file.id||''), iconUrl: project.iconUrl || '', installedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sourceUrl: project.websiteUrl || '' }; await writeMeta(root, meta);
  return [file.fileName];
}


async function identifyLocalModrinthMods(root, manifest) {
  const listing = await listMods(root, manifest, 'recent');
  const meta = await readMeta(root);
  const recognized = [];
  const failed = [];
  for (const mod of listing.mods.filter((m) => m.userAdded && (!m.projectId || m.provider === 'local'))) {
    const full = path.join(root, 'mods', mod.filename);
    try {
      const buf = await fsp.readFile(full);
      const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
      const version = await fetchJson(`${MODRINTH}/version_file/${sha1}?algorithm=sha1`);
      const project = await fetchJson(`${MODRINTH}/project/${encodeURIComponent(version.project_id)}`);
      meta.mods[mod.baseFilename] = {
        ...(meta.mods?.[mod.baseFilename] || {}), provider:'modrinth', projectId:project.id, projectName:project.title,
        versionId:version.id, versionName:version.name || version.version_number || '', iconUrl:project.icon_url || '',
        sourceUrl:`https://modrinth.com/mod/${project.slug || project.id}`, categories:project.categories || [],
        environment:{client:project.client_side || '',server:project.server_side || ''},
        installedAt:meta.mods?.[mod.baseFilename]?.installedAt || mod.installedAt || new Date().toISOString(), recognizedAt:new Date().toISOString()
      };
      recognized.push({ filename:mod.filename, projectId:project.id, name:project.title });
    } catch (err) {
      failed.push({ filename:mod.filename, reason:err.message || String(err) });
    }
  }
  await writeMeta(root, meta);
  return { recognized, failed, listing: await listMods(root, manifest, 'recent') };
}

async function checkModUpdates(root, manifest, releaseChannel = 'release') {
  const listing = await listMods(root, manifest, 'recent');
  const updates = [];
  const checkedAt = new Date().toISOString();
  const pinned = listing.mods.filter((m) => m.userAdded && m.provider === 'modrinth' && m.projectId && m.pinned);
  for (const mod of listing.mods.filter((m) => m.userAdded && m.provider === 'modrinth' && m.projectId && !m.pinned)) {
    try {
      const latest = await pickModrinthVersion(mod.projectId, releaseChannel);
      const file = latest.files.find((f) => f.primary) || latest.files[0];
      if (!file) continue;
      if (String(latest.id) !== String(mod.versionId || '')) {
        updates.push({
          filename: mod.filename,
          baseFilename: mod.baseFilename,
          projectId: mod.projectId,
          projectName: mod.displayName,
          provider: 'modrinth',
          currentVersionId: mod.versionId || '',
          latestVersionId: latest.id,
          latestVersionName: latest.name || latest.version_number || '',
          latestFileName: file.filename,
          publishedAt: latest.date_published || '',
          iconUrl: mod.iconUrl || ''
        });
      }
    } catch (err) {
      updates.push({ filename: mod.filename, projectId: mod.projectId, projectName: mod.displayName, provider: 'modrinth', error: err.message || String(err) });
    }
  }
  return { checkedAt, count: updates.filter((u) => !u.error).length, updates, skippedPinned: pinned.length, releaseChannel };
}

async function updateModrinthUserMod(root, manifest, filename, releaseChannel = 'release', force = false) {
  const listing = await listMods(root, manifest, 'recent');
  const current = listing.mods.find((m) => m.filename === filename || m.baseFilename === filename);
  if (!current) throw new Error('No encontré ese mod instalado.');
  if (current.official) throw new Error('Los mods oficiales se actualizan con el modpack.');
  if (current.provider !== 'modrinth' || !current.projectId) throw new Error('Este mod no fue instalado desde Modrinth.');
  if (current.pinned && !force) throw new Error('Este mod está fijado a su versión actual. Desfijalo para actualizarlo.');

  const latest = await pickModrinthVersion(current.projectId, releaseChannel);
  if (String(latest.id) === String(current.versionId || '')) return { updated: false, reason: 'already-current', listing };
  const file = latest.files.find((f) => f.primary) || latest.files[0];
  if (!file) throw new Error('Modrinth no devolvió un archivo descargable.');
  if (officialSet(manifest).has(`mods/${file.filename}`)) throw new Error('La nueva versión de este mod ahora forma parte del modpack oficial.');

  const modsDir = path.join(root, 'mods');
  await fsp.mkdir(modsDir, { recursive: true });
  const targetName = current.enabled ? safeName(file.filename) : `${safeName(file.filename)}.disabled`;
  const target = path.join(modsDir, targetName);
  const part = `${target}.part`;
  const buf = await download(file.url, part);
  if (file.hashes?.sha512 && crypto.createHash('sha512').update(buf).digest('hex') !== file.hashes.sha512) {
    await fsp.rm(part, { force: true });
    throw new Error('La actualización no pasó la verificación SHA-512.');
  }
  await fsp.rename(part, target);
  const currentPath = path.join(modsDir, current.filename);
  if (path.resolve(currentPath) !== path.resolve(target)) await fsp.rm(currentPath, { force: true });

  const meta = await readMeta(root);
  const oldMeta = meta.mods?.[current.baseFilename] || {};
  delete meta.mods?.[current.baseFilename];
  meta.mods[file.filename] = {
    ...oldMeta,
    provider: 'modrinth', projectId: current.projectId, projectName: current.displayName,
    versionId: latest.id, iconUrl: current.iconUrl || '', sourceUrl: oldMeta.sourceUrl || '',
    installedAt: oldMeta.installedAt || current.installedAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await writeMeta(root, meta);

  for (const dep of latest.dependencies || []) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue;
    try {
      const existing = (await listMods(root, manifest, 'recent')).mods.some((m) => m.projectId === dep.project_id);
      if (existing) continue;
      const p = await fetchJson(`${MODRINTH}/project/${dep.project_id}`);
      await installModrinth(root, manifest, { id: p.id, slug: p.slug, name: p.title, iconUrl: p.icon_url || '', clientSide:p.client_side||'', serverSide:p.server_side||'' }, new Set([current.projectId]), releaseChannel);
    } catch (_) {}
  }
  return { updated: true, oldFilename: current.filename, newFilename: targetName, versionId: latest.id, listing: await listMods(root, manifest, 'recent') };
}

async function updateAllUserMods(root, manifest, releaseChannel = 'release') {
  const check = await checkModUpdates(root, manifest, releaseChannel);
  const results = [];
  for (const item of check.updates.filter((u) => !u.error)) {
    try { results.push(await updateModrinthUserMod(root, manifest, item.filename, releaseChannel)); }
    catch (err) { results.push({ updated: false, filename: item.filename, error: err.message || String(err) }); }
  }
  return { checkedAt: check.checkedAt, results, listing: await listMods(root, manifest, 'recent') };
}


async function getModDetails(project, apiKey = '', proxyUrl = '') {
  const provider = String(project?.provider || 'modrinth');
  if (provider === 'modrinth') {
    const id = encodeURIComponent(project.id || project.projectId || project.slug || '');
    if (!id) throw new Error('Proyecto de Modrinth inválido.');
    const data = await fetchJson(`${MODRINTH}/project/${id}`);
    let version = null;
    try { version = await pickModrinthVersion(data.id); } catch (_) {}
    return {
      provider: 'modrinth', id: data.id, slug: data.slug, name: data.title, summary: data.description || project.summary || '',
      body: data.body || '', author: project.author || '', iconUrl: data.icon_url || project.iconUrl || '', downloads: data.downloads || project.downloads || 0,
      followers: data.followers || 0, updatedAt: data.updated || project.updatedAt || '', createdAt: data.published || project.createdAt || '',
      categories: data.categories || project.categories || [], clientSide: data.client_side || project.clientSide || '', serverSide: data.server_side || project.serverSide || '',
      license: data.license?.name || data.license?.id || '', sourceUrl: `https://modrinth.com/mod/${data.slug || data.id}`,
      gallery: (data.gallery || []).slice(0, 6).map(g => ({ url:g.url, title:g.title || '', description:g.description || '', featured:Boolean(g.featured) })),
      latest: version ? { id:version.id, name:version.name || version.version_number || '', publishedAt:version.date_published || '', changelog:version.changelog || '' } : null
    };
  }
  const proxy = String(proxyUrl || '').replace(/\/+$/, '');
  if (proxy) {
    try {
      const data = await fetchJson(`${proxy}/project?projectId=${encodeURIComponent(project.id)}`);
      if (data?.project) return { provider:'curseforge', ...data.project };
    } catch (_) {}
  }
  if (!apiKey) return { provider:'curseforge', ...project, sourceUrl:project.websiteUrl || '', body:'CurseForge requiere el proxy o API oficial para mostrar la ficha completa.' };
  const data = await fetchJson(`${CURSEFORGE}/mods/${encodeURIComponent(project.id)}`, { headers:{'x-api-key':apiKey} });
  const x=data.data||{};
  return { provider:'curseforge', id:String(x.id||project.id), name:x.name||project.name, summary:x.summary||project.summary||'', body:'', author:(x.authors||[])[0]?.name||project.author||'', iconUrl:x.logo?.thumbnailUrl||project.iconUrl||'', downloads:x.downloadCount||project.downloads||0, updatedAt:x.dateModified||project.updatedAt||'', categories:(x.categories||[]).map(c=>c.name), sourceUrl:x.links?.websiteUrl||'', gallery:[] };
}


function compatibilityWarnings(project = {}) {
  const client = String(project.clientSide || project.client_side || '').toLowerCase();
  const server = String(project.serverSide || project.server_side || '').toLowerCase();
  const warnings = [];
  let blocked = false;
  if (client === 'unsupported' || client.includes('server_only') || client.includes('dedicated_server')) {
    blocked = true;
    warnings.push({ severity:'block', code:'not-client', text:'Este proyecto no está pensado para instalarse en el cliente de Minecraft.' });
  }
  if (server === 'required' || server === 'client_and_server') {
    warnings.push({ severity:'warn', code:'server-required', text:'Este mod también necesita estar instalado en el servidor. Agregarlo solo a tu cliente puede impedir entrar o no tener efecto.' });
  }
  return { warnings, blocked };
}

async function planModrinthInstall(root, manifest, project, releaseChannel = 'release') {
  if (!project?.id) throw new Error('Proyecto de Modrinth inválido.');
  const listing = await listMods(root, manifest, 'recent');
  const installedIds = new Set(listing.mods.filter(m => m.projectId).map(m => `${m.provider}:${m.projectId}`));
  const official = officialSet(manifest);
  const seen = new Set();
  const items = [];
  const warnings = [];
  let blocked = false;

  async function visit(input, requiredBy = '') {
    const id = String(input.id || input.projectId || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    let meta = input;
    if (!meta.clientSide && !meta.serverSide && (!meta.name || !meta.slug)) {
      const p = await fetchJson(`${MODRINTH}/project/${encodeURIComponent(id)}`);
      meta = { id:p.id, slug:p.slug, name:p.title, iconUrl:p.icon_url||'', clientSide:p.client_side||'', serverSide:p.server_side||'', categories:p.categories||[] };
    }
    const comp = compatibilityWarnings(meta);
    if (requiredBy && comp.blocked) warnings.push({ severity:'warn', code:'dependency-environment', text:`La dependencia ${meta.name || id} tiene compatibilidad de cliente limitada.` });
    else warnings.push(...comp.warnings.map(w => ({...w, project:meta.name||id})));
    if (!requiredBy && comp.blocked) blocked = true;

    const version = await pickModrinthVersion(id, releaseChannel);
    const file = version.files.find(f => f.primary) || version.files[0];
    if (!file) throw new Error(`No hay archivo descargable para ${meta.name || id}.`);
    const installed = installedIds.has(`modrinth:${id}`);
    const isOfficial = official.has(`mods/${file.filename}`);
    items.push({
      id, name:meta.name || id, slug:meta.slug || '', iconUrl:meta.iconUrl||'', filename:file.filename,
      size:Number(file.size||0), versionId:version.id, versionName:version.name||version.version_number||'', versionType:version.version_type||'release',
      installed, official:isOfficial, requiredBy, clientSide:meta.clientSide||'', serverSide:meta.serverSide||''
    });
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== 'required' || !dep.project_id) continue;
      try {
        const p = await fetchJson(`${MODRINTH}/project/${encodeURIComponent(dep.project_id)}`);
        await visit({ id:p.id, slug:p.slug, name:p.title, iconUrl:p.icon_url||'', clientSide:p.client_side||'', serverSide:p.server_side||'', categories:p.categories||[] }, meta.name || id);
      } catch (err) {
        warnings.push({ severity:'warn', code:'dependency-lookup', text:`No pude verificar una dependencia requerida: ${err.message || err}` });
      }
    }
  }

  await visit(project);
  const needed = items.filter(x => !x.installed && !x.official);
  return {
    provider:'modrinth', projectId:String(project.id), releaseChannel, blocked,
    items, needed, dependencies:needed.slice(1), totalSize:needed.reduce((n,x)=>n+Number(x.size||0),0),
    warnings:warnings.slice(0,12), alreadyInstalled:items[0]?.installed || items[0]?.official || false
  };
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
    if (mod.projectId) {
      const key = `${mod.provider}:${mod.projectId}`;
      const prior = byProject.get(key);
      if (prior) issues.push({ severity:'bad', type:'duplicate-project', mod:mod.displayName, filename:mod.filename, text:`Duplicado con ${prior.filename}` });
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

module.exports = { listMods, addMods, toggleMod, removeMod, toggleFavorite, togglePin, setAllUserModsEnabled, searchModrinth, installModrinth, planModrinthInstall, searchCurseForge, installCurseForge, getModDetails, copyModToRoot, checkModUpdates, updateModrinthUserMod, updateAllUserMods, identifyLocalModrinthMods, auditMods, MODRINTH_CATEGORY_MAP };
