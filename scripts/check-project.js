#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const readText = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
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
const packService = require(path.join(root,'src','main','services','packService'));
if (typeof packService.markPublishedOfficial !== 'function') throw new Error('packService no exporta markPublishedOfficial()');
const packServiceSource = readText(path.join(root,'src','main','services','packService.js'));
const mainSource = readText(path.join(root,'src','main','main.js'));
const gameServiceSource = readText(path.join(root,'src','main','services','gameService.js'));
const publisherSource = readText(path.join(root,'scripts','publish-pack-github.js'));
const packBuilderSource = readText(path.join(root,'scripts','build-pack.js'));
const manifestServiceSource = readText(path.join(root,'src','main','services','manifestService.js'));
const serverPingSource = readText(path.join(root,'src','main','services','serverPing.js'));
const updateServiceSource = readText(path.join(root,'src','main','services','updateService.js'));
const updateRuntimeSource = readText(path.join(root,'src','main','services','updateRuntime.js'));
const releaseWorkflow = readText(path.join(root,'.github','workflows','build.yml'));
const configStoreSource = readText(path.join(root,'src','main','services','configStore.js'));
const authServiceSource = readText(path.join(root,'src','main','services','authService.js'));
const installerSource = readText(path.join(root,'install-app.sh'));
const verifyReleaseTagSource = readText(path.join(root,'scripts','verify-launcher-release.js'));
const developerServiceSource = readText(path.join(root,'src','main','services','developerService.js'));
if (!packBuilderSource.includes('ETERNAL_LAUNCHER_VERSION')) throw new Error('El constructor del pack no tiene fallback de versión para builds empaquetadas.');
if (!publisherSource.includes("String(output || '').trim()")) throw new Error('El publicador debe normalizar la salida nula de gh antes de trim().');
if (!publisherSource.includes("'--input', bodyFile")) throw new Error('El publicador debe enviar el manifest por archivo y no por argumentos de gh.');
if (!publisherSource.includes('includeUserMods')) throw new Error('El publicador debe declarar la política de mods personales.');
if (!packBuilderSource.includes("Boolean(args['include-user-mods'])")) throw new Error('El constructor debe aceptar la política explícita de publicación de mods personales.');
if (!packServiceSource.includes('function normalizeModMetadataPath') || !packServiceSource.includes("replace(/^mods\\//i, '')")) throw new Error('Los metadatos de mods deben normalizar rutas antiguas y archivos desactivados.');
if (!packServiceSource.includes('existingCheck = null') || !mainSource.includes('packProgress(p), before)')) throw new Error('La actualización debe reutilizar la comprobación previa antes de reparar.');
if (!manifestServiceSource.includes('Ruta fuera del payload administrado')) throw new Error('El validador debe limitar el manifiesto a los directorios administrados.');
if (!serverPingSource.includes("confidence: hasStatusPayload && !exarotonLobby ? 'verified' : 'unknown'")) throw new Error('El ping del servidor debe distinguir respuestas verificadas de estados ambiguos.');
if (!serverPingSource.includes('onlinePlayers <= maxPlayers')) throw new Error('El ping del servidor debe validar la coherencia de jugadores.');
if (!serverPingSource.includes('incoming.length > 2 * 1024 * 1024')) throw new Error('El ping del servidor debe limitar respuestas excesivamente grandes.');
if (!updateServiceSource.includes('if (availableInfo) emit({ type: \'available\'')) throw new Error('El updater debe conservar el reintento después de un fallo de descarga.');
if (!updateRuntimeSource.includes('function appImageRuntimeMessage') || !updateServiceSource.includes("appImageRuntimeMessage({ packaged: app.isPackaged })") || !updateServiceSource.includes("emit({ type: 'error', message: runtimeMessage })")) throw new Error('El updater debe explicar cuándo se inició desde una copia extraída sin soporte para autoactualizarse.');
if (!updateServiceSource.includes('if (downloadPromise) return { configured: true')) throw new Error('El updater debe evitar comprobaciones concurrentes durante una descarga.');
if (!updateServiceSource.includes('if (checkPromise) await checkPromise')) throw new Error('El updater debe esperar la comprobación antes de descargar.');
if (!updateServiceSource.includes("if (lastState.type !== 'downloaded') emit({ type: 'downloaded', info: availableInfo, files })")) throw new Error('El updater debe normalizar la finalización de downloadUpdate().');
if (!developerServiceSource.includes("output = `${output}${text}`.slice(-maxCapture)")) throw new Error('El publicador debe conservar el final del log para diagnosticar fallos.');
if (!developerServiceSource.includes('async cleanupStalePublishWorkDir')) throw new Error('La limpieza de temporales del publicador debe ser asíncrona.');
if (!developerServiceSource.includes("child.kill('SIGTERM')")) throw new Error('El publicador debe terminar el proceso hijo cuando falla su canal de salida.');
if (!developerServiceSource.includes('const hasCache = this.githubStatusCache.at > 0')) throw new Error('El estado del developer no debe ocultar una conexión GitHub conocida durante el desbloqueo.');
if (!developerServiceSource.includes('this.githubStatusInFlight')) throw new Error('El estado de GitHub del developer debe deduplicar comprobaciones simultáneas.');
if (!developerServiceSource.includes('function sha256FileAsync') || !developerServiceSource.includes('item.sha256 = await sha256FileAsync(item.full)')) throw new Error('El preflight debe calcular hashes de mods por stream para no cargar JARs completos en memoria.');
if (!developerServiceSource.includes('publisherChildren')) throw new Error('Los procesos de publicación deben registrarse para terminarlos al salir.');
if (!developerServiceSource.includes('const temporary = `${this.file}.tmp-${process.pid}-${Date.now()}-') || !developerServiceSource.includes('fs.renameSync(temporary, this.file)')) throw new Error('Los secretos del modo desarrollador deben guardarse con reemplazo atómico.');
if (!developerServiceSource.includes("child.kill('SIGKILL')")) throw new Error('El cierre del launcher debe forzar procesos de publicación que no respondan.');
if (!developerServiceSource.includes('if (child.exitCode === null) { try { child.kill(\'SIGKILL\')')) throw new Error('Los errores del publicador deben forzar el proceso aunque child.killed ya sea true.');
if (!mainSource.includes('runtimeCacheGeneration')) throw new Error('Las cachés de runtime deben descartar respuestas iniciadas antes de una invalidación.');
if (!mainSource.includes('function withDeadline(') || !mainSource.includes('const [java, system, developer] = await Promise.all')) throw new Error('El estado inicial debe tolerar comprobaciones lentas sin bloquear el renderer.');
if (!mainSource.includes('PRIMED_MANIFEST_TTL_MS') || !mainSource.includes('primeManifestCache(store.load(), publishedManifest')) throw new Error('La publicación debe usar el manifiesto verificado mientras GitHub propaga stable.json.');
if (!mainSource.includes('rendererLoadAttempts < 3')) throw new Error('La carga del renderer debe reintentar fallos iniciales sin entrar en un bucle infinito.');
if (!mainSource.includes("isQuitting = true;\n    try { installLauncherUpdate();")) throw new Error('La instalación de actualizaciones debe omitir el cierre a la bandeja.');
const launchHandler = mainSource.match(/ipcMain\.handle\('game:launch',[\s\S]*?\n\s*ipcMain\.handle\('game:safe-launch'/)?.[0] || '';
if (!launchHandler || /updatePack\(|checkInstallation\(/.test(launchHandler)) throw new Error('Jugar no debe comprobar, reparar ni actualizar el modpack.');
if (/quickPlay\s*:/.test(gameServiceSource)) throw new Error('El inicio normal no debe conectar al servidor automáticamente.');
if (defaults.launcher?.hideOnGameStart !== true) throw new Error('El launcher debe ocultarse al abrir Minecraft de forma predeterminada.');
if (!configStoreSource.includes('merged.configSchemaVersion = 1') || !configStoreSource.includes('hideOnGameStart: true')) throw new Error('Las configuraciones existentes deben migrarse una sola vez al ocultar el launcher al iniciar Minecraft.');
if (!mainSource.includes('hideOnGameStart:config.launcher?.hideOnGameStart!==false') || !mainSource.includes('hideOnGameStart:l.hideOnGameStart!==false')) throw new Error('La configuración debe conservar habilitado el comportamiento predeterminado y permitir desactivarlo explícitamente.');
if (!authServiceSource.includes('function isAuthFailure') || !authServiceSource.includes('error.reauthRequired = true')) throw new Error('La sesión Microsoft debe diferenciar tokens inválidos de fallos de red.');
if (!authServiceSource.includes('const temporary = `${this.file}.tmp-${process.pid}-${Date.now()}-') || !authServiceSource.includes('fs.renameSync(temporary, this.file)')) throw new Error('La cuenta premium debe guardarse con reemplazo atómico y temporal único.');
const stopLauncherIndex = installerSource.indexOf('\nstop_existing_launcher\n');
const replaceAppImageIndex = installerSource.indexOf('cp -f "$BUILT" "$APPIMAGE"');
if (stopLauncherIndex < 0 || replaceAppImageIndex < 0 || stopLauncherIndex > replaceAppImageIndex || !installerSource.includes('kill -TERM') || !installerSource.includes('No se reemplazaron los archivos')) throw new Error('El instalador debe cerrar limpiamente el launcher anterior antes de reemplazar archivos.');
const preflightIndex = installerSource.indexOf('preflight_writable_directory "$target_dir"');
if (preflightIndex < 0 || preflightIndex > stopLauncherIndex || !installerSource.includes('mktemp "$directory/.eternal-craft-write-test.XXXXXX"')) throw new Error('El instalador debe comprobar escrituras reales en todas las rutas críticas antes de cerrar/reemplazar la instalación.');
const installedWrapper = installerSource.slice(installerSource.indexOf('cat > "$WRAPPER"'), installerSource.indexOf('\nWRAPPER\n'));
if (!installedWrapper.includes('if [[ -x "$APPIMAGE" ]]') || !installedWrapper.includes('--appimage-extract-and-run') || installedWrapper.indexOf('if [[ -x "$APPIMAGE" ]]') > installedWrapper.indexOf('if [[ -x "$APP_HOME/app/EternalCraftLauncher" ]]')) throw new Error('El wrapper debe priorizar el AppImage actualizable y dejar AppDir solo como recuperación.');
if (!installedWrapper.includes('ETERNAL_DEVELOPER_BUILD=1') || !installedWrapper.includes('--developer-build')) throw new Error('El wrapper local debe conservar el acceso a herramientas de mantenimiento.');
if (!mainSource.includes('else if (result.reauthRequired) store.save({ minecraft: { accountMode: \'offline\' } });')) throw new Error('El launcher debe salir del modo premium cuando Microsoft invalida la sesión.');
if (!mainSource.includes("if (err?.reauthRequired) {\n        store.save({ minecraft: { accountMode: 'offline' } });")) throw new Error('El inicio del juego debe convertir una sesión premium vencida en una acción recuperable.');
if (!configStoreSource.includes('Persist the migration immediately')) throw new Error('La limpieza de configuración heredada debe persistirse al migrar.');
if (/--(?:raw-)?field['\"`][^\n]*(?:manifest|content|body)/i.test(publisherSource)) throw new Error('El publicador volvió a pasar contenido grande del manifest por argumentos de gh.');
for (const match of mainSource.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\('\.\/services\/([^']+)'\)/g)) {
  const names = match[1].split(',').map(value => value.trim()).filter(Boolean);
  const serviceSource = readText(path.join(root,'src','main','services',`${match[2]}.js`));
  const exportBlocks = [...serviceSource.matchAll(/module\.exports\s*=\s*\{([\s\S]*?)\}/g)].map(item => item[1]).join('\n');
  for (const name of names) if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(exportBlocks)) throw new Error(`${match[2]} no exporta ${name}()`);
}
// Keep the preload bridge and main-process IPC contract in sync. A missing
// handler is particularly damaging here: the renderer can show a blank page
// after one rejected invoke while the rest of the launcher still appears
// healthy.
const preloadSource = readText(path.join(root,'src','main','preload.js'));
const mainChannels = new Set([...mainSource.matchAll(/ipcMain\.handle\(['"]([^'"]+)['"]/g)].map(m => m[1]));
const preloadChannels = new Set([...preloadSource.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)].map(m => m[1]));
for (const channel of preloadChannels) if (!mainChannels.has(channel)) throw new Error(`preload.js invoca un canal sin handler: ${channel}`);
for (const channel of mainChannels) if (!preloadChannels.has(channel)) throw new Error(`main.js registra un handler sin puente preload: ${channel}`);
if (manifest.minimumLauncher !== packageJson.version) throw new Error(`minimumLauncher ${manifest.minimumLauncher} no coincide con launcher ${packageJson.version}`);
if (packageJson.build?.appId !== 'uy.eternalcraft.launcher') throw new Error('appId del launcher cambió inesperadamente.');
const runtimeFiles = [...walk(path.join(root, 'src'), f => /\.(js|html|css)$/.test(f)), path.join(root, 'resources', 'default-config.json')];
for (const file of runtimeFiles) {
  const source = readText(file).toLowerCase();
  if (/curseforge|modrinth/.test(source) && !/configstore|developerservice|changelog|diagnostic|provider/.test(path.basename(file).toLowerCase())) {
    throw new Error(`Integración de catálogo externo encontrada en runtime: ${path.relative(root, file)}`);
  }
}
if (!defaults.minecraft?.preferDedicatedGpu) throw new Error('La GPU dedicada debe venir activada por defecto.');
if (!defaults.minecraft?.useSystemResolution) throw new Error('La resolución del sistema debe venir activada por defecto.');
if (/\/releases\/latest\/download\/?$/i.test(defaults.launcher?.updateFeedUrl || '')) throw new Error('El updater del launcher debe apuntar al canal estable independiente de las releases del modpack.');
if (packageJson.build?.publish?.[0]?.url !== defaults.launcher?.updateFeedUrl) throw new Error('El feed de electron-builder y la configuración del launcher deben coincidir.');
if (!configStoreSource.includes('/releases/download/launcher-latest/') || !configStoreSource.includes('configuredFeed.replace')) throw new Error('Las instalaciones existentes deben migrar el feed latest al canal estable del launcher.');
if (!releaseWorkflow.includes('npm test') || !releaseWorkflow.includes('make_latest: true') || !releaseWorkflow.includes('gh release upload launcher-latest')) throw new Error('El workflow debe probar los cambios y publicar el canal estable del updater.');
if (!releaseWorkflow.includes('scripts/verify-launcher-release.js')) throw new Error('El workflow debe validar que el tag del launcher coincida con package.json.');
if (!verifyReleaseTagSource.includes('launcher-v${version}')) throw new Error('La validación de tag debe exigir launcher-v seguido de la versión exacta.');
if (!publisherSource.includes("'--latest=false'")) throw new Error('Las releases de mods no deben reemplazar la release latest del launcher.');
for (const legacy of ['provider','category','environment','releaseChannel','curseforgeProxyUrl','autoCheckUpdates','autoUpdateUserMods']) if (Object.prototype.hasOwnProperty.call(defaults.mods || {}, legacy)) throw new Error(`La configuración conserva una clave retirada: ${legacy}`);

const html = readText(path.join(root,'src','renderer','index.html'));
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

const renderer = readText(path.join(root,'src','renderer','renderer.js'));
const playAction = renderer.match(/async function launch\(\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
if (!playAction.includes('askConfirm(') || playAction.includes('healthCheck(')) throw new Error('Jugar debe pedir confirmación sin ejecutar el diagnóstico completo.');
if (!renderer.includes('s.hidden=!active') || !renderer.includes("s.setAttribute('aria-hidden',String(!active))")) throw new Error('La navegación debe controlar la visibilidad nativa de cada página.');
if (!renderer.includes('const retry=banner.querySelector(\'button\')') || !renderer.includes('if(title) title.textContent')) throw new Error('El banner de errores del renderer debe tolerar un DOM parcial.');
for (const ref of [...renderer.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1])) {
  if (/^[.#\[]/.test(ref) || /[ >:+~]/.test(ref)) continue;
  if (!ids.includes(ref)) throw new Error(`renderer.js referencia un ID inexistente: ${ref}`);
}
for (const ref of [...renderer.matchAll(/\$\(['"]([^'"#.[\]]+)['"]\)\s*\.addEventListener/g)].map(m => m[1])) {
  if (!ids.includes(ref)) throw new Error(`renderer.js enlaza un listener a un ID inexistente: ${ref}`);
}

console.log(`OK // ${jsFiles.length} archivos JS · ${ids.length} IDs UI · configuración v${packageJson.version} verificada`);
