const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { repairInstallation, markPublishedOfficial, ensureCachedBlob } = require('../src/main/services/packService');

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

test('pack update recovers from null local indexes and ignores unsafe persisted official paths', async (t) => {
  const root=await createInstance(t);
  await fs.writeFile(path.join(root,'.launcher','file-index.json'),'null');
  await fs.writeFile(path.join(root,'.eternal-pack.json'),'null');
  await fs.writeFile(path.join(root,'.launcher','official-files.json'),JSON.stringify({files:['../../outside.txt','mods/../mods/retired.jar']}));
  await fs.writeFile(path.join(root,'mods','retired.jar'),'preserve unknown ownership');

  const result=await repairInstallation(root,{version:'1.0.3',minecraft:'1.20.1',forge:'47.4.10',files:[]});

  assert.equal(result.state.version,'1.0.3');
  assert.equal(await fs.readFile(path.join(root,'mods','retired.jar'),'utf8'),'preserve unknown ownership');
});

test('parallel pack entries with identical content share one cached blob safely', async (t) => {
  const root=await createInstance(t);
  const source=path.join(root,'source.bin');
  const payload=Buffer.from('same bytes for two pack files');
  await fs.writeFile(source,payload);
  const entry={sha256:crypto.createHash('sha256').update(payload).digest('hex'),size:payload.length,url:pathToFileURL(source).href};

  const [first,second]=await Promise.all([ensureCachedBlob(root,entry),ensureCachedBlob(root,entry)]);

  assert.equal(first.path,second.path);
  assert.equal(await fs.readFile(first.path,'utf8'),payload.toString());
});

test('pack update retires files recorded in the historical inventory when the current one was lost', async (t) => {
  const root = await createInstance(t);
  // A previous repair recorded the file as official, then the inventory file was
  // truncated/interrupted: only the historical list survived.
  await fs.writeFile(path.join(root, '.launcher', 'official-files.json'), JSON.stringify({
    version: '1.0.0',
    files: ['mods/current.jar'],
    known: ['mods/retired-long-ago.jar', 'mods/current.jar']
  }));
  await fs.writeFile(path.join(root, 'mods', 'retired-long-ago.jar'), 'old official payload');
  await fs.writeFile(path.join(root, 'mods', 'current.jar'), 'still official');

  const result = await repairInstallation(root, {
    version: '1.0.4', minecraft: '1.20.1', forge: '47.4.10',
    files: [{ path: 'mods/current.jar', size: 14, sha256: crypto.createHash('sha256').update('still official').digest('hex'), url: 'https://example.test/current' }],
    remove: []
  });

  assert.equal(result.state.version, '1.0.4');
  await assert.rejects(fs.access(path.join(root, 'mods', 'retired-long-ago.jar')), 'el archivo retirado debe eliminarse');
  assert.equal(await fs.readFile(path.join(root, 'mods', 'current.jar'), 'utf8'), 'still official');
});

test('repair never deletes a personal mod that reuses a retired official filename', async (t) => {
  const root = await createInstance(t);
  await fs.writeFile(path.join(root, '.launcher', 'official-files.json'), JSON.stringify({
    version: '1.0.0', files: [], known: ['mods/reused-name.jar']
  }));
  await fs.writeFile(path.join(root, '.launcher', 'user-mods.json'), JSON.stringify({ mods: { 'reused-name.jar': { provider: 'local' } } }));
  const personal = path.join(root, 'mods', 'reused-name.jar');
  await fs.writeFile(personal, 'my own build');

  await repairInstallation(root, { version: '1.0.5', minecraft: '1.20.1', forge: '47.4.10', files: [], remove: [] });

  assert.equal(await fs.readFile(personal, 'utf8'), 'my own build');
});

test('repair prunes directories emptied by a retired pack file', async (t) => {
  const root = await createInstance(t);
  const nested = path.join(root, 'iammusicplayerrenewed', 'lavaplayer_natives', 'win-x86-64');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(nested, 'connector.dll'), 'native');
  await fs.writeFile(path.join(root, '.launcher', 'official-files.json'), JSON.stringify({
    version: '1.0.0', files: ['iammusicplayerrenewed/lavaplayer_natives/win-x86-64/connector.dll']
  }));

  const result = await repairInstallation(root, { version: '1.0.6', minecraft: '1.20.1', forge: '47.4.10', files: [], remove: [] });

  assert.equal(result.removed, 1);
  await assert.rejects(fs.access(path.join(nested, 'connector.dll')));
  await assert.rejects(fs.access(nested), 'la carpeta vacía no debe quedar huérfana');
  await assert.rejects(fs.access(path.join(root, 'iammusicplayerrenewed', 'lavaplayer_natives')));
  assert.equal(await fs.stat(path.join(root, 'iammusicplayerrenewed')).then((s) => s.isDirectory()), true);
});

test('repair keeps the historical inventory consistent with the published manifest', async (t) => {
  const root = await createInstance(t);
  const payload = Buffer.from('official jar');
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  await fs.writeFile(path.join(root, '.launcher', 'official-files.json'), JSON.stringify({
    version: '1.0.0', files: ['mods/retired.jar'], known: ['mods/retired.jar']
  }));
  const source = path.join(root, 'source.jar');
  await fs.writeFile(source, payload);
  await repairInstallation(root, {
    version: '1.0.7', minecraft: '1.20.1', forge: '47.4.10',
    files: [{ path: 'mods/new.jar', size: payload.length, sha256: sha, url: pathToFileURL(source).href }],
    remove: ['mods/retired.jar']
  });
  const inventory = JSON.parse(await fs.readFile(path.join(root, '.launcher', 'official-files.json'), 'utf8'));
  assert.deepEqual(inventory.files, ['mods/new.jar']);
  assert.equal(inventory.known.includes('mods/retired.jar'), true, 'la historia debe conservarse para futuras reparaciones');
  assert.equal(inventory.known.includes('mods/new.jar'), true);
});
