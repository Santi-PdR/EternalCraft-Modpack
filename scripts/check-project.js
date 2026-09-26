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
const modService = require(path.join(root,'src','main','services','modService'));
for (const name of ['listMods','addMods','toggleMod','removeMod','toggleFavorite','togglePin','setAllUserModsEnabled','copyModToRoot','auditMods']) {
  if (typeof modService[name] !== 'function') throw new Error(`modService no exporta ${name}()`);
}
const mainSource = fs.readFileSync(path.join(root,'src','main','main.js'),'utf8');
for (const match of mainSource.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\('\.\/services\/([^']+)'\)/g)) {
  const names = match[1].split(',').map(value => value.trim()).filter(Boolean);
  const serviceSource = fs.readFileSync(path.join(root,'src','main','services',`${match[2]}.js`),'utf8');
  const exportBlocks = [...serviceSource.matchAll(/module\.exports\s*=\s*\{([\s\S]*?)\}/g)].map(item => item[1]).join('\n');
  for (const name of names) if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(exportBlocks)) throw new Error(`${match[2]} no exporta ${name}()`);
}
// Keep the preload bridge and main-process IPC contract in sync. A missing
// handler is particularly damaging here: the renderer can show a blank page
// after one rejected invoke while the rest of the launcher still appears
// healthy.
const preloadSource = fs.readFileSync(path.join(root,'src','main','preload.js'),'utf8');
const mainChannels = new Set([...mainSource.matchAll(/ipcMain\.handle\(['"]([^'"]+)['"]/g)].map(m => m[1]));
const preloadChannels = new Set([...preloadSource.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)].map(m => m[1]));
for (const channel of preloadChannels) if (!mainChannels.has(channel)) throw new Error(`preload.js invoca un canal sin handler: ${channel}`);
for (const channel of mainChannels) if (!preloadChannels.has(channel)) throw new Error(`main.js registra un handler sin puente preload: ${channel}`);
if (manifest.minimumLauncher !== packageJson.version) throw new Error(`minimumLauncher ${manifest.minimumLauncher} no coincide con launcher ${packageJson.version}`);
if (packageJson.build?.appId !== 'uy.eternalcraft.launcher') throw new Error('appId del launcher cambió inesperadamente.');
const runtimeFiles = [...walk(path.join(root, 'src'), f => /\.(js|html|css)$/.test(f)), path.join(root, 'resources', 'default-config.json')];
for (const file of runtimeFiles) {
  const source = fs.readFileSync(file, 'utf8').toLowerCase();
  if (/curseforge|modrinth/.test(source) && !/configstore|developerservice|changelog|diagnostic|provider/.test(path.basename(file).toLowerCase())) {
    throw new Error(`Integración de catálogo externo encontrada en runtime: ${path.relative(root, file)}`);
  }
}
if (!defaults.minecraft?.preferDedicatedGpu) throw new Error('La GPU dedicada debe venir activada por defecto.');
if (!defaults.minecraft?.useSystemResolution) throw new Error('La resolución del sistema debe venir activada por defecto.');
for (const legacy of ['provider','category','environment','releaseChannel','curseforgeProxyUrl','autoCheckUpdates','autoUpdateUserMods']) if (Object.prototype.hasOwnProperty.call(defaults.mods || {}, legacy)) throw new Error(`La configuración conserva una clave retirada: ${legacy}`);

const html = fs.readFileSync(path.join(root,'src','renderer','index.html'),'utf8');
// A prematurely closed .content container makes every page after the first
// one render below the viewport while the sidebar still appears healthy. Keep
// a small structural check here so an extra closing div cannot regress the UI.
const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const htmlStack = [];
const htmlToken = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g;
for (const match of html.matchAll(htmlToken)) {
  const token = match[0];
  if (token.startsWith('<!--') || /^<\s*!/u.test(token)) continue;
  const close = /^<\//u.test(token);
  const name = token.match(/^<\/?\s*([A-Za-z][\w:-]*)/u)?.[1]?.toLowerCase();
  if (!name || voidTags.has(name) || /\/\s*>$/u.test(token)) continue;
  if (close) {
    const open = htmlStack.pop();
    if (!open || open.name !== name) throw new Error(`HTML malformado: se esperaba cerrar ${open?.name || 'nada'} y apareció </${name}> en offset ${match.index}`);
  } else htmlStack.push({name, token, index:match.index});
}
if (htmlStack.length) throw new Error(`HTML malformado: quedan etiquetas abiertas (${htmlStack.map(item => item.name).join(', ')})`);
const contentOpen = html.indexOf('<main class="content">');
const contentClose = html.indexOf('</main>', contentOpen);
if (contentOpen < 0 || contentClose < 0) throw new Error('No se encontró el contenedor principal .content.');
for (const page of ['home','mods','modpack','updates','gallery','support','settings']) {
  const pageIndex = html.indexOf(`<section id="page-${page}"`);
  if (pageIndex < contentOpen || pageIndex > contentClose) throw new Error(`La página ${page} quedó fuera de main.content.`);
}
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const duplicateIds = ids.filter((id,i)=>ids.indexOf(id)!==i);
if (duplicateIds.length) throw new Error(`IDs HTML duplicados: ${[...new Set(duplicateIds)].join(', ')}`);

const renderer = fs.readFileSync(path.join(root,'src','renderer','renderer.js'),'utf8');
for (const ref of [...renderer.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1])) {
  if (/^[.#\[]/.test(ref) || /[ >:+~]/.test(ref)) continue;
  if (!ids.includes(ref)) throw new Error(`renderer.js referencia un ID inexistente: ${ref}`);
}
for (const ref of [...renderer.matchAll(/\$\(['"]([^'"#.[\]]+)['"]\)\s*\.addEventListener/g)].map(m => m[1])) {
  if (!ids.includes(ref)) throw new Error(`renderer.js enlaza un listener a un ID inexistente: ${ref}`);
}

console.log(`OK // ${jsFiles.length} archivos JS · ${ids.length} IDs UI · configuración v${packageJson.version} verificada`);
