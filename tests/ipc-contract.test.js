const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBundles } = require('../scripts/bundle-preloads');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const mainSource = read('src/main/main.js');
const preloadEntry = read('src/main/preload.js');
const publicBridge = read('src/main/preloadBridge.js');
const developerBridge = read('src/main/developer/developerBridge.js');
const developerIpc = read('src/main/developer/developerIpc.js');

function matches(source, pattern) { return [...source.matchAll(pattern)].map((match) => match[1]); }
function channels(source, pattern) { return [...new Set(matches(source, pattern))].sort(); }

const publicInvokes = channels(publicBridge, /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
const developerInvokes = channels(developerBridge, /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
const publicHandlers = channels(mainSource, /ipcMain\.handle\(['"]([^'"]+)['"]/g);
const developerHandlers = channels(developerIpc, /ipcMain\.handle\(['"]([^'"]+)['"]/g);

test('sandbox preload bundles are self-contained and keep Developer IPC out of Public', () => {
  const bundles=createBundles();
  assert.match(bundles.public,/require\('electron'\)/);
  assert.doesNotMatch(bundles.public,/require\(['"]\.\//);
  assert.doesNotMatch(bundles.public,/developer:|createDeveloperBridge/);
  assert.match(bundles.developer,/createDeveloperBridge/);
  assert.match(bundles.developer,/developer:publish/);
  assert.doesNotMatch(bundles.developer,/require\(['"]\.\//);
  const main=read('src/main/main.js');
  assert.match(main,/sandbox:\s*true/);
  assert.match(main,/build', 'preload'/);
});

test('every Public renderer IPC invoke has exactly one public main-process handler', () => {
  const allInvokes=matches(publicBridge,/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
  const allHandlers=matches(mainSource,/ipcMain\.handle\(['"]([^'"]+)['"]/g);
  assert.deepEqual(allInvokes.filter((channel,index)=>allInvokes.indexOf(channel)!==index),[],'public preload must not expose duplicate invokes');
  assert.deepEqual(allHandlers.filter((channel,index)=>allHandlers.indexOf(channel)!==index),[],'public main must not register duplicate handlers');
  assert.deepEqual(publicInvokes,publicHandlers);
});

test('Developer-only invokes and handlers are added only by the private bridge/runtime', () => {
  assert.ok(developerInvokes.length>0);
  assert.deepEqual(developerInvokes,developerHandlers);
  assert.ok(developerHandlers.every((channel)=>channel.startsWith('developer:')));
  assert.doesNotMatch(preloadEntry,/developerBridge|developer:/);
  assert.doesNotMatch(publicBridge,/developer:/);
  assert.doesNotMatch(mainSource,/ipcMain\.handle\(['"]developer:/);
  assert.match(read('src/main/preload.developer.js'),/createDeveloperBridge/);
  assert.match(read('src/main/developerMain.js'),/createDeveloperIntegration/);
});

test('every public/private preload event subscription has a corresponding main emitter', () => {
  const publicSubscriptions=channels(publicBridge,/listener\(['"]([^'"]+)['"]/g);
  const developerSubscriptions=channels(developerBridge,/listener\(['"]([^'"]+)['"]/g);
  const mainEmitters=matches(mainSource,/emit\(['"]([^'"]+)['"]/g);
  const developerEmitters=matches(developerIpc,/emit\(['"]([^'"]+)['"]/g);
  const emitters=new Set([...mainEmitters,...developerEmitters]);
  assert.deepEqual(publicSubscriptions.filter((channel)=>!emitters.has(channel)),[]);
  assert.deepEqual(developerSubscriptions.filter((channel)=>!emitters.has(channel)),[]);
});
