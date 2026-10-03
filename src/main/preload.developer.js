const { contextBridge, ipcRenderer } = require('electron');
const { createPublicBridge } = require('./preloadBridge');
const { createDeveloperBridge } = require('./developer/developerBridge');

contextBridge.exposeInMainWorld('eternal', {
  ...createPublicBridge(ipcRenderer),
  ...createDeveloperBridge(ipcRenderer)
});
