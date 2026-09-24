const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function presetFile(resourcesDir, preset = 'balanced') {
  const safe = ['performance', 'balanced', 'quality'].includes(preset) ? preset : 'balanced';
  return path.join(resourcesDir, 'game-preset', `options-${safe}.txt`);
}

async function ensurePreset(root, resourcesDir, preset = 'balanced', force = false) {
  await fsp.mkdir(root, { recursive: true });
  const target = path.join(root, 'options.txt');
  if (!force) {
    try {
      const stat = await fsp.stat(target);
      if (stat.isFile() && stat.size > 0) return { applied: false, path: target, reason: 'existing' };
    } catch (_) {}
  }
  const source = presetFile(resourcesDir, preset);
  if (!fs.existsSync(source)) throw new Error(`Preset no encontrado: ${preset}`);
  await fsp.copyFile(source, target);
  return { applied: true, path: target, preset };
}

module.exports = { ensurePreset, presetFile };
