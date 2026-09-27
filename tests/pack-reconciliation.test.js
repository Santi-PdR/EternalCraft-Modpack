const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { repairInstallation, markPublishedOfficial } = require('../src/main/services/packService');

async function createInstance(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-pack-reconcile-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'mods'), { recursive: true });
  await fs.mkdir(path.join(root, '.launcher'), { recursive: true });
  return root;
}

test('pack update removes explicitly retired official jars on legacy installs and preserves unrelated personal jars', async (t) => {
  const root = await createInstance(t);
  const retired = path.join(root, 'mods', 'retired-official.jar.disabled');
  const personal = path.join(root, 'mods', 'my-personal-mod.jar');
  await fs.writeFile(retired, 'old official mod');
  await fs.writeFile(personal, 'personal mod');
  await fs.writeFile(path.join(root, '.launcher', 'user-mods.json'), JSON.stringify({ mods: {
    'retired-official.jar': { provider: 'local' },
    'my-personal-mod.jar': { provider: 'local' }
  } }));
  await fs.writeFile(path.join(root, '.eternal-pack.json'), JSON.stringify({ version: '1.0.0' }));

  const result = await repairInstallation(root, {
    version: '1.0.1', minecraft: '1.20.1', forge: '47.4.10', files: [],
    remove: ['mods/retired-official.jar']
  });

  assert.equal(result.removed, 1);
  await assert.rejects(fs.access(retired));
  assert.equal(await fs.readFile(personal, 'utf8'), 'personal mod');
  assert.equal((await fs.readFile(path.join(root, '.eternal-pack.json'), 'utf8')).includes('1.0.1'), true);
});

test('publishing promotes matching local jars to official without changing other personal mods', async (t) => {
  const root = await createInstance(t);
  const official = path.join(root, 'mods', 'published.jar');
  const personal = path.join(root, 'mods', 'personal.jar');
  await fs.writeFile(official, 'published');
  await fs.writeFile(personal, 'personal');
  await fs.writeFile(path.join(root, '.launcher', 'user-mods.json'), JSON.stringify({ mods: {
    'published.jar': { provider: 'local' },
    'personal.jar': { provider: 'local' }
  } }));

  const manifest = { version: '1.0.2', files: [{ path: 'mods/published.jar' }] };
  await markPublishedOfficial(root, manifest);
  const metadata = JSON.parse(await fs.readFile(path.join(root, '.launcher', 'user-mods.json'), 'utf8'));
  const officialFiles = JSON.parse(await fs.readFile(path.join(root, '.launcher', 'official-files.json'), 'utf8'));

  assert.equal(metadata.mods['published.jar'].provider, 'official');
  assert.equal(metadata.mods['personal.jar'].provider, 'local');
  assert.deepEqual(officialFiles.files, ['mods/published.jar']);
});
