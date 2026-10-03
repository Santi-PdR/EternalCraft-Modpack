function launcherBuildConfig(base, variant = 'public') {
  const isDeveloper = variant === 'developer';
  const config = {
    ...base,
    appId: isDeveloper ? 'uy.eternalcraft.launcher.developer' : 'uy.eternalcraft.launcher',
    productName: isDeveloper ? 'Eternal Craft Launcher Developer' : 'Eternal Craft Launcher',
    executableName: isDeveloper ? 'EternalCraftLauncherDeveloper' : 'EternalCraftLauncher',
    directories: { ...base.directories, output: isDeveloper ? 'dist-developer' : 'dist' },
    extraMetadata: { ...(base.extraMetadata || {}), main: isDeveloper ? 'src/main/developerMain.js' : 'src/main/publicMain.js' },
    files: isDeveloper
      ? [
          'src/**/*', 'resources/**/*', 'package.json', 'scripts/**/*',
          'build/preload/developer.cjs',
          '!build/preload/public.cjs', '!src/main/preload.js', '!src/main/preload.developer.js',
          '!src/main/preloadBridge.js', '!src/main/developer/developerBridge.js'
        ]
      : [
          'src/**/*', 'resources/**/*', 'package.json', 'build/preload/public.cjs',
          '!src/main/developer/**', '!src/main/developerMain.js', '!src/main/preload.js', '!src/main/preload.developer.js',
          '!src/main/preloadBridge.js', '!src/main/services/developerService.js',
          '!build/preload/developer.cjs', '!scripts/**'
        ],
    extraResources: isDeveloper
      ? [{ from: 'resources', to: 'resources' }, { from: 'scripts', to: 'scripts' }]
      : [{ from: 'resources', to: 'resources' }],
    artifactName: isDeveloper
      ? 'Eternal-Craft-Launcher-Developer-${version}-${os}-${arch}.${ext}'
      : base.artifactName
  };

  if (isDeveloper) {
    config.publish = null;
    config.linux = {
      ...base.linux,
      desktop: {
        ...base.linux?.desktop,
        entry: { ...base.linux?.desktop?.entry, Name:'Eternal Craft Launcher Developer', StartupWMClass:'uy.eternalcraft.launcher.developer' }
      }
    };
    config.win = { ...base.win, target:['nsis','portable'] };
    config.nsis = { ...base.nsis, shortcutName:'Eternal Craft Launcher Developer' };
  }
  return config;
}

module.exports = { launcherBuildConfig };
