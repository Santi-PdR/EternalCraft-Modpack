#!/usr/bin/env node
/**
 * Eternal Craft // SIEGE — publicador del modpack.
 *
 * Fuente de verdad:
 *   instancia SIEGE (carpeta mods + iammusicplayerrenewed)
 *     -> estado deseado (manifest)
 *     -> assets de la release de GitHub (blob por SHA-256)
 *     -> channel/stable.json (committeado en la rama del canal)
 *     -> launcher (compara, descarga, elimina retirados, verifica)
 *
 * El publicador nunca publica un manifest que no pueda descargarse: antes de
 * tocar el canal comprueba que todos los blobs referenciados existan como
 * assets. Si no hay cambios, la publicación es idempotente: no sube nada, no
 * crea una versión nueva y solo repara el canal si detecta que quedó atrás.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const {
  launcherVersion, buildPack, parseArgs, manifestFingerprint, payloadFingerprint,
  manifestSemanticEqual, collectReferencedAssets
} = require('./build-pack');
const { twoWordReleaseName, nextVersion } = require('./release-name');

const MAX_VERIFIED_TAGS = 24;

function gh(args, opts = {}) {
  // `stdio: inherit` makes execFileSync return null. Normalise both modes so
  // release uploads and API writes cannot crash while trimming their output.
  const output = execFileSync('gh', args, { encoding: 'utf8', stdio: opts.stdio || ['ignore', 'pipe', 'pipe'] });
  return String(output || '').trim();
}
function ghCaptured(args) {
  try {
    const stdout = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout: String(stdout || ''), stderr: '' };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || error?.message || ''),
      code: error?.status ?? error?.code
    };
  }
}
function requireGh() {
  try { gh(['--version']); gh(['auth', 'status']); }
  catch (_) { throw new Error('Necesitás GitHub CLI (gh) instalado y con sesión iniciada.'); }
}
function releaseUrl(repo, tag, sha) {
  return `https://github.com/${repo}/releases/download/${tag}/${sha}`;
}
function isNotFound(output) {
  return /\b404\b|Not Found/i.test(String(output || ''));
}
async function uploadAssetWithRetry(tag, repo, file, label, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      gh(['release', 'upload', tag, '--repo', repo, '--clobber', `${file}${label ? `#${label}` : ''}`], { stdio: 'inherit' });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.log(`Reintentando ${path.basename(file)} (${attempt + 1}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
      }
    }
  }
  throw lastError || new Error(`No se pudo subir ${path.basename(file)}.`);
}
async function uploadAssetBatch(tag, repo, files, completed, total) {
  try {
    gh(['release', 'upload', tag, '--repo', repo, '--clobber', ...files], { stdio: 'inherit' });
    return files.length;
  } catch (_) {
    console.log(`El lote ${completed + 1}-${completed + files.length}/${total} no respondió bien; reintentando esos archivos por separado.`);
    for (const entry of files) {
      const [file, label] = String(entry).split('#');
      await uploadAssetWithRetry(tag, repo, file, label || '');
    }
    return files.length;
  }
}
async function existingReleaseAssetNames(repo, tag, cache = null) {
  if (cache?.has(tag)) return cache.get(tag);
  const result = ghCaptured(['release', 'view', tag, '--repo', repo, '--json', 'assets']);
  let names = new Map();
  if (result.ok) {
    try {
      const data = JSON.parse(result.stdout || '{}');
      // The name alone is not proof of a valid blob: a resumed or interrupted
      // upload can leave an asset with the right name and a truncated body.
      // Keep size and digest so the published state can be verified for real.
      for (const asset of data.assets || []) {
        const name = String(asset?.name || '');
        if (!name) continue;
        names.set(name, {
          size: Number.isFinite(Number(asset?.size)) ? Number(asset.size) : null,
          digest: String(asset?.digest || '')
        });
      }
    } catch (_) { names = new Map(); }
  } else if (!isNotFound(result.stderr)) {
    // A transient API failure must not be read as “the assets are missing”:
    // that would re-upload gigabytes and hide a real outage.
    const error = new Error(`No pude consultar los assets de ${tag}: ${String(result.stderr || '').trim() || 'error desconocido'}`);
    error.transient = true;
    throw error;
  }
  if (cache) cache.set(tag, names);
  return names;
}

/**
 * Read the published channel. A missing file means “first publication”; any
 * other failure aborts instead of silently rebuilding the pack from scratch
 * (which used to drop the retired-file list and re-upload every blob).
 */
async function readPublishedChannel(repo, branch) {
  const result = ghCaptured(['api', '-H', 'Accept: application/vnd.github.raw+json', `repos/${repo}/contents/channel/stable.json?ref=${branch}`]);
  if (!result.ok) {
    if (isNotFound(result.stderr) || isNotFound(result.stdout)) return { exists: false, manifest: null };
    throw new Error(`No pude leer el canal publicado (${String(result.stderr || '').trim() || 'error de GitHub'}). Publicación detenida para no publicar un estado incompleto.`);
  }
  const raw = String(result.stdout || '').trim();
  if (!raw) throw new Error('GitHub devolvió un canal vacío. Publicación detenida para no sobrescribir el estado publicado.');
  let manifest;
  try { manifest = JSON.parse(raw); }
  catch (_) { throw new Error('El canal publicado no es JSON válido. Publicación detenida para no perder el estado anterior.'); }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files) || !manifest.version) {
    throw new Error('El canal publicado no tiene el formato esperado (version + files). Publicación detenida.');
  }
  return { exists: true, manifest };
}
async function getPrevious(repo, branch) {
  return (await readPublishedChannel(repo, branch)).manifest;
}

/**
 * Blob SHA of the committed channel, required by the contents API to replace an
 * existing file. A failed lookup used to be swallowed, so the PUT went out
 * without `sha`, GitHub rejected it with 422 and the publisher blamed the
 * channel after uploading every blob. A missing file is the only case without
 * sha; any other read failure stops before touching the remote.
 */
async function existingChannelSha(repo, branch) {
  const result = ghCaptured(['api', `repos/${repo}/contents/channel/stable.json?ref=${branch}`]);
  if (!result.ok) {
    if (isNotFound(result.stderr) || isNotFound(result.stdout)) return '';
    throw new Error(`No pude leer el SHA del canal publicado (${String(result.stderr || '').trim() || 'error de GitHub'}). Publicación detenida para no sobrescribir el estado remoto.`);
  }
  try {
    const info = JSON.parse(String(result.stdout || '{}'));
    return String(info?.sha || '');
  } catch (_) {
    throw new Error('GitHub devolvió metadatos inválidos del canal publicado.');
  }
}
async function updateChannel(repo, branch, manifest) {
  const sha = await existingChannelSha(repo, branch);
  // Never pass the base64 manifest as a command-line argument. Large packs
  // can exceed the OS argv limit and fail with spawnSync E2BIG after all
  // blobs were uploaded. GitHub CLI accepts a JSON request body from a file.
  // Use a unique temporary directory instead of a PID-only filename. A second
  // publisher process (or a stale crash artifact) must never overwrite the
  // request body that another publish is about to send.
  const bodyDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'eternal-craft-channel-'));
  const bodyFile = path.join(bodyDir, 'request.json');
  const body = { message:`Publish Eternal Craft ${manifest.version}`, content:Buffer.from(JSON.stringify(manifest, null, 2)).toString('base64'), branch };
  if (sha) body.sha = sha;
  await fsp.writeFile(bodyFile, JSON.stringify(body), 'utf8');
  try { gh(['api', '--method', 'PUT', `repos/${repo}/contents/channel/stable.json`, '--input', bodyFile]); }
  finally { await fsp.rm(bodyDir, { recursive: true, force: true }).catch(() => {}); }
}
async function verifyPublishedChannel(repo, branch, expectedManifest) {
  // Read the committed file back with the raw media type: the JSON contents
  // API truncates the base64 body above 1 MB, which would make a large pack
  // look like a failed publication after the commit already happened.
  const result = ghCaptured(['api', '-H', 'Accept: application/vnd.github.raw+json', `repos/${repo}/contents/channel/stable.json?ref=${branch}`]);
  if (!result.ok) throw new Error(`No pude verificar el canal publicado: ${String(result.stderr || '').trim() || 'error de GitHub'}`);
  let remote;
  try { remote = JSON.parse(String(result.stdout || '').trim()); }
  catch (_) { throw new Error('El manifest estable remoto no es JSON válido.'); }
  if (String(remote.version || '') !== String(expectedManifest.version || '')) throw new Error(`El manifest remoto quedó en ${remote.version || 'una versión desconocida'} y se esperaba ${expectedManifest.version}.`);
  if (Number(remote.files?.length || 0) !== Number(expectedManifest.files?.length || 0)) throw new Error('El manifest remoto no contiene la misma cantidad de archivos que la publicación local.');
  if (remote.files?.some((file) => !expectedManifest.files.find((local) => local.path === file.path))) throw new Error('El manifest remoto contiene archivos que no forman parte de la publicación local.');
  const expectedRemovals = [...(expectedManifest.remove || [])].map(String).sort();
  const remoteRemovals = [...(remote.remove || [])].map(String).sort();
  if (JSON.stringify(expectedRemovals) !== JSON.stringify(remoteRemovals)) throw new Error('La lista de archivos retirados del manifest remoto no coincide con la publicación local.');
  if (manifestFingerprint(remote) !== manifestFingerprint(expectedManifest)) throw new Error('El manifest remoto no coincide con la huella SHA-256 de la publicación local.');
  return remote;
}

/**
 * Verify that every blob referenced by the manifest exists in its release.
 *
 * Returns:
 *   missing      blobs that must be uploaded (by SHA-256, with the tag that
 *                should host them once repaired)
 *   unverifiable files whose URL cannot be trusted at all (foreign repository,
 *                legacy asset name, missing URL); their content is re-uploaded
 *   unchecked    releases that could not be inspected (transient API failure
 *                or too many tags); never treated as “missing”
 */
/**
 * Compare an asset already present in a release with the manifest entry that
 * references it. GitHub exposes the size of every asset and, for assets
 * uploaded recently, the SHA-256 digest; either mismatch means the published
 * pack would hand players a broken download.
 */
function assetIntegrityProblem(assetInfo, expected) {
  if (!assetInfo || !expected) return '';
  const expectedSize = Number(expected.size);
  const actualSize = Number(assetInfo.size);
  if (Number.isFinite(actualSize) && Number.isFinite(expectedSize) && expectedSize > 0 && actualSize !== expectedSize) {
    return `tamaño ${actualSize} ≠ ${expectedSize}`;
  }
  const digest = /^sha256:([a-f0-9]{64})$/i.exec(String(assetInfo.digest || '').trim());
  if (digest && digest[1].toLowerCase() !== String(expected.sha256).toLowerCase()) return 'sha256 remoto distinto';
  return '';
}

async function verifyReferencedAssets(repo, manifest, cache, { tags = null } = {}) {
  const { groups, foreign, mismatched } = collectReferencedAssets(repo, manifest);
  const byHash = new Map((manifest?.files || []).filter((file) => !file.empty).map((file) => [String(file.sha256).toLowerCase(), file]));
  const missing = new Map();
  const unverifiable = [];
  const unchecked = [];
  const corrupted = [];
  const entries = [...groups.entries()].sort((a, b) => compareReleaseTags(b[0], a[0]));
  let checked = 0;
  for (const [tag, assets] of entries) {
    if (tags && !tags.has(tag)) continue;
    if (checked >= MAX_VERIFIED_TAGS) { unchecked.push(tag); continue; }
    checked++;
    let names;
    try {
      names = await existingReleaseAssetNames(repo, tag, cache);
    } catch (error) {
      if (error?.transient) { unchecked.push(tag); continue; }
      throw error;
    }
    for (const asset of assets) {
      const key = asset.toLowerCase();
      const info = names.get(asset) || names.get(key);
      if (!info) {
        if (!missing.has(key)) missing.set(key, { sha256: key, tag, asset });
        continue;
      }
      const problem = assetIntegrityProblem(info, byHash.get(key));
      if (problem) {
        corrupted.push({ tag, asset, path: byHash.get(key)?.path || '', reason: problem });
        if (!missing.has(key)) missing.set(key, { sha256: key, tag, asset, reason: problem });
      }
    }
  }
  for (const item of [...foreign, ...mismatched]) {
    const file = byHash.get(String(item.path || '').toLowerCase()) || (manifest.files || []).find((entry) => entry.path === item.path);
    if (!file) continue;
    const key = String(file.sha256).toLowerCase();
    unverifiable.push({ sha256: key, path: file.path, reason: item.reason || 'URL no verificable' });
    if (!missing.has(key)) missing.set(key, { sha256: key, tag: null, asset: key });
  }
  return { missing: [...missing.values()], unchecked, unverifiable, corrupted };
}
function compareReleaseTags(a, b) {
  const parts = (value) => String(value).replace(/^pack-v/i, '').split('.').map((piece) => Number.parseInt(piece, 10) || 0);
  const left = parts(a); const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return String(a).localeCompare(String(b));
}

function compareVersions(a, b) {
  const parts = (value) => String(value || '').replace(/^v/i, '').split(/[.-]/).map((piece) => Number.parseInt(piece, 10) || 0);
  const left = parts(a); const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The pack cannot require a launcher build that does not exist: publishing from
 * an unreleased maintenance build used to leave `minimumLauncher` ahead of the
 * newest public release, which locked every player out with “actualizá el
 * launcher primero” and nothing to update to.
 */
function releasedLauncherVersions(repo) {
  const result = ghCaptured(['release', 'list', '--repo', repo, '--limit', '100', '--json', 'tagName']);
  if (!result.ok) return null;
  try {
    const list = JSON.parse(result.stdout || '[]');
    return list
      .map((entry) => String(entry?.tagName || ''))
      .filter((tag) => /^launcher-v\d+\.\d+\.\d+$/.test(tag))
      .map((tag) => tag.replace(/^launcher-v/, ''))
      .sort(compareVersions);
  } catch (_) { return null; }
}
function resolveMinimumLauncher(repo, publisherVersion) {
  const value = String(publisherVersion || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(value)) return { value, clamped: false, released: '' };
  const released = releasedLauncherVersions(repo);
  if (!released) return { value, clamped: false, released: '', unchecked: true };
  if (!released.length) return { value, clamped: false, released: '' };
  const newest = released[released.length - 1];
  if (compareVersions(value, newest) > 0) return { value: newest, clamped: true, released: newest, requested: value };
  return { value, clamped: false, released: newest };
}

async function ensureRelease(tag, repo, { notesFile = '', title = '' } = {}) {
  const view = ghCaptured(['release', 'view', tag, '--repo', repo]);
  if (view.ok) return false;
  const args = ['release', 'create', tag, '--repo', repo, '--latest=false', '--title', title || tag];
  if (notesFile && fs.existsSync(notesFile)) args.push('--notes-file', notesFile);
  else args.push('--notes', `Eternal Craft ${title || tag}`);
  gh(args);
  return true;
}

/**
 * The local checkout must never keep a stale copy of the published manifest:
 * committing that file again would roll the channel back. Only touched when
 * the checkout actually points at the repository being published.
 */
function resolveLocalChannelDir(repo) {
  if (process.env.ETERNAL_PUBLISH_SKIP_LOCAL_CHANNEL === '1') return '';
  const override = String(process.env.ETERNAL_PUBLISH_LOCAL_CHANNEL_DIR || '').trim();
  if (override) return override;
  const checkout = path.join(__dirname, '..');
  const channelDir = path.join(checkout, 'channel');
  if (!fs.existsSync(channelDir)) return '';
  try {
    const origin = String(execFileSync('git', ['-C', checkout, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) || '').trim();
    const slug = origin.replace(/^git@github\.com:/, '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').trim();
    if (slug.toLowerCase() !== String(repo).toLowerCase()) return '';
  } catch (_) {
    return '';
  }
  return channelDir;
}
async function syncLocalChannel(channelDir, manifest) {
  if (!channelDir) return '';
  const file = path.join(channelDir, 'stable.json');
  const serialized = JSON.stringify(manifest, null, 2);
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fsp.mkdir(channelDir, { recursive: true });
  await fsp.writeFile(temporary, serialized, 'utf8');
  await fsp.rename(temporary, file);
  return file;
}
function clearStaging(out, { keepChannel = false } = {}) {
  for (const target of keepChannel ? ['blobs'] : ['blobs', 'channel']) {
    try { fs.rmSync(path.join(out, target), { recursive: true, force: true }); } catch (_) {}
  }
  for (const file of ['changes.json', 'release-notes.md']) {
    try { fs.rmSync(path.join(out, file), { force: true }); } catch (_) {}
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = String(args.repo || process.env.ETERNAL_PACK_REPO || '').trim();
  if (!repo || !repo.includes('/')) throw new Error('Usá --repo USUARIO/REPO (por ejemplo Santi-PdR/EternalCraft-Modpack).');
  requireGh();
  const previewOnly = Boolean(args.preview);
  let created = false;
  try { gh(['repo', 'view', repo, '--json', 'name']); }
  catch (_) {
    if (previewOnly) { console.log(`PREVIEW // ${repo} todavía no existe; se tomará como publicación inicial.`); }
    else {
      console.log(`El repositorio ${repo} no existe. Creándolo como repositorio público...`);
      gh(['repo', 'create', repo, '--public', '--add-readme', '--description', 'Canal oficial de actualizaciones del modpack Eternal Craft // SIEGE']);
      created = true;
    }
  }

  let branch = 'main';
  try { branch = gh(['repo', 'view', repo, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']) || 'main'; } catch (_) {}
  if (created) console.log(`Repositorio listo: ${repo} (${branch})`);

  const channel = created
    ? { exists: false, manifest: null }
    : await readPublishedChannel(repo, branch);
  const previous = channel.manifest;
  if (previous) console.log(`Estado publicado: ${previous.version} · ${(previous.files || []).length} archivos · ${(previous.remove || []).length} retirados.`);
  else console.log('No hay canal publicado todavía: se creará la primera versión.');

  const requestedVersion = String(args.version || '').trim();
  const source = args.source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege');
  const out = path.resolve(args.out || path.join(process.cwd(), 'pack-dist-publish'));
  // Keep the working directory alive (the launcher spawns this process with
  // cwd = --out) while still discarding any half-written previous staging.
  process.env.ETERNAL_PUBLISH_OUT = out;
  await fsp.mkdir(out, { recursive: true });
  clearStaging(out);

  const initialVersion = requestedVersion || (previous?.version || '1.0.0');
  const reportBuildProgress = ({ current, total, file }) => {
    if (current === 1 || current === total || current % 25 === 0) console.log(`Preparando publicación: ${current}/${total} · ${file}`);
  };
  const includeUserMods = Boolean(args['include-user-mods']);
  const launcherPolicy = resolveMinimumLauncher(repo, launcherVersion);
  if (launcherPolicy.clamped) {
    console.log(`Aviso: este build de mantenimiento es ${launcherPolicy.requested} y todavía no existe esa release del launcher.`);
    console.log(`El canal va a requerir ${launcherPolicy.value} (última release publicada) para que los jugadores puedan instalar el pack.`);
  } else if (launcherPolicy.unchecked) {
    console.log('Aviso: no pude comprobar las releases del launcher; se mantiene el requisito actual.');
  }
  const result = await buildPack({ source, out, version: initialVersion, minimumLauncher: launcherPolicy.value, baseUrl: `https://github.com/${repo}/releases/download/pack-v${initialVersion}`, previousManifest: previous, notes: args.notes || '', includeUserMods, onProgress: reportBuildProgress });
  const changes = result.changes;
  const changeCount = (changes.added?.length || 0) + (changes.changed?.length || 0) + (changes.removed?.length || 0);
  // A publish that only repeats the current state must not create a new
  // version. An explicit --version different from the published one is a
  // deliberate republish of the same payload under a new number.
  const explicitNewVersion = Boolean(requestedVersion) && (!previous || requestedVersion !== String(previous.version));
  const noop = changeCount === 0 && !explicitNewVersion;
  const version = noop ? initialVersion : (requestedVersion || nextVersion(previous?.version || '', changes));
  const tag = `pack-v${version}`;

  result.manifest.version = version;
  changes.version = version;
  result.manifest.releaseName = twoWordReleaseName(changes);
  result.manifest.releaseNotes.title = `${version} — ${result.manifest.releaseName}`;

  // Reassign URLs: only reuse a previous URL when the asset really is the
  // blob's SHA-256, and only for content that already exists. Anything else is
  // served from this version's release.
  const oldUrlByHash = new Map();
  for (const entry of previous?.files || []) {
    if (!entry.sha256 || !entry.url) continue;
    const match = /\/releases\/download\/([^/]+)\/(.+)$/.exec(String(entry.url));
    if (!match || decodeURIComponent(match[2]).toLowerCase() !== String(entry.sha256).toLowerCase()) continue;
    if (!oldUrlByHash.has(entry.sha256)) oldUrlByHash.set(entry.sha256, entry.url);
  }
  for (const file of result.manifest.files) {
    file.url = file.empty ? '' : (oldUrlByHash.get(file.sha256) || releaseUrl(repo, tag, file.sha256));
  }

  const sourceFingerprint = payloadFingerprint(result.manifest);
  const preview = {
    ok: true, preview: true, repo, branch, source, noop,
    minimumLauncher: result.manifest.minimumLauncher,
    previousVersion: previous?.version || null, version, releaseName: result.manifest.releaseName,
    totalFiles: result.manifest.files.length,
    added: changes.added || [], changed: changes.changed || [], removed: changes.removed || [],
    unchanged: changes.unchanged || 0,
    newBlobCount: (result.manifest.files.filter((file) => !file.empty && !oldUrlByHash.has(file.sha256))).length,
    ignored: result.payload?.ignored || [],
    sourceFingerprint, payload: result.payload
  };
  if (args['expected-fingerprint'] && String(args['expected-fingerprint']) !== sourceFingerprint) {
    // The source changed after the user reviewed the previous preview. Return
    // the exact manifest just rebuilt so the UI can show the new changes
    // without hashing every file a third time or publishing unreviewed data.
    console.log(`PUBLISH_PREVIEW_REFRESH_JSON:${JSON.stringify(preview)}`);
    throw new Error('La instancia SIEGE cambió después de la previsualización. Se actualizó el resumen; revisá los cambios antes de volver a publicar.');
  }
  console.log(`Fuente verificada: ${result.source}`);
  console.log(`Payload verificado: ${result.payload.mods} mods + ${result.payload.iammusicplayerrenewed} archivos de iammusicplayerrenewed (${result.payload.total} total) · ${result.payload.personalModsExcluded} personales omitidos`);
  if (result.payload.ignored?.length) {
    console.log(`Ignorados por no ser parte del payload: ${result.payload.ignored.length} · ${result.payload.ignored.slice(0, 3).map((entry) => entry.path).join(', ')}${result.payload.ignored.length > 3 ? '…' : ''}`);
  }
  if (changes.removed?.length) console.log(`Archivos retirados que los launchers van a eliminar: ${changes.removed.length} · ${changes.removed.slice(0, 3).join(', ')}${changes.removed.length > 3 ? '…' : ''}`);

  if (previewOnly) {
    console.log(`PREVIEW_JSON:${JSON.stringify(preview)}`);
    clearStaging(out);
    return;
  }

  const assetCache = new Map();
  const uploadQueue = new Set();

  // 1. Verify every blob the manifest references, including the URLs reused
  //    from older releases. A published manifest must never point at a blob
  //    that is not actually uploaded.
  const verification = await verifyReferencedAssets(repo, result.manifest, assetCache, { tags: null });
  for (const item of verification.missing) uploadQueue.add(item.sha256);
  if (verification.unchecked.length) console.log(`No pude verificar ${verification.unchecked.length} release(s) antiguas (transitorio); se continúa.`);
  if (verification.unverifiable.length) {
    console.log(`Re-subiendo ${verification.unverifiable.length} archivo(s) cuya URL no era verificable (${verification.unverifiable.slice(0, 3).map((item) => item.path).join(', ')}).`);
  }
  const corruptedBlobs = new Set((verification.corrupted || []).map((item) => String(item.asset).toLowerCase()));
  if (corruptedBlobs.size) {
    console.log(`GitHub tiene ${corruptedBlobs.size} blob(s) con contenido incorrecto; se vuelven a subir (${verification.corrupted.slice(0, 3).map((item) => `${item.asset.slice(0, 12)}… (${item.reason})`).join(', ')}${verification.corrupted.length > 3 ? '…' : ''}).`);
  }

  if (noop) {
    const sameChannel = previous && manifestSemanticEqual(previous, result.manifest);
    if (sameChannel && uploadQueue.size === 0) {
      const summary = noopSummary({ repo, branch, version, result, preview, repaired: [] });
      console.log('');
      console.log('SIN CAMBIOS');
      console.log(`El canal ${version} ya refleja exactamente la instancia SIEGE: ${result.manifest.files.length} archivos verificados.`);
      console.log('No se subió nada, no se creó una versión nueva y no se modificó el estado publicado.');
      console.log(`NOOP_JSON:${JSON.stringify(summary)}`);
      // Keep the verified manifest available for the launcher's local metadata
      // sync; drop only the heavy staging payload.
      await fsp.mkdir(path.join(out, 'channel'), { recursive: true });
      await fsp.writeFile(path.join(out, 'channel', 'stable.json'), JSON.stringify(result.manifest, null, 2)).catch(() => {});
      clearStaging(out, { keepChannel: true });
      return;
    }
    console.log('Sin cambios de contenido, pero el estado publicado no está completo. Reparando el canal sin crear una versión nueva...');
  }

  // 2. Re-point every blob that must be uploaded to this version's tag, so the
  //    manifest being committed can always be downloaded from a verified asset.
  for (const file of result.manifest.files) {
    if (file.empty || !uploadQueue.has(String(file.sha256).toLowerCase())) continue;
    file.url = releaseUrl(repo, tag, file.sha256);
  }

  // 3. Upload everything that is not already an asset of this tag.
  const releaseAssets = await existingReleaseAssetNames(repo, tag, assetCache);
  // A damaged asset must be replaced even though its name already exists;
  // `gh release upload --clobber` overwrites it atomically enough for GitHub
  // to recompute size and digest.
  const pending = [...uploadQueue].filter((sha) => !releaseAssets.has(sha) || corruptedBlobs.has(String(sha).toLowerCase()));
  const alreadyUploaded = uploadQueue.size - pending.length;
  if (!noop || pending.length) {
    const notes = path.join(out, 'release-notes.md');
    const customNotes = String(args.notes || '').trim();
    await fsp.writeFile(notes, `# ${version} — ${result.manifest.releaseName}\n\n${customNotes ? `${customNotes}\n\n` : ''}- Añadidos: ${changes.added.length}\n- Cambiados: ${changes.changed.length}\n- Eliminados: ${changes.removed.length}\n- Archivos del pack: ${result.manifest.files.length}\n`);
    const releaseCreated = await ensureRelease(tag, repo, { notesFile: notes, title: `${version} — ${result.manifest.releaseName}` });
    if (releaseCreated) console.log(`Release ${tag} creada.`);
  }
  console.log(`Subiendo ${pending.length} blobs pendientes de ${uploadQueue.size} requeridos (lotes de 8, reanudable si ya existen assets)...`);
  if (alreadyUploaded) console.log(`Se conservan ${alreadyUploaded} blobs que ya estaban en la release ${tag}.`);
  const batchSize = 8;
  const uploadStarted = Date.now();
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize).map((sha) => {
      const local = result.blobSources.get(sha) || path.join(out, 'blobs', sha);
      if (!fs.existsSync(local)) throw new Error(`No tengo el contenido local del blob ${sha}; no puedo publicar un estado incompleto.`);
      // The asset name must be the SHA-256: the manifest resolves every blob as
      // <tag>/<sha256>, no matter where the file came from on disk.
      return `${local}#${sha}`;
    });
    await uploadAssetBatch(tag, repo, batch, i, pending.length);
    const uploaded = Math.min(i + batch.length, pending.length);
    if (uploaded % 10 < batch.length || uploaded === pending.length) {
      console.log(`Blobs subidos en esta ejecución: ${uploaded}/${pending.length} · ${Math.round((Date.now() - uploadStarted) / 1000)} s`);
    }
  }
  assetCache.delete(tag);

  // 4. Verify the whole referenced set again before touching the channel.
  const afterUpload = await verifyReferencedAssets(repo, result.manifest, assetCache, { tags: null });
  if (afterUpload.missing.length || afterUpload.corrupted.length) {
    const problems = [...afterUpload.missing, ...afterUpload.corrupted];
    throw new Error(`GitHub no confirmó ${problems.length} blob(s) referenciado(s): ${problems.slice(0, 3).map((item) => item.asset).join(', ')}. El canal no se modificó.`);
  }

  // 5. Commit the channel, then verify the committed state.
  const manifestAsset = path.join(out, 'channel', 'stable.json');
  await fsp.writeFile(manifestAsset, JSON.stringify(result.manifest, null, 2));
  if (!noop) await uploadAssetWithRetry(tag, repo, manifestAsset, 'manifest.json');
  await updateChannel(repo, branch, result.manifest);
  const verified = await verifyPublishedChannel(repo, branch, result.manifest);
  console.log(`Publicación verificada · ${verified.files.length} archivos en channel/stable.json · ${(verified.remove || []).length} retirados.`);
  const localChannel = await syncLocalChannel(resolveLocalChannelDir(repo), result.manifest).catch(() => '');
  if (localChannel) console.log(`Copia local del canal actualizada: ${localChannel}`);

  const summary = noopSummary({
    repo, branch, version, result, preview,
    repaired: uploadQueue.size ? [...uploadQueue] : [],
    corrupted: (verification.corrupted || []).map((item) => item.asset)
  });
  console.log('');
  console.log(noop ? 'CANAL REPARADO' : 'PUBLICACIÓN COMPLETA');
  console.log(`Manifest estable: https://raw.githubusercontent.com/${repo}/${branch}/channel/stable.json`);
  console.log(`Versión: ${version} — ${result.manifest.releaseName}`);
  console.log(`Archivos: ${result.manifest.files.length} · nuevos: ${changes.added.length} · actualizados: ${changes.changed.length} · retirados: ${changes.removed.length}`);
  console.log(`Blobs verificados en esta ejecución: ${uploadQueue.size} (${alreadyUploaded} ya existían, ${pending.length} subidos ahora)`);
  console.log(`Tiempo de carga: ${Math.round((Date.now() - uploadStarted) / 1000)} s`);
  if (changes.removed.length) console.log(`Los jugadores eliminarán ${changes.removed.length} archivo(s) retirado(s) al actualizar.`);
  else console.log('Los jugadores solo descargarán archivos nuevos, cambiados o faltantes.');
  console.log(`PUBLISH_JSON:${JSON.stringify(summary)}`);
  clearStaging(out);
}

function noopSummary({ repo, branch, version, result, preview, repaired = [], corrupted = [] }) {
  return {
    ok: true,
    noop: repaired.length === 0 && result.changes.noop,
    repaired,
    corrupted,
    repo, branch, version,
    minimumLauncher: result.manifest.minimumLauncher,
    releaseName: result.manifest.releaseName,
    totalFiles: result.manifest.files.length,
    added: result.changes.added || [],
    changed: result.changes.changed || [],
    removed: result.changes.removed || [],
    unchanged: result.changes.unchanged || 0,
    ignored: preview?.ignored || [],
    channelUrl: `https://raw.githubusercontent.com/${repo}/${branch}/channel/stable.json`,
    sourceFingerprint: payloadFingerprint(result.manifest)
  };
}

main().catch((err) => {
  const failedOut = process.env.ETERNAL_PUBLISH_OUT;
  if (failedOut) clearStaging(failedOut);
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
