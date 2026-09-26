#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
function walk(dir, predicate) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (!predicate || predicate(full)) out.push(full);
  }
  return out;
}

const jsFiles = [
  ...walk(path.join(root, 'src'), f => f.endsWith('.js')),
  ...walk(path.join(root, 'scripts'), f => f.endsWith('.js'))
].sort();
for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio:'inherit' });

const packageJson = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const defaults = JSON.parse(fs.readFileSync(path.join(root,'resources','default-config.json'),'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'resources','manifest.example.json'),'utf8'));
if (manifest.minimumLauncher !== packageJson.version) throw new Error(`minimumLauncher ${manifest.minimumLauncher} no coincide con launcher ${packageJson.version}`);
if (packageJson.build?.appId !== 'uy.eternalcraft.launcher') throw new Error('appId del launcher cambió inesperadamente.');
if (!defaults.minecraft?.preferDedicatedGpu) throw new Error('La GPU dedicada debe venir activada por defecto.');
if (!defaults.minecraft?.useSystemResolution) throw new Error('La resolución del sistema debe venir activada por defecto.');
for (const legacy of ['provider','category','environment','releaseChannel','curseforgeProxyUrl','autoCheckUpdates','autoUpdateUserMods']) if (Object.prototype.hasOwnProperty.call(defaults.mods || {}, legacy)) throw new Error(`La configuración conserva una clave retirada: ${legacy}`);

const html = fs.readFileSync(path.join(root,'src','renderer','index.html'),'utf8');
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const duplicateIds = ids.filter((id,i)=>ids.indexOf(id)!==i);
if (duplicateIds.length) throw new Error(`IDs HTML duplicados: ${[...new Set(duplicateIds)].join(', ')}`);

const renderer = fs.readFileSync(path.join(root,'src','renderer','renderer.js'),'utf8');
for (const ref of [...renderer.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1])) {
  if (/^[.#\[]/.test(ref) || /[ >:+~]/.test(ref)) continue;
  if (!ids.includes(ref)) throw new Error(`renderer.js referencia un ID inexistente: ${ref}`);
}

console.log(`OK // ${jsFiles.length} archivos JS · ${ids.length} IDs UI · configuración v${packageJson.version} verificada`);
