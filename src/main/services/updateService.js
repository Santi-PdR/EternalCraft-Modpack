const { autoUpdater } = require('electron-updater');

let configuredUrl = '';
let wired = false;

function normalizeBaseUrl(url) {
  const v = String(url || '').trim();
  if (!v) return '';
  return v.endsWith('/') ? v : `${v}/`;
}

function configureLauncherUpdates({ feedUrl, onEvent = () => {} }) {
  const normalized = normalizeBaseUrl(feedUrl);
  if (!normalized) return { configured: false };

  if (!wired) {
    wired = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => onEvent({ type: 'checking' }));
    autoUpdater.on('update-available', (info) => onEvent({ type: 'available', info }));
    autoUpdater.on('update-not-available', (info) => onEvent({ type: 'none', info }));
    autoUpdater.on('download-progress', (progress) => onEvent({ type: 'progress', progress }));
    autoUpdater.on('update-downloaded', (info) => onEvent({ type: 'downloaded', info }));
    autoUpdater.on('error', (error) => onEvent({ type: 'error', message: error?.message || String(error) }));
  }

  if (configuredUrl !== normalized) {
    configuredUrl = normalized;
    autoUpdater.setFeedURL({ provider: 'generic', url: normalized });
  }
  return { configured: true, url: normalized };
}

async function checkLauncherUpdate(config, onEvent) {
  const setup = configureLauncherUpdates({ feedUrl: config.launcher?.updateFeedUrl, onEvent });
  if (!setup.configured) return { configured: false };
  const result = await autoUpdater.checkForUpdates();
  return { configured: true, updateInfo: result?.updateInfo || null };
}

async function downloadLauncherUpdate(config, onEvent) {
  const setup = configureLauncherUpdates({ feedUrl: config.launcher?.updateFeedUrl, onEvent });
  if (!setup.configured) throw new Error('No hay un canal de actualizaciones del launcher configurado.');
  await autoUpdater.downloadUpdate();
  return true;
}

function installLauncherUpdate() {
  autoUpdater.quitAndInstall(false, true);
}

module.exports = {
  configureLauncherUpdates,
  checkLauncherUpdate,
  downloadLauncherUpdate,
  installLauncherUpdate
};
