const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

async function fetchJson(url, timeoutMs = 12000) {
  const value = String(url || '').trim();
  if (value.startsWith('file://')) return JSON.parse(fs.readFileSync(fileURLToPath(value), 'utf8'));
  if (path.isAbsolute(value)) return JSON.parse(fs.readFileSync(value, 'utf8'));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(value, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json', 'User-Agent': 'EternalCraftLauncher/0.65.20' }
      });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        const error = new Error(`HTTP ${response.status}`);
        error.retryable = retryable;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error?.name === 'AbortError' ? new Error(`Tiempo de espera agotado al consultar el canal (${timeoutMs / 1000} s).`) : error;
      const transientNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(error?.code)
        || error?.name === 'TypeError'
        || /fetch failed|network|socket|connect/i.test(String(error?.message || ''));
      if (!lastError?.retryable && error?.name !== 'AbortError' && !transientNetworkError) throw lastError;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('No se pudo consultar el canal del modpack.');
}

function validateManifest(manifest) {
  if (!manifest || ![1, 2].includes(Number(manifest.schema)) || !Array.isArray(manifest.files)) throw new Error('Manifest del modpack inválido');
  if (manifest.files.length > 12000) throw new Error('Manifest demasiado grande');
  const seen=new Set();
  const validatePath=(value)=>{
    const p=String(value||'').replace(/\\/g,'/');
    if(!p||p.startsWith('/')||p.includes('\0')||p.split('/').includes('..')) throw new Error(`Ruta insegura en manifest: ${value||'vacía'}`);
    return p;
  };
  for (const entry of manifest.files) {
    const p=validatePath(entry?.path);
    if(seen.has(p)) throw new Error(`Ruta duplicada en manifest: ${p}`); seen.add(p);
    if(!/^[a-f0-9]{64}$/i.test(String(entry?.sha256||''))) throw new Error(`SHA-256 inválido: ${p}`);
    const size=Number(entry.size||0);
    if(size<0||size>8*1024*1024*1024) throw new Error(`Tamaño inválido: ${p}`);
    const empty=Boolean(entry?.empty) && size===0;
    if (empty && String(entry.sha256).toLowerCase() !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
      throw new Error(`SHA-256 incorrecto para archivo vacío: ${p}`);
    }
    const u=String(entry?.url||'');
    if(!empty&&!u) throw new Error(`URL faltante: ${p}`);
    if(u){
      let parsed; try{parsed=new URL(u);}catch(_){throw new Error(`URL inválida: ${p}`);}
      const localHttp=parsed.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(parsed.hostname);
      if(!['https:','file:'].includes(parsed.protocol)&&!localHttp) throw new Error(`URL no segura en manifest: ${p}`);
    }
  }
  if(Array.isArray(manifest.remove)) manifest.remove.forEach(validatePath);
  return manifest;
}

function writeCache(cachePath, manifest, source) {
  if (!cachePath) return;
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ cachedAt: new Date().toISOString(), source, manifest }, null, 2));
  } catch (_) {}
}
function readCache(cachePath) {
  if (!cachePath) return null;
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return { ...data, manifest: validateManifest(data.manifest) };
  } catch (_) { return null; }
}

async function getManifest(config, localManifestPath, cachePath = '') {
  const envUrl = String(process.env.ETERNAL_PACK_MANIFEST || '').trim();
  const url = envUrl || String(config.pack?.manifestUrl || '').trim();
  if (!url) {
    return {
      manifest: JSON.parse(fs.readFileSync(localManifestPath, 'utf8')),
      source: 'local-example',
      configured: false,
      stale: false
    };
  }
  try {
    const manifest = validateManifest(await fetchJson(url));
    if (!envUrl && /^https?:\/\//i.test(url)) writeCache(cachePath, manifest, url);
    return { manifest, source: url, configured: true, stale: false };
  } catch (err) {
    const cached = !envUrl ? readCache(cachePath) : null;
    if (cached) {
      return {
        manifest: cached.manifest,
        source: 'cache',
        configured: true,
        stale: true,
        cachedAt: cached.cachedAt || '',
        error: err.message || String(err)
      };
    }
    throw err;
  }
}

module.exports = { getManifest, fetchJson, validateManifest };
