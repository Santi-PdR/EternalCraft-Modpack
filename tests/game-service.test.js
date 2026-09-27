const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { requireLaunchedChild, resolveMemory } = require('../src/main/services/gameService');

test('a swallowed Minecraft launcher failure is reported instead of a false successful start', () => {
  assert.throws(() => requireLaunchedChild(null, '[MCLC]: Failed to start due to ENOENT'), /no pudo crear el proceso de Java.*ENOENT/);
  assert.throws(() => requireLaunchedChild(undefined), /no pudo crear el proceso de Java.*Revisá Java/);
});

test('a valid child process is accepted for lifecycle monitoring', () => {
  const child = new EventEmitter();
  assert.equal(requireLaunchedChild(child), child);
});

test('Minecraft memory arguments remain valid for malformed or inverted user settings', () => {
  assert.deepEqual(resolveMemory(8192, 4096), { min: '8192M', max: '8192M' });
  assert.deepEqual(resolveMemory('invalid', null), { min: '2048M', max: '6144M' });
  assert.deepEqual(resolveMemory(-1, 512), { min: '1024M', max: '2048M' });
});
