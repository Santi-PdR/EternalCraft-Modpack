const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSnapshot, deleteSnapshot, restoreSnapshot } = require('../src/main/services/recoveryService');

test('invalid snapshot ids cannot escape the snapshots directory', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-recovery-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const launcherData = path.join(root, '.launcher', 'important.json');
  await fs.mkdir(path.dirname(launcherData), { recursive: true });
  await fs.writeFile(launcherData, 'keep');

  assert.equal(await deleteSnapshot(root, '..'), false);
  assert.equal(await deleteSnapshot(root, '../important.json'), false);
  await assert.rejects(restoreSnapshot(root, { files: [] }, '..'), /Snapshot inválido/);
  assert.equal(await fs.readFile(launcherData, 'utf8'), 'keep');
});

test('snapshot restore preserves official mods despite filename case differences', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-recovery-case-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const mods = path.join(root, 'mods');
  await fs.mkdir(mods, { recursive: true });
  await fs.writeFile(path.join(mods, 'OfficialMod.jar'), 'official');
  await fs.writeFile(path.join(mods, 'PersonalMod.jar'), 'personal');

  const manifest = { version: '1.0.0', files: [{ path: 'mods/officialmod.jar' }] };
  const snapshot = await createSnapshot(root, manifest);
  await fs.writeFile(path.join(mods, 'PersonalMod.jar'), 'changed');
  await restoreSnapshot(root, manifest, snapshot.id);

  assert.equal(await fs.readFile(path.join(mods, 'OfficialMod.jar'), 'utf8'), 'official');
  assert.equal(await fs.readFile(path.join(mods, 'PersonalMod.jar'), 'utf8'), 'personal');
});
