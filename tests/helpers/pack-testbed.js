/**
 * Shared helpers for the pack publish/sync integration tests.
 *
 * These helpers do not stub project code: they replace only the external
 * world (GitHub CLI, release CDN) so the real publisher, the real manifest
 * validator and the real launcher sync code run end to end.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PUBLISH_SCRIPT = path.join(REPO_ROOT, 'scripts', 'publish-pack-github.js');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'build-pack.js');
const FAKE_GH_SCRIPT = path.join(__dirname, 'fake-gh.js');

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function writeJar(dir, name, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

/** Create a fake SIEGE instance with the given { filename: content } mods. */
function createSourceInstance(root, mods = {}, extras = {}) {
  writeJar(path.join(root, 'mods'), '.keep', '');
  fs.rmSync(path.join(root, 'mods', '.keep'), { force: true });
  for (const [name, content] of Object.entries(mods)) writeJar(path.join(root, 'mods'), name, content);
  for (const [relative, content] of Object.entries(extras.extraFiles || {})) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

/** Create an isolated fake `gh` executable that writes into `stateDir`. */
function createFakeGhEnvironment(stateDir) {
  const binDir = path.join(stateDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'remote'), { recursive: true });
  const shim = path.join(binDir, 'gh');
  fs.writeFileSync(shim, `#!/usr/bin/env node\nrequire(${JSON.stringify(FAKE_GH_SCRIPT)});\n`, { mode: 0o755 });
  fs.chmodSync(shim, 0o755);
  return {
    binDir,
    stateDir: path.join(stateDir, 'remote'),
    logFile: path.join(stateDir, 'gh-calls.log'),
    counters: () => readJson(path.join(stateDir, 'remote', 'upload-attempts.json'), {}) || {},
    env: (extra = {}) => ({
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_GH_STATE: path.join(stateDir, 'remote'),
      FAKE_GH_LOG: path.join(stateDir, 'gh-calls.log'),
      FAKE_GH_LOGIN: 'tester',
      // Never let a test run write the checkout's real channel/stable.json:
      // the fake repository mirrors the real slug, so the local-sync guard
      // would otherwise consider this checkout its own channel.
      ETERNAL_PUBLISH_LOCAL_CHANNEL_DIR: path.join(stateDir, 'local-channel'),
      ...extra
    })
  };
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch (_) { return fallback; }
}
function readJsonSync(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

/** Run the real publisher against the fake `gh`, capturing its output. */
function runPublisher({ stateDir, gh, args = [], env = {}, cwd, timeoutMs = 120000 }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PUBLISH_SCRIPT, ...args], {
      cwd: cwd || REPO_ROOT,
      env: { ...process.env, ...gh.env(env) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const collect = (chunk) => { output += String(chunk); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output, stateDir });
    });
  });
}

function readChannel(stateDir) {
  return readJsonSync(path.join(stateDir, 'repo', 'channel', 'stable.json'), null);
}

/** Seed a previously published state (channel + release assets) in the fake remote. */
function seedRemote(stateDir, { manifest, blobs = {}, tag }) {
  const channelDir = path.join(stateDir, 'repo', 'channel');
  fs.mkdirSync(channelDir, { recursive: true });
  fs.writeFileSync(path.join(channelDir, 'stable.json'), JSON.stringify(manifest, null, 2));
  const releaseTag = tag || (manifest.files[0]?.url || '').split('/releases/download/')[1]?.split('/')[0] || `pack-v${manifest.version}`;
  const assetsDir = path.join(stateDir, 'releases', releaseTag, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'releases', releaseTag, 'release.json'), JSON.stringify({ tag: releaseTag, latest: false }));
  for (const [sha, content] of Object.entries(blobs)) fs.writeFileSync(path.join(assetsDir, sha), content);
  return { tag: releaseTag, assetsDir };
}

function deleteAsset(stateDir, tag, name) {
  try { fs.rmSync(path.join(stateDir, 'releases', tag, 'assets', name), { force: true }); return true; } catch (_) { return false; }
}

function assetExists(stateDir, tag, name) {
  return fs.existsSync(path.join(stateDir, 'releases', tag, 'assets', name));
}

function releaseAssetNames(stateDir, tag) {
  try { return fs.readdirSync(path.join(stateDir, 'releases', tag, 'assets')); } catch (_) { return []; }
}

/**
 * Serve the fake remote the way GitHub + the release CDN would: the manifest
 * keeps its real shape but blob URLs point to this local server.
 */
/**
 * Rewrite a published manifest so the launcher downloads from the local CDN
 * instead of GitHub. The path layout mirrors the real release assets.
 */
function clientManifest(manifest, server) {
  const localize = (url) => String(url || '').replace(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//,
    `${server.url}/releases/download/`
  );
  return {
    ...manifest,
    files: (manifest.files || []).map((file) => (file.empty ? { ...file, url: '' } : { ...file, url: localize(file.url) })),
    ...(manifest.forgeInstaller?.url ? { forgeInstaller: { ...manifest.forgeInstaller, url: `${server.url}/forge/${path.basename(manifest.forgeInstaller.url)}` } } : {})
  };
}

async function startPackServer(stateDir) {
  const served = [];
  const blobs = new Map();
  const assetRoot = path.join(stateDir, 'releases');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const base = `http://127.0.0.1:${server.address().port}`;
    if (url.pathname === '/channel/stable.json') {
      const manifest = readJsonSync(path.join(stateDir, 'repo', 'channel', 'stable.json'), null);
      if (!manifest) { res.statusCode = 404; res.end('missing'); return; }
      served.push({ at: Date.now(), path: url.pathname });
      const rewritten = {
        ...manifest,
        files: (manifest.files || []).map((file) => {
          if (file.empty) return { ...file, url: '' };
          const relative = String(file.url || '').replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//, '');
          return { ...file, url: `${base}/releases/download/${relative}` };
        })
      };
      const body = JSON.stringify(rewritten);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Length', Buffer.byteLength(body));
      res.end(body);
      return;
    }
    if (url.pathname.startsWith('/forge/')) {
      const data = Buffer.from('fake forge installer');
      res.setHeader('Content-Type', 'application/java-archive');
      res.setHeader('Content-Length', data.length);
      res.end(data);
      return;
    }
    const match = /^\/releases\/download\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (match) {
      const file = path.join(assetRoot, decodeURIComponent(match[1]), 'assets', decodeURIComponent(match[2]));
      if (!fs.existsSync(file)) { res.statusCode = 404; res.end('missing blob'); return; }
      const data = fs.readFileSync(file);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', data.length);
      res.end(data);
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    url: `http://127.0.0.1:${server.address().port}`,
    blobs,
    close: () => new Promise((resolve) => server.close(resolve)),
    requests: served
  };
}

async function tempDir(prefix, t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  if (t) t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  return dir;
}

function listFiles(root, relative = '') {
  const out = [];
  const dir = path.join(root, relative);
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, next));
    else out.push(next);
  }
  return out.sort();
}

module.exports = {
  REPO_ROOT,
  PUBLISH_SCRIPT,
  BUILD_SCRIPT,
  FAKE_GH_SCRIPT,
  sha256,
  createSourceInstance,
  createFakeGhEnvironment,
  readJson,
  readJsonSync,
  runPublisher,
  readChannel,
  seedRemote,
  deleteAsset,
  assetExists,
  releaseAssetNames,
  startPackServer,
  clientManifest,
  tempDir,
  listFiles
};
