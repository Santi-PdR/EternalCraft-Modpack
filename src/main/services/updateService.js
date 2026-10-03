const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const { CancellationToken } = require('builder-util-runtime');
const { appImageRuntimeMessage } = require('./updateRuntime');
const { normalizeLauncherUpdateState, reduceLauncherUpdateState } = require('./launcherUpdateState');

let configuredUrl = '';
let wired = false;
let checkPromise = null;
let downloadPromise = null;
let downloadCancellation = null;
let lastState = normalizeLauncherUpdateState({ type: 'idle' }, app.getVersion());
let availableInfo = null;
let eventSink = () => {};

function normalizeBaseUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}
function emit(payload) {
  lastState = reduceLauncherUpdateState(lastState, payload, app.getVersion());
  try { eventSink({ ...lastState }); } catch (_) {}
}
function configureLauncherUpdates({ feedUrl, onEvent = () => {} }) {
  const normalized = normalizeBaseUrl(feedUrl);
  eventSink = onEvent;
  if (!normalized) {
    if (downloadCancellation && !downloadCancellation.cancelled) downloadCancellation.cancel();
    configuredUrl = '';
    availableInfo = null;
    lastState = normalizeLauncherUpdateState({ type: 'unconfigured' }, app.getVersion());
    return { configured: false, state: { ...lastState } };
  }
  if (!wired) {
    wired = true;
    autoUpdater.autoDownload = false;
    // Never install silently on quit. The user must press “Reiniciar e instalar”.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('checking-for-update', () => emit({ type: 'checking' }));
    autoUpdater.on('update-available', (info) => { availableInfo = info || null; emit({ type: 'available', info, error: '' }); });
    autoUpdater.on('update-not-available', (info) => { availableInfo = null; emit({ type: 'current', info, error: '' }); });
    autoUpdater.on('download-progress', (progress) => emit({ type: 'progress', progress }));
    autoUpdater.on('update-downloaded', (info) => emit({ type: 'downloaded', info }));
    autoUpdater.on('error', (error) => emit({ type: 'error', message: error?.message || String(error) }));
  }
  if (configuredUrl !== normalized) {
    if (downloadCancellation && !downloadCancellation.cancelled) downloadCancellation.cancel();
    configuredUrl = normalized;
    availableInfo = null;
    lastState = normalizeLauncherUpdateState({ type: 'idle' }, app.getVersion());
    autoUpdater.setFeedURL({ provider: 'generic', url: normalized });
  }
  return { configured: true, url: normalized, state: { ...lastState } };
}

async function checkLauncherUpdate(config, onEvent) {
  const setup = configureLauncherUpdates({ feedUrl: config.launcher?.updateFeedUrl, onEvent });
  if (!setup.configured) return { configured: false, currentVersion: app.getVersion(), state: lastState };
  const runtimeMessage = appImageRuntimeMessage({ packaged: app.isPackaged });
  if (runtimeMessage) {
    availableInfo = null;
    emit({ type: 'error', message: runtimeMessage });
    return { configured: true, currentVersion: app.getVersion(), state: lastState };
  }
  // electron-updater does not support a check racing with an active download.
  // Return the current state and let the download event drive the UI instead
  // of resetting the banner while the installer is being written.
  if (downloadPromise) return { configured: true, currentVersion: app.getVersion(), state: lastState };
  if (checkPromise) return checkPromise;
  checkPromise = autoUpdater.checkForUpdates()
    .then((result) => ({ configured: true, currentVersion: app.getVersion(), updateInfo: result?.updateInfo || null, state: lastState }))
    .finally(() => { checkPromise = null; });
  return checkPromise;
}

async function downloadLauncherUpdate(config, onEvent) {
  const setup = configureLauncherUpdates({ feedUrl: config.launcher?.updateFeedUrl, onEvent });
  if (!setup.configured) throw new Error('No hay un canal de actualizaciones del launcher configurado.');
  const runtimeMessage = appImageRuntimeMessage({ packaged: app.isPackaged });
  if (runtimeMessage) {
    availableInfo = null;
    emit({ type: 'error', message: runtimeMessage });
    throw new Error(runtimeMessage);
  }
  if (lastState.type === 'downloaded') return { downloaded: true, state: lastState };
  // Wait for an in-flight check to publish the available version before
  // deciding whether downloadUpdate() is allowed. This avoids the renderer
  // seeing “primero comprobá” during the short checking/available transition.
  if (checkPromise) await checkPromise;
  if (lastState.type === 'downloaded') return { downloaded: true, state: lastState };
  if (!['available', 'progress'].includes(lastState.type)) {
    throw new Error('Primero comprobá si hay una actualización disponible.');
  }
  if (downloadPromise) return downloadPromise;
  const downloadUrl = configuredUrl;
  const cancellation = new CancellationToken();
  downloadCancellation = cancellation;
  downloadPromise = autoUpdater.downloadUpdate(cancellation)
    .then((files) => {
      // electron-updater versions differ on whether the promise resolves
      // before or after `update-downloaded`. Normalize the state so the
      // renderer can always enable “Reiniciar e instalar” after success.
      if (lastState.type !== 'downloaded') emit({ type: 'downloaded', info: availableInfo, files });
      return { downloaded: true, state: lastState };
    })
    .catch((error) => {
      const message = error?.message || String(error);
      if (cancellation.cancelled) {
        if (configuredUrl === downloadUrl && availableInfo) emit({ type: 'available', info: availableInfo, error: '' });
        return { downloaded: false, cancelled: true, state: lastState };
      }
      // Keep the retry path usable after a transient download failure. The
      // updater already knows which release was offered, so returning to the
      // available state lets the user press DESCARGAR again instead of being
      // forced to run a new check first.
      if (availableInfo) emit({ type: 'available', info: availableInfo, error: message });
      else emit({ type: 'error', message });
      throw error;
    })
    .finally(() => {
      downloadPromise = null;
      if (downloadCancellation === cancellation) downloadCancellation = null;
    });
  return downloadPromise;
}

async function cancelLauncherUpdate() {
  if (!downloadPromise || !downloadCancellation) return { cancelled:false, state:getLauncherUpdateState() };
  const cancellation = downloadCancellation;
  const pending = downloadPromise;
  if (!cancellation.cancelled) cancellation.cancel();
  try { await pending; } catch (_) {}
  return { cancelled:true, state:getLauncherUpdateState() };
}

function installLauncherUpdate() {
  if (lastState.type !== 'downloaded') throw new Error('La actualización todavía no terminó de descargarse.');
  // quitAndInstall must run after the renderer has received the downloaded event.
  autoUpdater.quitAndInstall(false, true);
  return true;
}

function getLauncherUpdateState() { return { ...normalizeLauncherUpdateState(lastState, app.getVersion()) }; }

module.exports = { configureLauncherUpdates, checkLauncherUpdate, downloadLauncherUpdate, cancelLauncherUpdate, installLauncherUpdate, getLauncherUpdateState };
