const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

function inspectJava(javaPath = 'java') {
  return new Promise((resolve) => {
    const child = spawn(javaPath || 'java', ['-version'], { windowsHide: true });
    let output = '';
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; resolve(value); };
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      finish({ found: false, path: javaPath || 'java', error: 'timeout' });
    }, 5000);

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.once('error', (err) => {
      clearTimeout(timer);
      finish({ found: false, path: javaPath || 'java', error: err.code || err.message });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      const versionMatch = output.match(/version\s+"([^"]+)"/i) || output.match(/openjdk\s+([0-9][^\s]*)/i);
      const version = versionMatch?.[1] || 'Desconocida';
      const major = Number(String(version).replace(/^1\./, '').split(/[._-]/)[0]) || null;
      finish({
        found: code === 0 || Boolean(versionMatch), path: javaPath || 'java', version, major,
        raw: output.trim().split(/\r?\n/)[0] || ''
      });
    });
  });
}
function supportedJava(major) { return Number.isFinite(Number(major)) && Number(major) >= 17; }

async function linuxJavaCandidates() {
  const out = [];
  try {
    const entries = await fsp.readdir('/usr/lib/jvm');
    for (const name of entries) {
      if (!/(17|18|19|20|21|22|23|24|25)/.test(name)) continue;
      const candidate = path.join('/usr/lib/jvm', name, 'bin', 'java');
      try { await fsp.access(candidate, fs.constants.X_OK); out.push(candidate); } catch (_) {}
    }
  } catch (_) {}
  const home = os.homedir();
  const localRoots = [path.join(home, '.local', 'opt'), path.join(home, '.jdks')];
  for (const root of localRoots) {
    try {
      const entries = await fsp.readdir(root);
      for (const name of entries) {
        if (!/(17|18|19|20|21|22|23|24|25)/.test(name)) continue;
        const candidate = path.join(root, name, 'bin', 'java');
        try { await fsp.access(candidate, fs.constants.X_OK); out.push(candidate); } catch (_) {}
      }
    } catch (_) {}
  }
  return out;
}

async function windowsJavaCandidates() {
  const out = [];
  const roots = [
    process.env.JAVA_HOME,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Eclipse Adoptium'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Java'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Eclipse Adoptium')
  ].filter(Boolean);
  for (const root of roots) {
    try {
      const stat = await fsp.stat(root);
      if (stat.isDirectory()) {
        const direct = path.join(root, 'bin', 'java.exe');
        try { await fsp.access(direct, fs.constants.X_OK); out.push(direct); } catch (_) {}
        for (const name of await fsp.readdir(root)) {
          if (!/1[7-9]|2[0-5]|jdk|jre/i.test(name)) continue;
          const candidate = path.join(root, name, 'bin', 'java.exe');
          try { await fsp.access(candidate, fs.constants.X_OK); out.push(candidate); } catch (_) {}
        }
      }
    } catch (_) {}
  }
  return out;
}

async function managedJavaPath(managedRoot) {
  if (!managedRoot) return '';
  try {
    const meta = JSON.parse(await fsp.readFile(path.join(managedRoot, 'runtime.json'), 'utf8'));
    if (meta?.javaPath) {
      const inspected = await inspectJava(meta.javaPath);
      if (inspected.found && supportedJava(inspected.major)) return meta.javaPath;
    }
  } catch (_) {}
  return '';
}

async function resolveJava17(explicitPath = '', managedRoot = '') {
  const preferred = String(explicitPath || '').trim();
  if (preferred) {
    const inspected = await inspectJava(preferred);
    if (inspected.found && supportedJava(inspected.major)) return { ...inspected, managed: false };
  }

  const managed = await managedJavaPath(managedRoot);
  if (managed) {
    const inspected = await inspectJava(managed);
    if (inspected.found && supportedJava(inspected.major)) return { ...inspected, managed: true };
  }

  const candidates = process.platform === 'linux' ? await linuxJavaCandidates() : process.platform === 'win32' ? await windowsJavaCandidates() : [];
  for (const candidate of candidates) {
    const inspected = await inspectJava(candidate);
    if (inspected.found && supportedJava(inspected.major)) return { ...inspected, managed: false };
  }

  const fallback = await inspectJava(preferred || 'java');
  return { ...fallback, managed: false };
}

function platformForAdoptium() {
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'win32') return 'windows';
  throw new Error('La instalación automática de Java está disponible para Windows y Linux.');
}
function archForAdoptium() {
  if (process.arch === 'x64') return 'x64';
  if (process.arch === 'arm64') return 'aarch64';
  throw new Error(`Arquitectura no soportada para Java automático: ${process.arch}`);
}

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject); stream.on('data', (d) => hash.update(d)); stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function fetchWithRetry(url, options = {}, attempts = 3, timeoutMs = 120000) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: options.signal || controller.signal, headers: { 'User-Agent': 'EternalCraftLauncher/0.65.0', ...(options.headers || {}) } });
      if (response.ok) return response;
      last = new Error(`HTTP ${response.status}`);
      last.retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (!last.retryable) throw last;
    } catch (error) {
      last = error?.name === 'AbortError' ? new Error(`La conexión superó el tiempo de espera (${Math.round(timeoutMs / 1000)} s).`) : error;
      const transient = Boolean(last?.retryable) || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(error?.code) || error?.name === 'TypeError' || /fetch failed|network|socket|connect/i.test(String(error?.message || ''));
      if (!transient) throw last;
      if (attempt >= attempts) break;
    } finally { clearTimeout(timer); }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
  }
  throw last || new Error('No se pudo conectar con el proveedor de Java.');
}

async function download(url, destination, onProgress = () => {}) {
  const response = await fetchWithRetry(url, {}, 3, 120000);
  if (!response.ok || !response.body) throw new Error(`No se pudo descargar Java 17 (HTTP ${response.status}).`);
  const total = Number(response.headers.get('content-length') || 0); let received = 0;
  const reader = response.body.getReader();
  const source = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) return this.push(null);
        received += value.byteLength; onProgress({ phase: 'java-download', bytesReceived: received, bytesTotal: total, current: received, total, file: path.basename(destination) });
        this.push(Buffer.from(value));
      } catch (err) { this.destroy(err); }
    }
  });
  await pipeline(source, fs.createWriteStream(destination));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let error = '';
    child.stderr.on('data', (d) => { error += d.toString(); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `${command} terminó con código ${code}`)));
  });
}

async function findJava(root, depth = 5) {
  if (depth < 0) return '';
  let entries = [];
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch (_) { return ''; }
  const executable = process.platform === 'win32' ? 'java.exe' : 'java';
  const direct = path.join(root, 'bin', executable);
  try { await fsp.access(direct, fs.constants.X_OK); return direct; } catch (_) {}
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findJava(path.join(root, entry.name), depth - 1);
    if (found) return found;
  }
  return '';
}

async function installManagedJava17(managedRoot, onProgress = () => {}) {
  if (!managedRoot) throw new Error('No se definió la carpeta del runtime de Java.');
  const osName = platformForAdoptium(); const arch = archForAdoptium();
  await fsp.mkdir(managedRoot, { recursive: true });
  onProgress({ phase: 'java-resolving', current: 0, total: 1, file: 'Java 17' });
  const apiUrl = `https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=${encodeURIComponent(arch)}&image_type=jre&os=${encodeURIComponent(osName)}&vendor=eclipse`;
  const response = await fetchWithRetry(apiUrl, { headers: { Accept: 'application/json' } }, 3, 15000);
  if (!response.ok) throw new Error(`No se pudo consultar Java 17 (HTTP ${response.status}).`);
  const assets = await response.json();
  const pkg = assets?.[0]?.binary?.package;
  if (!pkg?.link) throw new Error('No encontré un runtime Java 17 compatible para este sistema.');

  const extension = osName === 'windows' ? '.zip' : '.tar.gz';
  const archive = path.join(managedRoot, `java17${extension}`);
  const extractRoot = path.join(managedRoot, 'current');
  await fsp.rm(archive, { force: true }).catch(() => {});
  await fsp.rm(extractRoot, { recursive: true, force: true }).catch(() => {});
  await download(pkg.link, archive, onProgress);
  if (pkg.checksum) {
    const actual = await sha256File(archive);
    if (actual.toLowerCase() !== String(pkg.checksum).toLowerCase()) throw new Error('La descarga de Java 17 no pasó la verificación de integridad.');
  }

  await fsp.mkdir(extractRoot, { recursive: true });
  onProgress({ phase: 'java-extract', current: 0, total: 1, file: 'Java 17' });
  if (osName === 'linux') {
    await run('tar', ['-xzf', archive, '-C', extractRoot]);
  } else {
    const q = (v) => String(v).replace(/'/g, "''");
    await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath '${q(archive)}' -DestinationPath '${q(extractRoot)}' -Force`]);
  }
  await fsp.rm(archive, { force: true }).catch(() => {});

  const javaPath = await findJava(extractRoot);
  if (!javaPath) throw new Error('Java 17 se descargó, pero no pude encontrar su ejecutable.');
  if (process.platform !== 'win32') await fsp.chmod(javaPath, 0o755).catch(() => {});
  const inspected = await inspectJava(javaPath);
  if (!inspected.found || !supportedJava(inspected.major)) throw new Error('El runtime descargado no es compatible con Minecraft 1.20.1.');
  await fsp.writeFile(path.join(managedRoot, 'runtime.json'), JSON.stringify({ javaPath, version: inspected.version, installedAt: new Date().toISOString(), vendor: 'Eclipse Temurin' }, null, 2));
  onProgress({ phase: 'java-ready', current: 1, total: 1, file: 'Java 17' });
  return { ...inspected, path: javaPath, managed: true };
}

async function ensureJava17(explicitPath = '', managedRoot = '', onProgress = () => {}) {
  const existing = await resolveJava17(explicitPath, managedRoot);
  if (existing.found && supportedJava(existing.major)) return existing;
  return installManagedJava17(managedRoot, onProgress);
}

module.exports = { inspectJava, resolveJava17, installManagedJava17, ensureJava17, supportedJava };
