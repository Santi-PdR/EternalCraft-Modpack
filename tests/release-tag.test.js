const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyLauncherReleaseTag } = require('../scripts/verify-launcher-release');

test('accepts only a launcher tag matching the package version', () => {
  assert.equal(verifyLauncherReleaseTag('launcher-v0.70.8', '0.70.8'), true);
  assert.throws(() => verifyLauncherReleaseTag('launcher-v0.70.5', '0.70.8'), /launcher-v0\.70\.8/);
  assert.throws(() => verifyLauncherReleaseTag('pack-v1.0.0', '0.70.8'), /launcher-v0\.70\.8/);
});
