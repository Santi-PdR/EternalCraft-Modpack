const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { prepareSafeMode, restoreSafeMode } = require('../src/main/services/safeModeService');

test('safe mode never disables an official mod because of filename casing', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-safe-mode-case-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'mods'), { recursive: true });
  await fs.writeFile(path.join(root, 'mods', 'Official.jar'), 'official');
  await fs.writeFile(path.join(root, 'mods', 'Personal.jar'), 'personal');

  const result = await prepareSafeMode(root, { files: [{ path: 'mods/official.jar' }] });
  assert.deepEqual(result.disabled, ['mods/Personal.jar']);
  await restoreSafeMode(root);
  assert.equal(await fs.readFile(path.join(root, 'mods', 'Official.jar'), 'utf8'), 'official');
  assert.equal(await fs.readFile(path.join(root, 'mods', 'Personal.jar'), 'utf8'), 'personal');
});

test('safe-mode recovery rejects marker paths outside the mods directory', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-safe-mode-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outside = path.join(root, 'victim.jar.disabled');
  await fs.writeFile(outside, 'keep');
  const marker = path.join(root, '.launcher', 'safe-mode.json');
  await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.writeFile(marker, JSON.stringify({ files: [{ enabled: '../victim.jar', disabled: '../victim.jar.disabled' }] }));

  const result = await restoreSafeMode(root);
  assert.deepEqual(result.restored, []);
  assert.equal(await fs.readFile(outside, 'utf8'), 'keep');
  assert.equal(await fs.readFile(marker, 'utf8').then(() => true), true);
});

test('safe-mode recovery keeps its marker when enabled and disabled copies collide', async (t) => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ecl-safe-mode-collision-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'mods'),{recursive:true});
  await fs.writeFile(path.join(root,'mods','personal.jar'),'active');
  await fs.writeFile(path.join(root,'mods','personal.jar.disabled'),'disabled');
  const marker=path.join(root,'.launcher','safe-mode.json');
  await fs.mkdir(path.dirname(marker),{recursive:true});
  await fs.writeFile(marker,JSON.stringify({files:[{enabled:'mods/personal.jar',disabled:'mods/personal.jar.disabled'}]}));

  const result=await restoreSafeMode(root);
  assert.deepEqual(result.restored,[]);
  assert.equal(await fs.readFile(path.join(root,'mods','personal.jar'),'utf8'),'active');
  assert.equal(await fs.readFile(path.join(root,'mods','personal.jar.disabled'),'utf8'),'disabled');
  await fs.access(marker);
  await assert.rejects(prepareSafeMode(root,{files:[]}),/restauración del modo seguro/);
  await fs.access(marker);
});

test('safe-mode keeps a corrupt marker instead of erasing recovery metadata', async (t) => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ecl-safe-mode-corrupt-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const marker=path.join(root,'.launcher','safe-mode.json');
  await fs.mkdir(path.dirname(marker),{recursive:true});
  await fs.writeFile(marker,'{broken');

  const result=await restoreSafeMode(root);
  assert.match(result.error,/está dañado/);
  assert.equal(await fs.readFile(marker,'utf8'),'{broken');
  await assert.rejects(prepareSafeMode(root,{files:[]}),/está dañado/);
});
