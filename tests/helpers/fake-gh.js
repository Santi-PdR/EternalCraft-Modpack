#!/usr/bin/env node
/**
 * Minimal, deterministic stand-in for the GitHub CLI used by the publisher.
 *
 * The real publisher talks to GitHub through `gh` (releases + contents API).
 * Integration tests need the real publisher code paths, so this helper
 * emulates exactly the `gh` invocations the project performs and stores the
 * "remote" state in a directory given by FAKE_GH_STATE.
 *
 * Supported invocations:
 *   gh --version
 *   gh auth status
 *   gh api user --jq .login
 *   gh repo view REPO --json name|defaultBranchRef [--jq ...]
 *   gh repo create REPO --public ...
 *   gh api [-H 'Accept: application/vnd.github.raw+json'] repos/REPO/contents/PATH[?ref=BRANCH]
 *   gh api --method PUT repos/REPO/contents/PATH --input BODY
 *   gh release view TAG --repo REPO [--json assets]
 *   gh release create TAG --repo REPO [--latest=false] [--title T] [--notes-file F]
 *   gh release upload TAG --repo REPO --clobber FILE[#LABEL] ...
 *
 * Fault injection used by the recovery tests:
 *   FAKE_GH_FAIL_UPLOAD=<sha|file name substring>  -> the upload exits non-zero
 *   FAKE_GH_FAIL_UPLOAD_TIMES=<n>                  -> how many failing attempts
 *   FAKE_GH_OFFLINE=1                              -> every command fails
 *   FAKE_GH_LOG=<file>                             -> append one JSON line per call
 *   FAKE_GH_NO_CONTENT=<path>                      -> GET contents returns no body
 *   FAKE_GH_FAIL_API_READ=1                        -> contents API fails with HTTP 500
 *   FAKE_GH_FAIL_API_READ_AFTER=<n>                -> contents API fails after N successful reads
 *   FAKE_GH_CONTENT_LIMIT=<bytes>                  -> emulate GitHub's 1 MB truncation
 *   FAKE_GH_NO_DIGEST=1                            -> assets report size but no sha256 digest
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const stateDir = process.env.FAKE_GH_STATE || '';
if (!stateDir) {
  process.stderr.write('fake-gh: FAKE_GH_STATE is required\n');
  process.exit(1);
}
const argv = process.argv.slice(2);
const logFile = process.env.FAKE_GH_LOG || '';
if (logFile) {
  try { fs.appendFileSync(logFile, `${JSON.stringify(argv)}\n`); } catch (_) {}
}
if (process.env.FAKE_GH_OFFLINE === '1') {
  process.stderr.write('fake-gh: network unreachable\n');
  process.exit(1);
}

const repoRoot = path.join(stateDir, 'repo');
const releasesRoot = path.join(stateDir, 'releases');
const counterFile = path.join(stateDir, 'upload-attempts.json');
mkdir(stateDir, repoRoot, releasesRoot);

function mkdir(...dirs) { for (const dir of dirs) fs.mkdirSync(dir, { recursive: true }); }
function fail(message, code = 1) { process.stderr.write(`${message}\n`); process.exit(code); }
function out(value) { process.stdout.write(`${value}\n`); }
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function shaOf(file) { return require('crypto').createHash('sha1').update(fs.readFileSync(file)).digest('hex'); }
function writeJson(file, value) { mkdir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function bumpCounter(key, amount = 1) {
  const value = readJson(counterFile, {}) || {};
  value[key] = Number(value[key] || 0) + amount;
  writeJson(counterFile, value);
  return value[key];
}
function repoFile(relative) { return path.join(repoRoot, relative); }
function releaseDir(tag) { return path.join(releasesRoot, tag); }
function releaseAssets(tag) {
  try {
    return fs.readdirSync(path.join(releaseDir(tag), 'assets')).filter((name) => {
      try { return fs.statSync(path.join(releaseDir(tag), 'assets', name)).isFile(); } catch (_) { return false; }
    });
  } catch (_) { return []; }
}
function argValue(flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}
function hasFlag(flag) { return argv.includes(flag); }

function parseApiPath(value) {
  // repos/OWNER/REPO/contents/PATH?ref=BRANCH
  const match = /^repos\/([^/]+\/[^/]+)\/contents\/(.+?)(?:\?ref=(.+))?$/.exec(String(value || ''));
  if (!match) return null;
  return { repo: match[1], path: decodeURIComponent(match[2]), ref: match[3] || 'main' };
}

function commandVersion() { out('gh version 2.62.0 (fake)'); return 0; }
function commandAuthStatus() { out('github.com\n  ✓ Logged in to github.com account tester (FAKE_GH_TOKEN)'); return 0; }
function commandApiUser() { out(process.env.FAKE_GH_LOGIN || 'tester'); return 0; }

function commandRepoView() {
  const exists = fs.existsSync(path.join(repoRoot, 'channel', 'stable.json')) || hasFlag('--force-exists') || readJson(path.join(stateDir, 'repo-created.json'), null);
  if (!exists && !hasFlag('--json')) return 1;
  if (!exists) return 1;
  const json = hasFlag('--json');
  const fields = String(argValue('--json') || '').split(',').map((value) => value.trim());
  const payload = { name: 'EternalCraft-Modpack', defaultBranchRef: { name: 'main' } };
  if (hasFlag('--jq')) {
    const expr = String(argValue('--jq') || '');
    if (expr === '.defaultBranchRef.name') { out('main'); return 0; }
    if (expr === '.name') { out(payload.name); return 0; }
  }
  if (json) out(JSON.stringify(fields.length ? Object.fromEntries(fields.filter((f) => f in payload).map((f) => [f, payload[f]])) : payload));
  else out('EternalCraft-Modpack');
  return 0;
}
function commandRepoCreate() {
  writeJson(path.join(stateDir, 'repo-created.json'), { createdAt: new Date().toISOString() });
  out('✓ Created repository');
  return 0;
}

function commandApi() {
  // gh api [--method PUT|-X PUT] [-H header] ENDPOINT [--input file]
  const endpoint = argv.filter((token) => !token.startsWith('-')).find((token, index, list) => index > 0 && /^(repos|user)\//.test(token) || token === 'user');
  const raw = hasFlag('-H') && String(argValue('-H') || '').includes('raw');
  const method = String(argValue('--method') || argValue('-X') || 'GET').toUpperCase();
  const noContent = String(process.env.FAKE_GH_NO_CONTENT || '');
  if (endpoint === 'user') return commandApiUser();
  const target = parseApiPath(endpoint);
  if (!target) fail(`fake-gh: unsupported api endpoint ${endpoint}`);
  const file = repoFile(target.path);
  if (method === 'GET' && process.env.FAKE_GH_FAIL_API_READ === '1') {
    // A repository that exists but whose contents API is failing: the
    // publisher must abort instead of rebuilding the pack from scratch.
    process.stderr.write('gh: HTTP 500: Internal Server Error\n');
    return 1;
  }
  if (method === 'GET' && Number(process.env.FAKE_GH_FAIL_API_READ_AFTER || 0) > 0
    && bumpCounter('apiReads') > Number(process.env.FAKE_GH_FAIL_API_READ_AFTER)) {
    // Fails only the reads that happen after N successful ones: used to break
    // the channel SHA lookup that runs right before committing.
    process.stderr.write('gh: HTTP 500: Internal Server Error\n');
    return 1;
  }
  if (method === 'GET') {
    if (!fs.existsSync(file)) {
      process.stderr.write('gh: Not Found (HTTP 404)\n');
      return 1;
    }
    const meta = readJson(`${file}.meta.json`, { sha: shaOf(file) });
    const body = fs.readFileSync(file, 'utf8');
    if (noContent && target.path === noContent) { out(JSON.stringify({ name: path.basename(target.path), path: target.path, sha: meta.sha, content: '', encoding: 'none' })); return 0; }
    if (raw) { process.stdout.write(body); return 0; }
    // GitHub truncates the base64 `content` field for files over 1 MB. Emulate
    // that boundary with FAKE_GH_CONTENT_LIMIT so the publisher must handle it.
    const limit = Number(process.env.FAKE_GH_CONTENT_LIMIT || 1024 * 1024);
    if (Buffer.byteLength(body, 'utf8') > limit) {
      out(JSON.stringify({ name: path.basename(target.path), path: target.path, sha: meta.sha, content: '', encoding: 'none', size: Buffer.byteLength(body) }));
      return 0;
    }
    out(JSON.stringify({ name: path.basename(target.path), path: target.path, sha: meta.sha, content: Buffer.from(body, 'utf8').toString('base64'), encoding: 'base64' }));
    return 0;
  }
  if (method === 'PUT') {
    const inputFile = argValue('--input');
    if (!inputFile || !fs.existsSync(inputFile)) fail('fake-gh: PUT requires --input with a JSON body');
    const body = readJson(inputFile, null);
    if (!body || typeof body.content !== 'string') fail('fake-gh: PUT body must contain base64 content');
    if (body.sha && fs.existsSync(file)) {
      const current = readJson(`${file}.meta.json`, { sha: shaOf(file) });
      if (current.sha !== body.sha) { process.stderr.write('gh: sha mismatch (HTTP 409)\n'); return 1; }
    }
    mkdir(path.dirname(file));
    const content = Buffer.from(body.content, 'base64').toString('utf8');
    fs.writeFileSync(file, content);
    writeJson(`${file}.meta.json`, { sha: shaOf(file), message: body.message || '' });
    out(JSON.stringify({ content: { path: target.path }, commit: { sha: 'fake' } }));
    return 0;
  }
  fail(`fake-gh: unsupported method ${method}`);
}

function commandRelease() {
  const sub = argv[1];
  const tag = argv[2];
  if (sub === 'list') {
    const limit = Number(argValue('--limit') || 30);
    const tags = fs.existsSync(releasesRoot)
      ? fs.readdirSync(releasesRoot).filter((name) => fs.existsSync(path.join(releaseDir(name), 'release.json')))
      : [];
    const rows = tags.slice(0, limit).map((name) => ({ tagName: name }));
    out(hasFlag('--json') ? JSON.stringify(rows) : rows.map((row) => row.tagName).join('\n'));
    return 0;
  }
  if (sub === 'view') {
    const exists = fs.existsSync(releaseDir(tag));
    if (!exists) { process.stderr.write('gh: release not found (HTTP 404)\n'); return 1; }
    if (hasFlag('--json')) {
      const wantAssets = String(argValue('--json') || '').includes('assets');
      if (wantAssets) {
        const assets = releaseAssets(tag).map((name) => {
          const file = path.join(releaseDir(tag), 'assets', name);
          const size = fs.statSync(file).size;
          // Real GitHub returns a sha256 digest for recently uploaded assets and
          // null for older ones. FAKE_GH_NO_DIGEST emulates the legacy shape so
          // the size-only verification path stays covered.
          const digest = process.env.FAKE_GH_NO_DIGEST === '1'
            ? null
            : `sha256:${require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
          return { name, size, digest };
        });
        out(JSON.stringify({ assets }));
      } else out(JSON.stringify({ name: tag }));
    } else out(tag);
    return 0;
  }
  if (sub === 'create') {
    mkdir(path.join(releaseDir(tag), 'assets'));
    writeJson(path.join(releaseDir(tag), 'release.json'), { tag, latest: !hasFlag('--latest=false'), title: argValue('--title') || '' });
    out(`✓ Created release ${tag}`);
    return 0;
  }
  if (sub === 'upload') {
    mkdir(path.join(releaseDir(tag), 'assets'));
    const files = argv.slice(3).filter((token) => !token.startsWith('-') && token !== argValue('--repo'));
    const failBlobs = Number(process.env.FAKE_GH_FAIL_BLOBS || 0);
    const failTimes = Number(process.env.FAKE_GH_FAIL_UPLOAD_TIMES || 1);
    let failed = false;
    for (const entry of files) {
      const [file, label] = String(entry).split('#');
      if (!fs.existsSync(file)) fail(`fake-gh: cannot upload missing file ${file}`);
      const name = label || path.basename(file);
      // `release upload` is not atomic: some assets land before the rejection.
      if (failBlobs > 0 && /^[a-f0-9]{64}$/i.test(name) && bumpCounter('failingUploads') <= failTimes) {
        failed = true;
        process.stderr.write(`HTTP 502: Bad Gateway (uploading ${name})\n`);
        break;
      }
      fs.copyFileSync(file, path.join(releaseDir(tag), 'assets', name));
      bumpCounter('uploadedAssets');
      out(`✓ Uploaded ${name}`);
    }
    return failed ? 1 : 0;
  }
  fail(`fake-gh: unsupported release subcommand ${sub}`);
}

function main() {
  if (!argv.length) return commandVersion();
  const command = argv[0];
  if (command === '--version') return commandVersion();
  if (command === 'auth' && argv[1] === 'status') return commandAuthStatus();
  if (command === 'api') return commandApi();
  if (command === 'repo' && argv[1] === 'view') return commandRepoView();
  if (command === 'repo' && argv[1] === 'create') return commandRepoCreate();
  if (command === 'release') return commandRelease();
  fail(`fake-gh: unsupported command ${argv.join(' ')}`);
}
process.exit(main() ?? 0);

// Keep a reference so lint/readers know os is intentionally available for
// future fault injection (e.g. temp path checks).
void os;
