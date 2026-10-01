#!/usr/bin/env node
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { twoWordReleaseName } = require('./release-name');
function resolveLauncherVersion() {
  const candidates = [
    process.env.ETERNAL_LAUNCHER_VERSION,
    path.join(__dirname, '..', 'package.json'),
    process.resourcesPath ? path.join(process.resourcesPath, 'launcher-package.json') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'package.json') : '',
    path.join(__dirname, '..', '..', 'package.json')
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = candidate.endsWith('.json') && !candidate.includes('package.json') ? candidate : candidate;
      const parsed = typeof value === 'string' && value.endsWith('.json') && fs.existsSync(value)
        ? JSON.parse(fs.readFileSync(value, 'utf8'))
        : null;
      if (parsed?.version) return String(parsed.version);
      if (!value.endsWith('.json') && value) return String(value);
    } catch (_) {}
  }
  return '0.0.0';
}
const launcherVersion = resolveLauncherVersion();

const FORGE_URL = 'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-installer.jar';

const SKIP_DIRS = new Set([
  'saves', 'screenshots', 'logs', 'crash-reports', 'backups',
  'libraries', 'assets', 'versions', 'runtime', 'natives',
  '.cache', '.launcher', 'webcache', 'downloads', 'server-resource-packs',
  'journeymap', 'XaeroWaypoints', 'XaeroWorldMap', 'replay_recordings',
  '.git', '.github'
]);
const SKIP_FILES = new Set([
  'options.txt', 'optionsof.txt', 'servers.dat', 'servers.dat_old',
  'launcher_profiles.json', 'launcher_accounts.json', 'launcher_log.txt',
  'usercache.json', 'usernamecache.json', 'realms_persistence.json',
  '.eternal-pack.json', '.DS_Store', 'knownkeys.txt', '.env',
  '.env.local', '.env.production', 'credentials.json', 'secrets.json',
  'client_token.json', 'launcher_accounts.json'
]);
// Filesystem debris must never become part of the published pack. A deleted
// but still-open mod shows up as `.fuse_hidden…`, a partially written download
// as `mod-1.2.jar.part`, a disabled mod as `mod.jar.disabled` and editors leave
// `~`, `.bak` or `.swp` copies behind. Publishing any of them makes the pack
// look like it still ships a mod the developer already removed.
const JUNK_FILE_PATTERNS = [
  /^(?:\.fuse_hidden|\.goutputstream-|\.nfs)/i,
  /^(?:thumbs\.db|ehthumbs\.db|desktop\.ini|\.ds_store)$/i,
  /(?:^|[._-])(?:secret|token|credential|password|private)[^/]*$/i
];
const JUNK_SUFFIX_PATTERN = /(?:~|\.(?:bak|backup|old|orig|save|tmp|temp|part|partial|download|crdownload|swp|swo|lock|disabled))$/i;
const JUNK_FILE_TYPES = /\.(?:pem|key|p12|pfx|jks|keystore|log|dmp)$/i;

/**
 * True when an entry inside the published tree is filesystem debris that must
 * not be distributed. Hidden entries are rejected on purpose: the pack payload
 * only contains regular mod files and the iammusicplayerrenewed assets.
 */
function isJunkEntry(name, isDirectory = false) {
  const value = String(name || '');
  if (!value || value === '.' || value === '..') return true;
  if (value.startsWith('.')) return true;
  if (JUNK_FILE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  if (isDirectory) return false;
  if (JUNK_SUFFIX_PATTERN.test(value)) return true;
  if (JUNK_FILE_TYPES.test(value)) return true;
  return false;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function resolveGameRoot(candidate) {
  const roots = [candidate, path.join(candidate, '.minecraft'), path.join(candidate, 'minecraft')];
  for (const root of roots) {
    try {
      const st = await fsp.stat(path.join(root, 'mods'));
      if (st.isDirectory()) return root;
    } catch (_) {}
  }
  return null;
}

function shouldSkip(relative, entry) {
  const normalized = relative.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.some((part) => SKIP_DIRS.has(part))) return true;
  if (isJunkEntry(entry.name, entry.isDirectory())) return true;
  if (!entry.isDirectory() && SKIP_FILES.has(entry.name)) return true;
  return false;
}

/** Reason why an entry is excluded, used by the publish preview. */
function skipReason(relative, entry) {
  const normalized = relative.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.slice(0, -1).some((part) => SKIP_DIRS.has(part))) return 'directorio excluido';
  if (isJunkEntry(entry.name, entry.isDirectory())) return 'archivo temporal o basura';
  if (!entry.isDirectory() && SKIP_FILES.has(entry.name)) return 'archivo personal o de estado';
  return '';
}

function isPublishedPath(relative) {
  const normalized = String(relative || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized === 'mods' || normalized.startsWith('mods/')
    || normalized === 'iammusicplayerrenewed' || normalized.startsWith('iammusicplayerrenewed/');
}

function publishedPathKind(relative) {
  const normalized = String(relative || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized === 'mods' || normalized.startsWith('mods/')) return 'mods';
  if (normalized === 'iammusicplayerrenewed' || normalized.startsWith('iammusicplayerrenewed/')) return 'iammusicplayerrenewed';
  return null;
}

async function walkDetailed(root, dir = root, prefix = '', ignored = []) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { return { files: [], ignored }; }
  const out = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const normalized = relative.replace(/\\/g, '/');
    if (shouldSkip(relative, entry)) {
      // Only report exclusions inside the payload boundary: those are the ones
      // that could silently change what the pack distributes.
      if (isPublishedPath(normalized)) ignored.push({ path: normalized, reason: skipReason(relative, entry) });
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (isPublishedPath(normalized)) ignored.push({ path: normalized, reason: 'enlace simbólico' });
      continue;
    }
    if (entry.isDirectory()) {
      const nested = await walkDetailed(root, full, relative, ignored);
      out.push(...nested.files);
    } else if (entry.isFile()) out.push({ relative: normalized, full });
  }
  return { files: out, ignored };
}

async function walk(root, dir = root, prefix = '') {
  return (await walkDetailed(root, dir, prefix)).files;
}

function cleanBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function readJsonMaybe(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch (_) { return null; }
}

async function resolveNotes(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const stat = await fsp.stat(path.resolve(raw));
    if (stat.isFile()) return (await fsp.readFile(path.resolve(raw), 'utf8')).trim();
  } catch (_) {}
  return raw;
}

async function readLocalUserModPaths(source) {
  try {
    const data = JSON.parse(await fsp.readFile(path.join(source, '.launcher', 'user-mods.json'), 'utf8'));
    return new Set(Object.entries(data?.mods || {})
      .filter(([, metadata]) => String(metadata?.provider || '').toLowerCase() === 'local')
      .map(([name]) => `mods/${String(name).replace(/\\/g, '/')}`)
      .filter((file) => /^mods\/[^/]+\.jar$/i.test(file))
      .map((file) => file.toLowerCase()));
  } catch (_) {
    return new Set();
  }
}

async function listPublishableFiles(source, { includeUserMods = false } = {}) {
  const localUserMods = await readLocalUserModPaths(source);
  const { files, ignored } = await walkDetailed(source);
  const publishable = files.filter((file) => isPublishedPath(file.relative));
  const selected = includeUserMods ? publishable : publishable.filter((file) => !localUserMods.has(file.relative.toLowerCase()));
  // A retired path that no longer exists cannot be distributed, so reporting
  // exclusions lets the developer confirm that deleted files really left the
  // payload instead of trusting a silent filter.
  const ignoredInPayload = ignored
    .filter((entry) => entry.path !== 'mods' && entry.path !== 'iammusicplayerrenewed')
    .sort((a, b) => a.path.localeCompare(b.path));
  return { files: selected, excludedUserMods: publishable.length - selected.length, ignored: ignoredInPayload };
}

/**
 * Keep the publisher honest about its payload boundary. This is intentionally
 * checked from the source tree a second time instead of trusting the array
 * that was used to build the manifest. It catches future regressions where a
 * filter, a staging step, or a hand-edited manifest drops a SIEGE file.
 */
async function validatePublishedPayload(source, manifest, { includeUserMods = false } = {}) {
  const { files: sourceFiles, excludedUserMods, ignored = [] } = await listPublishableFiles(source, { includeUserMods });
  const expected = new Map(sourceFiles.map((file) => [file.relative, publishedPathKind(file.relative)]));
  const manifestPaths = (manifest?.files || []).map((file) => String(file.path || '').replace(/\\/g, '/'));
  const duplicatePaths = [...new Set(manifestPaths.filter((file, index) => manifestPaths.indexOf(file) !== index))];
  if (duplicatePaths.length) throw new Error(`El manifest contiene rutas duplicadas: ${duplicatePaths.slice(0, 5).join(', ')}.`);
  const actual = new Map(manifestPaths.map((file) => [file, publishedPathKind(file)]));
  const missing = [...expected.keys()].filter((file) => !actual.has(file));
  const unexpected = [...actual.keys()].filter((file) => !expected.has(file) || !actual.get(file));
  if (missing.length || unexpected.length) {
    const details = [
      missing.length ? `faltan ${missing.length}: ${missing.slice(0, 5).join(', ')}` : '',
      unexpected.length ? `sobran ${unexpected.length}: ${unexpected.slice(0, 5).join(', ')}` : ''
    ].filter(Boolean).join(' · ');
    throw new Error(`El manifest no coincide con el payload de SIEGE (${details}). La publicación fue detenida.`);
  }
  const payload = {
    total: expected.size,
    mods: [...expected.values()].filter((kind) => kind === 'mods').length,
    iammusicplayerrenewed: [...expected.values()].filter((kind) => kind === 'iammusicplayerrenewed').length,
    personalModsExcluded: excludedUserMods,
    ignored: ignored.slice(0, 50)
  };
  if (!payload.mods) throw new Error(`La instancia ${source} no contiene mods publicables.`);
  return payload;
}

/**
 * Content identity of a published manifest. Only the data that decides what a
 * launcher installs participates: version, payload, referenced URLs and the
 * retired-path list. Timestamps and release notes are metadata and must never
 * make two otherwise identical states look different.
 */
function manifestFingerprint(manifest) {
  const rows = (manifest?.files || [])
    .map((file) => `${file.path}\u0000${file.sha256}\u0000${file.size}\u0000${file.url || ''}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(rows).digest('hex');
}

/**
 * Identity of the *source* payload (paths, hashes, sizes and retired paths).
 * Used to detect that SIEGE changed between the preview and the publish; it
 * deliberately ignores download URLs, which the publisher may rewrite when it
 * has to re-upload a blob to a newer release.
 */
function payloadFingerprint(manifest) {
  const rows = (manifest?.files || [])
    .map((file) => `${file.path}\u0000${file.sha256}\u0000${file.size}`)
    .sort()
    .join('\n');
  const removals = [...(manifest?.remove || [])].map(String).sort().join('\n');
  return crypto.createHash('sha256').update(`${rows}\u0001${removals}`).digest('hex');
}

function manifestSemanticEqual(a, b) {
  if (!a || !b) return false;
  if (String(a.version ?? '') !== String(b.version ?? '')) return false;
  if (String(a.minecraft ?? '') !== String(b.minecraft ?? '')) return false;
  if (String(a.forge ?? '') !== String(b.forge ?? '')) return false;
  if (String(a.forgeInstaller?.url || '') !== String(b.forgeInstaller?.url || '')) return false;
  if (manifestFingerprint(a) !== manifestFingerprint(b)) return false;
  const removals = (manifest) => JSON.stringify([...(manifest.remove || [])].map(String).sort());
  return removals(a) === removals(b);
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Group the release assets a manifest depends on, so the publisher can verify
 * that every URL it is about to publish actually resolves to an uploaded blob.
 */
function collectReferencedAssets(repo, manifest) {
  const pattern = new RegExp(`^https://github\\.com/${escapeRegExp(repo)}/releases/download/([^/]+)/(.+)$`, 'i');
  const groups = new Map();
  const foreign = [];
  const mismatched = [];
  for (const file of manifest?.files || []) {
    if (file.empty) continue;
    const value = String(file.url || '');
    if (!value) { mismatched.push({ path: file.path, reason: 'sin URL' }); continue; }
    const match = pattern.exec(value);
    if (!match) { foreign.push({ path: file.path, url: value }); continue; }
    const tag = match[1];
    const asset = decodeURIComponent(match[2]);
    if (asset.toLowerCase() !== String(file.sha256 || '').toLowerCase()) {
      mismatched.push({ path: file.path, reason: `el asset ${asset} no coincide con el SHA-256 del archivo` });
      continue;
    }
    if (!groups.has(tag)) groups.set(tag, new Set());
    groups.get(tag).add(asset);
  }
  return { groups, foreign, mismatched };
}

async function buildPack(options = {}) {
  const sourceCandidate = path.resolve(options.source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'));
  const source = await resolveGameRoot(sourceCandidate);
  if (!source) throw new Error(`No encontré una instancia Minecraft válida en: ${sourceCandidate}`);

  const out = path.resolve(options.out || path.join(process.cwd(), 'pack-dist'));
  const version = String(options.version || '1.0.0');
  const baseUrl = cleanBaseUrl(options.baseUrl || 'http://127.0.0.1:4174');
  const previous = options.previousManifest || (options.previous ? await readJsonMaybe(options.previous) : null);
  const notes = await resolveNotes(options.notes);
  const previousByHash = new Map();
  for (const entry of previous?.files || []) {
    if (entry.sha256 && entry.url && !previousByHash.has(entry.sha256)) previousByHash.set(entry.sha256, entry.url);
  }

  // The SIEGE instance is also used for development and contains saves,
  // options, logs and other personal state. Only the pack payload is
  // publishable: mods plus the iammusicplayerrenewed resource. A normal
  // local build keeps user-added mods out; an explicit developer publish
  // passes includeUserMods so a jar intentionally present in SIEGE becomes
  // part of the official manifest and is no longer classified as personal.
  const includeUserMods = Boolean(options.includeUserMods);
  const { files } = await listPublishableFiles(source, { includeUserMods });
  if (!files.length) throw new Error(`La instancia ${source} no contiene archivos publicables después de aplicar los filtros de seguridad.`);
  const blobsDir = path.join(out, 'blobs');
  const channelDir = path.join(out, 'channel');
  await fsp.mkdir(blobsDir, { recursive: true });
  await fsp.mkdir(channelDir, { recursive: true });

  const manifestFiles = [];
  const uniqueNew = new Set();
  // sha256 -> local path of the exact content. The publisher needs it to
  // re-upload a blob whose release asset disappeared, without copying the whole
  // payload again.
  const blobSources = new Map();
  let done = 0;
  for (const file of files) {
    const stat = await fsp.stat(file.full);
    const sha256 = await sha256File(file.full);
    const oldUrl = previousByHash.get(sha256);
    const empty = stat.size === 0;
    const url = empty ? '' : (oldUrl || `${baseUrl}/blobs/${sha256}`);
    const blobPath = path.join(blobsDir, sha256);
    if (!empty && !oldUrl && !fs.existsSync(blobPath)) {
      await fsp.copyFile(file.full, blobPath);
      uniqueNew.add(sha256);
    }
    if (!empty) blobSources.set(sha256, file.full);
    manifestFiles.push({ path: file.relative, size: stat.size, sha256, url, ...(empty ? { empty: true } : {}) });
    done++;
    if (options.onProgress) options.onProgress({ current: done, total: files.length, file: file.relative, bytes: stat.size, sha256 });
  }
  manifestFiles.sort((a, b) => a.path.localeCompare(b.path));

  const currentPaths = new Set(manifestFiles.map((f) => f.path));
  const remove = (previous?.files || []).map((f) => f.path).filter((p) => !currentPaths.has(p)).sort();
  const prevByPath = new Map((previous?.files || []).map((f) => [f.path, f]));
  const added = [];
  const changed = [];
  const unchanged = [];
  for (const file of manifestFiles) {
    const old = prevByPath.get(file.path);
    if (!old) added.push(file.path);
    else if (old.sha256 !== file.sha256) changed.push(file.path);
    else unchanged.push(file.path);
  }
  // The published state only changes when a path appears, disappears or its
  // content changes. Metadata such as `generatedAt` must not turn an otherwise
  // identical republish into a new version.
  const noop = added.length === 0 && changed.length === 0 && remove.length === 0;

  const releaseName = twoWordReleaseName({ added, changed, removed: remove });
  const manifest = {
    schema: 2,
    pack: 'Eternal Craft',
    channel: 'stable',
    version,
    releaseName,
    minecraft: '1.20.1',
    forge: '47.4.10',
    minimumLauncher: launcherVersion,
    generatedAt: new Date().toISOString(),
    releaseNotes: {
      title: `${version} — ${releaseName}`,
      summary: notes || `${added.length} archivos nuevos · ${changed.length} actualizados · ${remove.length} eliminados`,
      addedCount: added.length,
      changedCount: changed.length,
      removedCount: remove.length,
      highlights: [
        ...added.slice(0, 4).map((p) => ({ type: 'added', path: p })),
        ...changed.slice(0, 6).map((p) => ({ type: 'changed', path: p })),
        ...remove.slice(0, 4).map((p) => ({ type: 'removed', path: p }))
      ].slice(0, 10)
    },
    forgeInstaller: { url: FORGE_URL, sha256: '' },
    files: manifestFiles,
    remove
  };
  const payload = await validatePublishedPayload(source, manifest, { includeUserMods });
  manifest.payload = payload;
  const changes = {
    version,
    generatedAt: manifest.generatedAt,
    sourceFiles: manifestFiles.length,
    uniqueNewBlobs: uniqueNew.size,
    noop,
    added,
    changed,
    removed: remove,
    unchanged: unchanged.length,
    payload
  };

  await fsp.writeFile(path.join(channelDir, 'stable.json'), JSON.stringify(manifest, null, 2));
  await fsp.writeFile(path.join(out, 'changes.json'), JSON.stringify(changes, null, 2));
  return { source, out, manifest, changes, payload, uniqueNew: [...uniqueNew], blobSources };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await buildPack({
    source: args.source,
    out: args.out,
    version: args.version,
    baseUrl: args['base-url'],
    previous: args.previous,
    notes: args.notes,
    includeUserMods: Boolean(args['include-user-mods']),
    onProgress: ({ current, total, file }) => {
      if (current === 1 || current === total || current % 25 === 0) console.log(`[${current}/${total}] ${file}`);
    }
  });
  console.log('\nETERNAL CRAFT // PACK BUILD READY');
  console.log(`Fuente: ${result.source}`);
  console.log(`Payload verificado: ${result.payload.mods} mods + ${result.payload.iammusicplayerrenewed} archivos de iammusicplayerrenewed · ${result.payload.personalModsExcluded} personales omitidos`);
  console.log(`Versión: ${result.manifest.version}`);
  console.log(`Archivos: ${result.manifest.files.length}`);
  console.log(`Nuevos blobs: ${result.changes.uniqueNewBlobs}`);
  console.log(`Añadidos: ${result.changes.added.length} | Cambiados: ${result.changes.changed.length} | Eliminados: ${result.changes.removed.length}`);
  console.log(`Manifest: ${path.join(result.out, 'channel', 'stable.json')}`);
}

if (require.main === module) main().catch((err) => { console.error(`ERROR: ${err.message}`); process.exit(1); });
module.exports = {
  buildPack, parseArgs, resolveGameRoot, sha256File, walk, walkDetailed, isPublishedPath, isJunkEntry,
  validatePublishedPayload, readLocalUserModPaths, listPublishableFiles, manifestFingerprint,
  payloadFingerprint, manifestSemanticEqual, collectReferencedAssets
};