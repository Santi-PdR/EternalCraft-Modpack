const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { variantCapabilities } = require('../src/main/launcherVariant');
const { playUpdateDecision } = require('../src/main/services/playDecision');
const { DeveloperService } = require('../src/main/services/developerService');
const { launcherBuildConfig } = require('../scripts/launcherBuildConfig');

const packageBuild = require('../package.json').build;

 test('public and private variants receive disjoint build capabilities and runtime entrypoints', () => {
  assert.deepEqual(variantCapabilities('public'), {
    variant:'public', isPublic:true, isDeveloper:false, developerTools:false, publishing:false
  });
  assert.equal(variantCapabilities('developer').developerTools, true);
  assert.equal(variantCapabilities('unknown').publishing, false);

  const publicConfig = launcherBuildConfig(packageBuild, 'public');
  const developerConfig = launcherBuildConfig(packageBuild, 'developer');
  assert.equal(publicConfig.extraMetadata.main, 'src/main/publicMain.js');
  assert.equal(publicConfig.appId, 'uy.eternalcraft.launcher');
  assert.ok(publicConfig.files.includes('!src/main/developer/**'));
  assert.ok(publicConfig.files.includes('!src/main/services/developerService.js'));
  assert.ok(publicConfig.files.includes('!scripts/**'));
  assert.ok(publicConfig.files.includes('build/preload/public.cjs'));
  assert.ok(publicConfig.files.includes('!build/preload/developer.cjs'));
  assert.ok(!publicConfig.extraResources.some((entry) => entry.from === 'scripts'));
  assert.equal(developerConfig.extraMetadata.main, 'src/main/developerMain.js');
  assert.equal(developerConfig.appId, 'uy.eternalcraft.launcher.developer');
  assert.equal(developerConfig.directories.output, 'dist-developer');
  assert.ok(developerConfig.files.includes('src/**/*'));
  assert.ok(developerConfig.files.includes('build/preload/developer.cjs'));
  assert.ok(developerConfig.files.includes('!build/preload/public.cjs'));
  assert.ok(!developerConfig.files.includes('!src/main/developer/**'));
  assert.ok(developerConfig.extraResources.some((entry) => entry.from === 'scripts'));
  assert.equal(developerConfig.publish, null);

  const root = path.join(__dirname, '..');
  assert.equal(packageBuild.toolsets?.appimage, '1.0.3', 'Fedora AppImages should use the static runtime toolset');
  const buildScript = fs.readFileSync(path.join(root, 'scripts/build-launcher.js'), 'utf8');
  assert.match(buildScript, /--use-system-ca/);
  assert.doesNotMatch(buildScript, /NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized\s*:\s*false/);
  const publicPreload = fs.readFileSync(path.join(root, 'src/main/preloadBridge.js'), 'utf8');
  const publicMain = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  const publicEntry = fs.readFileSync(path.join(root, 'src/main/publicMain.js'), 'utf8');
  assert.doesNotMatch(publicPreload, /developer:/);
  assert.doesNotMatch(publicMain, /ipcMain\.handle\(['"]developer:/);
  assert.doesNotMatch(publicMain, /services\/developerService/);
  assert.match(publicMain, /if \(launcherVariant === DEVELOPER_VARIANT\) return \{ configured:false, developer:true/);
  assert.match(publicMain, /launcherVariant !== DEVELOPER_VARIANT && app\.isPackaged/);
  assert.match(publicMain, /launcher:update-cancel/);
  assert.match(publicEntry, /variant: PUBLIC_VARIANT/);
});

test('runtime environment flags cannot unlock Developer in the public variant', () => {
  const previous = process.env.ETERNAL_DEVELOPER_BUILD;
  process.env.ETERNAL_DEVELOPER_BUILD = '1';
  try {
    const publicService = new DeveloperService(os.tmpdir(), path.join(__dirname, '..', 'scripts'), '0.81.0');
    assert.equal(publicService.isMaintenanceBuild(), false);
    assert.throws(() => publicService.requireAvailable(), /build privada de mantenimiento/);
    const privateService = new DeveloperService(os.tmpdir(), path.join(__dirname, '..', 'scripts'), '0.81.0', { variant:'developer' });
    assert.equal(privateService.isMaintenanceBuild(), true);
  } finally {
    if (previous === undefined) delete process.env.ETERNAL_DEVELOPER_BUILD;
    else process.env.ETERNAL_DEVELOPER_BUILD = previous;
  }
});

test('Play prompts for a stale or damaged pack while preserving offline and play-without-update choices', () => {
  const equal = playUpdateDecision({ installedVersion:'1.0.9', targetVersion:'1.0.9', installed:true, manifestConfigured:true, integrityHealthy:true });
  assert.equal(equal.updateAvailable, false);
  const newerInstalled = playUpdateDecision({ installedVersion:'1.1.0', targetVersion:'1.0.9', installed:true, manifestConfigured:true, integrityHealthy:true });
  assert.equal(newerInstalled.updateAvailable, false);
  const stale = playUpdateDecision({ installedVersion:'1.0.8', targetVersion:'1.0.9', installed:true, manifestConfigured:true, integrityHealthy:true });
  assert.equal(stale.updateAvailable, true);
  const damaged = playUpdateDecision({ installedVersion:'1.0.9', targetVersion:'1.0.9', installed:true, manifestConfigured:true, integrityHealthy:false });
  assert.equal(damaged.updateAvailable, true);
  assert.equal(damaged.integrityNeedsUpdate, true);
  const firstInstall = playUpdateDecision({ installedVersion:'', targetVersion:'1.0.9', installed:false, manifestConfigured:true });
  assert.equal(firstInstall.updateAvailable, true);
  const offline = playUpdateDecision({ installedVersion:'1.0.8', targetVersion:'1.0.9', installed:true, manifestConfigured:false });
  assert.equal(offline.updateAvailable, false);
  assert.equal(offline.canPlayInstalled, true);
  const offlineEmpty = playUpdateDecision({ targetVersion:'1.0.9', installed:false, manifestConfigured:false });
  assert.equal(offlineEmpty.canPlayInstalled, false);
});
