const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLauncherCompatibility } = require('../scripts/build-pack');

const sha = 'a'.repeat(64);
const entry = (over = {}) => ({ path: 'mods/a.jar', size: 10, sha256: sha, url: `https://github.com/o/r/releases/download/pack-v1.0.0/${sha}`, ...over });
const manifestWith = (files, over = {}) => ({ schema: 2, version: '1.0.0', files, remove: [], ...over });

test('a manifest the launcher can consume passes validation', () => {
  assert.equal(validateLauncherCompatibility(manifestWith([entry(), entry({ path: 'iammusicplayerrenewed/lavaplayer/x.so' })])), true);
});

test('paths that only differ by case are refused before publishing', () => {
  assert.throws(() => validateLauncherCompatibility(manifestWith([entry({ path: 'mods/Magic.jar' }), entry({ path: 'mods/magic.jar' })])),
    /solo difieren en mayúsculas\/minúsculas/);
});

test('paths the launcher rejects cannot reach the channel', () => {
  for (const bad of ['mods/a:b.jar', 'mods/..', 'mods/a\u0001b.jar', 'mods/a//b.jar']) {
    assert.throws(() => validateLauncherCompatibility(manifestWith([entry({ path: bad })])), /no es válida para el launcher/, `debe rechazar ${JSON.stringify(bad)}`);
  }
});

test('impossible sizes, hashes and URLs are refused', () => {
  assert.throws(() => validateLauncherCompatibility(manifestWith([entry({ size: -1 })])), /no es válido para el launcher/);
  assert.throws(() => validateLauncherCompatibility(manifestWith([entry({ size: 9 * 1024 * 1024 * 1024 })])), /no es válido para el launcher/);
  assert.throws(() => validateLauncherCompatibility(manifestWith([entry({ sha256: 'corto' })])), /SHA-256/);
  assert.throws(() => validateLauncherCompatibility(manifestWith([entry({ url: '' })])), /Falta la URL/);
  assert.throws(() => validateLauncherCompatibility(manifestWith([entry({ url: 'http://example.test/x' })])), /no es HTTPS/);
  assert.doesNotThrow(() => validateLauncherCompatibility(manifestWith([entry({ empty: true, size: 0, url: '' })])));
});

test('a manifest bigger than the launcher limit is refused', () => {
  const files = Array.from({ length: 12001 }, (_value, index) => entry({ path: `mods/mod-${index}.jar` }));
  assert.throws(() => validateLauncherCompatibility(manifestWith(files)), /hasta 12000/);
});

test('the same file cannot be kept and retired at once', () => {
  assert.throws(() => validateLauncherCompatibility(manifestWith([entry()], { remove: ['mods/A.jar'] })), /conserva y retira/);
  assert.doesNotThrow(() => validateLauncherCompatibility(manifestWith([entry()], { remove: ['mods/otro.jar'] })));
});
