const { contextBridge, ipcRenderer } = require('electron');
const { createPublicBridge } = require('./preloadBridge');

contextBridge.exposeInMainWorld('eternal', createPublicBridge(ipcRenderer));
