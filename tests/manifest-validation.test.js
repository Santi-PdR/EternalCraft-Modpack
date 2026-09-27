const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest } = require('../src/main/services/manifestService');

const hash = 'a'.repeat(64);
function manifest(overrides = {}) {
  return { schema: 2, version: '1.0.0', files: [{ path: 'mods/example.jar', size: 1, sha256: hash, url: 'https://example.test/example.jar' }], ...overrides };
}

test('manifest rejects directory-wide removals that could erase personal mods', () => {
  for (const remove of [['mods'], ['iammusicplayerrenewed']]) {
    assert.throws(() => validateManifest(manifest({ remove })), /Ruta de carpeta inválida/);
  }
});

test('manifest rejects case-colliding paths and paths kept and removed together', () => {
  assert.throws(() => validateManifest(manifest({ files: [
    { path: 'mods/Example.jar', size: 1, sha256: hash, url: 'https://example.test/a' },
    { path: 'MODS/example.jar', size: 1, sha256: hash, url: 'https://example.test/b' }
  ] })), /duplicada o incompatible/);
  assert.throws(() => validateManifest(manifest({ remove: ['MODS/EXAMPLE.JAR'] })), /conservar y eliminar/);
});

test('manifest rejects malformed segments, control characters, and non-integer sizes', () => {
  for (const path of ['mods/../outside.jar', 'mods//example.jar', 'mods/./example.jar', 'mods/bad:name.jar', 'mods/bad\nname.jar']) {
    assert.throws(() => validateManifest(manifest({ files: [{ path, size: 1, sha256: hash, url: 'https://example.test/file' }] })), /Ruta insegura/);
  }
  for (const size of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateManifest(manifest({ files: [{ path: 'mods/example.jar', size, sha256: hash, url: 'https://example.test/file' }] })), /Tamaño inválido/);
  }
});

test('manifest accepts ordinary file updates and exact-file removals', () => {
  const value = manifest({ remove: ['mods/retired.jar'] });
  assert.equal(validateManifest(value), value);
});
