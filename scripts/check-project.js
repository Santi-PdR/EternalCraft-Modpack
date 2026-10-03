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
const statePayloadSource = mainSource.match(/async function statePayload\(\)\s*\{[\s\S]*?(?=\n\/\/ The first state request)/)?.[0] || '';
if (!statePayloadSource.includes('Promise.all([') || !statePayloadSource.includes('currentManifest(config, { quick: true })')) throw new Error('El estado inicial debe cargar en paralelo el manifest rápido, Java, perfil del sistema y estado local del pack.');
const rendererForStartup = readText(path.join(root,'src','renderer','renderer.js'));
const initSource = rendererForStartup.match(/async function init\(\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
if (!initSource.includes('bind();setPage(\'home\')') || initSource.indexOf('bootScreen') > initSource.indexOf('const state=await api.getState()')) throw new Error('El shell debe mostrarse antes de esperar el estado inicial.');
if (!mainSource.includes('PRIMED_MANIFEST_TTL_MS') || !readText(path.join(root,'src','main','developer','developerIpc.js')).includes('primeManifestCache(store.load(), publishedManifest')) throw new Error('La publicación Developer debe usar el manifiesto verificado mientras GitHub propaga stable.json.');
// The launcher reads channel/stable.json from the publisher work dir after a
// successful run to promote the jars in SIEGE and to prime its cache. If every
// successful path deletes it, both silently stop happening.
if ((publisherSource.match(/clearStaging\(out, \{ keepChannel: true \}\)/g) || []).length < 2) throw new Error('Toda publicación exitosa debe conservar el manifest verificado para la sincronización de metadatos del launcher.');
if (!publisherSource.includes('if (failedOut) clearStaging(failedOut);')) throw new Error('Una publicación fallida debe limpiar su staging para no dejar un manifest que parezca verificado.');
if (!mainSource.includes('rendererLoadAttempts < 3')) throw new Error('La carga del renderer debe reintentar fallos iniciales sin entrar en un bucle infinito.');
if (!mainSource.includes("isQuitting = true;\n    try { installLauncherUpdate();")) throw new Error('La instalación de actualizaciones debe omitir el cierre a la bandeja.');
const playCheckHandler = mainSource.match(/ipcMain\.handle\('game:play-check',[\s\S]*?\n\s*ipcMain\.handle\('game:launch'/)?.[0] || '';
const launchHandler = mainSource.match(/ipcMain\.handle\('game:launch',[\s\S]*?\n\s*ipcMain\.handle\('game:update-launch'/)?.[0] || '';
if (!playCheckHandler.includes('checkInstallationShared')) throw new Error('Play debe comprobar la integridad con hashes verificados antes de ofrecer actualizar o continuar.');
if (!launchHandler || /updatePack\(|repairInstallation\(/.test(launchHandler)) throw new Error('Jugar sin actualizar no debe modificar ni forzar una sincronización del modpack.');
if (!rendererForStartup.includes("confirmText:'Actualizar y jugar'") || !rendererForStartup.includes("cancelText:'Jugar sin actualizar'")) throw new Error('La decisión de Play debe ofrecer actualizar y jugar o continuar sin actualizar.');
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
if (!installedWrapper.includes('if [[ -x "$APPIMAGE" ]]') || !installedWrapper.includes('--appimage-extract-and-run') || installedWrapper.indexOf('if [[ -x "$APPIMAGE" ]]') > installedWrapper.indexOf('if [[ -x "$APP_HOME/app/EternalCraftLauncherDeveloper" ]]')) throw new Error('El wrapper privado debe priorizar el AppImage actualizable y dejar el AppDir Developer solo como recuperación.');
if (!installerSource.includes('npm run dist:developer:linux') || !installerSource.includes('APP_ID="uy.eternalcraft.launcher.developer"') || !installerSource.includes('Eternal Craft Launcher Developer')) throw new Error('El instalador local debe distribuir exclusivamente la variante privada Developer.');
if (!mainSource.includes('else if (result.reauthRequired) store.save({ minecraft: { accountMode: \'offline\' } });')) throw new Error('El launcher debe salir del modo premium cuando Microsoft invalida la sesión.');
if (!mainSource.includes("if (err?.reauthRequired) {") || !mainSource.includes("store.save({ minecraft: { accountMode: 'offline' } });")) throw new Error('El inicio del juego debe convertir una sesión premium vencida en una acción recuperable.');
if (!configStoreSource.includes('Persist the migration immediately')) throw new Error('La limpieza de configuración heredada debe persistirse al migrar.');
if (/--(?:raw-)?field['\"`][^\n]*(?:manifest|content|body)/i.test(publisherSource)) throw new Error('El publicador volvió a pasar contenido grande del manifest por argumentos de gh.');
for (const match of mainSource.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\('\.\/services\/([^']+)'\)/g)) {
  const names = match[1].split(',').map(value => value.trim()).filter(Boolean);
  const serviceSource = readText(path.join(root,'src','main','services',`${match[2]}.js`));
  const exportBlocks = [...serviceSource.matchAll(/module\.exports\s*=\s*\{([\s\S]*?)\}/g)].map(item => item[1]).join('\n');
  for (const name of names) if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(exportBlocks)) throw new Error(`${match[2]} no exporta ${name}()`);
}
// Keep the split Public/Developer preload bridges and IPC handlers in sync.
// Developer channels must never leak into the Public bridge or main runtime.
const publicPreloadEntry = readText(path.join(root,'src','main','preload.js'));
const developerPreloadEntry = readText(path.join(root,'src','main','preload.developer.js'));
const publicBridgeSource = readText(path.join(root,'src','main','preloadBridge.js'));
const developerBridgeSource = readText(path.join(root,'src','main','developer','developerBridge.js'));
const developerIpcSource = readText(path.join(root,'src','main','developer','developerIpc.js'));
const channelList = (source, pattern) => [...source.matchAll(pattern)].map(m => m[1]);
const publicInvokes = channelList(publicBridgeSource,/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
const publicHandlers = channelList(mainSource,/ipcMain\.handle\(['"]([^'"]+)['"]/g);
const developerInvokes = channelList(developerBridgeSource,/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
const developerHandlers = channelList(developerIpcSource,/ipcMain\.handle\(['"]([^'"]+)['"]/g);
const duplicates = channels => channels.filter((channel,index) => channels.indexOf(channel)!==index);
if (duplicates(publicInvokes).length || duplicates(publicHandlers).length) throw new Error('El contrato IPC público contiene canales duplicados.');
for (const channel of publicInvokes) if (!publicHandlers.includes(channel)) throw new Error(`El puente Public invoca un canal sin handler: ${channel}`);
for (const channel of publicHandlers) if (!publicInvokes.includes(channel)) throw new Error(`main.js registra un handler sin puente Public: ${channel}`);
if (duplicates(developerInvokes).length || duplicates(developerHandlers).length) throw new Error('El contrato IPC privado contiene canales duplicados.');
for (const channel of developerInvokes) if (!developerHandlers.includes(channel)) throw new Error(`El puente Developer invoca un canal sin handler: ${channel}`);
for (const channel of developerHandlers) if (!developerInvokes.includes(channel)) throw new Error(`El IPC privado registra un handler sin puente: ${channel}`);
if (developerHandlers.some(channel => !channel.startsWith('developer:'))) throw new Error('Los handlers privados deben usar el namespace developer:.');
if (/developerBridge|ipcRenderer\.invoke\(['"]developer:|ipcMain\.handle\(['"]developer:|emit\(['"]developer:/.test(publicPreloadEntry + publicBridgeSource + mainSource)) throw new Error('El build Public expone canales Developer en su entrypoint, preload o runtime.');
if (!developerPreloadEntry.includes('createDeveloperBridge') || !readText(path.join(root,'src','main','developerMain.js')).includes('createDeveloperIntegration')) throw new Error('La build Developer debe usar su entrypoint e integración IPC privados.');
const publicSubscriptions = channelList(publicBridgeSource,/listener\(['"]([^'"]+)['"]/g);
const developerSubscriptions = channelList(developerBridgeSource,/listener\(['"]([^'"]+)['"]/g);
const commonEmitters = channelList(mainSource,/emit\(['"]([^'"]+)['"]/g);
const developerEmitters = channelList(developerIpcSource,/emit\(['"]([^'"]+)['"]/g);
for (const channel of publicSubscriptions) if (!commonEmitters.includes(channel)) throw new Error(`El puente Public escucha ${channel} sin emisor.`);
for (const channel of developerSubscriptions) if (!commonEmitters.includes(channel) && !developerEmitters.includes(channel)) throw new Error(`El puente Developer escucha ${channel} sin emisor.`);
if (manifest.minimumLauncher !== packageJson.version) throw new Error(`minimumLauncher ${manifest.minimumLauncher} no coincide con launcher ${packageJson.version}`);

// channel/stable.json is the published state that raw.githubusercontent serves
// to every player. A manifest that nobody can consume (requiring a launcher
// version that does not exist) or a corrupted payload must never ship.
const channel = JSON.parse(readText(path.join(root,'channel','stable.json')));
function versionParts(value){ return String(value||'0').replace(/^v/i,'').split(/[.-]/).slice(0,3).map(v=>Number(v)||0); }
function versionAtLeast(current, required){ const a=versionParts(current), b=versionParts(required); for(let i=0;i<3;i++){ if((a[i]||0)>(b[i]||0)) return true; if((a[i]||0)<(b[i]||0)) return false; } return true; }
if (!channel.version) throw new Error('channel/stable.json no declara versión.');
if (!Array.isArray(channel.files)) throw new Error('channel/stable.json no contiene la lista de archivos.');
if (!versionAtLeast(packageJson.version, channel.minimumLauncher || '0.0.0')) {
  throw new Error(`channel/stable.json exige launcher ${channel.minimumLauncher} y este repositorio compila ${packageJson.version}: los jugadores quedarían bloqueados.`);
}
const channelPaths = new Set();
for (const entry of channel.files) {
  const file = String(entry?.path || '');
  if (!file.startsWith('mods/') && !file.startsWith('iammusicplayerrenewed/')) throw new Error(`channel/stable.json publica una ruta fuera del payload: ${file || '(vacía)'}`);
  if (!/^[a-f0-9]{64}$/i.test(String(entry?.sha256 || ''))) throw new Error(`channel/stable.json tiene un SHA-256 inválido: ${file}`);
  if (!entry?.empty && !String(entry?.url || '').startsWith('https://')) throw new Error(`channel/stable.json tiene una URL inválida: ${file}`);
  const key = file.toLowerCase();
  if (channelPaths.has(key)) throw new Error(`channel/stable.json contiene la ruta duplicada ${file}`);
  channelPaths.add(key);
}
for (const retired of channel.remove || []) {
  if (channelPaths.has(String(retired).toLowerCase())) throw new Error(`channel/stable.json conserva y retira el mismo archivo: ${retired}`);
}
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
const modListRenderSource = renderer.match(/function renderMods\([\s\S]*?\n\}\nfunction handleModsListClick/)?.[0] || '';
if (!renderer.includes("$('modsList')?.addEventListener('click',handleModsListClick)") || !renderer.includes('function handleModsListClick(event)') || /addEventListener\('click'/.test(modListRenderSource)) throw new Error('La biblioteca de mods debe usar delegación de eventos para evitar listeners por fila en cada búsqueda.');
const playAction = renderer.match(/async function launch\(\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
if (!playAction.includes('api.checkPlayUpdate()') || !playAction.includes('appDialog(') || playAction.includes('api.healthCheck(')) throw new Error('Jugar debe comprobar el pack con feedback inmediato y no ejecutar el diagnóstico completo.');
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
