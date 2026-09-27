const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyLauncherReleaseTag } = require('../scripts/verify-launcher-release');
const version = require('../package.json').version;

test('accepts only a launcher tag matching the package version', () => {
  assert.equal(verifyLauncherReleaseTag(`launcher-v${version}`, version), true);
  assert.throws(() => verifyLauncherReleaseTag('launcher-v0.70.5', version), new RegExp(`launcher-v${version.replaceAll('.', '\\.').replaceAll('+', '\\+')}`));
  assert.throws(() => verifyLauncherReleaseTag('pack-v1.0.0', version), new RegExp(`launcher-v${version.replaceAll('.', '\\.').replaceAll('+', '\\+')}`));
});
