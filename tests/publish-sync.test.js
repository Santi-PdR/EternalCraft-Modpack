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

test('publish: the pack never requires an unreleased launcher build', async (t) => {
  const ctx = await setup(t);
  const { seedRemote } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'a.jar': 'a' });
  // The newest public launcher release is 0.80.0, but the maintenance build
  // publishing this pack is 0.99.0.
  const manifest = {
    schema: 2, version: '0.0.1', minecraft: '1.20.1', forge: '47.4.10',
    forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' },
    files: [], remove: []
  };
  seedRemote(ctx.gh.stateDir, { manifest, blobs: {}, tag: 'launcher-v0.80.0' });
  const result = await publish(ctx, [], { ETERNAL_LAUNCHER_VERSION: '0.99.0' });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /todavía no existe la release/i);
  const channel = readChannel(ctx.gh.stateDir);
  assert.equal(channel.minimumLauncher, '0.80.0', 'el requisito debe quedar en la última release pública del launcher');
});

test('publish: a newer released launcher is accepted as the requirement', async (t) => {
  const ctx = await setup(t);
  const { seedRemote } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'a.jar': 'a' });
  seedRemote(ctx.gh.stateDir, {
    manifest: { schema: 2, version: '0.0.1', files: [], remove: [], forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' } },
    blobs: {}, tag: 'launcher-v0.99.0'
  });
  const result = await publish(ctx, [], { ETERNAL_LAUNCHER_VERSION: '0.99.0' });
  assert.equal(result.code, 0, result.output);
  assert.equal(readChannel(ctx.gh.stateDir).minimumLauncher, '0.99.0');
  assert.equal(/no existe esa release del launcher/i.test(result.output), false);
});

test('publish: a truncated blob already present in the release is replaced', async (t) => {
  const ctx = await setup(t);
  const { seedRemote, sha256 } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'a.jar': 'contenido real del mod' });
  const firstName = 'a.jar';
  const blob = fs.readFileSync(path.join(ctx.source, 'mods', firstName));
  const hash = sha256(blob);
  // First publication: correct channel and correct asset.
  let result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  const publishedVersion = readChannel(ctx.gh.stateDir).version;

  // Simulate an interrupted upload: the asset keeps the SHA-256 name but holds
  // a truncated body, exactly the state that used to pass the old "the asset
  // exists" check and hand players a broken download.
  const tag = `pack-v${publishedVersion}`;
  fs.writeFileSync(path.join(ctx.gh.stateDir, 'releases', tag, 'assets', hash), blob.subarray(0, 5));

  result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /contenido incorrecto/i, 'el publicador debe detectar el blob dañado');
  const repairedBlob = fs.readFileSync(path.join(ctx.gh.stateDir, 'releases', tag, 'assets', hash));
  assert.equal(repairedBlob.toString(), blob.toString(), 'el asset dañado debe quedar reemplazado por el contenido real');
  assert.equal(readChannel(ctx.gh.stateDir).version, publishedVersion, 'reparar un blob no debe crear una versión nueva');
  const summary = JSON.parse(/PUBLISH_JSON:(\{.*\})/s.exec(result.output)[1]);
  assert.deepEqual(summary.corrupted, [hash], 'el resumen debe informar qué blob estaba dañado');
});

test('publish: a same-size corrupted blob is detected through the remote digest', async (t) => {
  const ctx = await setup(t);
  const { sha256 } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'b.jar': 'AAAA contenido bueno AAAA' });
  const blob = fs.readFileSync(path.join(ctx.source, 'mods', 'b.jar'));
  const hash = sha256(blob);
  let result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  const tag = `pack-v${readChannel(ctx.gh.stateDir).version}`;
  // Same length, different bytes: only the SHA-256 digest can reveal it.
  fs.writeFileSync(path.join(ctx.gh.stateDir, 'releases', tag, 'assets', hash), 'BBBB contenido malo  BBBB');
  result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /sha256 remoto distinto/, 'el publicador debe comparar el digest remoto');
  assert.equal(fs.readFileSync(path.join(ctx.gh.stateDir, 'releases', tag, 'assets', hash)).toString(), blob.toString());
});

test('publish: a failing channel SHA lookup aborts before overwriting anything', async (t) => {
  const ctx = await setup(t);
  const { seedRemote } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'c.jar': 'contenido' });
  // An already published channel: reading it is the first contents API call, so
  // the SHA lookup right before committing is the second one.
  seedRemote(ctx.gh.stateDir, {
    manifest: { schema: 2, version: '1.0.0', minecraft: '1.20.1', forge: '47.4.10', forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' }, files: [], remove: [] },
    blobs: {}, tag: 'pack-v1.0.0'
  });
  const before = readChannel(ctx.gh.stateDir);
  const result = await publish(ctx, [], { FAKE_GH_FAIL_API_READ_AFTER: '1' });
  assert.notEqual(result.code, 0, 'la publicación debe fallar en vez de sobrescribir el canal');
  assert.match(result.output, /SHA del canal/i);
  const after = readChannel(ctx.gh.stateDir);
  assert.deepEqual(after, before, 'el canal publicado no debe cambiar si no se pudo leer su SHA');
});

test('publish: retirements accumulate so a skipped version still cleans up', async (t) => {
  const ctx = await setup(t);
  const { seedRemote } = require('./helpers/pack-testbed');
  const summaryOf = (output) => JSON.parse(/PUBLISH_JSON:(\{.*\})/s.exec(output)[1]);
  seedRemote(ctx.gh.stateDir, {
    manifest: { schema: 2, version: '1.0.0', minecraft: '1.20.1', forge: '47.4.10', forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' }, files: [], remove: [] },
    blobs: {}, tag: 'pack-v1.0.0'
  });
  createSourceInstance(ctx.source, { 'a.jar': 'A', 'b.jar': 'B' });
  let result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  assert.equal(readChannel(ctx.gh.stateDir).version, '1.0.1');

  // 1.0.2 retires b.jar.
  fs.rmSync(path.join(ctx.source, 'mods', 'b.jar'));
  result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  let channel = readChannel(ctx.gh.stateDir);
  assert.equal(channel.version, '1.0.2');
  assert.deepEqual(channel.remove, ['mods/b.jar']);
  assert.deepEqual(summaryOf(result.output).removed, ['mods/b.jar']);

  // 1.0.3 adds a new mod. The retirement must survive in the published channel
  // even though this publication removed nothing.
  createSourceInstance(ctx.source, { 'c.jar': 'C' });
  result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  channel = readChannel(ctx.gh.stateDir);
  assert.equal(channel.version, '1.0.3');
  assert.deepEqual(channel.remove, ['mods/b.jar'], 'la lista de retirados es acumulativa');
  assert.deepEqual(summaryOf(result.output).removed, [], 'esta versión no retiró archivos');
});

test('publish/sync: a legacy install that skipped versions still deletes retired mods', async (t) => {
  const ctx = await setup(t);
  const { seedRemote, startPackServer, sha256 } = require('./helpers/pack-testbed');
  const blob = (text) => Buffer.from(text);
  const modA = blob('contenido A');
  const modB = blob('contenido B');
  const modC = blob('contenido C');
  const tag = `pack-v1.0.0`;
  const baseUrl = `https://github.com/${REPO}/releases/download/${tag}`;
  const forgeInstaller = { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' };
  const entry = (name, data) => ({ path: `mods/${name}`, size: data.length, sha256: sha256(data), url: `${baseUrl}/${sha256(data)}` });
  const v1 = { schema: 2, version: '1.0.0', minecraft: '1.20.1', forge: '47.4.10', forgeInstaller, files: [entry('a.jar', modA), entry('b.jar', modB)], remove: [] };
  seedRemote(ctx.gh.stateDir, { manifest: v1, blobs: { [sha256(modA)]: modA, [sha256(modB)]: modB, [sha256(modC)]: modC }, tag });
  const server = await startPackServer(ctx.gh.stateDir);
  t.after(() => server.close());

  const install = path.join(ctx.base, 'install');
  await repairInstallation(install, clientManifest(v1, server));
  assert.deepEqual(listFiles(install, 'mods').sort(), ['mods/a.jar', 'mods/b.jar']);

  // b.jar was retired in 1.0.1, a version this player never installed, and the
  // machine has no official inventory (launcher older than the feature). The
  // cumulative `remove` of 1.0.2 is the only thing that can clean it up.
  fs.rmSync(path.join(install, '.launcher', 'official-files.json'), { force: true });
  const v3 = { schema: 2, version: '1.0.2', minecraft: '1.20.1', forge: '47.4.10', forgeInstaller, files: [entry('a.jar', modA), entry('c.jar', modC)], remove: ['mods/b.jar'] };
  seedRemote(ctx.gh.stateDir, { manifest: v3, blobs: {}, tag });
  await repairInstallation(install, clientManifest(v3, server));
  assert.deepEqual(listFiles(install, 'mods').sort(), ['mods/a.jar', 'mods/c.jar'], 'los retirados acumulados deben desaparecer');
});

test('publish: the requirement never exceeds what the update feed can deliver', async (t) => {
  const ctx = await setup(t);
  const { seedRemote } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'a.jar': 'a' });
  const manifest = {
    schema: 2, version: '0.0.1', minecraft: '1.20.1', forge: '47.4.10',
    forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' },
    files: [], remove: []
  };
  // The versioned release exists, but the updater feed never received its
  // binaries (a CI step can fail after the release is created).
  seedRemote(ctx.gh.stateDir, { manifest, blobs: {}, tag: 'launcher-v0.99.0' });
  seedRemote(ctx.gh.stateDir, {
    manifest,
    blobs: { 'Eternal-Craft-Launcher-0.80.0-linux-x86_64.AppImage': Buffer.from('launcher') },
    tag: 'launcher-latest'
  });
  const result = await publish(ctx, [], { ETERNAL_LAUNCHER_VERSION: '0.99.0' });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /feed launcher-latest solo ofrece 0\.80\.0/i);
  assert.equal(readChannel(ctx.gh.stateDir).minimumLauncher, '0.80.0');
});

test('publish: an invalid version is rejected before touching the remote', async (t) => {
  const ctx = await setup(t);
  createSourceInstance(ctx.source, { 'a.jar': 'a' });
  const before = readChannel(ctx.gh.stateDir);
  const result = await publish(ctx, ['--version', 'v1.0.5']);
  assert.notEqual(result.code, 0, 'la publicación debe fallar');
  assert.match(result.output, /no es válida/i);
  assert.deepEqual(readChannel(ctx.gh.stateDir), before, 'el canal no debe cambiar');
  const releases = fs.existsSync(path.join(ctx.gh.stateDir, 'releases')) ? fs.readdirSync(path.join(ctx.gh.stateDir, 'releases')) : [];
  assert.deepEqual(releases, [], 'no debe crearse ninguna release');
});

test('publish: a case-colliding path set is refused instead of shipping a manifest the launcher rejects', async (t) => {
  const ctx = await setup(t);
  createSourceInstance(ctx.source, { 'Magic.jar': 'uno', 'magic.jar': 'dos' });
  const { validateManifest } = require('../src/main/services/manifestService');
  const before = readChannel(ctx.gh.stateDir);
  const result = await publish(ctx);
  assert.notEqual(result.code, 0, 'publicar un manifest inválido para el launcher debe fallar');
  assert.match(result.output, /solo difieren en mayúsculas\/minúsculas/i);
  assert.deepEqual(readChannel(ctx.gh.stateDir), before, 'el canal no debe cambiar');
  if (before) assert.doesNotThrow(() => validateManifest(before));
});

test('sync: repairing an up-to-date installation is a true no-op', async (t) => {
  const ctx = await setup(t);
  const { seedRemote, startPackServer, sha256 } = require('./helpers/pack-testbed');
  const a = Buffer.from('contenido A');
  const b = Buffer.from('contenido B');
  const tag = 'pack-v1.0.0';
  const baseUrl = `https://github.com/${REPO}/releases/download/${tag}`;
  const manifest = {
    schema: 2, version: '1.0.0', minecraft: '1.20.1', forge: '47.4.10',
    forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' },
    files: [
      { path: 'mods/a.jar', size: a.length, sha256: sha256(a), url: `${baseUrl}/${sha256(a)}` },
      { path: 'mods/b.jar', size: b.length, sha256: sha256(b), url: `${baseUrl}/${sha256(b)}` }
    ],
    remove: []
  };
  seedRemote(ctx.gh.stateDir, { manifest, blobs: { [sha256(a)]: a, [sha256(b)]: b }, tag });
  const server = await startPackServer(ctx.gh.stateDir);
  t.after(() => server.close());
  const remote = clientManifest(manifest, server);
  const install = path.join(ctx.base, 'install');

  const first = await repairInstallation(install, remote);
  assert.equal(first.downloaded, 2, 'la primera reparación descarga lo que falta');

  // Publishing twice without changes is idempotent; the same must hold for the
  // installation side: nothing to download, replace or delete.
  const second = await repairInstallation(install, remote);
  assert.equal(second.downloaded, 0, 'no debe volver a descargar nada');
  assert.equal(second.repaired, 0, 'no debe reemplazar archivos que ya coinciden');
  assert.equal(second.removed, 0, 'no debe borrar nada');
  assert.equal(second.healthy, true);
  const third = await checkInstallation(install, remote);
  assert.equal(third.healthy, true);
  assert.deepEqual(listFiles(install, 'mods').sort(), ['mods/a.jar', 'mods/b.jar']);
});

test('publish: the verified manifest stays in the work dir for the launcher metadata sync', async (t) => {
  const ctx = await setup(t);
  createSourceInstance(ctx.source, { 'a.jar': 'contenido' });
  const result = await publish(ctx);
  assert.equal(result.code, 0, result.output);
  // main.js reads this file after a successful publication to promote the jars
  // in the SIEGE instance and to prime its manifest cache; deleting it here
  // silently skipped both.
  const manifestPath = path.join(ctx.out, 'channel', 'stable.json');
  assert.equal(fs.existsSync(manifestPath), true, 'el manifest verificado debe quedar disponible');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const published = readChannel(ctx.gh.stateDir);
  assert.equal(manifest.version, published.version);
  assert.deepEqual(manifest.files.map((f) => f.path), published.files.map((f) => f.path));
  assert.equal(fs.existsSync(path.join(ctx.out, 'blobs')), false, 'los blobs pesados se descartan igual');
});

test('publish: a failed publication leaves no manifest behind', async (t) => {
  const ctx = await setup(t);
  const { seedRemote } = require('./helpers/pack-testbed');
  createSourceInstance(ctx.source, { 'a.jar': 'a' });
  seedRemote(ctx.gh.stateDir, {
    manifest: { schema: 2, version: '1.0.0', minecraft: '1.20.1', forge: '47.4.10', forgeInstaller: { url: 'https://maven.minecraftforge.net/forge-1.20.1-47.4.10-installer.jar', sha256: '' }, files: [], remove: [] },
    blobs: {}, tag: 'pack-v1.0.0'
  });
  const result = await publish(ctx, [], { FAKE_GH_FAIL_UPLOAD: '1', FAKE_GH_FAIL_BLOBS: '1', FAKE_GH_FAIL_UPLOAD_TIMES: '99' });
  assert.notEqual(result.code, 0, result.output);
  assert.equal(fs.existsSync(path.join(ctx.out, 'channel', 'stable.json')), false, 'una publicación fallida no debe dejar un manifest que parezca verificado');
});
