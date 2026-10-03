const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { ensureFreeSpace } = require('./systemService');
const { fileURLToPath } = require('url');
const launcherVersion = require('../../../package.json').version;

const STATE_FILE = '.eternal-pack.json';
const INTERNAL_DIR = '.launcher';
const INDEX_FILE = path.join(INTERNAL_DIR, 'file-index.json');
const OFFICIAL_FILES_FILE = path.join(INTERNAL_DIR, 'official-files.json');
const CACHE_DIR = path.join(INTERNAL_DIR, 'cache');
const STAGING_DIR = path.join(INTERNAL_DIR, 'staging');
const ROLLBACK_DIR = path.join(INTERNAL_DIR, 'rollback');
const blobJobs = new Map();

function safeTarget(root, relativePath) {
  const cleaned = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('\0')) throw new Error('Ruta de archivo inválida');
  const target = path.resolve(root, cleaned);
  const base = path.resolve(root) + path.sep;
  if (target !== path.resolve(root) && !target.startsWith(base)) throw new Error(`Ruta fuera de la instancia: ${relativePath}`);
  return target;
}

function safeInside(root, relativePath) {
  const cleaned = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(root, cleaned);
  const base = path.resolve(root) + path.sep;
  if (target !== path.resolve(root) && !target.startsWith(base)) throw new Error(`Ruta interna inválida: ${relativePath}`);
  return target;
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readIndex(root) {
  try {
    const value = JSON.parse(await fsp.readFile(path.join(root, INDEX_FILE), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { files: {} };
    return { ...value, files: value.files && typeof value.files === 'object' && !Array.isArray(value.files) ? value.files : {} };
  } catch (_) { return { files: {} }; }
}
async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  const serialized = JSON.stringify(value, null, 2);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(temporary, serialized, 'utf8');
  try {
    await fsp.rename(temporary, file);
  } catch (error) {
    // Windows cannot replace an existing file with rename(). Keep the safe
    // temporary write, then fall back to a normal replacement there.
    await fsp.writeFile(file, serialized, 'utf8');
    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
}
async function writeIndex(root, index) {
  await writeJsonAtomic(path.join(root, INDEX_FILE), index);
}

async function fileStatus(root, entry, index) {
  const target = safeTarget(root, entry.path);
  try {
    const stat = await fsp.stat(target);
    if (!stat.isFile()) return { ...entry, status: 'missing' };
    if (entry.size && stat.size !== entry.size) return { ...entry, status: 'changed', reason: 'size' };
    const cached = index.files?.[entry.path];
    const sameMeta = cached && cached.size === stat.size && Math.abs(Number(cached.mtimeMs) - stat.mtimeMs) < 2 && cached.sha256 === entry.sha256;
    if (sameMeta) return { ...entry, status: 'ok', cached: true };
    const hash = await sha256File(target);
    if (hash.toLowerCase() !== String(entry.sha256).toLowerCase()) return { ...entry, status: 'changed', reason: 'sha256' };
    index.files[entry.path] = { size: stat.size, mtimeMs: stat.mtimeMs, sha256: hash };
    return { ...entry, status: 'ok' };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...entry, status: 'missing' };
    return { ...entry, status: 'error', reason: err.message };
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let next = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (true) { const i = next++; if (i >= items.length) break; results[i] = await fn(items[i], i); }
  });
  await Promise.all(workers); return results;
}

async function readState(root) {
  const empty = { version: null, minecraft: null, forge: null, forgeInstaller: null, minimumLauncher: null, updatedAt: null };
  try {
    const value = JSON.parse(await fsp.readFile(path.join(root, STATE_FILE), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
    return {
      version: typeof value.version === 'string' ? value.version : null,
      minecraft: typeof value.minecraft === 'string' ? value.minecraft : null,
      forge: typeof value.forge === 'string' ? value.forge : null,
      forgeInstaller: value.forgeInstaller && typeof value.forgeInstaller === 'object' ? value.forgeInstaller : null,
      minimumLauncher: typeof value.minimumLauncher === 'string' ? value.minimumLauncher : null,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
    };
  } catch (_) { return empty; }
}
async function writeState(root, manifest) {
  const state = {
    version: manifest.version,
    minecraft: manifest.minecraft,
    forge: manifest.forge,
    forgeInstaller: manifest.forgeInstaller || null,
    minimumLauncher: manifest.minimumLauncher || null,
    updatedAt: new Date().toISOString()
  };
  await writeJsonAtomic(path.join(root, STATE_FILE), state);
  return state;
}

function manifestPaths(manifest) {
  return (Array.isArray(manifest?.files) ? manifest.files : [])
    .map((entry) => String(entry?.path || '').replace(/\\/g, '/'))
    .filter(Boolean);
}

function normalizeModMetadataPath(name) {
  const value = String(name || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^mods\//i, '').replace(/\.disabled$/i, '');
  if (!value || value.includes('/') || !/\.jar$/i.test(value)) return '';
  return `mods/${value}`.toLowerCase();
}

// Paths a pack may ever own. A file is only retired after the manifest stops
// listing it, so this inventory must survive a lost or half-written metadata
// file: `known` keeps every path that was ever distributed by the pack. Any
// path a player added themselves is still recorded as personal (user-mods.json)
// and never removed by the `known` list.
const MAX_KNOWN_OFFICIAL_PATHS = 20000;

function isManagedOfficialPath(file) {
  const parts = String(file || '').split('/');
  const lower = String(file || '').toLowerCase();
  return parts.length >= 2 && parts.every((part) => part && part !== '.' && part !== '..')
    && (lower.startsWith('mods/') || lower.startsWith('iammusicplayerrenewed/'));
}
function normalizeOfficialList(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const file = String(entry || '').replace(/\\/g, '/');
    if (!isManagedOfficialPath(file)) continue;
    const key = file.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}
async function readOfficialInventory(root) {
  try {
    const data = JSON.parse(await fsp.readFile(path.join(root, OFFICIAL_FILES_FILE), 'utf8'));
    const files = Array.isArray(data) ? data : data?.files;
    return { current: new Set(normalizeOfficialList(files)), known: new Set(normalizeOfficialList(data?.known)) };
  } catch (_) {
    return { current: new Set(), known: new Set() };
  }
}
async function readOfficialFiles(root) {
  return (await readOfficialInventory(root)).current;
}

async function writeOfficialFiles(root, manifest) {
  const file = path.join(root, OFFICIAL_FILES_FILE);
  const previous = await readOfficialInventory(root);
  const current = normalizeOfficialList(manifestPaths(manifest));
  const known = [];
  const seen = new Set();
  for (const entry of [...current, ...previous.current, ...previous.known]) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    known.push(entry);
  }
  await writeJsonAtomic(file, {
    version: String(manifest?.version || ''),
    updatedAt: new Date().toISOString(),
    files: current,
    known: known.slice(0, MAX_KNOWN_OFFICIAL_PATHS)
  });
}

async function readUserAddedPaths(root) {
  try {
    const data = JSON.parse(await fsp.readFile(path.join(root, path.join(INTERNAL_DIR, 'user-mods.json')), 'utf8'));
    return new Set(Object.entries(data?.mods || {})
      .filter(([, metadata]) => String(metadata?.provider || '').toLowerCase() === 'local')
      .map(([name]) => normalizeModMetadataPath(name))
      .filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

async function reconcileOfficialModMetadata(root, manifest) {
  const file = path.join(root, INTERNAL_DIR, 'user-mods.json');
  let data;
  try { data = JSON.parse(await fsp.readFile(file, 'utf8')); } catch (_) { return false; }
  if (!data || typeof data !== 'object' || !data.mods || typeof data.mods !== 'object') return false;
  const official = new Set(manifestPaths(manifest)
    .map((entry) => entry.toLowerCase())
    .filter((entry) => entry.startsWith('mods/') && entry.endsWith('.jar')));
  let changed = false;
  for (const [name, metadata] of Object.entries(data.mods)) {
    const key = normalizeModMetadataPath(name);
    if (!official.has(key) || !metadata || typeof metadata !== 'object') continue;
    if (String(metadata.provider || '').toLowerCase() === 'local') {
      data.mods[name] = { ...metadata, provider: 'official' };
      changed = true;
    }
  }
  if (changed) await writeJsonAtomic(file, data);
  return changed;
}

// A developer publish can promote a local SIEGE jar before any player runs
// the next pack update. Persist the same inventory used by repairInstallation
// so the source instance immediately agrees with the verified manifest.
async function markPublishedOfficial(root, manifest) {
  if (!root || !manifest || !Array.isArray(manifest.files)) return false;
  await fsp.mkdir(root, { recursive: true });
  const changed = await reconcileOfficialModMetadata(root, manifest);
  await writeOfficialFiles(root, manifest);
  return changed;
}

async function removalPlan(root, manifest) {
  const current = new Set(manifestPaths(manifest));
  const currentKeys = new Set([...current].map((file) => file.toLowerCase()));
  const inventory = await readOfficialInventory(root);
  const previousOfficial = inventory.current;
  const userAdded = await readUserAddedPaths(root);
  const previousOfficialKeys = new Set([...previousOfficial].map((file) => file.toLowerCase()));
  const explicit = Array.isArray(manifest?.remove) ? manifest.remove : [];
  const explicitKeys = new Set(explicit
    .map((file) => String(file || '').replace(/\\/g, '/').toLowerCase())
    .filter(Boolean));
  const staleOfficial = [...previousOfficial].filter((file) => !currentKeys.has(file.toLowerCase()));
  // Files the pack distributed at some point but no longer ships. They are
  // still retirable when the persisted inventory was lost or interrupted,
  // except when the player registered that exact path as a personal mod.
  const staleKnown = [...inventory.known].filter((file) => {
    const key = file.toLowerCase();
    return !currentKeys.has(key) && !previousOfficialKeys.has(key) && !userAdded.has(key);
  });
  const candidates = [...new Set([...explicit, ...staleOfficial, ...staleKnown])]
    .map((file) => String(file || '').replace(/\\/g, '/'))
    // Retire only files owned by the pack. A personal jar must survive even if
    // an old manifest accidentally listed the same path in `remove`; the
    // persisted official inventory is the stronger signal when metadata is
    // stale and still says `local`.
    .filter((file) => {
      const key = file.toLowerCase();
      // A `remove` entry is published from the previous official manifest.
      // It must also clean older installs that predate official-files.json,
      // where stale `local` metadata would otherwise preserve the retired jar.
      return file && !currentKeys.has(key) && (explicitKeys.has(key) || previousOfficialKeys.has(key) || !userAdded.has(key));
    });
  const paths = [];
  for (const file of candidates) {
    if (await fsp.lstat(safeTarget(root, file)).catch(() => null)) paths.push(file);
    if (/\.jar$/i.test(file) && await fsp.lstat(safeTarget(root, `${file}.disabled`)).catch(() => null)) paths.push(`${file}.disabled`);
  }
  return { paths, previousOfficial, userAdded, known: inventory.known };
}

/**
 * Directories inside the managed roots that only existed to hold pack files
 * disappear together with their last file (for example the native library
 * folder of a platform the pack no longer ships). Empty folders left behind by
 * a retired mod are the kind of orphan state a repair should clean up.
 */
async function pruneEmptyManagedDirectories(root, removedPaths = []) {
  const roots = ['mods', 'iammusicplayerrenewed'];
  const directories = new Set();
  for (const relative of removedPaths) {
    const parts = String(relative || '').replace(/\\/g, '/').split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  }
  const sorted = [...directories].sort((a, b) => b.split('/').length - a.split('/').length);
  let removed = 0;
  for (const relative of sorted) {
    const normalized = relative.toLowerCase();
    const insideManagedRoot = roots.some((base) => normalized === base || normalized.startsWith(`${base}/`));
    if (!insideManagedRoot) continue;
    if (roots.includes(normalized)) continue;
    const target = safeTarget(root, relative);
    try {
      const entries = await fsp.readdir(target);
      if (entries.length) continue;
      await fsp.rm(target, { recursive: true, force: true });
      removed++;
    } catch (_) {}
  }
  return removed;
}

async function checkInstallation(root, manifest, onProgress = () => {}) {
  await fsp.mkdir(root, { recursive: true });
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const index = await readIndex(root); index.files ||= {};
  let completed = 0;
  const statuses = await mapLimit(files, 6, async (entry) => {
    const result = await fileStatus(root, entry, index);
    completed++;
    onProgress({ phase: 'checking', current: completed, total: files.length, file: entry.path });
    return result;
  });
  const validPaths = new Set(files.map((f) => f.path));
  for (const key of Object.keys(index.files)) if (!validPaths.has(key)) delete index.files[key];
  await writeIndex(root, index);
  const state = await readState(root);
  const removals = await removalPlan(root, manifest);
  const missing = statuses.filter((f) => f.status === 'missing');
  const changed = statuses.filter((f) => f.status === 'changed' || f.status === 'error');
  return {
    state, expectedVersion: manifest.version, versionMatches: state.version === manifest.version,
    total: files.length, ok: statuses.filter((f) => f.status === 'ok').length, missing, changed,
    remove: removals.paths,
    bytesRequired: [...missing, ...changed].reduce((sum, f) => sum + Number(f.size || 0), 0),
    healthy: missing.length === 0 && changed.length === 0 && removals.paths.length === 0 && (files.length === 0 || state.version === manifest.version)
  };
}

async function fetchWithRetry(url, options = {}, attempts = 3, timeoutMs = 120000) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: options.signal || controller.signal });
      if (response.ok) return response;
      last = new Error(`HTTP ${response.status}`);
      last.retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (!last.retryable) throw last;
    } catch (err) {
      last = err?.name === 'AbortError' ? new Error(`La descarga superó el tiempo de espera (${Math.round(timeoutMs / 1000)} s).`) : err;
      const transient = Boolean(last?.retryable)
        || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(err?.code)
        || err?.name === 'TypeError'
        || /fetch failed|network|socket|connect/i.test(String(err?.message || ''));
      if (!transient) throw last;
      if (attempt >= attempts) break;
    } finally { clearTimeout(timer); }
    if (attempt >= attempts) break;
    await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
  }
  throw last || new Error('No se pudo descargar el archivo.');
}

async function downloadFile(url, destination, expectedSha256, onChunk = () => {}) {
  if (!url) throw new Error(`URL faltante para ${path.basename(destination)}`);
  const rawUrl=String(url);
  if(!rawUrl.startsWith('file://')) { let parsed; try{parsed=new URL(rawUrl);}catch(_){throw new Error('URL de descarga inválida');} const local=parsed.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(parsed.hostname); if(parsed.protocol!=='https:'&&!local) throw new Error('Descarga bloqueada: se requiere HTTPS'); }
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temp = `${destination}.part-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  if (String(url).startsWith('file://')) {
    const source = fileURLToPath(String(url));
    const stat = await fsp.stat(source);
    onChunk(stat.size, stat.size);
    await fsp.copyFile(source, temp);
    if (expectedSha256) {
      const actual = await sha256File(temp);
      if (actual.toLowerCase() !== String(expectedSha256).toLowerCase()) { await fsp.rm(temp,{force:true}); throw new Error(`SHA-256 no coincide para ${path.basename(destination)}`); }
    }
    await fsp.rm(destination, { force: true }).catch(() => {});
    await fsp.rename(temp, destination);
    return;
  }
  const response = await fetchWithRetry(url, { headers: { 'User-Agent': `EternalCraftLauncher/${launcherVersion}`, Accept: '*/*' } }, 3, 120000);
  if (!response.body) throw new Error(`Respuesta vacía al descargar ${url}`);
  const total = Number(response.headers.get('content-length') || 0); let received = 0;
  const reader = response.body.getReader();
  let bodyTimer;
  const source = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) return this.push(null);
        received += value.byteLength; onChunk(received, total); this.push(Buffer.from(value));
        clearTimeout(bodyTimer); bodyTimer = setTimeout(() => { reader.cancel().catch(() => {}); source.destroy(new Error('La descarga quedó sin datos durante demasiado tiempo.')); }, 120000);
      } catch (err) { this.destroy(err); }
    }
  });
  bodyTimer = setTimeout(() => {
    reader.cancel().catch(() => {});
    source.destroy(new Error('La descarga quedó sin datos durante demasiado tiempo.'));
  }, 120000);
  try {
    await pipeline(source, fs.createWriteStream(temp));
    if (expectedSha256) {
      const actual = await sha256File(temp);
      if (actual.toLowerCase() !== String(expectedSha256).toLowerCase()) throw new Error(`SHA-256 no coincide para ${path.basename(destination)}`);
    }
    await fsp.rm(destination, { force: true }).catch(() => {});
    await fsp.rename(temp, destination);
  } catch (err) { await fsp.rm(temp, { force: true }).catch(() => {}); throw err; }
  finally { clearTimeout(bodyTimer); }
}

async function validCachedBlob(file, entry) {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return false;
    if (entry.size && stat.size !== Number(entry.size)) return false;
    return (await sha256File(file)).toLowerCase() === String(entry.sha256).toLowerCase();
  } catch (_) { return false; }
}

async function ensureCachedBlob(root, entry, onChunk = () => {}) {
  const cacheRoot = path.join(root, CACHE_DIR);
  await fsp.mkdir(cacheRoot, { recursive: true });
  const hash=String(entry.sha256).toLowerCase();
  const blob = path.join(cacheRoot, hash);
  if (await validCachedBlob(blob, entry)) return { path: blob, fromCache: true };
  const active=blobJobs.get(`${path.resolve(root)}:${hash}`);
  if(active){await active;return {path:blob,fromCache:false,shared:true};}
  const key=`${path.resolve(root)}:${hash}`;
  const job=(async()=>{
    if (entry.empty && Number(entry.size || 0) === 0) {
      await fsp.writeFile(blob, '');
      onChunk(0, 0);
      return;
    }
    await downloadFile(entry.url, blob, entry.sha256, onChunk);
  })();
  blobJobs.set(key,job);
  try { await job; return { path: blob, fromCache: false }; }
  finally { if(blobJobs.get(key)===job)blobJobs.delete(key); }
}

async function ensureForgeInstaller(root, manifest, onProgress = () => {}) {
  const forge = manifest.forgeInstaller; if (!forge?.url) return null;
  const destination = path.join(root, INTERNAL_DIR, `forge-${manifest.minecraft}-${manifest.forge}-installer.jar`);
  let valid = false;
  try { valid = forge.sha256 ? (await sha256File(destination)).toLowerCase() === forge.sha256.toLowerCase() : (await fsp.stat(destination)).isFile(); } catch (_) {}
  if (!valid) {
    onProgress({ phase: 'forge', current: 0, total: 1, file: path.basename(destination) });
    await downloadFile(forge.url, destination, forge.sha256, (received, total) => onProgress({ phase: 'forge', current: received, total, file: path.basename(destination), bytesReceived: received, bytesTotal: total }));
  }
  return destination;
}

async function backupPath(source, destination) {
  try {
    const stat = await fsp.lstat(source);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    if (stat.isDirectory()) await fsp.cp(source, destination, { recursive: true, force: true });
    else await fsp.copyFile(source, destination);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function restoreRollback(root, rollbackRoot, records) {
  for (const record of [...records].reverse()) {
    const target = safeTarget(root, record.path);
    await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
    if (record.hadOriginal) {
      const backup = safeInside(rollbackRoot, record.backupPath);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      try {
        const stat = await fsp.lstat(backup);
        if (stat.isDirectory()) await fsp.cp(backup, target, { recursive: true, force: true });
        else await fsp.copyFile(backup, target);
      } catch (_) {}
    }
  }
}

async function cleanupInterruptedTransactions(root, maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  const cacheDir = path.join(root, CACHE_DIR);
  try {
    for (const entry of await fsp.readdir(cacheDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.part-\d+-\d+$/i.test(entry.name)) continue;
      await fsp.rm(path.join(cacheDir, entry.name), { force: true }).catch(() => {});
    }
  } catch (_) {}
  for (const directory of [path.join(root, STAGING_DIR), path.join(root, ROLLBACK_DIR)]) {
    try {
      for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^tx-\d+-\d+$/i.test(entry.name)) continue;
        const full = path.join(directory, entry.name);
        const stat = await fsp.stat(full).catch(() => null);
        if (stat && now - stat.mtimeMs > maxAgeMs) await fsp.rm(full, { recursive: true, force: true }).catch(() => {});
      }
    } catch (_) {}
  }
}

async function repairInstallation(root, manifest, onProgress = () => {}, existingCheck = null) {
  await cleanupInterruptedTransactions(root);
  // An update flow often checks the same manifest immediately before repair
  // to decide whether a snapshot is needed. Reuse that result instead of
  // hashing every installed JAR a second time.
  const check = existingCheck || await checkInstallation(root, manifest, onProgress);
  const removals = await removalPlan(root, manifest);
  const priorState = check.state || { version: null, updatedAt: null };
  const targets = [...check.missing, ...check.changed];
  await ensureFreeSpace(root, check.bytesRequired);
  if (targets.length === 0 && removals.paths.length === 0) {
    // Nothing to download, replace or delete: the only possible difference is
    // bookkeeping. A missing/incomplete `.eternal-pack.json` (a player removed
    // it, an interrupted first migration, a launcher that predates the file)
    // used to force a full staging transaction that had no work to do and
    // could fail on its own. Record the expected state instead.
    if (!(await fsp.stat(path.join(root, OFFICIAL_FILES_FILE)).catch(() => null))) {
      await writeOfficialFiles(root, manifest);
    }
    await reconcileOfficialModMetadata(root, manifest);
    const state = check.versionMatches ? priorState : await writeState(root, manifest);
    const after = check.versionMatches ? check : await checkInstallation(root, manifest, onProgress);
    if (!after.healthy) throw new Error('La verificación final falló. Se restauró la instalación anterior.');
    return { ...after, state, repaired: 0, removed: 0, cacheHits: 0, downloaded: 0 };
  }

  const stagingRoot = path.join(root, STAGING_DIR, `tx-${Date.now()}-${process.pid}`);
  const rollbackRoot = path.join(root, ROLLBACK_DIR, `tx-${Date.now()}-${process.pid}`);
  await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(rollbackRoot, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(stagingRoot, { recursive: true });
  await fsp.mkdir(rollbackRoot, { recursive: true });

  let bytesDone = 0;
  let cacheHits = 0;
  let downloaded = 0;
  let staged = 0;
  const records = [];

  try {
    await mapLimit(targets, 4, async (entry) => {
      let last = 0;
      const cached = await ensureCachedBlob(root, entry, (received, total) => {
        const delta = Math.max(0, received - last); last = received; bytesDone += delta;
        onProgress({ phase: 'downloading', current: staged, total: targets.length, file: entry.path, bytesReceived: bytesDone, bytesTotal: check.bytesRequired || total });
      });
      if (cached.fromCache) cacheHits++; else downloaded++;
      const stageFile = safeInside(stagingRoot, entry.path);
      await fsp.mkdir(path.dirname(stageFile), { recursive: true });
      await fsp.copyFile(cached.path, stageFile);
      staged++;
      onProgress({ phase: 'preparing', current: staged, total: targets.length, file: entry.path, bytesReceived: bytesDone, bytesTotal: check.bytesRequired, fromCache: cached.fromCache });
    });

    let applied = 0;
    for (const entry of targets) {
      const target = safeTarget(root, entry.path);
      const stageFile = safeInside(stagingRoot, entry.path);
      const backupRel = `files/${entry.path}`;
      const backup = safeInside(rollbackRoot, backupRel);
      const hadOriginal = await backupPath(target, backup);
      records.push({ path: entry.path, hadOriginal, backupPath: backupRel });
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
      await fsp.rename(stageFile, target);
      applied++;
      onProgress({ phase: 'applying', current: applied, total: targets.length, file: entry.path });
    }

    let removed = 0;
    for (const relativePath of removals.paths) {
      const target = safeTarget(root, relativePath);
      const backupRel = `removed/${relativePath}`;
      const backup = safeInside(rollbackRoot, backupRel);
      const hadOriginal = await backupPath(target, backup);
      records.push({ path: relativePath, hadOriginal, backupPath: backupRel });
      await fsp.rm(target, { recursive: true, force: true });
      removed++;
      onProgress({ phase: 'removing', current: removed, total: removals.paths.length, file: relativePath });
    }
    // Only after the files are really gone: remove the empty folders they left
    // inside the managed roots so a retired mod cannot leave orphan structure.
    await pruneEmptyManagedDirectories(root, removals.paths).catch(() => 0);

    const forgeInstaller = await ensureForgeInstaller(root, manifest, onProgress);
    const state = await writeState(root, manifest);
    await fsp.rm(path.join(root, INDEX_FILE), { force: true }).catch(() => {});
    const after = await checkInstallation(root, manifest, onProgress);
    if (!after.healthy) throw new Error('La verificación final falló. Se restauró la instalación anterior.');

    // Persist the exact official inventory only after the transaction verifies
    // successfully. This lets the next update remove retired official files
    // without touching mods installed through “Agregar .jar”.
    await writeOfficialFiles(root, manifest);
    await reconcileOfficialModMetadata(root, manifest);

    await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(rollbackRoot, { recursive: true, force: true }).catch(() => {});
    const cache = await pruneCache(root, manifest).catch(() => ({ removed: 0, bytes: 0 }));
    return { ...after, state, repaired: targets.length, removed, forgeInstaller, cacheHits, downloaded, cache };
  } catch (err) {
    try {
      if (records.length) await restoreRollback(root, rollbackRoot, records);
      if (priorState?.version) await fsp.writeFile(path.join(root, STATE_FILE), JSON.stringify(priorState, null, 2));
      else await fsp.rm(path.join(root, STATE_FILE), { force: true }).catch(() => {});
      await fsp.rm(path.join(root, INDEX_FILE), { force: true }).catch(() => {});
    } catch (_) {}
    await fsp.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(rollbackRoot, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}


async function cacheStats(root) {
  const dir = path.join(root, CACHE_DIR);
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { return { files: 0, bytes: 0 }; }
  let bytes = 0; let files = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try { const stat = await fsp.stat(path.join(dir, entry.name)); bytes += stat.size; files++; } catch (_) {}
  }
  return { files, bytes };
}

async function pruneCache(root, manifest, maxBytes = 1536 * 1024 * 1024) {
  const dir = path.join(root, CACHE_DIR);
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { return { removed: 0, bytes: 0 }; }
  const protectedHashes = new Set((manifest?.files || []).map((f) => String(f.sha256 || '').toLowerCase()).filter(Boolean));
  const files = [];
  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    try {
      const stat = await fsp.stat(full); total += stat.size;
      files.push({ full, name: entry.name.toLowerCase(), size: stat.size, mtimeMs: stat.mtimeMs });
    } catch (_) {}
  }
  if (total <= maxBytes) return { removed: 0, bytes: total };
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  let removed = 0;
  for (const file of files) {
    if (total <= maxBytes) break;
    if (protectedHashes.has(file.name)) continue;
    await fsp.rm(file.full, { force: true }).catch(() => {});
    total -= file.size; removed++;
  }
  return { removed, bytes: Math.max(0, total) };
}

async function clearCache(root) {
  const cacheRoot = path.join(root, CACHE_DIR);
  let before = { files:0, bytes:0 };
  try { before = await cacheStats(root); } catch (_) {}
  await fsp.rm(cacheRoot, { recursive:true, force:true });
  await fsp.mkdir(cacheRoot, { recursive:true });
  return { clearedFiles:Number(before.files||0), clearedBytes:Number(before.bytes||0) };
}

module.exports = { checkInstallation, repairInstallation, ensureForgeInstaller, safeTarget, sha256File, readState, cacheStats, pruneCache, clearCache, readOfficialFiles, readOfficialInventory, removalPlan, pruneEmptyManagedDirectories, reconcileOfficialModMetadata, markPublishedOfficial, ensureCachedBlob };
