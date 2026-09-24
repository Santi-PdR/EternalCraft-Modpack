const fs = require('fs');
const path = require('path');

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base;
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = deepMerge(out[key] || {}, value);
    else out[key] = value;
  }
  return out;
}
function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function defaultInstallDirectory(userDataDir) {
  const home = require('os').homedir();
  const candidates = [
    path.join(home, '.sklauncher', 'instances', 'siege'),
    path.join(home, '.sklauncher', 'instances', 'SIEGE'),
    path.join(userDataDir, 'EternalCraft')
  ];
  for (const candidate of candidates) {
    try { if (fs.statSync(path.join(candidate, 'mods')).isDirectory()) return candidate; } catch (_) {}
  }
  return path.join(userDataDir, 'EternalCraft');
}

class ConfigStore {
  constructor({ defaultsPath, userDataDir }) {
    this.defaultsPath = defaultsPath;
    this.userDataDir = userDataDir;
    this.configPath = path.join(userDataDir, 'config.json');
    this.backupPath = path.join(userDataDir, 'config.json.bak');
    this.lastRecovery = null;
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  readDefaults() { return JSON.parse(fs.readFileSync(this.defaultsPath, 'utf8')); }
  recoverInterruptedWrite() {
    if (fs.existsSync(this.configPath) || !fs.existsSync(this.backupPath)) return;
    try {
      fs.renameSync(this.backupPath, this.configPath);
      this.lastRecovery = { backupPath: this.configPath, message: 'Se recuperó una escritura interrumpida de los ajustes.', at: new Date().toISOString() };
    } catch (_) {}
  }
  readUser() {
    this.recoverInterruptedWrite();
    if (!fs.existsSync(this.configPath)) return {};
    try { return JSON.parse(fs.readFileSync(this.configPath, 'utf8')); }
    catch (error) {
      try {
        const broken = path.join(this.userDataDir, `config.corrupt-${timestamp()}.json`);
        try { fs.renameSync(this.configPath, broken); }
        catch (_) { fs.copyFileSync(this.configPath, broken); try { fs.rmSync(this.configPath, { force:true }); } catch (_) {} }
        this.lastRecovery = { backupPath: broken, message: error.message || String(error), at: new Date().toISOString() };
      } catch (_) {}
      return {};
    }
  }
  load() {
    const merged = deepMerge(this.readDefaults(), this.readUser());
    if (!merged.pack.installDirectory) merged.pack.installDirectory = defaultInstallDirectory(this.userDataDir);
    return merged;
  }
  save(patch) {
    const next = deepMerge(this.load(), patch);
    const tmp = `${this.configPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding:'utf8', mode:0o600 });
    let movedOld = false;
    try {
      try { fs.rmSync(this.backupPath, { force:true }); } catch (_) {}
      if (fs.existsSync(this.configPath)) { fs.renameSync(this.configPath, this.backupPath); movedOld = true; }
      fs.renameSync(tmp, this.configPath);
      try { fs.rmSync(this.backupPath, { force:true }); } catch (_) {}
    } catch (error) {
      try { fs.rmSync(tmp, { force:true }); } catch (_) {}
      if (movedOld && !fs.existsSync(this.configPath) && fs.existsSync(this.backupPath)) {
        try { fs.renameSync(this.backupPath, this.configPath); } catch (_) {}
      }
      throw error;
    }
    return next;
  }
  recoveryInfo() { return this.lastRecovery; }
}
module.exports = { ConfigStore, deepMerge };
