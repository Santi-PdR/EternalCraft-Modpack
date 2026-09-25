const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, screen, Tray, Menu, Notification } = require('electron');
const { ConfigStore } = require('./services/configStore');
const { pingMinecraftServer } = require('./services/serverPing');
const { getManifest } = require('./services/manifestService');
const { checkInstallation, repairInstallation, cacheStats, clearCache } = require('./services/packService');
const { resolveJava17, ensureJava17, supportedJava } = require('./services/javaService');
const { buildDiagnostic, quickDiagnostic } = require('./services/diagnostics');
const { launchGame } = require('./services/gameService');
const { ensurePreset } = require('./services/gamePresetService');
const { systemProfile } = require('./services/systemService');
const { checkLauncherUpdate, downloadLauncherUpdate, installLauncherUpdate } = require('./services/updateService');
const { listMods, addMods, toggleMod, removeMod, toggleFavorite, togglePin, setAllUserModsEnabled, searchModrinth, installModrinth, planModrinthInstall, searchCurseForge, installCurseForge, getModDetails, copyModToRoot, checkModUpdates, updateModrinthUserMod, updateAllUserMods, identifyLocalModrinthMods, auditMods } = require('./services/modService');
const { DeveloperService } = require('./services/developerService');
const { AuthService } = require('./services/authService');
const { listSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot } = require('./services/recoveryService');
const { prepareSafeMode, restoreSafeMode } = require('./services/safeModeService');
const { storageSummary, cleanupLogs } = require('./services/storageService');
const { connectivityReport } = require('./services/connectivityService');
const { recordChange, listChanges, changesSince } = require('./services/changeHistoryService');
const { vaultStatus, pushVault, pullVault } = require('./services/vaultService');


// Give Linux/Windows a stable application identity. In development this also
// helps KDE/Wayland match the window with the .desktop entry instead of Electron.
app.setName('Eternal Craft Launcher');
app.setAppUserModelId('uy.eternalcraft.launcher');
if (process.platform === 'linux') {
  app.setDesktopName('uy.eternalcraft.launcher.desktop');
  app.commandLine.appendSwitch('class', 'uy.eternalcraft.launcher');
}

let mainWindow;
let tray;
let store;
let activeOperation = '';
let developerService;
let authService;
let isQuitting = false;
let nativeUpdateNotified = false;

// Several renderer panels ask for the same data during boot. Keep a very
// short-lived cache and share in-flight requests so those panels do not race
// each other or repeat expensive disk/network work.
const manifestCache = new Map();
const manifestInFlight = new Map();
const systemProfileCache = new Map();
const systemProfileInFlight = new Map();
const RUNTIME_CACHE_TTL_MS = 2500;

let launcherErrorLog = '';
function serializeError(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}
${value.stack || ''}`;
  try { return typeof value === 'string' ? value : JSON.stringify(value); } catch (_) { return String(value); }
}
async function appendLauncherError(kind, value) {
  if (!launcherErrorLog) return;
  try {
    const line = `
[${new Date().toISOString()}] ${kind}
${serializeError(value)}
`;
    await fsp.appendFile(launcherErrorLog, line, 'utf8');
    const st = await fsp.stat(launcherErrorLog).catch(() => null);
    if (st && st.size > 1024 * 1024) {
      const raw = await fsp.readFile(launcherErrorLog, 'utf8');
      await fsp.writeFile(launcherErrorLog, raw.slice(-512 * 1024), 'utf8');
    }
  } catch (_) {}
}
async function tailLauncherErrorLog(maxBytes = 64000) {
  if (!launcherErrorLog) return '';
  try {
    const st = await fsp.stat(launcherErrorLog); const handle = await fsp.open(launcherErrorLog, 'r');
    const len = Math.min(st.size, maxBytes); const buf = Buffer.alloc(len);
    await handle.read(buf, 0, len, Math.max(0, st.size - len)); await handle.close(); return buf.toString('utf8');
  } catch (_) { return ''; }
}

function resourcesDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '..', '..', 'resources');
}
function rendererPath(file) { return path.join(__dirname, '..', 'renderer', file); }
function scriptsDir() { return app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(__dirname, '..', '..', 'scripts'); }
function managedJavaRoot() { return path.join(app.getPath('userData'), 'runtime', 'java17'); }
function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}
function notifyNative(title, body) {
  try {
    const cfg = store?.load?.();
    if (cfg?.launcher?.nativeNotifications === false || !Notification.isSupported()) return;
    new Notification({ title, body, icon: path.join(resourcesDir(), 'icons', 'icon.png') }).show();
  } catch (_) {}
}
function updateEvent(payload) {
  emit('launcher:update-event', payload);
  if (payload?.type === 'available' && !nativeUpdateNotified) { nativeUpdateNotified = true; notifyNative('Eternal Craft Launcher', `Nueva versión ${payload.info?.version || ''} disponible.`.trim()); }
  if (payload?.type === 'downloaded') notifyNative('Actualización lista', 'Reiniciá Eternal Craft Launcher para instalarla.');
}
function linuxAutostartPath() {
  return path.join(app.getPath('home'), '.config', 'autostart', 'eternal-craft-launcher.desktop');
}
async function applyStartupPreference(enabled) {
  try {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath, args: [] });
      return true;
    }
    if (process.platform === 'linux') {
      const file = linuxAutostartPath();
      if (!enabled) { await fsp.rm(file, { force: true }); return true; }
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const exec = app.isPackaged ? process.execPath : process.execPath + ' ' + path.join(__dirname, '..', '..');
      const content = `[Desktop Entry]\nType=Application\nName=Eternal Craft Launcher\nComment=Launcher oficial de Eternal Craft // SIEGE\nExec=${exec} --startup\nIcon=${path.join(resourcesDir(), 'icons', 'icon.png')}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
      await fsp.writeFile(file, content);
      return true;
    }
  } catch (_) {}
  return false;
}
function createTray() {
  if (tray || !store) return;
  try {
    tray = new Tray(path.join(resourcesDir(), 'icons', 'icon.png'));
    tray.setToolTip('Eternal Craft Launcher');
    const menu = Menu.buildFromTemplate([
      { label: 'Abrir Eternal Craft', click: () => showMainWindow() },
      { label: 'Jugar', click: () => { showMainWindow(); emit('ui:command', 'play'); } },
      { label: 'Comprobar actualizaciones', click: () => { showMainWindow(); emit('ui:command', 'updates'); } },
      { type: 'separator' },
      { label: 'Salir', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', showMainWindow);
  } catch (_) { tray = null; }
}

function packProgress(payload = {}) {
  emit('pack:progress', payload);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const total = Number(payload.bytesTotal || payload.total || 0);
  const current = Number(payload.bytesReceived || payload.current || 0);
  if (total > 0 && current >= 0) mainWindow.setProgressBar(Math.max(0, Math.min(1, current / total)));
  else if (['java-ready'].includes(String(payload.phase || ''))) mainWindow.setProgressBar(-1);
}

function applyWindowsTasks(){
  if(process.platform!=='win32') return;
  try{app.setUserTasks([
    {program:process.execPath,arguments:'--play',iconPath:process.execPath,iconIndex:0,title:'Jugar Eternal Craft',description:'Abrir el launcher y jugar'},
    {program:process.execPath,arguments:'--updates',iconPath:process.execPath,iconIndex:0,title:'Comprobar actualizaciones',description:'Abrir el centro de actualizaciones'}
  ]);}catch(_){}
}
function createWindow() {
  const cfg = store?.load?.() || {};
  const saved = cfg.launcher?.windowBounds;
  const opts = {
    width: saved?.width || 1460, height: saved?.height || 860, minWidth: 1040, minHeight: 670, show: false, frame: false,
    backgroundColor: '#dfe9ed', title: 'Eternal Craft Launcher', icon: path.join(resourcesDir(), 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  };
  if (Number.isFinite(saved?.x)) opts.x = saved.x;
  if (Number.isFinite(saved?.y)) opts.y = saved.y;
  mainWindow = new BrowserWindow(opts);
  mainWindow.loadFile(rendererPath('index.html'));
  mainWindow.once('ready-to-show', () => { if (cfg.launcher?.windowMaximized) mainWindow.maximize(); const startup=process.argv.includes('--startup'); if(startup && cfg.launcher?.startMinimized) mainWindow.hide(); else mainWindow.show(); });
  let saveTimer = null;
  const saveWindowState = () => {
    clearTimeout(saveTimer); saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const maximized = mainWindow.isMaximized();
      const bounds = maximized ? (store.load().launcher?.windowBounds || mainWindow.getNormalBounds()) : mainWindow.getBounds();
      store.save({ launcher: { windowBounds: bounds, windowMaximized: maximized } });
    }, 180);
  };
  mainWindow.on('resize', saveWindowState); mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', () => { emit('window:maximized', true); saveWindowState(); });
  mainWindow.on('unmaximize', () => { emit('window:maximized', false); saveWindowState(); });
  mainWindow.on('close', (event) => {
    try { if (!mainWindow.isMaximized()) store.save({ launcher: { windowBounds: mainWindow.getBounds(), windowMaximized: false } }); } catch (_) {}
    const cfg = store?.load?.() || {};
    if (!isQuitting && cfg.launcher?.closeToTray !== false && tray) {
      event.preventDefault();
      mainWindow.hide();
      if (cfg.launcher?.nativeNotifications !== false && !cfg.launcher?.trayHintShown) {
        notifyNative('Eternal Craft sigue abierto', 'El launcher quedó en la bandeja del sistema. Podés cerrarlo desde su icono.');
        store.save({ launcher: { trayHintShown: true } });
      }
    }
  });
}

function versionParts(value) {
  return String(value || '0').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((v) => Number(v) || 0);
}
function versionAtLeast(current, required) {
  const a = versionParts(current); const b = versionParts(required);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
}

async function currentManifest(config) {
  const key = `${String(process.env.ETERNAL_PACK_MANIFEST || '').trim()}|${String(config.pack?.manifestUrl || '').trim()}`;
  const now = Date.now();
  const cached = manifestCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (manifestInFlight.has(key)) return manifestInFlight.get(key);
  const request = (async () => {
    const info = await getManifest(config, path.join(resourcesDir(), 'manifest.example.json'), path.join(app.getPath('userData'), 'cache', 'stable-manifest.json'));
    const value = { ...info, source: info.configured ? (process.env.ETERNAL_PACK_MANIFEST ? 'development' : 'remote') : 'fallback' };
    manifestCache.set(key, { value, expiresAt: Date.now() + RUNTIME_CACHE_TTL_MS });
    return value;
  })();
  manifestInFlight.set(key, request);
  try { return await request; }
  finally { manifestInFlight.delete(key); }
}
function invalidateRuntimeCaches() {
  manifestCache.clear();
  systemProfileCache.clear();
}
async function cachedSystemProfile(installDirectory, bytesRequired = 0) {
  const key = `${path.resolve(String(installDirectory || app.getPath('userData')))}|${Number(bytesRequired || 0)}`;
  const now = Date.now();
  const cached = systemProfileCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (systemProfileInFlight.has(key)) return systemProfileInFlight.get(key);
  const request = systemProfile(installDirectory, bytesRequired).then((value) => {
    systemProfileCache.set(key, { value, expiresAt: Date.now() + RUNTIME_CACHE_TTL_MS });
    return value;
  });
  systemProfileInFlight.set(key, request);
  try { return await request; }
  finally { systemProfileInFlight.delete(key); }
}
function validMinecraftUsername(value) { return /^[A-Za-z0-9_]{3,16}$/.test(String(value || '').trim()); }
function primaryDisplayInfo() {
  try { const d = screen.getPrimaryDisplay(); return { width:d.size.width, height:d.size.height, workWidth:d.workAreaSize.width, workHeight:d.workAreaSize.height, scaleFactor:d.scaleFactor || 1, label:d.label || 'Monitor principal' }; } catch (_) { return { width:1920, height:1080, workWidth:1920, workHeight:1080, scaleFactor:1, label:'Monitor principal' }; }
}
function configWithDisplay(config) { const d=primaryDisplayInfo(); if (config.minecraft?.useSystemResolution !== false) return { ...config, minecraft:{...config.minecraft,width:d.width,height:d.height} }; return config; }
function portableSettings(config) {
  return {
    schema:1, exportedAt:new Date().toISOString(), launcherVersion:app.getVersion(),
    minecraft:{ username:config.minecraft?.username||'', maxMemoryMb:config.minecraft?.maxMemoryMb||6144, width:config.minecraft?.width||0, height:config.minecraft?.height||0, useSystemResolution:config.minecraft?.useSystemResolution!==false, fullscreen:Boolean(config.minecraft?.fullscreen), preset:config.minecraft?.preset||'balanced', autoInstallJava:config.minecraft?.autoInstallJava!==false, preferDedicatedGpu:config.minecraft?.preferDedicatedGpu!==false },
    pack:{ autoUpdate:config.pack?.autoUpdate!==false, repairBeforeLaunch:Boolean(config.pack?.repairBeforeLaunch), autoSnapshot:config.pack?.autoSnapshot!==false },
    launcher:{ hideOnGameStart:Boolean(config.launcher?.hideOnGameStart), refocusOnGameExit:config.launcher?.refocusOnGameExit!==false, background:config.launcher?.background||'frontline', backgroundMode:config.launcher?.backgroundMode||'fixed', theme:config.launcher?.theme||'aurora', density:config.launcher?.density||'comfortable', glassEffects:config.launcher?.glassEffects!==false, scanlines:Boolean(config.launcher?.scanlines), noise:Boolean(config.launcher?.noise), reducedMotion:Boolean(config.launcher?.reducedMotion), uiScale:config.launcher?.uiScale||'normal', startPage:config.launcher?.startPage||'home', rememberLastPage:Boolean(config.launcher?.rememberLastPage), autoConnectivityCheck:config.launcher?.autoConnectivityCheck!==false, closeToTray:config.launcher?.closeToTray!==false, startWithSystem:Boolean(config.launcher?.startWithSystem), startMinimized:Boolean(config.launcher?.startMinimized), nativeNotifications:config.launcher?.nativeNotifications!==false, sidebarCollapsed:Boolean(config.launcher?.sidebarCollapsed), lastSeenVersion:String(config.launcher?.lastSeenVersion||''), crashStreak:Number(config.launcher?.crashStreak||0) },
    mods:{ sort:config.mods?.sort||'recent', provider:config.mods?.provider||'modrinth', category:config.mods?.category||'all', environment:config.mods?.environment||'all', releaseChannel:config.mods?.releaseChannel||'release', autoCheckUpdates:config.mods?.autoCheckUpdates!==false, autoUpdateUserMods:Boolean(config.mods?.autoUpdateUserMods), compatibilityWarnings:config.mods?.compatibilityWarnings!==false, hideWarnings:Boolean(config.mods?.hideWarnings), protectServerCompatibility:config.mods?.protectServerCompatibility!==false, autoChangeSnapshots:config.mods?.autoChangeSnapshots!==false },
    sync:{ includeScreenshots:config.sync?.includeScreenshots!==false, includeSaves:Boolean(config.sync?.includeSaves), extraPaths:Array.isArray(config.sync?.extraPaths)?config.sync.extraPaths.slice(0,20):[] }
  };
}
function sanitizeImportedSettings(raw={}) {
  const out={};
  if(raw.minecraft&&typeof raw.minecraft==='object') {
    const m=raw.minecraft; const username=validMinecraftUsername(m.username)?String(m.username):store.load().minecraft.username;
    out.minecraft={ username, maxMemoryMb:Math.max(3072,Math.min(16384,Number(m.maxMemoryMb)||6144)), width:Math.max(0,Math.min(7680,Number(m.width)||0)), height:Math.max(0,Math.min(4320,Number(m.height)||0)), useSystemResolution:m.useSystemResolution!==false, fullscreen:Boolean(m.fullscreen), preset:['performance','balanced','quality'].includes(String(m.preset))?String(m.preset):'balanced', autoInstallJava:m.autoInstallJava!==false, preferDedicatedGpu:m.preferDedicatedGpu!==false };
  }
  if(raw.pack&&typeof raw.pack==='object') out.pack={ autoUpdate:raw.pack.autoUpdate!==false, repairBeforeLaunch:Boolean(raw.pack.repairBeforeLaunch), autoSnapshot:raw.pack.autoSnapshot!==false };
  if(raw.launcher&&typeof raw.launcher==='object') {
    const l=raw.launcher; const themes=new Set(['aurora','tactical','crimson','frost','obsidian','dvn','classic','dominion','nusia','ember','clean','neon','verdant','monolith']); const backgrounds=new Set(['frontline','night','canyon','anniversary','cyborg','dummies','orbit','laststand','vought','nightop','rooftop','tempest','urban']);
    out.launcher={ hideOnGameStart:Boolean(l.hideOnGameStart), refocusOnGameExit:l.refocusOnGameExit!==false, background:backgrounds.has(String(l.background))?String(l.background):'frontline', backgroundMode:['fixed','randomStartup','rotate5','rotate15'].includes(String(l.backgroundMode))?String(l.backgroundMode):'fixed', theme:themes.has(String(l.theme))?String(l.theme):'aurora', density:['comfortable','compact'].includes(String(l.density))?String(l.density):'comfortable', glassEffects:l.glassEffects!==false, scanlines:Boolean(l.scanlines), noise:Boolean(l.noise), reducedMotion:Boolean(l.reducedMotion), uiScale:['small','normal','large'].includes(String(l.uiScale))?String(l.uiScale):'normal', startPage:['home','mods','updates','modpack','support','settings'].includes(String(l.startPage))?String(l.startPage):'home', rememberLastPage:Boolean(l.rememberLastPage), autoConnectivityCheck:l.autoConnectivityCheck!==false, closeToTray:l.closeToTray!==false, startWithSystem:Boolean(l.startWithSystem), startMinimized:Boolean(l.startMinimized), nativeNotifications:l.nativeNotifications!==false, sidebarCollapsed:Boolean(l.sidebarCollapsed), lastSeenVersion:String(l.lastSeenVersion||''), crashStreak:Math.max(0,Math.min(9,Number(l.crashStreak||0))) };
  }
  if(raw.mods&&typeof raw.mods==='object') { const m=raw.mods; out.mods={ sort:['recent','oldest','az','size','favorites','updated'].includes(String(m.sort))?String(m.sort):'recent', provider:['modrinth','curseforge'].includes(String(m.provider))?String(m.provider):'modrinth', category:String(m.category||'all').slice(0,40), environment:['all','client','both','server'].includes(String(m.environment))?String(m.environment):'all', releaseChannel:['release','beta','alpha'].includes(String(m.releaseChannel))?String(m.releaseChannel):'release', autoCheckUpdates:m.autoCheckUpdates!==false, autoUpdateUserMods:Boolean(m.autoUpdateUserMods), compatibilityWarnings:m.compatibilityWarnings!==false, hideWarnings:Boolean(m.hideWarnings), protectServerCompatibility:m.protectServerCompatibility!==false, autoChangeSnapshots:m.autoChangeSnapshots!==false }; }
  if(raw.sync&&typeof raw.sync==='object'){const x=raw.sync;out.sync={includeScreenshots:x.includeScreenshots!==false,includeSaves:Boolean(x.includeSaves),extraPaths:Array.isArray(x.extraPaths)?x.extraPaths.map(v=>String(v).slice(0,180)).slice(0,20):[]};}
  return out;
}

async function runExclusive(name, fn) {
  if (activeOperation) throw new Error(`Ya hay una operación en curso: ${activeOperation}.`);
  activeOperation = name;
  try { return await fn(); }
  finally { activeOperation = ''; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1); }
}

async function statePayload() {
  const config = store.load();
  let manifestInfo;
  try { manifestInfo = await currentManifest(config); }
  catch (err) {
    manifestInfo = {
      manifest: JSON.parse(await fsp.readFile(path.join(resourcesDir(), 'manifest.example.json'), 'utf8')),
      configured: false, source: 'error', error: err.message
    };
  }
  const java = await resolveJava17(config.minecraft.javaPath || '', managedJavaRoot());
  const username = String(config.minecraft.username || '').trim();
  const minimumLauncher = String(manifestInfo.manifest?.minimumLauncher || '0.0.0');
  const system = await cachedSystemProfile(config.pack.installDirectory).catch(() => null);
  if (system) system.display = primaryDisplayInfo();
  const effectiveConfig = configWithDisplay(config);
  return {
    appVersion: app.getVersion(), platform: process.platform, packaged: app.isPackaged,
    config: effectiveConfig, manifest: manifestInfo.manifest, manifestConfigured: manifestInfo.configured,
    manifestSource: manifestInfo.source, manifestError: manifestInfo.error || '', manifestStale: Boolean(manifestInfo.stale), manifestCachedAt: manifestInfo.cachedAt || '', java, system,
    minimumLauncher, launcherCompatible: versionAtLeast(app.getVersion(), minimumLauncher),
    needsOnboarding: !config.onboarding?.completed || !validMinecraftUsername(username) || username.toLowerCase() === 'player',
    launcherUpdateConfigured: Boolean(config.launcher?.updateFeedUrl),
    developer: developerService ? developerService.status() : { configured:false, unlocked:false, curseforgeConfigured:false },
    account: authService ? authService.status() : { authenticated:false, name:'', id:'' },
    operation: activeOperation || '', configRecovery: store.recoveryInfo ? store.recoveryInfo() : null
  };
}

async function checkPack(config, info) {
  if (!info.configured) {
    const system = await cachedSystemProfile(config.pack.installDirectory, 0).catch(() => null);
    return {
      configured: false, state: { version: null }, expectedVersion: info.manifest?.version || 'DEV',
      versionMatches: false, total: 0, ok: 0, missing: [], changed: [], remove: [], healthy: false,
      bytesRequired: 0, system, cache: await cacheStats(config.pack.installDirectory).catch(() => ({ files: 0, bytes: 0 }))
    };
  }
  const status = await checkInstallation(config.pack.installDirectory, info.manifest, (p) => packProgress(p));
  const system = await cachedSystemProfile(config.pack.installDirectory, status.bytesRequired).catch(() => null);
  const cache = await cacheStats(config.pack.installDirectory).catch(() => ({ files: 0, bytes: 0 }));
  return { configured: true, ...status, system, cache };
}

async function updatePack(config, force = false) {
  const info = await currentManifest(config);
  if (!info.configured) throw new Error('El canal del modpack todavía no está publicado.');
  if (!versionAtLeast(app.getVersion(), info.manifest.minimumLauncher || '0.0.0')) {
    throw new Error(`Este modpack requiere Eternal Craft Launcher ${info.manifest.minimumLauncher} o superior.`);
  }
  const before = await checkInstallation(config.pack.installDirectory, info.manifest, (p) => packProgress(p));
  if (!force && before.healthy) {
    const system = await cachedSystemProfile(config.pack.installDirectory, 0).catch(() => null);
    const cache = await cacheStats(config.pack.installDirectory).catch(() => ({ files: 0, bytes: 0 }));
    return { configured: true, updated: false, ...before, system, cache };
  }
  const changeCount = (before.missing?.length || 0) + (before.changed?.length || 0) + (before.remove?.length || 0);
  if (changeCount > 0 && config.pack.autoSnapshot !== false) {
    await createSnapshot(config.pack.installDirectory, info.manifest, `Antes de actualizar a ${info.manifest.version || 'nueva versión'}`).catch(() => null);
  }
  const repaired = await repairInstallation(config.pack.installDirectory, info.manifest, (p) => packProgress(p));
  const system = await cachedSystemProfile(config.pack.installDirectory, 0).catch(() => null);
  const cache = await cacheStats(config.pack.installDirectory).catch(() => ({ files: 0, bytes: 0 }));
  return { configured: true, updated: true, ...repaired, system, cache };
}

async function ensurePlayableJava(config) {
  let java = await resolveJava17(config.minecraft.javaPath || '', managedJavaRoot());
  if (java.found && supportedJava(java.major)) return java;
  if (config.minecraft.autoInstallJava === false) {
    throw new Error(`Eternal Craft necesita Java 17 o superior. Detectado: ${java.version || 'ninguno'}. Elegí un Java compatible en Ajustes.`);
  }
  java = await ensureJava17(config.minecraft.javaPath || '', managedJavaRoot(), (p) => packProgress(p));
  store.save({ minecraft: { javaPath: java.path, autoInstallJava: true } });
  return java;
}

async function recordUserChange(config, event) {
  try { return await recordChange(config.pack.installDirectory, event); } catch (_) { return null; }
}
async function maybeSnapshotBeforeModChange(config, manifest, label) {
  if (config.mods?.autoChangeSnapshots === false) return null;
  try { return await createSnapshot(config.pack.installDirectory, manifest, label); } catch (_) { return null; }
}

function registerIpc() {
  ipcMain.handle('app:get-state', statePayload);

  ipcMain.handle('onboarding:complete', async (_event, payload = {}) => {
    const username = String(payload.username || '').trim();
    if (!validMinecraftUsername(username)) throw new Error('El nick debe tener entre 3 y 16 caracteres y usar solo letras, números o _.');
    const current = store.load();
    const system = await cachedSystemProfile(current.pack.installDirectory).catch(() => null);
    const recommendedMb = Number(system?.recommendedRamGb || 6) * 1024;
    const display = primaryDisplayInfo();
    store.save({ minecraft: { username, maxMemoryMb: recommendedMb, width: display.width, height: display.height, useSystemResolution: true }, onboarding: { completed: true } });
    return statePayload();
  });

  ipcMain.handle('server:ping', async () => {
    const config = store.load();
    return pingMinecraftServer(config.server.host, Number(config.server.port || 25565));
  });
  ipcMain.handle('server:copy-address', async () => {
    const config = store.load();
    clipboard.writeText(`${config.server.host}:${config.server.port}`);
    return true;
  });

  ipcMain.handle('pack:check', async () => {
    const config = store.load(); const info = await currentManifest(config); return checkPack(config, info);
  });
  ipcMain.handle('pack:update', async (_event, force = false) => runExclusive('actualización del modpack', async () => { const result = await updatePack(store.load(), Boolean(force)); invalidateRuntimeCaches(); if (result.updated !== false) notifyNative('Eternal Craft actualizado', 'El modpack quedó listo para jugar.'); return result; }));
  ipcMain.handle('pack:repair', async () => runExclusive('reparación del modpack', async () => { const result = await updatePack(store.load(), true); invalidateRuntimeCaches(); notifyNative('Reparación completa', 'La instalación de Eternal Craft fue verificada.'); return result; }));

  ipcMain.handle('mods:list', async () => {
    const config = store.load(); const info = await currentManifest(config);
    return listMods(config.pack.installDirectory, info.manifest, config.mods?.sort || 'recent');
  });
  ipcMain.handle('mods:add', async () => {
    const config = store.load(); const info = await currentManifest(config);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Agregar mods a Eternal Craft',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mods de Minecraft', extensions: ['jar'] }]
    });
    if (result.canceled || !result.filePaths.length) return listMods(config.pack.installDirectory, info.manifest);
    const listing = await addMods(config.pack.installDirectory, result.filePaths, info.manifest);
    await recordUserChange(config,{type:'mod-install-local',title:'Mods locales agregados',detail:`${result.filePaths.length} archivo(s) .jar`,filenames:result.filePaths.map(p=>path.basename(p)),risk:'medium'});
    return listing;
  });
  ipcMain.handle('mods:toggle', async (_event, filename) => {
    const config = store.load(); const info = await currentManifest(config);
    const listing = await toggleMod(config.pack.installDirectory, filename, info.manifest);
    await recordUserChange(config,{type:'mod-toggle',title:'Estado de mod cambiado',detail:String(filename||''),filenames:[String(filename||'')],risk:'low'});
    return listing;
  });
  ipcMain.handle('mods:remove', async (_event, filename) => {
    const config = store.load(); const info = await currentManifest(config);
    await maybeSnapshotBeforeModChange(config,info.manifest,`Antes de quitar ${path.basename(String(filename||'mod'))}`);
    const listing = await removeMod(config.pack.installDirectory, filename, info.manifest);
    await recordUserChange(config,{type:'mod-remove',title:'Mod personal eliminado',detail:String(filename||''),filenames:[String(filename||'')],risk:'high'});
    return listing;
  });
  ipcMain.handle('mods:favorite', async (_event, filename) => {
    const config = store.load(); const info = await currentManifest(config);
    return toggleFavorite(config.pack.installDirectory, filename, info.manifest);
  });
  ipcMain.handle('mods:pin', async (_event, filename) => {
    const config = store.load(); const info = await currentManifest(config);
    const result = await togglePin(config.pack.installDirectory, filename, info.manifest);
    await recordUserChange(config,{type:'mod-pin',title:result.pinned?'Versión de mod fijada':'Versión de mod liberada',detail:String(filename||''),filenames:[String(filename||'')],risk:'low'});
    return result;
  });
  ipcMain.handle('mods:set-all-enabled', async (_event, enabled) => {
    const config = store.load(); const info = await currentManifest(config);
    await maybeSnapshotBeforeModChange(config,info.manifest,enabled?'Antes de activar mods personales':'Antes de desactivar mods personales');
    const result = await setAllUserModsEnabled(config.pack.installDirectory, info.manifest, Boolean(enabled));
    await recordUserChange(config,{type:enabled?'mods-enable-all':'mods-disable-all',title:enabled?'Mods personales activados':'Mods personales desactivados',detail:`${result.changed?.length||0} cambios`,filenames:(result.changed||[]).map(x=>x.to||x.from),risk:'medium'});
    return result;
  });

  ipcMain.handle('mods:search', async (_event, payload = {}) => {
    const provider = String(payload.provider || 'modrinth'); const query = String(payload.query || '').trim();
    const options = {
      category:String(payload.category||'all'),
      environment:String(payload.environment||'all'),
      sort:String(payload.sort||'relevance'),
      offset:Math.max(0, Number(payload.offset||0)),
      limit:Math.max(1, Math.min(48, Number(payload.limit||36)))
    };
    if (provider === 'curseforge') { const cfg=store.load(); return searchCurseForge(query, developerService.getCurseForgeApiKey(), options, cfg.mods?.curseforgeProxyUrl || ''); }
    return { provider: 'modrinth', configured: true, results: await searchModrinth(query, options) };
  });
  ipcMain.handle('mods:plan', async (_event, project = {}) => {
    const cfg=store.load(); const info=await currentManifest(cfg);
    if(String(project.provider||'modrinth')!=='modrinth') return {provider:String(project.provider||''),blocked:false,items:[],needed:[],dependencies:[],totalSize:0,warnings:[{severity:'info',text:'El plan detallado está disponible para Modrinth.'}]};
    return planModrinthInstall(cfg.pack.installDirectory,info.manifest,project,cfg.mods?.releaseChannel||'release');
  });
  ipcMain.handle('mods:details', async (_event, project = {}) => {
    const cfg = store.load();
    return getModDetails(project, developerService.getCurseForgeApiKey(), cfg.mods?.curseforgeProxyUrl || '');
  });

  ipcMain.handle('mods:install', async (_event, project = {}) => runExclusive('instalación de mod', async () => {
    const config = store.load(); const info = await currentManifest(config);
    const installed = project.provider === 'curseforge'
      ? await installCurseForge(config.pack.installDirectory, info.manifest, project, developerService.getCurseForgeApiKey(), config.mods?.curseforgeProxyUrl || '')
      : await installModrinth(config.pack.installDirectory, info.manifest, project, new Set(), config.mods?.releaseChannel || 'release');
    await recordUserChange(config,{type:'mod-install',title:`Instalado ${project.name||'mod'}`,detail:`${installed.length||0} archivo(s), incluyendo dependencias`,filenames:installed,risk:'medium',source:String(project.provider||'modrinth')});
    return { installed, ...(await listMods(config.pack.installDirectory, info.manifest)) };
  }));

  ipcMain.handle('mods:identify-local', async () => runExclusive('identificación de mods locales', async () => {
    const config = store.load(); const info = await currentManifest(config);
    return identifyLocalModrinthMods(config.pack.installDirectory, info.manifest);
  }));

  ipcMain.handle('mods:updates-check', async () => {
    const config = store.load(); const info = await currentManifest(config);
    return checkModUpdates(config.pack.installDirectory, info.manifest, config.mods?.releaseChannel || 'release');
  });
  ipcMain.handle('mods:update-one', async (_event, filename) => runExclusive('actualización de mod', async () => {
    const config = store.load(); const info = await currentManifest(config);
    await maybeSnapshotBeforeModChange(config,info.manifest,`Antes de actualizar ${path.basename(String(filename||'mod'))}`);
    const result=await updateModrinthUserMod(config.pack.installDirectory, info.manifest, String(filename || ''), config.mods?.releaseChannel || 'release');
    if(result.updated) await recordUserChange(config,{type:'mod-update',title:'Mod personal actualizado',detail:`${result.oldFilename||filename} → ${result.newFilename||''}`,filenames:[String(result.oldFilename||filename),String(result.newFilename||'')].filter(Boolean),risk:'high',source:'modrinth'});
    return result;
  }));
  ipcMain.handle('mods:update-all', async () => runExclusive('actualización de mods', async () => {
    const config = store.load(); const info = await currentManifest(config);
    await maybeSnapshotBeforeModChange(config,info.manifest,'Antes de actualizar mods personales');
    const result=await updateAllUserMods(config.pack.installDirectory, info.manifest, config.mods?.releaseChannel || 'release');
    const files=(result.results||[]).filter(x=>x.updated).flatMap(x=>[x.oldFilename,x.newFilename]).filter(Boolean);
    await recordUserChange(config,{type:'mods-update-all',title:'Mods personales actualizados',detail:`${(result.results||[]).filter(x=>x.updated).length} mod(s) actualizados`,filenames:files,risk:'high',source:'modrinth'});
    return result;
  }));

  ipcMain.handle('mods:audit', async () => { const config=store.load(); const info=await currentManifest(config); return auditMods(config.pack.installDirectory, info.manifest); });
  ipcMain.handle('mods:history', async (_event, limit=25) => listChanges(store.load().pack.installDirectory, limit));
  ipcMain.handle('diagnostic:crash-guard', async () => {
    const config=store.load(); const last=config.launcher?.lastSession||{}; const diag=await quickDiagnostic(config);
    const since=last.startedAt ? new Date(new Date(last.startedAt).getTime()-30*60*1000).toISOString() : new Date(Date.now()-2*60*60*1000).toISOString();
    const recent=await changesSince(config.pack.installDirectory,since,30);
    const listing=await listMods(config.pack.installDirectory,(await currentManifest(config)).manifest,'recent');
    const userByFile=new Map((listing.mods||[]).filter(m=>m.userAdded).map(m=>[m.filename,m]));
    const suspects=[]; const seen=new Set();
    for(const change of recent){for(const file of change.filenames||[]){const base=path.basename(String(file)); const mod=userByFile.get(base)||userByFile.get(base.replace(/\.disabled$/i,'')); if(mod&&!seen.has(mod.filename)){seen.add(mod.filename);suspects.push({filename:mod.filename,name:mod.displayName,changeType:change.type,changedAt:change.at,risk:change.risk||'medium',enabled:mod.enabled,provider:mod.provider});}}}
    return {diagnostic:diag,crashStreak:Number(config.launcher?.crashStreak||0),lastSession:last,recentChanges:recent.slice(0,12),suspects:suspects.slice(0,8)};
  });
  ipcMain.handle('diagnostic:disable-suspects', async (_event, filenames=[]) => runExclusive('cuarentena de mods', async()=>{
    const config=store.load(); const info=await currentManifest(config); await maybeSnapshotBeforeModChange(config,info.manifest,'Antes de poner mods sospechosos en cuarentena');
    let listing=await listMods(config.pack.installDirectory,info.manifest,'recent'); const changed=[];
    for(const raw of Array.isArray(filenames)?filenames:[]){const mod=listing.mods.find(m=>m.userAdded&&m.enabled&&(m.filename===raw||m.baseFilename===raw)); if(!mod)continue; listing=await toggleMod(config.pack.installDirectory,mod.filename,info.manifest); changed.push(mod.filename);}
    if(changed.length) await recordUserChange(config,{type:'crash-quarantine',title:'Mods sospechosos puestos en cuarentena',detail:`${changed.length} mod(s) desactivados`,filenames:changed,risk:'medium'});
    return {changed,listing};
  }));

  ipcMain.handle('storage:cache-clear', async () => runExclusive('limpieza de caché', async () => clearCache(store.load().pack.installDirectory)));
  ipcMain.handle('storage:summary', async () => storageSummary(store.load().pack.installDirectory));
  ipcMain.handle('storage:cleanup-logs', async (_event, days=14) => cleanupLogs(store.load().pack.installDirectory, days));
  ipcMain.handle('vault:status', async () => {const cfg=store.load();return vaultStatus(cfg.pack.installDirectory,cfg.sync||{});});
  ipcMain.handle('vault:choose', async () => {const cfg=store.load();const result=await dialog.showOpenDialog(mainWindow,{title:'Elegir carpeta para Personal Vault',defaultPath:cfg.sync?.vaultDirectory||app.getPath('documents'),properties:['openDirectory','createDirectory']});if(result.canceled||!result.filePaths[0])return null;const next=store.save({sync:{vaultDirectory:result.filePaths[0]}});return {config:next,status:await vaultStatus(next.pack.installDirectory,next.sync||{})};});
  ipcMain.handle('vault:push', async () => runExclusive('sincronización de Personal Vault',async()=>{const cfg=store.load();return pushVault(cfg.pack.installDirectory,cfg.sync||{},os.hostname());}));
  ipcMain.handle('vault:pull', async (_event, force=false) => runExclusive('restauración de Personal Vault',async()=>{const cfg=store.load();if(force&&cfg.mods?.autoChangeSnapshots!==false){const info=await currentManifest(cfg);await createSnapshot(cfg.pack.installDirectory,info.manifest,'Antes de restaurar Personal Vault').catch(()=>null);}return pullVault(cfg.pack.installDirectory,cfg.sync||{},Boolean(force));}));
  ipcMain.handle('app:connectivity', async () => connectivityReport(store.load()));
  ipcMain.handle('settings:export', async () => {
    const result=await dialog.showSaveDialog(mainWindow,{title:'Exportar ajustes de Eternal Craft',defaultPath:'EternalCraft-Ajustes.json',filters:[{name:'Ajustes de Eternal Craft',extensions:['json']}]});
    if(result.canceled||!result.filePath)return null;
    await fsp.writeFile(result.filePath,JSON.stringify(portableSettings(store.load()),null,2),'utf8'); return result.filePath;
  });
  ipcMain.handle('settings:import', async () => {
    const result=await dialog.showOpenDialog(mainWindow,{title:'Importar ajustes de Eternal Craft',properties:['openFile'],filters:[{name:'Ajustes de Eternal Craft',extensions:['json']}]});
    if(result.canceled||!result.filePaths[0])return null;
    const raw=JSON.parse(await fsp.readFile(result.filePaths[0],'utf8')); const patch=sanitizeImportedSettings(raw);
    const next=store.save(patch); if(patch.launcher&&Object.prototype.hasOwnProperty.call(patch.launcher,'startWithSystem'))await applyStartupPreference(Boolean(next.launcher?.startWithSystem)); return next;
  });

  ipcMain.handle('recovery:list', async () => listSnapshots(store.load().pack.installDirectory));
  ipcMain.handle('recovery:create', async (_event, label = '') => runExclusive('punto de restauración', async () => {
    const cfg=store.load(); const info=await currentManifest(cfg);
    return createSnapshot(cfg.pack.installDirectory, info.manifest, String(label||'Punto manual'));
  }));
  ipcMain.handle('recovery:restore', async (_event, id) => runExclusive('restauración', async () => {
    const cfg=store.load(); const info=await currentManifest(cfg);
    const result=await restoreSnapshot(cfg.pack.installDirectory, info.manifest, id);
    return { result, mods: await listMods(cfg.pack.installDirectory, info.manifest, cfg.mods?.sort || 'recent') };
  }));
  ipcMain.handle('recovery:delete', async (_event, id) => deleteSnapshot(store.load().pack.installDirectory, id));

  ipcMain.handle('app:health-check', async () => {
    const cfg=store.load(); const info=await currentManifest(cfg);
    const [java, pack, server, diagnostic, mods, system] = await Promise.all([
      resolveJava17(cfg.minecraft.javaPath || '', managedJavaRoot()).catch(()=>({found:false})),
      info.configured ? checkInstallation(cfg.pack.installDirectory, info.manifest).catch(()=>null) : Promise.resolve(null),
      pingMinecraftServer(cfg.server.host,cfg.server.port).catch(()=>({online:false})),
      quickDiagnostic(cfg).catch(()=>({severity:'warn',title:'No se pudo revisar el último log',summary:''})),
      listMods(cfg.pack.installDirectory, info.manifest, cfg.mods?.sort || 'recent').catch(()=>({mods:[],counts:{}})),
      cachedSystemProfile(cfg.pack.installDirectory, 0).catch(()=>null)
    ]);
    const userMods=(mods.mods||[]).filter(m=>m.userAdded);
    const disabled=userMods.filter(m=>!m.enabled).length;
    const issues=[];
    if(!supportedJava(java.major) && cfg.minecraft.autoInstallJava===false) issues.push({type:'java',severity:'bad',text:'Falta Java 17 o superior'});
    if(pack && !pack.healthy) issues.push({type:'pack',severity:'warn',text:'El modpack necesita sincronización'});
    if(!server.online) issues.push({type:'server',severity:'warn',text:'El servidor está offline'});
    const freeBytes=Number(system?.disk?.freeBytes||0);
    if(freeBytes>0 && freeBytes<5*1024**3) issues.push({type:'disk',severity:freeBytes<2*1024**3?'bad':'warn',text:`Poco espacio libre (${Math.max(0,freeBytes/1024**3).toFixed(1)} GB)`});
    const assignedRamGb=Number(cfg.minecraft?.maxMemoryMb||0)/1024; const maxRam=Number(system?.maxRamGb||0);
    if(maxRam>0 && assignedRamGb>maxRam) issues.push({type:'memory',severity:'warn',text:`RAM asignada alta (${assignedRamGb.toFixed(0)} GB · sugerido hasta ${maxRam} GB)`});
    if(info.stale) issues.push({type:'network',severity:'warn',text:'Usando el último manifest guardado en caché'});
    if(diagnostic?.severity && diagnostic.severity!=='ok') issues.push({type:'log',severity:'warn',text:diagnostic.title||'Revisar último log'});
    const latency=Number(server.latency||0); const connectionQuality=!server.online?'offline':latency<=70?'excellent':latency<=130?'good':latency<=220?'fair':'poor';
    return { ok:issues.length===0, issues, javaOk:Boolean(java.found&&supportedJava(java.major)), packOk:Boolean(pack?.healthy), serverOnline:Boolean(server.online), userMods:userMods.length, disabledMods:disabled, favorites:Number(mods.counts?.favorites||0), diagnostic, system, connectionQuality, latency };
  });

  ipcMain.handle('java:install', async () => runExclusive('instalación de Java 17', async () => {
    const config = store.load();
    const java = await ensureJava17(config.minecraft.javaPath || '', managedJavaRoot(), (p) => packProgress(p));
    const next = store.save({ minecraft: { javaPath: java.path, autoInstallJava: true } });
    return { java, config: next };
  }));

  ipcMain.handle('game:preset-reset', async (_event, preset) => {
    const config = store.save({ minecraft: { preset: String(preset || 'balanced') } });
    return ensurePreset(config.pack.installDirectory, resourcesDir(), config.minecraft.preset, true);
  });

  ipcMain.handle('game:launch', async () => runExclusive('inicio de Minecraft', async () => {
    let config = configWithDisplay(store.load());
    const info = await currentManifest(config);
    if (!info.configured) throw new Error('Todavía no hay un modpack oficial publicado para el launcher.');
    if (!versionAtLeast(app.getVersion(), info.manifest.minimumLauncher || '0.0.0')) {
      throw new Error(`Actualizá el launcher primero. El pack requiere la versión ${info.manifest.minimumLauncher} o superior.`);
    }

    const java = await ensurePlayableJava(config);
    config = store.load();
    if (config.pack.autoUpdate) await updatePack(config, false);
    else if (config.pack.repairBeforeLaunch) {
      const status = await checkInstallation(config.pack.installDirectory, info.manifest, (p) => packProgress(p));
      if (!status.healthy) await repairInstallation(config.pack.installDirectory, info.manifest, (p) => packProgress(p));
    }
    if (config.mods?.autoUpdateUserMods) {
      packProgress({ phase: 'mods', current: 0, total: 1, file: 'Comprobando mods personales' });
      try { await updateAllUserMods(config.pack.installDirectory, info.manifest, config.mods?.releaseChannel || 'release'); }
      catch (err) { emit('game:log', `[launcher] No se pudieron actualizar mods personales: ${err.message || err}`); }
      packProgress({ phase: 'mods', current: 1, total: 1, file: 'Mods personales listos' });
    }

    config = store.save({ launcher: { lastPlayedAt: new Date().toISOString() } });
    const latest = await currentManifest(config);
    const premium = await authService.getAuthorization().catch((err) => {
      if (config.minecraft?.accountMode === 'premium') throw new Error(`No pude renovar la sesión premium: ${err.message || err}`);
      return null;
    });
    if (premium) config = { ...config, minecraft: { ...config.minecraft, username: premium.profile.name, accountMode:'premium', authorization:premium.authorization } };
    const launched = await launchGame({
      config, manifest: latest.manifest, resourcesDir: resourcesDir(), managedJavaRoot: managedJavaRoot(), javaInfo: java,
      onLog: (line) => emit('game:log', line), onProgress: (p) => packProgress(p),
      onExit: (session) => {
        const current = store.load(); const stats = current.launcher?.playStats || { totalMs:0, sessions:0, days:{} };
        const duration = Math.max(0, Number(session?.durationMs || 0)); const day = new Date().toISOString().slice(0,10);
        const days = { ...(stats.days || {}) }; days[day] = Number(days[day] || 0) + duration;
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-35); for(const key of Object.keys(days)){ const d=new Date(`${key}T00:00:00`); if(Number.isFinite(d.getTime())&&d<cutoff)delete days[key]; }
        const crashStreak = (session && Number.isInteger(session.code) && session.code!==0) ? Math.min(9,Number(current.launcher?.crashStreak||0)+1) : 0;
        const next = store.save({ launcher: { lastSession: session, crashStreak, playStats:{ totalMs:Number(stats.totalMs||0)+duration, sessions:Number(stats.sessions||0)+1, days } } });
        recordUserChange(next,{type:session?.code===0?'game-success':'game-crash',title:session?.code===0?'Sesión finalizada correctamente':'Minecraft se cerró inesperadamente',detail:`Código ${session?.code ?? '—'} · ${Math.round(duration/60000)} min`,filenames:[],risk:session?.code===0?'low':'high',source:'game'}).catch(()=>null);
        emit('game:exit', session);
        if (next.launcher?.refocusOnGameExit !== false && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show(); mainWindow.restore(); mainWindow.focus();
        }
      }
    });
    if (config.launcher.hideOnGameStart && mainWindow) mainWindow.hide();
    return launched;
  }));


  ipcMain.handle('game:safe-launch', async () => runExclusive('inicio seguro de Minecraft', async () => {
    let config = configWithDisplay(store.load());
    const info = await currentManifest(config);
    if (!info.configured) throw new Error('Todavía no hay un modpack oficial publicado para el launcher.');
    if (!versionAtLeast(app.getVersion(), info.manifest.minimumLauncher || '0.0.0')) throw new Error(`Actualizá el launcher primero. El pack requiere la versión ${info.manifest.minimumLauncher} o superior.`);
    const java = await ensurePlayableJava(config);
    if (config.pack.autoUpdate) await updatePack(config, false);
    config = store.save({ launcher: { lastPlayedAt: new Date().toISOString() } });
    const latest = await currentManifest(config);
    const safe = await prepareSafeMode(config.pack.installDirectory, latest.manifest);
    try {
      const launched = await launchGame({
        config, manifest: latest.manifest, resourcesDir: resourcesDir(), managedJavaRoot: managedJavaRoot(), javaInfo: java,
        onLog: (line) => emit('game:log', line), onProgress: (p) => packProgress(p),
        onExit: async (session) => {
          await restoreSafeMode(config.pack.installDirectory).catch(()=>null);
          emit('game:exit', { ...session, safeMode:true });
          if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.restore(); mainWindow.focus(); }
        }
      });
      if (config.launcher.hideOnGameStart && mainWindow) mainWindow.hide();
      return { ...launched, safeMode:true, disabledMods:safe.count };
    } catch (err) {
      await restoreSafeMode(config.pack.installDirectory).catch(()=>null);
      throw err;
    }
  }));

  ipcMain.handle('diagnostic:build', async () => {
    const config = store.load(); const { manifest } = await currentManifest(config);
    return buildDiagnostic(config, manifest, app.getVersion());
  });
  ipcMain.handle('diagnostic:quick', async () => quickDiagnostic(store.load()));
  ipcMain.handle('diagnostic:copy', async () => {
    const config = store.load(); const { manifest } = await currentManifest(config);
    const text = await buildDiagnostic(config, manifest, app.getVersion()); clipboard.writeText(text); return true;
  });
  ipcMain.handle('diagnostic:save', async () => {
    const config = store.load(); const { manifest } = await currentManifest(config);
    const text = await buildDiagnostic(config, manifest, app.getVersion());
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, { title: 'Guardar informe de soporte', defaultPath: `EternalCraft-Diagnostico-${stamp}.txt`, filters: [{ name:'Archivo de texto', extensions:['txt'] }] });
    if (result.canceled || !result.filePath) return null;
    await fsp.writeFile(result.filePath, text, 'utf8');
    return result.filePath;
  });

  ipcMain.handle('diagnostic:bundle', async () => {
    const config = store.load(); const info = await currentManifest(config);
    const [text, quick, connectivity, storage, mods, audit, system, changes, vault] = await Promise.all([
      buildDiagnostic(config, info.manifest, app.getVersion()).catch((err)=>`No se pudo generar diagnóstico: ${err.message||err}`),
      quickDiagnostic(config).catch(()=>null),
      connectivityReport(config).catch(()=>null),
      storageSummary(config.pack.installDirectory).catch(()=>null),
      listMods(config.pack.installDirectory, info.manifest, config.mods?.sort || 'recent').catch(()=>null),
      auditMods(config.pack.installDirectory, info.manifest).catch(()=>null),
      cachedSystemProfile(config.pack.installDirectory, 0).catch(()=>null),
      listChanges(config.pack.installDirectory, 30).catch(()=>[]),
      vaultStatus(config.pack.installDirectory, config.sync||{}).catch(()=>null)
    ]);
    const safeMods=(mods?.mods||[]).map((m)=>({ filename:m.filename, displayName:m.displayName, official:Boolean(m.official), userAdded:Boolean(m.userAdded), enabled:Boolean(m.enabled), provider:m.provider||'', versionName:m.versionName||'', projectId:m.projectId||'', size:Number(m.size||0) }));
    const bundle={
      schema:1, generatedAt:new Date().toISOString(), launcher:{version:app.getVersion(),platform:process.platform,arch:process.arch,packaged:app.isPackaged},
      settings:portableSettings(config), manifest:{version:info.manifest?.version||'',releaseName:info.manifest?.releaseName||'',minecraft:info.manifest?.minecraft||'',forge:info.manifest?.forge||'',minimumLauncher:info.manifest?.minimumLauncher||'',source:info.source||'',stale:Boolean(info.stale)},
      system:system?{platform:system.platform,arch:system.arch,totalMemoryBytes:system.totalMemoryBytes,freeMemoryBytes:system.freeMemoryBytes,recommendedRamGb:system.recommendedRamGb,maxRamGb:system.maxRamGb,gpus:system.gpus,disk:system.disk}:null,
      quickDiagnostic:quick, connectivity, storage, modAudit:audit, mods:safeMods, recentModChanges:(changes||[]).map(x=>({at:x.at,type:x.type,title:x.title,detail:x.detail,filenames:x.filenames,risk:x.risk,source:x.source})),
      personalVault:vault?{configured:Boolean(vault.configured),files:Number(vault.files||0),bytes:Number(vault.bytes||0),lastPush:vault.lastPush||'',sourceDevice:vault.sourceDevice||'',conflicts:Number(vault.conflicts?.length||0),paths:vault.paths||[]}:null,
      diagnosticText:text, launcherErrors:await tailLauncherErrorLog(),
      privacy:'No contiene contraseñas, API keys, tokens de GitHub, rutas del Personal Vault, mundos ni contenido de archivos de usuario.'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, { title:'Guardar paquete de soporte', defaultPath:`EternalCraft-Soporte-${stamp}.json`, filters:[{name:'Paquete de soporte Eternal Craft',extensions:['json']}] });
    if(result.canceled||!result.filePath)return null;
    await fsp.writeFile(result.filePath,JSON.stringify(bundle,null,2),'utf8'); return result.filePath;
  });

  ipcMain.handle('settings:save', async (_event, patch = {}) => {
    if (patch.minecraft?.useSystemResolution === true) { const d=primaryDisplayInfo(); patch={...patch,minecraft:{...patch.minecraft,width:d.width,height:d.height}}; }
    const next = store.save(patch);
    if (patch.pack?.manifestUrl || patch.developer?.githubRepo || patch.developer?.githubBranch) invalidateRuntimeCaches();
    if (patch.launcher && Object.prototype.hasOwnProperty.call(patch.launcher, 'startWithSystem')) await applyStartupPreference(Boolean(next.launcher?.startWithSystem));
    if (next.launcher?.closeToTray !== false) createTray();
    return next;
  });
  ipcMain.handle('settings:choose-install-dir', async () => {
    const current = store.load().pack.installDirectory;
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Elegir carpeta de Eternal Craft', defaultPath: current, properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const config = store.save({ pack: { installDirectory: result.filePaths[0] } });
    await fsp.mkdir(config.pack.installDirectory, { recursive: true });
    return config.pack.installDirectory;
  });

  ipcMain.handle('account:status', async () => authService.status());
  ipcMain.handle('account:login', async () => runExclusive('inicio de sesión Microsoft', async () => {
    const result = await authService.login();
    store.save({ minecraft: { username: result.name, accountMode:'premium' } });
    return result;
  }));
  ipcMain.handle('account:logout', async () => {
    const result = authService.logout();
    store.save({ minecraft: { accountMode:'offline' } });
    return result;
  });
  ipcMain.handle('developer:status', async () => developerService.status());
  ipcMain.handle('developer:preflight', async () => { const cfg=store.load(); return developerService.preflight(cfg.developer?.sourceDirectory, cfg.developer?.testDirectory, cfg.developer?.githubRepo); });
  ipcMain.handle('developer:backup-source', async () => { const cfg=store.load(); return developerService.backupSourceMods(cfg.developer?.sourceDirectory); });
  ipcMain.handle('developer:setup', async (_event, password) => developerService.setup(password));
  ipcMain.handle('developer:unlock', async (_event, password) => developerService.unlock(password));
  ipcMain.handle('developer:reset-access', async () => developerService.resetAccess());
  ipcMain.handle('developer:lock', async () => developerService.lock());
  ipcMain.handle('developer:change-password', async (_event, payload = {}) => developerService.changePassword(payload.currentPassword, payload.nextPassword));
  ipcMain.handle('developer:set-curseforge-key', async (_event, key) => developerService.setCurseForgeApiKey(key));
  ipcMain.handle('developer:choose-source', async () => {
    const cfg = store.load(); const folder = await developerService.chooseSource(dialog, mainWindow, cfg.developer?.sourceDirectory);
    if (folder) store.save({ developer: { sourceDirectory: folder } }); return folder;
  });
  ipcMain.handle('developer:choose-test', async () => {
    const cfg = store.load(); const fallback = path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    const folder = await developerService.chooseTest(dialog, mainWindow, cfg.developer?.testDirectory || fallback);
    if (folder) store.save({ developer: { testDirectory: folder } }); return folder;
  });
  ipcMain.handle('developer:open-test', async () => {
    developerService.requireUnlocked(); const cfg=store.load(); const folder=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    const root=developerService.resolveRoot(folder); await fsp.mkdir(path.join(root,'mods'),{recursive:true}); return shell.openPath(root);
  });
  ipcMain.handle('developer:launch-test', async () => runExclusive('inicio de test-1', async () => {
    developerService.requireUnlocked(); let cfg=configWithDisplay(store.load());
    const testCandidate=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1'); const test=developerService.resolveRoot(testCandidate);
    const info=await currentManifest(cfg); const java=await ensurePlayableJava(cfg);
    cfg={...cfg,pack:{...cfg.pack,installDirectory:test},launcher:{...cfg.launcher,hideOnGameStart:false}};
    return launchGame({
      config:cfg, manifest:info.manifest, resourcesDir:resourcesDir(), managedJavaRoot:managedJavaRoot(), javaInfo:java,
      onLog:(line)=>emit('game:log',{...line,test:true}), onProgress:(p)=>packProgress(p),
      onExit:(session)=>{ emit('game:exit',{...session,test:true}); if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.show();mainWindow.restore();mainWindow.focus();} }
    });
  }));
  ipcMain.handle('developer:copy-mod-test', async (_event, filename) => {
    developerService.requireUnlocked(); const cfg=store.load(); const test=developerService.resolveRoot(cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1'));
    const target=await copyModToRoot(cfg.pack.installDirectory,test,filename); return {ok:true,target};
  });
  ipcMain.handle('developer:sync-test-mods', async () => {
    developerService.requireUnlocked(); const cfg=store.load(); const testCandidate=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1'); const test=developerService.resolveRoot(testCandidate);
    const info=await currentManifest(cfg); const listing=await listMods(cfg.pack.installDirectory,info.manifest,'recent'); const copied=[];
    for(const mod of listing.mods.filter(m=>m.userAdded&&m.enabled)){ await copyModToRoot(cfg.pack.installDirectory,test,mod.filename); copied.push(mod.filename); }
    return {ok:true,copied,testDirectory:test};
  });
  ipcMain.handle('developer:install-mod-test', async (_event, project = {}) => runExclusive('instalación de mod en test-1', async () => {
    developerService.requireUnlocked(); const cfg=store.load(); const test=developerService.resolveRoot(cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1'));
    const installed = project.provider === 'curseforge' ? await installCurseForge(test,{files:[]},project,developerService.getCurseForgeApiKey(), cfg.mods?.curseforgeProxyUrl || '') : await installModrinth(test,{files:[]},project,new Set(),cfg.mods?.releaseChannel||'release');
    return {ok:true,installed,testDirectory:test};
  }));
  ipcMain.handle('developer:publish-preview', async (_event, payload = {}) => runExclusive('preview de publicación', async () => {
    const current = store.load(); const repo = String(payload.repo || current.developer?.githubRepo || '').trim();
    const source = String(payload.source || current.developer?.sourceDirectory || '').trim() || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    return developerService.previewPublish({ repo, source, version: String(payload.version || '').trim(), notes: String(payload.notes || ''), onLine: (line) => emit('developer:publish-log', line) });
  }));
  ipcMain.handle('developer:test-compare', async () => {
    developerService.requireUnlocked(); const cfg=store.load();
    const source=cfg.developer?.sourceDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    const test=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    return developerService.compareTest(source,test);
  });
  ipcMain.handle('developer:test-promote', async (_event, filename) => {
    developerService.requireUnlocked(); const cfg=store.load();
    const source=cfg.developer?.sourceDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    const test=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    return developerService.promoteTestMod(source,test,String(filename||''));
  });

  ipcMain.handle('developer:test-promote-all', async () => runExclusive('promoción de mods de test-1', async () => {
    const cfg=store.load(); const source=cfg.developer?.sourceDirectory; const test=cfg.developer?.testDirectory;
    if(!source||!test) throw new Error('Configurá las instancias SIEGE y test-1.');
    const diff=developerService.compareTest(source,test);
    const names=[...(diff.testOnly||[]).map(x=>x.name),...(diff.changed||[]).map(x=>x.name)];
    const promoted=[];
    for(const name of names){ await developerService.promoteTestMod(source,test,name); promoted.push(name); }
    return { promoted, diff:developerService.compareTest(source,test) };
  }));

  ipcMain.handle('developer:publish', async (_event, payload = {}) => runExclusive('publicación del modpack', async () => {
    const current = store.load();
    const repo = String(payload.repo || current.developer?.githubRepo || '').trim();
    const source = String(payload.source || current.developer?.sourceDirectory || '').trim() || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    const cfg = store.save({ developer: { githubRepo: repo, sourceDirectory: source } });
    const result = await developerService.publish({ repo, source, version: String(payload.version || '').trim(), notes: String(payload.notes || ''), expectedFingerprint: String(payload.expectedFingerprint || ''), onLine: (line) => emit('developer:publish-log', line) });
    if (repo.includes('/')) {
      const branch = cfg.developer?.githubBranch || 'main';
      store.save({ pack: { manifestUrl: `https://raw.githubusercontent.com/${repo}/${branch}/channel/stable.json` } });
    }
    invalidateRuntimeCaches();
    return { ...result, state: await statePayload() };
  }));

  ipcMain.handle('launcher:update-check', async () => {
    if (!app.isPackaged) return { configured: false, development: true };
    return checkLauncherUpdate(store.load(), updateEvent);
  });
  ipcMain.handle('launcher:update-download', async () => {
    if (!app.isPackaged) throw new Error('Las actualizaciones del launcher se prueban en una build empaquetada.');
    return downloadLauncherUpdate(store.load(), updateEvent);
  });
  ipcMain.handle('launcher:update-install', async () => { installLauncherUpdate(); return true; });

  ipcMain.handle('shell:open-instance', async () => {
    const folder = store.load().pack.installDirectory; await fsp.mkdir(folder, { recursive: true }); return shell.openPath(folder);
  });
  ipcMain.handle('shell:open-logs', async () => {
    const folder = path.join(store.load().pack.installDirectory, 'logs'); await fsp.mkdir(folder, { recursive: true }); return shell.openPath(folder);
  });
  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('URL no permitida'); await shell.openExternal(url); return true;
  });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize-toggle', () => { if (!mainWindow) return; mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
  ipcMain.on('window:close', () => mainWindow?.close());
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv=[]) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
    if(argv.includes('--play')) emit('ui:command','play'); else if(argv.includes('--updates')) emit('ui:command','updates');
  });

  app.whenReady().then(() => {
    store = new ConfigStore({ defaultsPath: path.join(resourcesDir(), 'default-config.json'), userDataDir: app.getPath('userData') });
    launcherErrorLog = path.join(app.getPath('userData'), 'launcher-errors.log');
    process.on('uncaughtExceptionMonitor', (err) => { appendLauncherError('uncaughtException', err); });
    process.on('unhandledRejection', (reason) => { appendLauncherError('unhandledRejection', reason); });
    if (process.platform === 'linux') { const os=require('os'); const cfg=store.load(); const devPatch={}; if(!cfg.developer?.sourceDirectory)devPatch.sourceDirectory=path.join(os.homedir(),'.sklauncher','instances','siege'); if(!cfg.developer?.testDirectory)devPatch.testDirectory=path.join(os.homedir(),'.sklauncher','instances','test-1'); if(Object.keys(devPatch).length)store.save({developer:devPatch}); }
    developerService = new DeveloperService(app.getPath('userData'), scriptsDir());
    authService = new AuthService(app.getPath('userData'));
    applyWindowsTasks();
    restoreSafeMode(store.load().pack.installDirectory).catch(()=>null);
    registerIpc(); createTray(); createWindow();
    applyStartupPreference(Boolean(store.load().launcher?.startWithSystem)).catch(()=>null);
    mainWindow.webContents.once('did-finish-load', () => {
      const config = store.load();
      if(process.argv.includes('--play')) setTimeout(()=>emit('ui:command','play'),350); else if(process.argv.includes('--updates')) setTimeout(()=>emit('ui:command','updates'),350);
      if (app.isPackaged && config.launcher?.autoUpdate && config.launcher?.updateFeedUrl) {
        setTimeout(() => checkLauncherUpdate(config, updateEvent).catch((err) => updateEvent({ type: 'error', message: err.message })), 2200);
      }
    });
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => { const keep=Boolean(tray && store?.load?.().launcher?.closeToTray !== false); if (process.platform !== 'darwin' && !keep) app.quit(); });
