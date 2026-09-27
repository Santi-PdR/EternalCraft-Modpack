function appImageRuntimeMessage({ packaged = false, platform = process.platform, appImagePath = process.env.APPIMAGE } = {}) {
  if (!packaged || platform !== 'linux' || String(appImagePath || '').trim()) return '';
  return 'El launcher se abrió desde una copia extraída y no puede autoactualizarse. Abrilo desde Eternal Craft Launcher en el menú de aplicaciones.';
}

module.exports = { appImageRuntimeMessage };
