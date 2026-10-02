const test = require('node:test');
const assert = require('node:assert/strict');
const { nextVersion, parseVersion, twoWordReleaseName } = require('../scripts/release-name');

test('automatic versioning never jumps backwards on a hand-typed version', () => {
  assert.deepEqual(parseVersion('1.0.9'), [1, 0, 9]);
  assert.deepEqual(parseVersion('v1.0.5'), [1, 0, 5]);
  assert.deepEqual(parseVersion('1.0.5-beta'), [1, 0, 5]);
  assert.deepEqual(parseVersion('1.1'), [1, 1, 0]);
  assert.equal(parseVersion('sin versión'), null);
  // A published value that a maintainer typed with a prefix must not reset the
  // whole line to 1.0.0.
  assert.equal(nextVersion('v1.0.5', {}), '1.0.6');
  assert.equal(nextVersion('1.0.5-beta', {}), '1.0.6');
  assert.equal(nextVersion('1.0.9', { added: ['mods/a.jar', 'mods/b.jar'] }), '1.0.10');
  assert.equal(nextVersion('1.0.9', { added: Array(8).fill('mods/x.jar') }), '1.1.0');
  assert.equal(nextVersion('', {}), '1.0.0');
});

test('release names only count the files retired by the current publication', () => {
  // The published `remove` list is cumulative, but only a publication that
  // really retires files should look like a cleanup.
  const cleanup = { added: [], changed: [], removed: ['mods/a.jar', 'mods/b.jar', 'mods/c.jar'] };
  assert.equal(twoWordReleaseName(cleanup), 'Clean Sweep');
  const cumulativeOnly = { added: ['mods/new.jar'], changed: [], removed: [] };
  assert.notEqual(twoWordReleaseName(cumulativeOnly), 'Clean Sweep');
});
