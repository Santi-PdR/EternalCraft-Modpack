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
  if (user) await fs.writeFile(path.join(userDataDir, 'config.json'), JSON.stringify(user));
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
