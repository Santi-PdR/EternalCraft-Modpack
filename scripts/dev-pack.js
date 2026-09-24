#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function argsMap(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2); const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const cli = argsMap(process.argv.slice(2));
const source = path.resolve(cli.source || process.env.ETERNAL_PACK_SOURCE || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
const version = String(cli.version || process.env.ETERNAL_PACK_VERSION || `DEV-${stamp}`);
const previous = path.join(process.cwd(), 'pack-dist', 'channel', 'stable.json');
const buildArgs = [path.join(__dirname, 'build-pack.js'), '--source', source, '--version', version];
if (fs.existsSync(previous)) buildArgs.push('--previous', previous);

console.log(`Fuente de desarrollo: ${source}`);
const build = spawnSync(process.execPath, buildArgs, { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);

const server = spawn(process.execPath, [path.join(__dirname, 'serve-pack.js')], { stdio: 'inherit' });
const electronBin = require('electron');
const app = spawn(electronBin, ['.'], {
  cwd: path.join(__dirname, '..'), stdio: 'inherit',
  env: { ...process.env, ETERNAL_PACK_MANIFEST: 'http://127.0.0.1:4174/channel/stable.json' }
});

function stop() { try { server.kill('SIGTERM'); } catch (_) {} }
app.on('exit', (code) => { stop(); process.exit(code || 0); });
process.on('SIGINT', () => { try { app.kill('SIGTERM'); } catch (_) {}; stop(); });
process.on('SIGTERM', () => { try { app.kill('SIGTERM'); } catch (_) {}; stop(); });
