#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { buildPack, parseArgs } = require('./build-pack');
const { twoWordReleaseName, nextVersion } = require('./release-name');

function gh(args, opts = {}) {
  // `stdio: inherit` makes execFileSync return null. Normalise both modes so
  // release uploads and API writes cannot crash while trimming their output.
  const output = execFileSync('gh', args, { encoding: 'utf8', stdio: opts.stdio || ['ignore', 'pipe', 'pipe'] });
  return String(output || '').trim();
}
function requireGh() {
  try { gh(['--version']); gh(['auth', 'status']); }
  catch (_) { throw new Error('Necesitás GitHub CLI (gh) instalado y con sesión iniciada.'); }
}
function releaseUrl(repo, tag, sha) {
  return `https://github.com/${repo}/releases/download/${tag}/${sha}`;
}
function manifestFingerprint(manifest){
  const crypto=require('crypto');
  const rows=(manifest?.files||[]).map(f=>`${f.path}:${f.sha256}`).sort().join('\n');
  return crypto.createHash('sha256').update(rows).digest('hex');
}
async function getPrevious(repo, branch) {
  try {
    const raw = gh(['api', '-H', 'Accept: application/vnd.github.raw+json', `repos/${repo}/contents/channel/stable.json?ref=${branch}`]);
    return JSON.parse(raw);
  } catch (_) { return null; }
}
async function updateChannel(repo, branch, manifest) {
  let sha = '';
  try {
    const info = JSON.parse(gh(['api', `repos/${repo}/contents/channel/stable.json?ref=${branch}`]));
    sha = info.sha || '';
  } catch (_) {}
  const content = Buffer.from(JSON.stringify(manifest, null, 2)).toString('base64');
  const args = ['api', '--method', 'PUT', `repos/${repo}/contents/channel/stable.json`, '-f', `message=Publish Eternal Craft ${manifest.version}`, '-f', `content=${content}`, '-f', `branch=${branch}`];
  if (sha) args.push('-f', `sha=${sha}`);
  gh(args);
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
  const previous = previewOnly && !created ? await getPrevious(repo, branch) : await getPrevious(repo, branch);
  const requestedVersion = String(args.version || '').trim();
  const source = args.source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege');
  const out = path.resolve(args.out || path.join(process.cwd(), 'pack-dist-publish'));
  await fsp.rm(out, { recursive: true, force: true });

  const initialVersion = requestedVersion || (previous?.version || '1.0.0');
  let result = await buildPack({ source, out, version: initialVersion, baseUrl: `https://github.com/${repo}/releases/download/pack-v${initialVersion}`, previousManifest: previous, notes: args.notes || '' });
  const changeCount=(result.changes.added?.length||0)+(result.changes.changed?.length||0)+(result.changes.removed?.length||0);
  if(previous && changeCount===0) throw new Error('No hay cambios nuevos en la instancia SIEGE para publicar.');
  const version = requestedVersion || nextVersion(previous?.version || '', result.changes);
  const tag = `pack-v${version}`;
  if (version !== initialVersion) {
    await fsp.rm(out, { recursive: true, force: true });
    result = await buildPack({ source, out, version, baseUrl: `https://github.com/${repo}/releases/download/${tag}`, previousManifest: previous, notes: args.notes || '' });
  }
  result.manifest.releaseName = twoWordReleaseName(result.changes);
  result.manifest.releaseNotes.title = `${version} — ${result.manifest.releaseName}`;
  const sourceFingerprint=manifestFingerprint(result.manifest);
  if(args['expected-fingerprint'] && String(args['expected-fingerprint'])!==sourceFingerprint) throw new Error('La instancia SIEGE cambió después del preview. Hacé una nueva previsualización antes de publicar.');

  if (previewOnly) {
    const preview = {
      ok: true, preview: true, repo, branch, source,
      previousVersion: previous?.version || null, version, releaseName: result.manifest.releaseName,
      totalFiles: result.manifest.files.length,
      added: result.changes.added || [], changed: result.changes.changed || [], removed: result.changes.removed || [],
      unchanged: result.changes.unchanged || 0,
      newBlobCount: result.changes.uniqueNewBlobs || 0, sourceFingerprint
    };
    console.log(`PREVIEW_JSON:${JSON.stringify(preview)}`);
    await fsp.rm(out, { recursive: true, force: true }).catch(() => {});
    return;
  }
  const oldHashes = new Set((previous?.files || []).map((f) => f.sha256));
  const newHashes = [...new Set(result.manifest.files.filter((f) => !f.empty).map((f) => f.sha256).filter((h) => !oldHashes.has(h)))];

  // Reassign URLs only for truly new blobs; unchanged hashes preserve their older asset URLs.
  const oldUrlByHash = new Map((previous?.files || []).filter((f) => f.sha256 && f.url).map((f) => [f.sha256, f.url]));
  for (const file of result.manifest.files) {
    file.url = file.empty ? '' : (oldUrlByHash.get(file.sha256) || releaseUrl(repo, tag, file.sha256));
  }
  await fsp.writeFile(path.join(out, 'channel', 'stable.json'), JSON.stringify(result.manifest, null, 2));

  const notes = path.join(out, 'release-notes.md');
  const customNotes=String(args.notes||'').trim();
  await fsp.writeFile(notes, `# ${version} — ${result.manifest.releaseName}\n\n${customNotes?customNotes+'\n\n':''}- Añadidos: ${result.changes.added.length}\n- Cambiados: ${result.changes.changed.length}\n- Eliminados: ${result.changes.removed.length}\n- Archivos del pack: ${result.manifest.files.length}\n`);

  try { gh(['release', 'view', tag, '--repo', repo]); }
  catch (_) { gh(['release', 'create', tag, '--repo', repo, '--title', `${version} — ${result.manifest.releaseName}`, '--notes-file', notes]); }

  console.log(`Subiendo ${newHashes.length} blobs nuevos...`);
  for (let i = 0; i < newHashes.length; i += 25) {
    const batch = newHashes.slice(i, i + 25).map((sha) => path.join(out, 'blobs', sha));
    if (batch.length) gh(['release', 'upload', tag, '--repo', repo, '--clobber', ...batch], { stdio: 'inherit' });
  }
  const manifestAsset = path.join(out, 'channel', 'stable.json');
  gh(['release', 'upload', tag, '--repo', repo, '--clobber', `${manifestAsset}#manifest.json`], { stdio: 'inherit' });
  await updateChannel(repo, branch, result.manifest);

  console.log('\nPUBLICACIÓN COMPLETA');
  console.log(`Manifest estable: https://raw.githubusercontent.com/${repo}/${branch}/channel/stable.json`);
  console.log(`Versión: ${version} — ${result.manifest.releaseName}`);
  console.log(`Blobs nuevos subidos: ${newHashes.length}`);
  console.log('Los jugadores solo descargarán archivos nuevos, cambiados o faltantes.');
}
main().catch((err) => { console.error(`ERROR: ${err.message}`); process.exit(1); });
