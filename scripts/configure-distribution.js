#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('./build-pack');
const args = parseArgs(process.argv.slice(2));
const packRepo = String(args['pack-repo'] || '').trim();
const launcherRepo = String(args['launcher-repo'] || '').trim();
if (!packRepo.includes('/') || !launcherRepo.includes('/')) {
  console.error('Uso: npm run distribution:configure -- --pack-repo USUARIO/REPO --launcher-repo USUARIO/REPO');
  process.exit(1);
}
const file = path.join(process.cwd(), 'resources', 'default-config.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.pack.manifestUrl = `https://raw.githubusercontent.com/${packRepo}/main/channel/stable.json`;
config.launcher.updateFeedUrl = `https://github.com/${launcherRepo}/releases/latest/download/`;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log('Distribución configurada:');
console.log(`Pack: ${config.pack.manifestUrl}`);
console.log(`Launcher: ${config.launcher.updateFeedUrl}`);
