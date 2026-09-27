#!/usr/bin/env node
const packageJson = require('../package.json');

function verifyLauncherReleaseTag(tag, version = packageJson.version) {
  const expected = `launcher-v${version}`;
  if (String(tag || '').trim() !== expected) {
    throw new Error(`El tag de release debe ser ${expected}; recibido: ${String(tag || '(vacío)')}.`);
  }
  return true;
}

if (require.main === module) {
  try {
    verifyLauncherReleaseTag(process.env.GITHUB_REF_NAME);
    console.log(`Release validada: launcher-v${packageJson.version}`);
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 1;
  }
}

module.exports = { verifyLauncherReleaseTag };
