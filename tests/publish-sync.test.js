const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {
  createSourceInstance, createFakeGhEnvironment, runPublisher, readChannel,
  releaseAssetNames, startPackServer, clientManifest, tempDir, listFiles
} = require('./helpers/pack-testbed');
const { checkInstallation, repairInstallation } = require('../src/main/services/packService');

const REPO = 'Santi-PdR/EternalCraft-Modpack';

async function setup(t) {
  const base = await tempDir('ecl-publish-', t);
  const gh = createFakeGhEnvironment(base);
  const source = createSourceInstance(path.join(base, 'siege'), {});
  const out = path.join(base, 'out');
  return { base, gh, source, out };
}

async function publish(ctx, extraArgs = [], extraEnv = {}) {
  const result = await runPublisher({
    gh: ctx.gh,
    args: ['--repo', REPO, '--source', ctx.source, '--out', ctx.out, ...extraArgs],
    env: { ETERNAL_LAUNCHER_VERSION: '0.80.0', ...extraEnv }
  });
  return result;
}

async function clientSync(root, manifest, server) {
  const remote = clientManifest(manifest, server);
  const before = await checkInstallation(root, remote);
  const after = await repairInstallation(root, remote, () => {}, before);
  return { before, after };
}

test('publish/sync case A+B+C+D: retired mods disappear from channel, release and installs', async (t) => {
  const ctx = await setup(t);
  createSourceInstance(ctx.source, {
    'a.jar': Buffer.from('mod a v1'),
    'b.jar': Buffer.from('mod b v1'),
    'c.jar': Buffer.from('mod c v1')
  });
  const first = await publish(ctx);
  assert.equal(first.code, 0, `primera publicación falló:\n${first.output}`);
  let channel = readChannel(ctx.gh.stateDir);
  assert.ok(channel, 'el canal debe existir tras publicar');
  assert.deepEqual(channel.files.map((f) => f.path).sort(), ['mods/a.jar', 'mods/b.jar', 'mods/c.jar']);

  const server = await startPackServer(ctx.gh.stateDir);
  t.after(() => server.close());
  const install = path.join(ctx.base, 'player-install');
  const firstSync = await clientSync(install, channel, server);
  assert.equal(firstSync.before.missing.length, 3);
  assert.deepEqual(listFiles(path.join(install, 'mods')), ['a.jar', 'b.jar', 'c.jar']);
  assert.equal(firstSync.after.repaired, 3);

  // Case A: delete b.jar locally and publish again.
  await fsp.rm(path.join(ctx.source, 'mods', 'b.jar'));
  const second = await publish(ctx);
  assert.equal(second.code, 0, `publicación tras eliminar B falló:\n${second.output}`);
  channel = readChannel(ctx.gh.stateDir);
  assert.deepEqual(channel.files.map((f) => f.path).sort(), ['mods/a.jar', 'mods/c.jar'], 'el manifest publicado no debe seguir distribuyendo b.jar');
  assert.deepEqual(channel.remove, ['mods/b.jar'], 'b.jar debe quedar en la lista de retirados');
  const distributed = new Set(channel.files.map((f) => f.path));
  assert.equal(distributed.has('mods/b.jar'), false);
  const bHash = channel.files.find((f) => f.path === 'mods/b.jar');
  assert.equal(bHash, undefined);

  // Case B: replace a.jar with a new build.
  await fsp.writeFile(path.join(ctx.source, 'mods', 'a.jar'), 'mod a v2');
  const third = await publish(ctx);
  assert.equal(third.code, 0, `actualización de A falló:\n${third.output}`);
  channel = readChannel(ctx.gh.stateDir);
  const aPaths = channel.files.filter((f) => f.path === 'mods/a.jar');
  assert.equal(aPaths.length, 1, 'a.jar no debe duplicarse en el manifest');
  assert.notEqual(aPaths[0].url, '', 'a.jar debe tener URL de descarga');

  // Case C: add d.jar.
  await fsp.writeFile(path.join(ctx.source, 'mods', 'd.jar'), 'mod d v1');
  const fourth = await publish(ctx);
  assert.equal(fourth.code, 0, `agregar D falló:\n${fourth.output}`);
  channel = readChannel(ctx.gh.stateDir);
  assert.deepEqual(channel.files.map((f) => f.path).sort(), ['mods/a.jar', 'mods/c.jar', 'mods/d.jar']);

  // The player install now syncs: b.jar disappears, a.jar updates, d.jar arrives.
  const sync = await clientSync(install, channel, server);
  assert.deepEqual(listFiles(path.join(install, 'mods')), ['a.jar', 'c.jar', 'd.jar'], 'la instalación debe quedar idéntica al estado publicado');
  await fsp.rm(path.join(path.join(install, 'mods'), 'd.jar'));
  const afterDelete = await clientSync(install, channel, server);
  assert.equal(afterDelete.before.missing.length, 1);
  await fsp.writeFile(path.join(install, 'mods', 'personal-mine.jar'), 'user mod');
  const afterDelete2 = await clientSync(install, channel, server);
  assert.deepEqual(listFiles(path.join(install, 'mods')), ['a.jar', 'c.jar', 'd.jar', 'personal-mine.jar']);

  // Case D: delete d.jar locally and publish again.
  await fsp.rm(path.join(ctx.source, 'mods', 'd.jar'));
  const fifth = await publish(ctx);
  assert.equal(fifth.code, 0, `eliminar D falló:\n${fifth.output}`);
  channel = readChannel(ctx.gh.stateDir);
  assert.deepEqual(channel.files.map((f) => f.path).sort(), ['mods/a.jar', 'mods/c.jar']);
  const finalSync = await clientSync(install, channel, server);
  assert.deepEqual(listFiles(path.join(install, 'mods')), ['a.jar', 'c.jar', 'personal-mine.jar']);

  // Every blob referenced by the channel must exist as a release asset.
  const tags = fs.readdirSync(path.join(ctx.gh.stateDir, 'releases'));
  const available = new Set(tags.flatMap((tag) => releaseAssetNames(ctx.gh.stateDir, tag)));
  for (const file of channel.files) {
    if (file.empty) continue;
    const name = String(file.url).split('/').pop();
    assert.ok(available.has(name), `falta el blob ${name} (${file.path}) en las releases`);
  }
});

test('publish/sync case E: publishing twice without changes is idempotent', async (t) => {
  const ctx = await setup(t);
  createSourceInstance(ctx.source, { 'a.jar': 'a', 'b.jar': 'b' });
  const first = await publish(ctx);
  assert.equal(first.code, 0, first.output);
  const before = await fsp.readFile(path.join(ctx.gh.stateDir, 'repo', 'channel', 'stable.json'), 'utf8');
  const uploadsBefore = Number(ctx.gh.counters().uploadedAssets || 0);

  const second = await publish(ctx);
  const after = await fsp.readFile(path.join(ctx.gh.stateDir, 'repo', 'channel', 'stable.json'), 'utf8');
  const uploadsAfter = Number(ctx.gh.counters().uploadedAssets || 0);

  assert.equal(second.code, 0, `republicar sin cambios no debe fallar:\n${second.output}`);
  assert.equal(before, after, 'el manifest debe ser byte a byte idéntico');
  assert.equal(uploadsAfter, uploadsBefore, 'no se debe volver a subir ningún blob');
  assert.match(second.output, /sin cambios|idempotente|No hay cambios/i);
});

test('publish/sync case F: an interrupted publish can be resumed without corrupting the channel', async (t) => {
  const ctx = await setup(t);
  createSourceInstance(ctx.source, { 'a.jar': 'a' });
  const first = await publish(ctx);
  assert.equal(first.code, 0, first.output);
  const channelBefore = await fsp.readFile(path.join(ctx.gh.stateDir, 'repo', 'channel', 'stable.json'), 'utf8');

  // New content uploaded with a failing remote: the channel must stay intact.
  await fsp.writeFile(path.join(ctx.source, 'mods', 'a.jar'), 'a v2');
  await fsp.writeFile(path.join(ctx.source, 'mods', 'b.jar'), 'b v1');
  const interrupted = await publish(ctx, [], { FAKE_GH_FAIL_BLOBS: '1', FAKE_GH_FAIL_UPLOAD_TIMES: '99' });
  assert.notEqual(interrupted.code, 0, 'la publicación debe fallar si GitHub rechaza las subidas');
  const channelInterrupted = await fsp.readFile(path.join(ctx.gh.stateDir, 'repo', 'channel', 'stable.json'), 'utf8');
  assert.equal(channelInterrupted, channelBefore, 'un fallo de subida no debe tocar el canal publicado');

  // Recover: the same publish resumes correctly.
  const resumed = await publish(ctx);
  assert.equal(resumed.code, 0, `la republicación debe recuperarse:\n${resumed.output}`);
  const channel = readChannel(ctx.gh.stateDir);
  assert.deepEqual(channel.files.map((f) => f.path).sort(), ['mods/a.jar', 'mods/b.jar']);

  const server = await startPackServer(ctx.gh.stateDir);
  t.after(() => server.close());
  const install = path.join(ctx.base, 'recovery-install');
  const sync = await clientSync(install, channel, server);
  assert.equal(sync.after.healthy, true);
  assert.deepEqual(listFiles(path.join(install, 'mods')), ['a.jar', 'b.jar']);
});

test('publish: junk and retired files never reach the published channel', async (t) => {
  const ctx = await setup(t);
  const sha = (value) => require('node:crypto').createHash('sha256').update(value).digest('hex');
  const { seedRemote, assetExists } = require('./helpers/pack-testbed');
  const aContent = Buffer.from('mod a');
  const junkContent = Buffer.from('deleted but still open');
  const junkPath = 'mods/.fuse_hidden000000d100000015';
  // Simulate the state left by an older publisher that distributed debris.
  seedRemote(ctx.gh.stateDir, {
    tag: 'pack-v1.0.0',
    blobs: { [sha(aContent)]: aContent, [sha(junkContent)]: junkContent },
    manifest: {
      schema: 2, version: '1.0.0', minecraft: '1.20.1', forge: '47.4.10',
      forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' },
      files: [
        { path: 'mods/a.jar', size: aContent.length, sha256: sha(aContent), url: `https://github.com/${REPO}/releases/download/pack-v1.0.0/${sha(aContent)}` },
        { path: junkPath, size: junkContent.length, sha256: sha(junkContent), url: `https://github.com/${REPO}/releases/download/pack-v1.0.0/${sha(junkContent)}` }
      ],
      remove: []
    }
  });
  createSourceInstance(ctx.source, { 'a.jar': aContent });
  // Debris the payload must ignore: hidden files, disabled mods, editor copies.
  await fsp.writeFile(path.join(ctx.source, 'mods', '.fuse_hidden000000aa000000bb'), 'hidden');
  await fsp.writeFile(path.join(ctx.source, 'mods', 'disabled-mod.jar.disabled'), 'disabled');
  await fsp.writeFile(path.join(ctx.source, 'mods', 'editor-backup.jar~'), 'backup');
  await fsp.writeFile(path.join(ctx.source, 'mods', 'half-download.jar.part'), 'partial');
  await fsp.mkdir(path.join(ctx.source, 'mods', '.hidden-dir'), { recursive: true });
  await fsp.writeFile(path.join(ctx.source, 'mods', '.hidden-dir', 'nested.jar'), 'nested');
  await fsp.writeFile(path.join(ctx.source, 'iammusicplayerrenewed', 'lib.dll'), 'native').catch(async () => {
    await fsp.mkdir(path.join(ctx.source, 'iammusicplayerrenewed'), { recursive: true });
    await fsp.writeFile(path.join(ctx.source, 'iammusicplayerrenewed', 'lib.dll'), 'native');
  });

  const result = await publish(ctx);
  assert.equal(result.code, 0, `publicación falló:\n${result.output}`);
  const channel = readChannel(ctx.gh.stateDir);
  assert.deepEqual(channel.files.map((f) => f.path).sort(), ['iammusicplayerrenewed/lib.dll', 'mods/a.jar']);
  assert.deepEqual(channel.remove, [junkPath], 'la basura publicada antes debe retirarse');
  assert.equal(result.output.includes('.fuse_hidden000000aa000000bb'), true, 'el preview/log debe informar lo ignorado');

  // The launcher install drops the retired junk on the next sync.
  const server = await startPackServer(ctx.gh.stateDir);
  t.after(() => server.close());
  const install = path.join(ctx.base, 'junk-install');
  await fsp.mkdir(path.join(install, 'mods'), { recursive: true });
  await fsp.writeFile(path.join(install, 'mods', '.fuse_hidden000000d100000015'), junkContent);
  const sync = await clientSync(install, channel, server);
  assert.equal(await fsp.readFile(path.join(install, 'mods', '.fuse_hidden000000d100000015')).catch(() => null), null);
  assert.equal(sync.after.healthy, true);
});

test('publish: an unreadable channel aborts instead of rebuilding the pack from scratch', async (t) => {
  const ctx = await setup(t);
  createSourceInstance(ctx.source, { 'a.jar': 'a', 'b.jar': 'b' });
  const first = await publish(ctx);
  assert.equal(first.code, 0, first.output);
  const before = await fsp.readFile(path.join(ctx.gh.stateDir, 'repo', 'channel', 'stable.json'), 'utf8');
  const uploadsBefore = Number(ctx.gh.counters().uploadedAssets || 0);

  // The channel exists but the contents API is failing (HTTP 500).
  const broken = await publish(ctx, [], { FAKE_GH_FAIL_API_READ: '1' });
  assert.notEqual(broken.code, 0, 'una lectura fallida del canal debe abortar la publicación');
  assert.match(broken.output, /no pude leer el canal publicado/i);
  const after = await fsp.readFile(path.join(ctx.gh.stateDir, 'repo', 'channel', 'stable.json'), 'utf8');
  assert.equal(after, before, 'el canal no debe modificarse cuando no se pudo leer');
  assert.equal(Number(ctx.gh.counters().uploadedAssets || 0), uploadsBefore, 'no debe resubir blobs a ciegas');

  // Once GitHub answers again the publication works normally.
  const recovered = await publish(ctx);
  assert.equal(recovered.code, 0, recovered.output);
  assert.equal(recovered.output.includes('SIN CAMBIOS'), true);
});

test('publish: a no-op publish repairs a missing blob without creating a new version', async (t) => {
  const ctx = await setup(t);
  const { deleteAsset, assetExists } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'a.jar': 'a', 'b.jar': 'b' });
  const first = await publish(ctx);
  assert.equal(first.code, 0, first.output);
  const channel = readChannel(ctx.gh.stateDir);
  const versionBefore = channel.version;
  const target = channel.files.find((f) => f.path === 'mods/a.jar');
  const tag = String(target.url).split('/releases/download/')[1].split('/')[0];
  const sha = String(target.url).split('/').pop();
  assert.equal(assetExists(ctx.gh.stateDir, tag, sha), true);
  deleteAsset(ctx.gh.stateDir, tag, sha);

  const repair = await publish(ctx);
  assert.equal(repair.code, 0, `la reparación del canal debe funcionar:\n${repair.output}`);
  assert.equal(assetExists(ctx.gh.stateDir, tag, sha), true, 'el blob faltante debe volver a subirse');
  assert.match(repair.output, /CANAL REPARADO/);
  const channelAfter = readChannel(ctx.gh.stateDir);
  assert.equal(channelAfter.version, versionBefore, 'reparar no debe crear una versión nueva');
  assert.deepEqual(channelAfter.files.map((f) => f.path).sort(), channel.files.map((f) => f.path).sort());

  const server = await startPackServer(ctx.gh.stateDir);
  t.after(() => server.close());
  const install = path.join(ctx.base, 'repair-install');
  const sync = await clientSync(install, channelAfter, server);
  assert.equal(sync.after.healthy, true);
});

test('publish: the local checkout copy of the channel is refreshed after publishing', async (t) => {
  const ctx = await setup(t);
  const localChannelDir = path.join(ctx.base, 'checkout', 'channel');
  await fsp.mkdir(localChannelDir, { recursive: true });
  await fsp.writeFile(path.join(localChannelDir, 'stable.json'), JSON.stringify({ schema: 2, version: '0.0.1', files: [], remove: [] }));
  createSourceInstance(ctx.source, { 'a.jar': 'a' });
  const result = await publish(ctx, [], { ETERNAL_PUBLISH_LOCAL_CHANNEL_DIR: localChannelDir });
  assert.equal(result.code, 0, result.output);
  const local = JSON.parse(await fsp.readFile(path.join(localChannelDir, 'stable.json'), 'utf8'));
  const remote = readChannel(ctx.gh.stateDir);
  assert.equal(local.version, remote.version);
  assert.deepEqual(local.files, remote.files);
});

test('publish: large manifests survive GitHub content truncation', async (t) => {
  const ctx = await setup(t);
  const mods = {};
  for (let i = 0; i < 40; i++) mods[`mod-with-a-long-name-${i}.jar`] = `content ${i}`;
  createSourceInstance(ctx.source, mods);
  const result = await publish(ctx, [], { FAKE_GH_CONTENT_LIMIT: '512' });
  assert.equal(result.code, 0, `una publicación con manifest grande debe verificarse leyendo el contenido raw:\n${result.output}`);
  const channel = readChannel(ctx.gh.stateDir);
  assert.equal(channel.files.length, 40);
  const repeat = await publish(ctx, [], { FAKE_GH_CONTENT_LIMIT: '512' });
  assert.equal(repeat.code, 0, repeat.output);
  assert.equal(repeat.output.includes('SIN CAMBIOS'), true);
});
