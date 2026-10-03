const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, screen, Tray, Menu, Notification } = require('electron');
const { ConfigStore, deepMerge } = require('./services/configStore');
const { pingMinecraftServer } = require('./services/serverPing');
const { getManifest, getManifestQuick } = require('./services/manifestService');
const { checkInstallation, repairInstallation, cacheStats, clearCache, markPublishedOfficial, readState } = require('./services/packService');
const { resolveJava17, ensureJava17, supportedJava } = require('./services/javaService');
const { buildDiagnostic, quickDiagnostic } = require('./services/diagnostics');
const { launchGame } = require('./services/gameService');
const { ensurePreset } = require('./services/gamePresetService');
const { systemProfile } = require('./services/systemService');
const { checkLauncherUpdate, downloadLauncherUpdate, cancelLauncherUpdate, installLauncherUpdate, getLauncherUpdateState } = require('./services/updateService');
const { listMods, addMods, toggleMod, removeMod, toggleFavorite, togglePin, setAllUserModsEnabled, copyModToRoot, auditMods } = require('./services/modService');
const { normalizeVariant, DEVELOPER_VARIANT } = require('./launcherVariant');
const { GameSessionTracker, windowCloseAction, gameExitAction } = require('./services/gameLifecycle');
const { playUpdateDecision } = require('./services/playDecision');
const { AuthService } = require('./services/authService');
const { listSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot } = require('./services/recoveryService');
const { prepareSafeMode, restoreSafeMode } = require('./services/safeModeService');
const { storageSummary, cleanupLogs } = require('./services/storageService');
const { connectivityReport } = require('./services/connectivityService');
const { recordChange, listChanges, changesSince } = require('./services/changeHistoryService');
const { vaultStatus, pushVault, pullVault } = require('./services/vaultService');
const { listMedia, isAllowedFile } = require('./services/mediaService');


let mainWindow;
let tray;
let store;
let activeOperation = '';
let developerService;
let developerIntegration = null;
let launcherVariant = 'public';
let authService;
let isQuitting = false;
let appStarted = false;
let closeRequestedDuringGame = false;
let nativeUpdateNotified = false;
let packCheckInFlight = null;
const packIntegrityInFlight = new Map();
let playManifestInFlight = null;
let windowSaveTimer = null;
const gameSessions = new GameSessionTracker((session) => { void handleGameSessionExit(session); });

// Several renderer panels ask for the same data during boot. Keep a very
// short-lived cache and share in-flight requests so those panels do not race
// each other or repeat expensive disk/network work.
const manifestCache = new Map();
const manifestInFlight = new Map();
const quickManifestInFlight = new Map();
const systemProfileCache = new Map();
const systemProfileInFlight = new Map();
const RUNTIME_CACHE_TTL_MS = 2500;
// Raw GitHub can briefly serve the previous stable.json after a successful
// publish. Keep the verified local manifest authoritative for that short
// propagation window so the developer's own mods are not shown as personal.
const PRIMED_MANIFEST_TTL_MS = 60 * 1000;
let runtimeCacheGeneration = 0;

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

// A detached desktop launch can outlive the terminal that started it. Electron
// still writes rejected IPC calls to stderr; once that terminal closes Node
// emits EPIPE and treats it as an uncaught exception. Keep the launcher alive
// so one rejected page request cannot blank every other view.
for (const stream of [process.stdout, process.stderr]) {
  if (stream && typeof stream.on === 'function') {
    stream.on('error', (error) => {
      if (error?.code !== 'EPIPE') appendLauncherError('process stream', error);
    });
  }
}

// A rejected IPC call can be reported after the terminal/parent process has
// already closed its pipe. Electron surfaces that write as an uncaught
// exception even though it is unrelated to the launcher state. Treat only
// this transport failure as recoverable; every other exception keeps the
// normal crash path and is recorded by the handler installed during startup.
process.on('uncaughtException', (error) => {
  if (error?.code === 'EPIPE') return;
  void appendLauncherError('uncaughtException', error);
  setTimeout(() => { if (app.isReady() && !isQuitting) app.quit(); }, 0);
});

function resourcesDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '..', '..', 'resources');
}
function rendererPath(file) { return path.join(__dirname, '..', 'renderer', file); }
function scriptsDir() { return app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(__dirname, '..', '..', 'scripts'); }
function managedJavaRoot() { return path.join(app.getPath('userData'), 'runtime', 'java17'); }
function emit(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    mainWindow.webContents.send(channel, payload);
    return true;
  } catch (error) {
    // A background update can finish while the window is closing. Electron
    // may surface that race as EPIPE; it must not become a launcher error.
    if (error?.code !== 'EPIPE') void appendLauncherError(`ipc emit:${channel}`, error);
    return false;
  }
}
function setWindowVisible(visible) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (visible) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  } else {
    mainWindow.hide();
  }
  emit('window:visibility', { visible: Boolean(visible) });
  return true;
}
function showMainWindow() { return setWindowVisible(true); }
function hideMainWindow() { return setWindowVisible(false); }
function notifyNative(title, body) {
  try {
    const cfg = store?.load?.();
    if (cfg?.launcher?.nativeNotifications === false || !Notification.isSupported()) return;
    new Notification({ title, body, icon: path.join(resourcesDir(), 'icons', 'icon.png') }).show();
  } catch (_) {}
}
function launcherUpdateSnapshot() {
  const state = getLauncherUpdateState();
  if (launcherVariant !== DEVELOPER_VARIANT) return state;
  return { ...state, type:'unconfigured', info:null, progress:null, error:'La build Developer no usa el canal público de actualizaciones.' };
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
      preload: path.join(app.getAppPath(), 'build', 'preload', launcherVariant === DEVELOPER_VARIANT ? 'developer.cjs' : 'public.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true
    }
  };
  if (Number.isFinite(saved?.x)) opts.x = saved.x;
  if (Number.isFinite(saved?.y)) opts.y = saved.y;
  mainWindow = new BrowserWindow(opts);
  let rendererLoadAttempts = 0;
  const loadRenderer = () => {
    rendererLoadAttempts += 1;
    mainWindow.loadFile(rendererPath('index.html')).catch((error) => {
      appendLauncherError('renderer load-file', { attempt: rendererLoadAttempts, error });
    });
  };
  mainWindow.webContents.on('did-finish-load', () => { rendererLoadAttempts = 0; });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) appendLauncherError('renderer did-fail-load', { code, description, url });
    if (isMainFrame && rendererLoadAttempts < 3 && !mainWindow.isDestroyed()) {
      const attempt = rendererLoadAttempts;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) loadRenderer();
      }, 250 * attempt);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appendLauncherError('renderer render-process-gone', details);
    if (details?.reason === 'crashed' && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.reload();
      }, 250);
    }
  });
  loadRenderer();
  mainWindow.once('ready-to-show', () => {
    if (cfg.launcher?.windowMaximized) mainWindow.maximize();
    const startup = process.argv.includes('--startup');
    if (startup && cfg.launcher?.startMinimized) hideMainWindow(); else showMainWindow();
  });
  const saveWindowState = () => {
    clearTimeout(windowSaveTimer); windowSaveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const maximized = mainWindow.isMaximized();
      const bounds = maximized ? (store.load().launcher?.windowBounds || mainWindow.getNormalBounds()) : mainWindow.getBounds();
      store.save({ launcher: { windowBounds: bounds, windowMaximized: maximized } });
    }, 180);
  };
  mainWindow.on('resize', saveWindowState); mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', () => { emit('window:maximized', true); saveWindowState(); });
  mainWindow.on('unmaximize', () => { emit('window:maximized', false); saveWindowState(); });
  mainWindow.on('minimize', () => emit('window:visibility', { visible:false }));
  mainWindow.on('restore', () => emit('window:visibility', { visible:true }));
  mainWindow.on('close', (event) => {
    try { if (!mainWindow.isMaximized()) store.save({ launcher: { windowBounds: mainWindow.getBounds(), windowMaximized: false } }); } catch (_) {}
    const action = windowCloseAction({ quitting: isQuitting, activeGames: gameSessions.size });
    if (action === 'hide') {
      event.preventDefault();
      closeRequestedDuringGame = true;
      hideMainWindow();
      return;
    }
    if (action === 'quit') {
      isQuitting = true;
      app.quit();
    }
  });
  mainWindow.once('closed', () => {
    clearTimeout(windowSaveTimer);
    mainWindow = null;
    if (gameSessions.size > 0) closeRequestedDuringGame = true;
    else if (!isQuitting) { isQuitting = true; app.quit(); }
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

async function currentManifest(config, { quick = false } = {}) {
  const key = `${String(process.env.ETERNAL_PACK_MANIFEST || '').trim()}|${String(config.pack?.manifestUrl || '').trim()}`;
  const now = Date.now();
  const cached = manifestCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const inflight = quick ? quickManifestInFlight : manifestInFlight;
  if (inflight.has(key)) return inflight.get(key);
  const generation = runtimeCacheGeneration;
  const request = (async () => {
    const localPath = path.join(resourcesDir(), 'manifest.example.json');
    let info;
    try {
      const cachePath = path.join(app.getPath('userData'), 'cache', 'stable-manifest.json');
      info = quick
        ? await getManifestQuick(config, localPath, cachePath)
        : await getManifest(config, localPath, cachePath);
    } catch (error) {
      // A missing/unreachable channel must not blank a page. A quick read is
      // deliberately bounded and can fall back to the installed local pack.
      const manifest = JSON.parse(await fsp.readFile(localPath, 'utf8'));
      info = { manifest, configured: false, source: 'fallback', stale: false, error: error.message || String(error) };
    }
    const value = { ...info, source: info.configured ? (process.env.ETERNAL_PACK_MANIFEST ? 'development' : (info.source || 'remote')) : 'fallback' };
    // A publish/update may invalidate the cache while this request is still
    // in flight. Do not let the older response repopulate stale state.
    if (generation === runtimeCacheGeneration) manifestCache.set(key, { value, expiresAt: Date.now() + RUNTIME_CACHE_TTL_MS });
    return value;
  })();
  inflight.set(key, request);
  try { return await request; }
  finally { inflight.delete(key); }
}
function primeManifestCache(config, manifest, source = 'remote') {
  if (!manifest || !Array.isArray(manifest.files)) return;
  const key = `${String(process.env.ETERNAL_PACK_MANIFEST || '').trim()}|${String(config.pack?.manifestUrl || '').trim()}`;
  manifestCache.set(key, {
    value: { manifest, configured: true, source, stale: false },
    expiresAt: Date.now() + PRIMED_MANIFEST_TTL_MS
  });
}
function invalidateRuntimeCaches() {
  runtimeCacheGeneration += 1;
  manifestCache.clear();
  systemProfileCache.clear();
}
async function cachedSystemProfile(installDirectory, bytesRequired = 0) {
  const key = `${path.resolve(String(installDirectory || app.getPath('userData')))}|${Number(bytesRequired || 0)}`;
  const now = Date.now();
  const cached = systemProfileCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (systemProfileInFlight.has(key)) return systemProfileInFlight.get(key);
  const generation = runtimeCacheGeneration;
  const request = systemProfile(installDirectory, bytesRequired).then((value) => {
    if (generation === runtimeCacheGeneration) systemProfileCache.set(key, { value, expiresAt: Date.now() + RUNTIME_CACHE_TTL_MS });
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
    launcher:{ hideOnGameStart:config.launcher?.hideOnGameStart!==false, refocusOnGameExit:config.launcher?.refocusOnGameExit!==false, background:config.launcher?.background||'frontline', backgroundMode:config.launcher?.backgroundMode||'fixed', backgroundBrightness:Math.max(.7,Math.min(1.2,Number(config.launcher?.backgroundBrightness)||1)), theme:config.launcher?.theme||'aurora', density:config.launcher?.density||'comfortable', glassEffects:config.launcher?.glassEffects!==false, scanlines:Boolean(config.launcher?.scanlines), noise:Boolean(config.launcher?.noise), reducedMotion:Boolean(config.launcher?.reducedMotion), uiScale:config.launcher?.uiScale||'normal', accent:String(config.launcher?.accent||''), accent2:String(config.launcher?.accent2||''), cardRadius:Number(config.launcher?.cardRadius||16), clipsDirectory:String(config.launcher?.clipsDirectory||''), galleryView:{query:String(config.launcher?.galleryView?.query||'').slice(0,120),type:['all','image','video'].includes(config.launcher?.galleryView?.type)?config.launcher.galleryView.type:'all',sort:['newest','oldest','name','size'].includes(config.launcher?.galleryView?.sort)?config.launcher.galleryView.sort:'newest'}, startPage:config.launcher?.startPage||'home', rememberLastPage:Boolean(config.launcher?.rememberLastPage), autoConnectivityCheck:config.launcher?.autoConnectivityCheck!==false, startWithSystem:Boolean(config.launcher?.startWithSystem), startMinimized:Boolean(config.launcher?.startMinimized), nativeNotifications:config.launcher?.nativeNotifications!==false, sidebarCollapsed:Boolean(config.launcher?.sidebarCollapsed), lastSeenVersion:String(config.launcher?.lastSeenVersion||''), crashStreak:Number(config.launcher?.crashStreak||0) },
    mods:{ sort:config.mods?.sort||'recent', allowUserMods:config.mods?.allowUserMods!==false, compatibilityWarnings:config.mods?.compatibilityWarnings!==false, hideWarnings:Boolean(config.mods?.hideWarnings), protectServerCompatibility:config.mods?.protectServerCompatibility!==false, autoChangeSnapshots:config.mods?.autoChangeSnapshots!==false },
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
    const l=raw.launcher; const themes=new Set(['aurora','tactical','crimson','frost','obsidian','dvn','dvn-ember','dvn-sand','dvn-night','classic','dominion','nusia','ember','clean','neon','verdant','monolith','graphite','slate','smoke','iron']); const backgrounds=new Set(['frontline','night','canyon','anniversary','cyborg','dummies','orbit','laststand','vought','nightop','rooftop','tempest','urban','dvn-official-01','dvn-official-02','dvn-official-03','dvn-official-04','dvn-official-05','dvn-official-06']);
    const hexColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '';
    const galleryView={query:String(l.galleryView?.query||'').slice(0,120),type:['all','image','video'].includes(l.galleryView?.type)?l.galleryView.type:'all',sort:['newest','oldest','name','size'].includes(l.galleryView?.sort)?l.galleryView.sort:'newest'};
    out.launcher={ hideOnGameStart:l.hideOnGameStart!==false, refocusOnGameExit:l.refocusOnGameExit!==false, background:backgrounds.has(String(l.background))?String(l.background):'frontline', backgroundMode:['fixed','randomStartup','rotate5','rotate15'].includes(String(l.backgroundMode))?String(l.backgroundMode):'fixed', backgroundBrightness:Math.max(.7,Math.min(1.2,Number(l.backgroundBrightness)||1)), theme:themes.has(String(l.theme))?String(l.theme):'aurora', density:['comfortable','compact'].includes(String(l.density))?String(l.density):'comfortable', glassEffects:l.glassEffects!==false, scanlines:Boolean(l.scanlines), noise:Boolean(l.noise), reducedMotion:Boolean(l.reducedMotion), uiScale:['small','normal','large'].includes(String(l.uiScale))?String(l.uiScale):'normal', accent:hexColor(l.accent), accent2:hexColor(l.accent2), cardRadius:Math.max(8,Math.min(28,Number(l.cardRadius)||16)), clipsDirectory:String(l.clipsDirectory||'').slice(0,500), galleryView, startPage:['home','mods','modpack','updates','support','settings','gallery'].includes(String(l.startPage))?String(l.startPage):'home', rememberLastPage:Boolean(l.rememberLastPage), autoConnectivityCheck:l.autoConnectivityCheck!==false, startWithSystem:Boolean(l.startWithSystem), startMinimized:Boolean(l.startMinimized), nativeNotifications:l.nativeNotifications!==false, sidebarCollapsed:Boolean(l.sidebarCollapsed), lastSeenVersion:String(l.lastSeenVersion||''), crashStreak:Math.max(0,Math.min(9,Number(l.crashStreak||0))) };
  }
  if(raw.mods&&typeof raw.mods==='object') { const m=raw.mods; out.mods={ sort:['recent','oldest','az','size','favorites','updated'].includes(String(m.sort))?String(m.sort):'recent', allowUserMods:m.allowUserMods!==false, compatibilityWarnings:m.compatibilityWarnings!==false, hideWarnings:Boolean(m.hideWarnings), protectServerCompatibility:m.protectServerCompatibility!==false, autoChangeSnapshots:m.autoChangeSnapshots!==false }; }
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
  const [manifestInfo, java, system, localPack] = await Promise.all([
    currentManifest(config, { quick: true }).catch(async (error) => ({
      manifest: JSON.parse(await fsp.readFile(path.join(resourcesDir(), 'manifest.example.json'), 'utf8')),
      configured: false, source: 'error', error: error.message
    })),
    resolveJava17(config.minecraft.javaPath || '', managedJavaRoot()).catch(() => ({ found:false, major:0, version:'', path:'' })),
    cachedSystemProfile(config.pack.installDirectory).catch(() => null),
    readState(config.pack.installDirectory).catch(() => ({ version:null }))
  ]);
  const username = String(config.minecraft.username || '').trim();
  const minimumLauncher = String(manifestInfo.manifest?.minimumLauncher || '0.0.0');
  if (system) system.display = primaryDisplayInfo();
  const installedLocally = await localPackInstalled(config.pack.installDirectory, localPack).catch(() => false);
  const account = authService ? authService.status() : { authenticated:false, name:'', id:'' };
  const effectiveConfig = configWithDisplay(config);
  if (account.authenticated) effectiveConfig.minecraft = { ...effectiveConfig.minecraft, username:account.name || effectiveConfig.minecraft?.username, accountMode:'premium' };
  const developer = launcherVariant === DEVELOPER_VARIANT && developerService
    ? developerService.status()
    : { configured:false, unlocked:false, developerAllowed:false };
  return {
    appVersion: app.getVersion(), platform: process.platform, packaged: app.isPackaged, variant: launcherVariant,
    config: effectiveConfig, manifest: manifestInfo.manifest, manifestConfigured: manifestInfo.configured,
    manifestSource: manifestInfo.source, manifestError: manifestInfo.error || '', manifestStale: Boolean(manifestInfo.stale), manifestCachedAt: manifestInfo.cachedAt || '',
    localPackVersion: localPack?.version || '', localPackInstalled:installedLocally, java, system,
    minimumLauncher, launcherCompatible: versionAtLeast(app.getVersion(), minimumLauncher),
    needsOnboarding: !config.onboarding?.completed || !validMinecraftUsername(username) || username.toLowerCase() === 'player',
    launcherUpdateConfigured: launcherVariant !== DEVELOPER_VARIANT && Boolean(config.launcher?.updateFeedUrl), launcherUpdate: launcherUpdateSnapshot(),
    developer, account,
    operation: activeOperation || '', configRecovery: store.recoveryInfo ? store.recoveryInfo() : null
  };
}

// The first state request is the renderer's dependency for every page. A
// transient Java/profile/system failure must not turn that request into a
// rejected IPC call and leave the entire content area empty. Return a minimal
// but valid state and keep the original error in the launcher diagnostic log;
// individual panels can then retry their own checks normally.
async function safeStatePayload() {
  try { return await statePayload(); }
  catch (error) {
    void appendLauncherError('statePayload', error);
    const fallbackDefaults = {
      server: { host: '', port: 25565 },
      minecraft: { username: 'Player', version: '1.20.1', forgeVersion: '47.4.10', javaPath: '', maxMemoryMb: 6144, width: 0, height: 0, useSystemResolution: true, fullscreen: false, preset: 'balanced', autoInstallJava: true, preferDedicatedGpu: true },
      pack: { installDirectory: path.join(app.getPath('userData'), 'EternalCraft'), autoUpdate: true, repairBeforeLaunch: false, autoSnapshot: true },
      launcher: { hideOnGameStart: true, refocusOnGameExit: true, theme: 'aurora', background: 'frontline', backgroundMode: 'fixed', density: 'comfortable', glassEffects: true, scanlines: false, noise: false, reducedMotion: false, uiScale: 'normal', cardRadius: 16, startPage: 'home', autoConnectivityCheck: true, nativeNotifications: true, sidebarCollapsed: false },
      mods: { sort: 'recent', allowUserMods: true, compatibilityWarnings: true, hideWarnings: false, protectServerCompatibility: true, autoChangeSnapshots: true },
      sync: { includeScreenshots: true, includeSaves: false, extraPaths: [] },
      onboarding: { completed: false }
    };
    let config = fallbackDefaults;
    try {
      const defaults = store?.readDefaults?.() || {};
      const persisted = store?.load?.() || {};
      config = deepMerge(deepMerge(fallbackDefaults, defaults), persisted);
    } catch (recoveryError) { void appendLauncherError('statePayload recovery', recoveryError); }
    let manifest = { schema: 2, version: 'DEV', minecraft: '1.20.1', forge: '47.4.10', files: [], remove: [] };
    try { manifest = JSON.parse(await fsp.readFile(path.join(resourcesDir(), 'manifest.example.json'), 'utf8')); } catch (_) {}
    return {
      appVersion: app.getVersion(), platform: process.platform, packaged: app.isPackaged, variant: launcherVariant,
      config: configWithDisplay(config), manifest, manifestConfigured: false,
      manifestSource: 'error', manifestError: String(error?.message || error), manifestStale: false,
      minimumLauncher: String(manifest.minimumLauncher || '0.0.0'), launcherCompatible: true, localPackVersion: '', localPackInstalled:false,
      java: { found: false, major: 0, version: '', path: '' }, system: null,
      needsOnboarding: !config.onboarding?.completed || !validMinecraftUsername(String(config.minecraft?.username || '').trim()) || String(config.minecraft?.username || '').trim().toLowerCase() === 'player',
      launcherUpdateConfigured: launcherVariant !== DEVELOPER_VARIANT && Boolean(config.launcher?.updateFeedUrl), launcherUpdate: launcherUpdateSnapshot(),
      developer: { configured: false, unlocked: false, developerAllowed: launcherVariant === DEVELOPER_VARIANT },
      account: { authenticated: false, name: '', id: '', skins: [] }, operation: activeOperation || '',
      configRecovery: null
    };
  }
}

async function checkInstallationShared(root, manifest, onProgress = () => {}) {
  const key = `${path.resolve(String(root || ''))}|${String(manifest?.version || '')}`;
  if (packIntegrityInFlight.has(key)) return packIntegrityInFlight.get(key);
  const request = checkInstallation(root, manifest, onProgress);
  packIntegrityInFlight.set(key, request);
  try { return await request; }
  finally { if (packIntegrityInFlight.get(key) === request) packIntegrityInFlight.delete(key); }
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
  const status = await checkInstallationShared(config.pack.installDirectory, info.manifest, (p) => packProgress(p));
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
  const before = await checkInstallationShared(config.pack.installDirectory, info.manifest, (p) => packProgress(p));
  if (!force && before.healthy) {
    const system = await cachedSystemProfile(config.pack.installDirectory, 0).catch(() => null);
    const cache = await cacheStats(config.pack.installDirectory).catch(() => ({ files: 0, bytes: 0 }));
    return { configured: true, updated: false, ...before, system, cache };
  }
  const changeCount = (before.missing?.length || 0) + (before.changed?.length || 0) + (before.remove?.length || 0);
  if (changeCount > 0 && config.pack.autoSnapshot !== false) {
    await createSnapshot(config.pack.installDirectory, info.manifest, `Antes de actualizar a ${info.manifest.version || 'nueva versión'}`).catch(() => null);
  }
  const repaired = await repairInstallation(config.pack.installDirectory, info.manifest, (p) => packProgress(p), before);
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

async function launchPlayerGame({ config, manifest, javaInfo, safeMode = false }) {
  assertNoActiveGame();
  let currentConfig = configWithDisplay(store.save({ launcher: { lastPlayedAt: new Date().toISOString() } }));
  const premium = await authService.getAuthorization().catch((err) => {
    if (err?.reauthRequired) {
      store.save({ minecraft: { accountMode: 'offline' } });
      throw new Error('La sesión Microsoft venció. Iniciá sesión nuevamente para jugar con tu cuenta premium.');
    }
    if (currentConfig.minecraft?.accountMode === 'premium' || authService.status().authenticated) throw new Error(`No pude renovar la sesión premium: ${err.message || err}`);
    return null;
  });
  if (premium) currentConfig = { ...currentConfig, minecraft: { ...currentConfig.minecraft, username: premium.profile.name, accountMode:'premium', authorization:premium.authorization } };
  assertNoActiveGame();
  const launched = await launchTrackedGame({
    config: currentConfig, manifest, resourcesDir: resourcesDir(), managedJavaRoot: managedJavaRoot(), javaInfo,
    onLog: (line) => emit('game:log', line), onProgress: (progress) => packProgress(progress)
  }, { safeMode, test:false });
  return launched;
}

async function localPackInstalled(root, state = {}) {
  if (state?.version) return true;
  try {
    const files = await fsp.readdir(path.join(root, 'mods'));
    return files.some((name) => /\.jar(?:\.disabled)?$/i.test(name));
  } catch (_) { return false; }
}

async function resolvePlayManifest(config) {
  const [info, localState] = await Promise.all([
    currentManifest(config, { quick: true }),
    readState(config.pack.installDirectory)
  ]);
  const installed = await localPackInstalled(config.pack.installDirectory, localState);
  const targetManifest = info.manifest;
  if (!info.configured && !installed) {
    const message = info.error ? `No pude comprobar el canal del modpack (${info.error}). Conectate a internet para instalarlo.` : 'Todavía no hay un modpack oficial publicado para el launcher.';
    throw new Error(message);
  }
  // When the player chooses not to update, use the Minecraft/Forge metadata
  // that was installed with their local pack. This keeps a stale local install
  // launchable without changing its files or pretending it is the latest pack.
  const launchManifest = {
    ...targetManifest,
    version: installed && localState.version ? localState.version : targetManifest.version,
    minecraft: installed && localState.minecraft ? localState.minecraft : (config.minecraft.version || targetManifest.minecraft),
    forge: installed && localState.forge ? localState.forge : (config.minecraft.forgeVersion || targetManifest.forge),
    forgeInstaller: installed && localState.forgeInstaller ? localState.forgeInstaller : (targetManifest.forgeInstaller || null),
    minimumLauncher: installed && localState.minimumLauncher ? localState.minimumLauncher : (targetManifest.minimumLauncher || '0.0.0')
  };
  const minimumLauncher = String(launchManifest.minimumLauncher || '0.0.0');
  if (!versionAtLeast(app.getVersion(), minimumLauncher)) {
    throw new Error(`Actualizá el launcher primero. El pack requiere la versión ${minimumLauncher} o superior.`);
  }
  return {
    info,
    launchManifest,
    localState,
    installed,
    decision: playUpdateDecision({ installedVersion: localState.version, targetVersion: targetManifest.version, installed, manifestConfigured: Boolean(info.configured) })
  };
}

function assertNoActiveGame() {
  if (gameSessions.hasActiveGame) throw new Error('Minecraft ya está abierto. Cerrá la sesión actual antes de iniciar otra.');
  if (isQuitting) throw new Error('El launcher se está cerrando.');
}

async function launchTrackedGame(options, details = {}) {
  assertNoActiveGame();
  const startedAt = Date.now();
  return launchGame({
    ...options,
    onExit: () => {},
    onChild: (child) => {
      if (isQuitting) {
        try { child.kill(); } catch (_) {}
        throw new Error('El launcher se cerró antes de completar el inicio de Minecraft.');
      }
      gameSessions.track(child, { ...details, installDirectory: options.config.pack.installDirectory, startedAt });
    }
  });
}

async function handleGameSessionExit(rawSession = {}) {
  const details = rawSession.details || {};
  let session = { ...rawSession };
  delete session.details; delete session.activeGames; delete session.pid;
  if (details.safeMode) await restoreSafeMode(details.installDirectory).catch((error) => appendLauncherError('safe-mode restore after exit', error));
  if (!details.test) {
    const current = store.load(); const stats = current.launcher?.playStats || { totalMs:0, sessions:0, days:{} };
    const duration = Math.max(0, Number(session.durationMs || 0)); const day = new Date().toISOString().slice(0,10);
    const days = { ...(stats.days || {}) }; days[day] = Number(days[day] || 0) + duration;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-35);
    for (const key of Object.keys(days)) { const date = new Date(`${key}T00:00:00`); if (Number.isFinite(date.getTime()) && date < cutoff) delete days[key]; }
    const crashed = Boolean(session.error) || (Number.isInteger(session.code) && session.code !== 0);
    const crashStreak = crashed ? Math.min(9, Number(current.launcher?.crashStreak || 0) + 1) : 0;
    const next = store.save({ launcher: { lastSession: session, crashStreak, playStats: { totalMs:Number(stats.totalMs || 0) + duration, sessions:Number(stats.sessions || 0) + 1, days } } });
    recordUserChange(next, { type:!crashed?'game-success':'game-crash', title:!crashed?'Sesión finalizada correctamente':'Minecraft se cerró inesperadamente', detail:session.error || `Código ${session.code ?? '—'} · ${Math.round(duration/60000)} min`, filenames:[], risk:crashed?'high':'low', source:'game' }).catch(() => null);
  }
  if (details.safeMode) session.safeMode = true;
  if (details.test) session.test = true;
  emit('game:exit', session);
  if (isQuitting) return;
  const config = store.load();
  const action = gameExitAction({ closeRequested:closeRequestedDuringGame, refocusOnExit:config.launcher?.refocusOnGameExit !== false, windowVisible:Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()) });
  if (action === 'quit') {
    isQuitting = true;
    app.quit();
  } else if (action === 'show') {
    closeRequestedDuringGame = false;
    showMainWindow();
  }
}

async function recordUserChange(config, event) {
  try { return await recordChange(config.pack.installDirectory, event); } catch (_) { return null; }
}
async function maybeSnapshotBeforeModChange(config, manifest, label) {
  if (config.mods?.autoChangeSnapshots === false) return null;
  try { return await createSnapshot(config.pack.installDirectory, manifest, label); } catch (_) { return null; }
}

function registerIpc() {
  ipcMain.handle('app:get-state', safeStatePayload);

  ipcMain.handle('onboarding:complete', async (_event, payload = {}) => {
    payload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
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
    if (packCheckInFlight) return packCheckInFlight;
    const task = (async () => {
      const config = store.load(); const info = await currentManifest(config); return checkPack(config, info);
    })();
    packCheckInFlight = task;
    try { return await task; } finally { if (packCheckInFlight === task) packCheckInFlight = null; }
  });
  ipcMain.handle('pack:update', async (_event, force = false) => runExclusive('actualización del modpack', async () => { if (packCheckInFlight) await packCheckInFlight; const result = await updatePack(store.load(), Boolean(force)); invalidateRuntimeCaches(); if (result.updated !== false) notifyNative('Eternal Craft actualizado', 'El modpack quedó listo para jugar.'); return result; }));
  ipcMain.handle('pack:repair', async () => runExclusive('reparación del modpack', async () => { if (packCheckInFlight) await packCheckInFlight; const result = await updatePack(store.load(), true); invalidateRuntimeCaches(); notifyNative('Reparación completa', 'La instalación de Eternal Craft fue verificada.'); return result; }));

  ipcMain.handle('mods:list', async () => {
    const config = store.load(); const info = await currentManifest(config);
    return listMods(config.pack.installDirectory, info.manifest, config.mods?.sort || 'recent');
  });
  ipcMain.handle('mods:add', async () => runExclusive('agregar mods', async () => {
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
  }));
  ipcMain.handle('mods:toggle', async (_event, filename) => runExclusive('cambiar estado de mod', async () => {
    const config = store.load(); const info = await currentManifest(config);
    const listing = await toggleMod(config.pack.installDirectory, filename, info.manifest);
    await recordUserChange(config,{type:'mod-toggle',title:'Estado de mod cambiado',detail:String(filename||''),filenames:[String(filename||'')],risk:'low'});
    return listing;
  }));
  ipcMain.handle('mods:remove', async (_event, filename) => runExclusive('quitar mod', async () => {
    const config = store.load(); const info = await currentManifest(config);
    await maybeSnapshotBeforeModChange(config,info.manifest,`Antes de quitar ${path.basename(String(filename||'mod'))}`);
    const listing = await removeMod(config.pack.installDirectory, filename, info.manifest);
    await recordUserChange(config,{type:'mod-remove',title:'Mod personal eliminado',detail:String(filename||''),filenames:[String(filename||'')],risk:'high'});
    return listing;
  }));
  ipcMain.handle('mods:favorite', async (_event, filename) => runExclusive('marcar mod favorito', async () => {
    const config = store.load(); const info = await currentManifest(config);
    return toggleFavorite(config.pack.installDirectory, filename, info.manifest);
  }));
  ipcMain.handle('mods:pin', async (_event, filename) => runExclusive('fijar versión de mod', async () => {
    const config = store.load(); const info = await currentManifest(config);
    const result = await togglePin(config.pack.installDirectory, filename, info.manifest);
    await recordUserChange(config,{type:'mod-pin',title:result.pinned?'Versión de mod fijada':'Versión de mod liberada',detail:String(filename||''),filenames:[String(filename||'')],risk:'low'});
    return result;
  }));
  ipcMain.handle('mods:set-all-enabled', async (_event, enabled) => runExclusive('actualizar mods personales', async () => {
    const config = store.load(); const info = await currentManifest(config);
    await maybeSnapshotBeforeModChange(config,info.manifest,enabled?'Antes de activar mods personales':'Antes de desactivar mods personales');
    const result = await setAllUserModsEnabled(config.pack.installDirectory, info.manifest, Boolean(enabled));
    await recordUserChange(config,{type:enabled?'mods-enable-all':'mods-disable-all',title:enabled?'Mods personales activados':'Mods personales desactivados',detail:`${result.changed?.length||0} cambios`,filenames:(result.changed||[]).map(x=>x.to||x.from),risk:'medium'});
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
    const [java, pack, diagnostic, mods, system] = await Promise.all([
      resolveJava17(cfg.minecraft.javaPath || '', managedJavaRoot()).catch(()=>({found:false})),
      info.configured ? checkInstallationShared(cfg.pack.installDirectory, info.manifest).catch(()=>null) : Promise.resolve(null),
      quickDiagnostic(cfg).catch(()=>({severity:'warn',title:'No se pudo revisar el último log',summary:''})),
      listMods(cfg.pack.installDirectory, info.manifest, cfg.mods?.sort || 'recent').catch(()=>({mods:[],counts:{}})),
      cachedSystemProfile(cfg.pack.installDirectory, 0).catch(()=>null)
    ]);
    const userMods=(mods.mods||[]).filter(m=>m.userAdded);
    const disabled=userMods.filter(m=>!m.enabled).length;
    const issues=[];
    if(!supportedJava(java.major) && cfg.minecraft.autoInstallJava===false) issues.push({type:'java',severity:'bad',text:'Falta Java 17 o superior'});
    if(pack && !pack.healthy) issues.push({type:'pack',severity:'warn',text:'El modpack necesita sincronización'});
    // Exaroton may answer with a provider lobby while the game instance is
    // stopped. Server reachability is informational and must never block the
    // local readiness check or make the launcher look broken.
    const freeBytes=Number(system?.disk?.freeBytes||0);
    if(freeBytes>0 && freeBytes<5*1024**3) issues.push({type:'disk',severity:freeBytes<2*1024**3?'bad':'warn',text:`Poco espacio libre (${Math.max(0,freeBytes/1024**3).toFixed(1)} GB)`});
    const assignedRamGb=Number(cfg.minecraft?.maxMemoryMb||0)/1024; const maxRam=Number(system?.maxRamGb||0);
    if(maxRam>0 && assignedRamGb>maxRam) issues.push({type:'memory',severity:'warn',text:`RAM asignada alta (${assignedRamGb.toFixed(0)} GB · sugerido hasta ${maxRam} GB)`});
    if(info.stale) issues.push({type:'network',severity:'warn',text:'Usando el último manifest guardado en caché'});
    if(diagnostic?.severity && diagnostic.severity!=='ok') issues.push({type:'log',severity:'warn',text:diagnostic.title||'Revisar último log'});
    return { ok:issues.length===0, issues, javaOk:Boolean(java.found&&supportedJava(java.major)), packOk:Boolean(pack?.healthy), serverOnline:null, userMods:userMods.length, disabledMods:disabled, favorites:Number(mods.counts?.favorites||0), diagnostic, system, connectionQuality:'informational', latency:null };
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

  ipcMain.handle('game:play-check', async () => {
    const config = configWithDisplay(store.load());
    const context = await resolvePlayManifest(config);
    const integrity = context.info.configured
      ? await checkInstallationShared(config.pack.installDirectory, context.info.manifest, (progress) => packProgress(progress))
      : null;
    const decision = playUpdateDecision({
      installedVersion: context.localState.version,
      targetVersion: context.info.manifest.version,
      installed: context.installed,
      manifestConfigured: Boolean(context.info.configured),
      integrityHealthy: integrity ? !(integrity.missing?.length || integrity.changed?.length || integrity.remove?.length) : undefined
    });
    return {
      ...decision,
      targetVersion: context.info.manifest.version || null,
      manifestConfigured: Boolean(context.info.configured),
      manifestStale: Boolean(context.info.stale),
      manifestError: context.info.error || '',
      integrity: integrity ? {
        healthy: Boolean(integrity.healthy),
        total: integrity.total,
        ok: integrity.ok,
        missing: integrity.missing?.length || 0,
        changed: integrity.changed?.length || 0,
        retired: integrity.remove?.length || 0
      } : null
    };
  });

  ipcMain.handle('game:launch', async () => runExclusive('inicio de Minecraft', async () => {
    assertNoActiveGame();
    const config = configWithDisplay(store.load());
    const context = await resolvePlayManifest(config);
    const java = await ensurePlayableJava(config);
    const launched = await launchPlayerGame({ config, manifest: context.launchManifest, javaInfo: java });
    if (config.launcher.hideOnGameStart && mainWindow) hideMainWindow();
    return launched;
  }));

  ipcMain.handle('game:update-launch', async () => runExclusive('actualización del modpack e inicio', async () => {
    assertNoActiveGame();
    const config = configWithDisplay(store.load());
    const info = await currentManifest(config);
    if (!info.configured) throw new Error('No se puede actualizar el modpack sin conexión al canal oficial. Podés volver a Jugar y elegir “Jugar sin actualizar”.');
    if (!versionAtLeast(app.getVersion(), info.manifest.minimumLauncher || '0.0.0')) {
      throw new Error(`Actualizá el launcher primero. El pack requiere la versión ${info.manifest.minimumLauncher} o superior.`);
    }
    const java = await ensurePlayableJava(config);
    const result = await updatePack(config, false);
    invalidateRuntimeCaches();
    if (result.updated !== false) notifyNative('Eternal Craft actualizado', 'El modpack quedó listo para jugar.');
    const latestConfig = configWithDisplay(store.load());
    const launched = await launchPlayerGame({ config: latestConfig, manifest: info.manifest, javaInfo: java });
    if (latestConfig.launcher.hideOnGameStart && mainWindow) hideMainWindow();
    return { ...launched, packUpdated: result.updated !== false };
  }));

  ipcMain.handle('game:safe-launch', async () => runExclusive('inicio seguro de Minecraft', async () => {
    assertNoActiveGame();
    const config = configWithDisplay(store.load());
    const context = await resolvePlayManifest(config);
    const java = await ensurePlayableJava(config);
    const safe = await prepareSafeMode(config.pack.installDirectory, context.info.manifest);
    try {
      const launched = await launchPlayerGame({ config: store.load(), manifest: context.launchManifest, javaInfo: java, safeMode: true });
      const current = store.load();
      if (current.launcher?.hideOnGameStart && mainWindow) hideMainWindow();
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
    patch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    if (patch.minecraft?.useSystemResolution === true) { const d=primaryDisplayInfo(); patch={...patch,minecraft:{...patch.minecraft,width:d.width,height:d.height}}; }
    const next = store.save(patch);
    if (patch.pack?.manifestUrl || patch.developer?.githubRepo || patch.developer?.githubBranch) invalidateRuntimeCaches();
    if (patch.launcher && Object.prototype.hasOwnProperty.call(patch.launcher, 'startWithSystem')) await applyStartupPreference(Boolean(next.launcher?.startWithSystem));
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
  ipcMain.handle('account:refresh', async () => runExclusive('actualizar perfil Microsoft', async () => {
    const result = await authService.refreshProfile();
    if (result.authenticated) store.save({ minecraft: { username: result.name, accountMode: 'premium' } });
    else if (result.reauthRequired) store.save({ minecraft: { accountMode: 'offline' } });
    return result;
  }));
  ipcMain.handle('account:skins', async () => authService.listSkins());
  ipcMain.handle('account:choose-skin', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title:'Elegir skin de Minecraft', properties:['openFile'], filters:[{ name:'Skin PNG', extensions:['png'] }] });
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
  });
  ipcMain.handle('account:upload-skin', async (_event, variant = 'classic') => runExclusive('subir skin de Minecraft', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title:'Elegir skin PNG', properties:['openFile'], filters:[{ name:'Skin PNG', extensions:['png'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    return authService.uploadSkin(result.filePaths[0], variant);
  }));
  ipcMain.handle('clips:list', async () => listMedia(store.load().launcher?.clipsDirectory || ''));
  ipcMain.handle('clips:choose-folder', async () => {
    const current = store.load().launcher?.clipsDirectory || app.getPath('videos');
    const result = await dialog.showOpenDialog(mainWindow, { title:'Elegir carpeta de clips y capturas', defaultPath:current, properties:['openDirectory','createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const next = store.save({ launcher:{ clipsDirectory:result.filePaths[0] } });
    return listMedia(next.launcher.clipsDirectory);
  });
  ipcMain.handle('clips:open-folder', async () => {
    const directory = store.load().launcher?.clipsDirectory || '';
    if (!directory) throw new Error('Elegí una carpeta de clips primero.');
    await fsp.mkdir(directory, { recursive:true });
    return shell.openPath(directory);
  });
  ipcMain.handle('clips:open', async (_event, file) => {
    const directory = store.load().launcher?.clipsDirectory || '';
    if (!directory || !await isAllowedFile(directory, file)) throw new Error('El archivo no pertenece a la carpeta de clips configurada.');
    return shell.openPath(path.resolve(file));
  });
  ipcMain.handle('clips:clear-folder', async () => store.save({ launcher:{ clipsDirectory:'' } }));
  if (developerIntegration?.registerIpc) developerIntegration.registerIpc({
    ipcMain, app, dialog, shell, store, developerService, mainWindow, path, os, fsp,
    runExclusive, configWithDisplay, currentManifest, ensurePlayableJava, launchGame: launchTrackedGame,
    resourcesDir, managedJavaRoot, emit, packProgress, markPublishedOfficial,
    appendLauncherError, invalidateRuntimeCaches, primeManifestCache, safeStatePayload
  });

  ipcMain.handle('launcher:update-check', async () => {
    if (launcherVariant === DEVELOPER_VARIANT) return { configured:false, developer:true, state:launcherUpdateSnapshot() };
    if (!app.isPackaged) return { configured: false, development: true };
    return checkLauncherUpdate(store.load(), updateEvent);
  });
  ipcMain.handle('launcher:update-download', async () => {
    if (launcherVariant === DEVELOPER_VARIANT) throw new Error('La build Developer no se actualiza desde el canal público del launcher.');
    if (!app.isPackaged) throw new Error('Las actualizaciones del launcher se prueban en una build empaquetada.');
    return downloadLauncherUpdate(store.load(), updateEvent);
  });
  ipcMain.handle('launcher:update-cancel', async () => cancelLauncherUpdate());
  ipcMain.handle('launcher:update-install', async () => {
    if (launcherVariant === DEVELOPER_VARIANT) throw new Error('La build Developer no se instala desde el canal público del launcher.');
    // Installing a downloaded launcher update is an explicit restart request.
    isQuitting = true;
    try { installLauncherUpdate(); return true; }
    catch (error) { isQuitting = false; throw error; }
  });

  ipcMain.handle('shell:open-instance', async () => {
    const folder = store.load().pack.installDirectory; await fsp.mkdir(folder, { recursive: true }); return shell.openPath(folder);
  });
  ipcMain.handle('shell:open-logs', async () => {
    const folder = path.join(store.load().pack.installDirectory, 'logs'); await fsp.mkdir(folder, { recursive: true }); return shell.openPath(folder);
  });
  ipcMain.handle('shell:open-latest-log', async () => {
    const folder = path.join(store.load().pack.installDirectory, 'logs');
    await fsp.mkdir(folder, { recursive: true });
    const entries = (await fsp.readdir(folder, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.log(?:\.gz)?$/i.test(entry.name));
    if (!entries.length) return shell.openPath(folder);
    const candidates = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(folder, entry.name);
      const stat = await fsp.stat(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    }));
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return shell.openPath(candidates[0].fullPath);
  });
  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('URL no permitida'); await shell.openExternal(url); return true;
  });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize-toggle', () => { if (!mainWindow) return; mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
  ipcMain.on('window:close', () => mainWindow?.close());
}

function startLauncher(options = {}) {
  if (appStarted) return false;
  appStarted = true;
  launcherVariant = normalizeVariant(options.variant);
  developerIntegration = launcherVariant === DEVELOPER_VARIANT ? (options.developerIntegration || null) : null;
  if (launcherVariant === DEVELOPER_VARIANT && !developerIntegration) throw new Error('La build Developer necesita una integración privada de mantenimiento.');

  const developerBuild = launcherVariant === DEVELOPER_VARIANT;
  const appName = developerBuild ? 'Eternal Craft Launcher Developer' : 'Eternal Craft Launcher';
  const appId = developerBuild ? 'uy.eternalcraft.launcher.developer' : 'uy.eternalcraft.launcher';
  app.setName(appName);
  app.setAppUserModelId(appId);
  if (process.platform === 'linux') {
    app.setDesktopName(`${appId}.desktop`);
    app.commandLine.appendSwitch('class', appId);
  }

  if (!app.requestSingleInstanceLock()) {
    isQuitting = true;
    app.quit();
    return false;
  }

  app.on('second-instance', (_event, argv = []) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    showMainWindow();
    if (argv.includes('--play')) emit('ui:command', 'play');
    else if (argv.includes('--updates')) emit('ui:command', 'updates');
  });
  app.on('before-quit', () => {
    isQuitting = true;
    clearTimeout(windowSaveTimer);
    try { developerIntegration?.terminatePublishers?.(); } catch (error) { void appendLauncherError('developer publisher shutdown', error); }
  });
  app.on('window-all-closed', () => {
    if (gameSessions.hasActiveGame) { closeRequestedDuringGame = true; return; }
    if (!isQuitting) { isQuitting = true; app.quit(); }
  });

  app.whenReady().then(() => {
    store = new ConfigStore({ defaultsPath: path.join(resourcesDir(), 'default-config.json'), userDataDir: app.getPath('userData') });
    launcherErrorLog = path.join(app.getPath('userData'), 'launcher-errors.log');
    process.on('uncaughtExceptionMonitor', (err) => {
      if (err?.code !== 'EPIPE') appendLauncherError('uncaughtException', err);
    });
    process.on('unhandledRejection', (reason) => {
      if (reason?.code !== 'EPIPE') appendLauncherError('unhandledRejection', reason);
    });
    if (developerBuild && process.platform === 'linux') {
      const config = store.load(); const developerPatch = {};
      if (!config.developer?.sourceDirectory) developerPatch.sourceDirectory = path.join(os.homedir(), '.sklauncher', 'instances', 'siege');
      if (!config.developer?.testDirectory) developerPatch.testDirectory = path.join(os.homedir(), '.sklauncher', 'instances', 'test-1');
      if (Object.keys(developerPatch).length) store.save({ developer: developerPatch });
    }
    if (developerIntegration) {
      developerService = developerIntegration.createService({ userDataDir:app.getPath('userData'), scriptRoot:scriptsDir(), launcherVersion:app.getVersion() });
    }
    authService = new AuthService(app.getPath('userData'));
    applyWindowsTasks();
    restoreSafeMode(store.load().pack.installDirectory).catch(() => null);
    registerIpc(); createTray(); createWindow();
    if (developerService && developerIntegration?.cleanup) {
      void Promise.resolve(developerIntegration.cleanup(developerService)).catch((error) => appendLauncherError('publish workdir cleanup', error));
    }
    applyStartupPreference(Boolean(store.load().launcher?.startWithSystem)).catch(() => null);
    mainWindow.webContents.once('did-finish-load', () => {
      const config = store.load();
      if (process.argv.includes('--play')) setTimeout(() => emit('ui:command', 'play'), 350);
      else if (process.argv.includes('--updates')) setTimeout(() => emit('ui:command', 'updates'), 350);
      // The shell and first frame are already visible before network checks.
      if (launcherVariant !== DEVELOPER_VARIANT && app.isPackaged && config.launcher?.autoUpdate && config.launcher?.updateFeedUrl) {
        setTimeout(() => checkLauncherUpdate(config, updateEvent).catch((error) => updateEvent({ type:'error', message:error.message })), 650);
      }
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) createWindow();
    });
  }).catch((error) => {
    void appendLauncherError('launcher startup', error);
    isQuitting = true;
    app.quit();
  });
  return true;
}

module.exports = { startLauncher };
