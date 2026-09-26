const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

let configuredUrl = '';
let wired = false;
let checkPromise = null;
let downloadPromise = null;
let lastState = { type: 'idle', info: null, progress: null, error: '' };
let eventSink = () => {};

function normalizeBaseUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}
function emit(payload) {
  lastState = { ...lastState, ...payload };
  try { eventSink(payload); } catch (_) {}
}
function configureLauncherUpdates({ feedUrl, onEvent = () => {} }) {
  const normalized = normalizeBaseUrl(feedUrl);
  if (!normalized) return { configured: false, state: lastState };
  eventSink = onEvent;
  if (!wired) {
    wired = true;
    autoUpdater.autoDownload = false;
    // Never install silently on quit. The user must press “Reiniciar e instalar”.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('checking-for-update', () => emit({ type: 'checking' }));
    autoUpdater.on('update-available', (info) => emit({ type: 'available', info }));
    autoUpdater.on('update-not-available', (info) => emit({ type: 'none', info }));
    autoUpdater.on('download-progress', (progress) => emit({ type: 'progress', progress }));
    autoUpdater.on('update-downloaded', (info) => emit({ type: 'downloaded', info }));
    autoUpdater.on('error', (error) => emit({ type: 'error', message: error?.message || String(error) }));
  }
  if (configuredUrl !== normalized) {
    configuredUrl = normalized;
    autoUpdater.setFeedURL({ provider: 'generic', url: normalized });
  }
  return { configured: true, url: normalized, state: lastState };
}

async function checkLauncherUpdate(config, onEvent) {
  const setup = configureLauncherUpdates({ feedUrl: config.launcher?.updateFeedUrl, onEvent });
  if (!setup.configured) return { configured: false, currentVersion: app.getVersion(), state: lastState };
  if (checkPromise) return checkPromise;
  checkPromise = autoUpdater.checkForUpdates()
    .then((result) => ({ configured: true, currentVersion: app.getVersion(), updateInfo: result?.updateInfo || null, state: lastState }))
    .finally(() => { checkPromise = null; });
  return checkPromise;
}

async function downloadLauncherUpdate(config, onEvent) {
  const setup = configureLauncherUpdates({ feedUrl: config.launcher?.updateFeedUrl, onEvent });
  if (!setup.configured) throw new Error('No hay un canal de actualizaciones del launcher configurado.');
  if (lastState.type === 'downloaded') return { downloaded: true, state: lastState };
  if (!['available', 'progress'].includes(lastState.type)) {
    throw new Error('Primero comprobá si hay una actualización disponible.');
  }
  if (downloadPromise) return downloadPromise;
  downloadPromise = autoUpdater.downloadUpdate()
    .then(() => ({ downloaded: true, state: lastState }))
    .catch((error) => {
      emit({ type: 'error', message: error?.message || String(error) });
      throw error;
    })
    .finally(() => { downloadPromise = null; });
  return downloadPromise;
}

function installLauncherUpdate() {
  if (lastState.type !== 'downloaded') throw new Error('La actualización todavía no terminó de descargarse.');
  // quitAndInstall must run after the renderer has received the downloaded event.
  autoUpdater.quitAndInstall(false, true);
  return true;
}

module.exports = { configureLauncherUpdates, checkLauncherUpdate, downloadLauncherUpdate, installLauncherUpdate };
