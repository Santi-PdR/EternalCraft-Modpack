const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8');

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

test('every renderer IPC invoke has exactly one main-process handler', () => {
  const invokes = matches(preloadSource, /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
  const handlers = matches(mainSource, /ipcMain\.handle\(['"]([^'"]+)['"]/g);
  const duplicateInvokes = invokes.filter((channel, index) => invokes.indexOf(channel) !== index);
  const duplicateHandlers = handlers.filter((channel, index) => handlers.indexOf(channel) !== index);

  assert.deepEqual(duplicateInvokes, [], 'preload must not expose duplicate invokes');
  assert.deepEqual(duplicateHandlers, [], 'main process must not register duplicate handlers');
  assert.deepEqual([...new Set(invokes)].sort(), [...new Set(handlers)].sort());
});

test('every preload event subscription has a main-process emitter', () => {
  const subscriptions = matches(preloadSource, /listener\(['"]([^'"]+)['"]/g);
  const emitted = matches(mainSource, /emit\(['"]([^'"]+)['"]/g);
  assert.deepEqual([...new Set(subscriptions)].filter((channel) => !emitted.includes(channel)), []);
});
