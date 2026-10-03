#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { launcherBuildConfig } = require('./launcherBuildConfig');
const { buildPreloads } = require('./bundle-preloads');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function argValue(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || fallback) : fallback;
}
const variant = argValue('--variant', 'public') === 'developer' ? 'developer' : 'public';
const platform = args.includes('--win') ? 'win' : args.includes('--linux') ? 'linux' : process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : 'mac';
const directoryOnly = args.includes('--dir');
const baseConfig = require(path.join(root, 'package.json')).build;
const config = launcherBuildConfig(baseConfig, variant);

let tempDirectory = '';
try {
  buildPreloads();
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eternal-craft-build-'));
  const configPath = path.join(tempDirectory, `${variant}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const cli = require.resolve('electron-builder/cli.js');
  const builderArgs = [cli, '--config', configPath, '--x64', '--publish', 'never'];
  if (directoryOnly) builderArgs.push('--dir');
  else if (platform === 'linux') builderArgs.push('--linux', 'AppImage');
  else if (platform === 'win') builderArgs.push('--win', 'nsis', 'portable');
  else builderArgs.push('--mac');

  const env = { ...process.env };
  // electron-builder downloads its signed binaries over HTTPS. Node's bundled
  // CA list can differ from the OS trust store (for example, when the system
  // has an additional trusted root); use the native trust store without
  // weakening certificate verification.
  if (process.allowedNodeEnvironmentFlags?.has('--use-system-ca')) {
    const nodeOptions = String(env.NODE_OPTIONS || '').trim();
    if (!/(^|\s)--use-system-ca(?:\s|$)/.test(nodeOptions)) env.NODE_OPTIONS = [nodeOptions, '--use-system-ca'].filter(Boolean).join(' ');
  }
  const result = spawnSync(process.execPath, builderArgs, { cwd:root, stdio:'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
  else console.log(`Build ${variant} (${platform}) completada.`);
} catch (error) {
  console.error(`Falló la build ${variant}:`, error?.stack || error);
  process.exitCode = 1;
} finally {
  if (tempDirectory) fs.rmSync(tempDirectory, { recursive:true, force:true });
}
