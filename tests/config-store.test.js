const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ConfigStore } = require('../src/main/services/configStore');

const oldFeed = 'https://github.com/Santi-PdR/EternalCraft-Modpack/releases/latest/download/';
const stableFeed = 'https://github.com/Santi-PdR/EternalCraft-Modpack/releases/download/launcher-latest/';

async function createStore(t, user) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-config-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const defaultsPath = path.join(root, 'defaults.json');
  const userDataDir = path.join(root, 'user-data');
  await fs.writeFile(defaultsPath, JSON.stringify({ launcher: { updateFeedUrl: stableFeed }, pack: { installDirectory: path.join(root, 'instance') } }));
  await fs.mkdir(userDataDir, { recursive: true });
  if (user !== undefined) await fs.writeFile(path.join(userDataDir, 'config.json'), JSON.stringify(user));
  return { store: new ConfigStore({ defaultsPath, userDataDir }), userDataDir };
}

test('migrates old GitHub latest-release feeds to the dedicated launcher channel and persists it', async (t) => {
  const { store, userDataDir } = await createStore(t, { configSchemaVersion: 1, launcher: { updateFeedUrl: oldFeed, hideOnGameStart: false } });
  const config = store.load();
  assert.equal(config.launcher.updateFeedUrl, stableFeed);
  assert.equal(config.launcher.hideOnGameStart, false);
  const persisted = JSON.parse(await fs.readFile(path.join(userDataDir, 'config.json'), 'utf8'));
  assert.equal(persisted.launcher.updateFeedUrl, stableFeed);
});

test('keeps an explicitly configured custom launcher feed', async (t) => {
  const customFeed = 'https://updates.example.net/eternal/';
  const { store } = await createStore(t, { configSchemaVersion: 1, launcher: { updateFeedUrl: customFeed } });
  assert.equal(store.load().launcher.updateFeedUrl, customFeed);
});

test('removes the obsolete close-to-tray preference and persists the quit policy', async (t) => {
  const { store, userDataDir } = await createStore(t, { configSchemaVersion: 1, launcher: { closeToTray: true, hideOnGameStart: true } });
  const config = store.load();
  assert.equal(config.launcher.closeToTray, undefined);
  const persisted = JSON.parse(await fs.readFile(path.join(userDataDir, 'config.json'), 'utf8'));
  assert.equal(persisted.launcher.closeToTray, undefined);
});

test('quarantines syntactically valid but invalid root config shapes instead of crashing startup', async (t) => {
  for (const invalid of [null, [], 'settings']) {
    const { store, userDataDir } = await createStore(t, invalid);
    const loaded = store.load();
    assert.equal(path.isAbsolute(loaded.pack.installDirectory), true);
    assert.equal(Boolean(store.recoveryInfo()?.backupPath), true);
    assert.equal((await fs.readdir(userDataDir)).some((name) => name.startsWith('config.corrupt-')), true);
  }
});

test('never keeps session credentials from an older config file on disk', async (t) => {
  const { store, userDataDir } = await createStore(t, {
    configSchemaVersion: 1,
    minecraft: { username: 'Jugador', authorization: { access_token: 'secret-token' }, refreshToken: 'secret-refresh', maxMemoryMb: 6144 },
    account: { refreshToken: 'legacy-secret' }
  });
  const config = store.load();
  assert.equal(config.minecraft.authorization, undefined);
  assert.equal(config.minecraft.refreshToken, undefined);
  assert.equal(config.minecraft.username, 'Jugador', 'el resto de los ajustes sobrevive');
  assert.equal(config.minecraft.maxMemoryMb, 6144);
  assert.equal(config.account, undefined);
  const onDisk = await fs.readFile(path.join(userDataDir, 'config.json'), 'utf8');
  assert.equal(/secret-token|secret-refresh|legacy-secret/.test(onDisk), false, 'no debe quedar ningún token en el archivo');
});
