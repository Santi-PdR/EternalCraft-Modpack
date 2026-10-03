function normalizeVersion(value) {
  const raw = String(value || '').trim().replace(/^v/i, '');
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(raw);
  if (!match) return null;
  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
}

function versionAtLeast(current, target) {
  const a = normalizeVersion(current);
  const b = normalizeVersion(target);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index++) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

function playUpdateDecision({ installedVersion = '', targetVersion = '', installed = false, manifestConfigured = false, integrityHealthy } = {}) {
  const installedValue = String(installedVersion || '').trim();
  const targetValue = String(targetVersion || '').trim();
  const hasInstalledVersion = Boolean(installedValue);
  const needsInitialInstall = !installed;
  const versionKnown = hasInstalledVersion && Boolean(normalizeVersion(installedValue)) && Boolean(normalizeVersion(targetValue));
  const integrityNeedsUpdate = Boolean(installed && manifestConfigured && integrityHealthy === false);
  const updateAvailable = Boolean(manifestConfigured && targetValue && (
    needsInitialInstall || !versionKnown || !versionAtLeast(installedValue, targetValue) || integrityNeedsUpdate
  ));

  return {
    installedVersion: installedValue || null,
    targetVersion: targetValue || null,
    installed: Boolean(installed),
    versionKnown,
    integrityNeedsUpdate,
    updateAvailable,
    needsInitialInstall,
    canPlayInstalled: Boolean(installed),
    offline: !manifestConfigured
  };
}

module.exports = { normalizeVersion, versionAtLeast, playUpdateDecision };
