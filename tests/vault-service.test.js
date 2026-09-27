const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizePaths, pullVault, pushVault, safeRel, vaultStatus } = require('../src/main/services/vaultService');

test('vault rejects root paths and deduplicates paths without case collisions', () => {
  assert.equal(safeRel('.'), '');
  assert.equal(safeRel('folder/..'), '');
  assert.equal(safeRel('../outside'), '');
  assert.equal(safeRel('mods'), '');
  assert.deepEqual(normalizePaths({ includeScreenshots: true, extraPaths: ['Screenshots', '.', 'mods', 'custom/data'] }), ['options.txt', 'servers.dat', 'screenshots', 'custom/data']);
});

test('vault push ignores symlinks and does not ingest data outside the instance', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-push-'));
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-store-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-outside-'));
  t.after(() => Promise.all([root, vault, outside].map((dir) => fs.rm(dir, { recursive: true, force: true }))));
  await fs.mkdir(path.join(root, 'screenshots'), { recursive: true });
  await fs.writeFile(path.join(outside, 'private.png'), 'private');
  try { await fs.symlink(outside, path.join(root, 'screenshots', 'linked'), 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('symlinks are unavailable in this environment'); throw error; }

  const result = await pushVault(root, { vaultDirectory: vault, includeScreenshots: true }, 'test');
  assert.equal(result.files, 0);
  const manifest = JSON.parse(await fs.readFile(path.join(vault, 'EternalCraftVault', 'vault-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.files, []);
});

test('vault restore refuses to write through symlinks inside the instance', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-pull-'));
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-data-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-target-'));
  t.after(() => Promise.all([root, vault, outside].map((dir) => fs.rm(dir, { recursive: true, force: true }))));
  await fs.mkdir(path.join(root, 'screenshots'), { recursive: true });
  await fs.writeFile(path.join(outside, 'keep.png'), 'do not overwrite');
  try { await fs.symlink(outside, path.join(root, 'screenshots', 'linked'), 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('symlinks are unavailable in this environment'); throw error; }

  const data = path.join(vault, 'EternalCraftVault', 'data', 'screenshots', 'linked');
  await fs.mkdir(data, { recursive: true });
  const payload='malicious overwrite';
  await fs.writeFile(path.join(data, 'keep.png'), payload);
  await fs.writeFile(path.join(vault, 'EternalCraftVault', 'vault-manifest.json'), JSON.stringify({ schema: 1, paths: ['screenshots'], files: [{ rel:'screenshots/linked/keep.png',size:Buffer.byteLength(payload),sha256:crypto.createHash('sha256').update(payload).digest('hex'),mtimeMs:0 }] }));
  await assert.rejects(pullVault(root, { vaultDirectory: vault }, true), /enlace simbólico/);
  assert.equal(await fs.readFile(path.join(outside, 'keep.png'), 'utf8'), 'do not overwrite');
});

test('vault validates every hash before restoring any file', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-integrity-'));
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-vault-integrity-store-'));
  t.after(() => Promise.all([root, vault].map((dir) => fs.rm(dir, { recursive: true, force: true }))));
  await fs.mkdir(path.join(root, 'screenshots'), { recursive: true });
  await fs.writeFile(path.join(root, 'screenshots', 'first.png'), 'original');
  const data = path.join(vault, 'EternalCraftVault', 'data', 'screenshots');
  await fs.mkdir(data, { recursive: true });
  const first='replacement'; const broken='tampered';
  await fs.writeFile(path.join(data, 'first.png'), first);
  await fs.writeFile(path.join(data, 'second.png'), broken);
  const firstHash=crypto.createHash('sha256').update(first).digest('hex');
  const wrongHash='0'.repeat(64);
  const now=Date.now()+10000;
  await fs.writeFile(path.join(vault, 'EternalCraftVault', 'vault-manifest.json'), JSON.stringify({ schema:1,paths:['screenshots'],files:[
    {rel:'screenshots/first.png',size:first.length,sha256:firstHash,mtimeMs:0},
    {rel:'screenshots/second.png',size:broken.length,sha256:wrongHash,mtimeMs:0}
  ]}));

  await assert.rejects(pullVault(root,{vaultDirectory:vault},true),/SHA-256/);
  assert.equal(await fs.readFile(path.join(root,'screenshots','first.png'),'utf8'),'original');
});

test('vault status tolerates malformed manifest entries without breaking maintenance UI', async (t) => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ecl-vault-status-'));
  const vault=await fs.mkdtemp(path.join(os.tmpdir(),'ecl-vault-status-store-'));
  t.after(()=>Promise.all([root,vault].map((dir)=>fs.rm(dir,{recursive:true,force:true}))));
  const vaultRoot=path.join(vault,'EternalCraftVault');
  await fs.mkdir(vaultRoot,{recursive:true});
  await fs.writeFile(path.join(vaultRoot,'vault-manifest.json'),JSON.stringify({createdAt:{},device:['bad'],files:[null,{}, {rel:'../../outside',size:4},{rel:'screenshots/a.png',size:'NaN'},{rel:'screenshots/good.png',size:12,mtimeMs:'bad'}]}));
  const result=await vaultStatus(root,{vaultDirectory:vault});
  assert.equal(result.files,1);
  assert.equal(result.bytes,12);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.lastPush,'');
  assert.equal(result.sourceDevice,'');
});
