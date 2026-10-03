#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
}

function inlineModule(source, name) {
  return `const ${name} = { exports: {} };\n(function(module, exports) {\n${source}\n})(${name}, ${name}.exports);`;
}

function createBundles() {
  const publicBridge = read('src/main/preloadBridge.js');
  const developerBridge = read('src/main/developer/developerBridge.js');
  const common = `'use strict';\nconst { contextBridge, ipcRenderer } = require('electron');\n${inlineModule(publicBridge, 'publicBridgeModule')}\nconst { createPublicBridge } = publicBridgeModule.exports;\n`;
  return {
    public: `${common}contextBridge.exposeInMainWorld('eternal', createPublicBridge(ipcRenderer));\n`,
    developer: `${common}${inlineModule(developerBridge, 'developerBridgeModule')}\nconst { createDeveloperBridge } = developerBridgeModule.exports;\ncontextBridge.exposeInMainWorld('eternal', { ...createPublicBridge(ipcRenderer), ...createDeveloperBridge(ipcRenderer) });\n`
  };
}

function buildPreloads(outputDirectory = path.join(root, 'build', 'preload')) {
  const bundles = createBundles();
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const [variant, source] of Object.entries(bundles)) {
    const file = path.join(outputDirectory, `${variant}.cjs`);
    const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, source, 'utf8');
    fs.renameSync(temporary, file);
  }
  return Object.keys(bundles).map((variant) => path.join(outputDirectory, `${variant}.cjs`));
}

if (require.main === module) {
  for (const file of buildPreloads()) console.log(`Bundled sandbox preload: ${path.relative(root, file)}`);
}

module.exports = { createBundles, buildPreloads };
