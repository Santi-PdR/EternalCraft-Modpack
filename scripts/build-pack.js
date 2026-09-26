#!/usr/bin/env node
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { twoWordReleaseName } = require('./release-name');
const launcherVersion = String(require('../package.json').version || '0.0.0');

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
  if (!entry.isDirectory() && SKIP_FILES.has(entry.name)) return true;
  if (!entry.isDirectory() && /(?:^|[._-])(secret|token|credential|password|private)[^/]*$/i.test(entry.name)) return true;
  if (!entry.isDirectory() && /\.(pem|key|p12|pfx|jks|keystore)$/i.test(entry.name)) return true;
  if (!entry.isDirectory() && /\.(log|lock|tmp|part)$/i.test(entry.name)) return true;
  if (entry.name.startsWith('.nfs')) return true;
  return false;
}

async function walk(root, dir = root, prefix = '') {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (shouldSkip(relative, entry)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...await walk(root, full, relative));
    else if (entry.isFile()) out.push({ relative: relative.replace(/\\/g, '/'), full });
  }
  return out;
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

  const files = await walk(source);
  if (!files.length) throw new Error(`La instancia ${source} no contiene archivos publicables después de aplicar los filtros de seguridad.`);
  const blobsDir = path.join(out, 'blobs');
  const channelDir = path.join(out, 'channel');
  await fsp.mkdir(blobsDir, { recursive: true });
  await fsp.mkdir(channelDir, { recursive: true });

  const manifestFiles = [];
  const uniqueNew = new Set();
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
  const changes = {
    version,
    generatedAt: manifest.generatedAt,
    sourceFiles: manifestFiles.length,
    uniqueNewBlobs: uniqueNew.size,
    added,
    changed,
    removed: remove,
    unchanged: unchanged.length
  };

  await fsp.writeFile(path.join(channelDir, 'stable.json'), JSON.stringify(manifest, null, 2));
  await fsp.writeFile(path.join(out, 'changes.json'), JSON.stringify(changes, null, 2));
  return { source, out, manifest, changes, uniqueNew: [...uniqueNew] };
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
    onProgress: ({ current, total, file }) => {
      if (current === 1 || current === total || current % 25 === 0) console.log(`[${current}/${total}] ${file}`);
    }
  });
  console.log('\nETERNAL CRAFT // PACK BUILD READY');
  console.log(`Fuente: ${result.source}`);
  console.log(`Versión: ${result.manifest.version}`);
  console.log(`Archivos: ${result.manifest.files.length}`);
  console.log(`Nuevos blobs: ${result.changes.uniqueNewBlobs}`);
  console.log(`Añadidos: ${result.changes.added.length} | Cambiados: ${result.changes.changed.length} | Eliminados: ${result.changes.removed.length}`);
  console.log(`Manifest: ${path.join(result.out, 'channel', 'stable.json')}`);
}

if (require.main === module) main().catch((err) => { console.error(`ERROR: ${err.message}`); process.exit(1); });
module.exports = { buildPack, parseArgs, resolveGameRoot, sha256File, walk };
