function createDeveloperBridge(ipcRenderer) {
  function listener(channel, handler) {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
  return {
    developerStatus: () => ipcRenderer.invoke('developer:status'),
    developerPreflight: () => ipcRenderer.invoke('developer:preflight'),
    developerBackupSource: () => ipcRenderer.invoke('developer:backup-source'),
    developerSetup: (password) => ipcRenderer.invoke('developer:setup', password),
    developerUnlock: (password) => ipcRenderer.invoke('developer:unlock', password),
    developerResetAccess: () => ipcRenderer.invoke('developer:reset-access'),
    developerLock: () => ipcRenderer.invoke('developer:lock'),
    developerChangePassword: (payload) => ipcRenderer.invoke('developer:change-password', payload),
    developerChooseSource: () => ipcRenderer.invoke('developer:choose-source'),
    developerChooseTest: () => ipcRenderer.invoke('developer:choose-test'),
    developerOpenTest: () => ipcRenderer.invoke('developer:open-test'),
    developerLaunchTest: () => ipcRenderer.invoke('developer:launch-test'),
    developerCopyModTest: (filename) => ipcRenderer.invoke('developer:copy-mod-test', filename),
    developerSyncTestMods: () => ipcRenderer.invoke('developer:sync-test-mods'),
    developerPublish: (payload) => ipcRenderer.invoke('developer:publish', payload),
    developerPreviewPublish: (payload) => ipcRenderer.invoke('developer:publish-preview', payload),
    developerCompareTest: () => ipcRenderer.invoke('developer:test-compare'),
    developerPromoteTestMod: (filename) => ipcRenderer.invoke('developer:test-promote', filename),
    developerPromoteAllTestMods: () => ipcRenderer.invoke('developer:test-promote-all'),
    onDeveloperPublishLog: (handler) => listener('developer:publish-log', handler)
  };
}

module.exports = { createDeveloperBridge };
