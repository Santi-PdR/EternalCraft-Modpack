const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

function hashPassword(password, saltHex) {
  return crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32).toString('hex');
}

function resolveMinecraftRoot(candidate) {
  const roots = [candidate, path.join(candidate || '', '.minecraft'), path.join(candidate || '', 'minecraft')];
  for (const root of roots) {
    try { if (root && fs.statSync(path.join(root, 'mods')).isDirectory()) return root; } catch (_) {}
  }
  return candidate || '';
}
function sha256Sync(file) {
  const h = crypto.createHash('sha256'); h.update(fs.readFileSync(file)); return h.digest('hex');
}
function scanModDirectory(candidate) {
  const root = resolveMinecraftRoot(candidate); const dir = path.join(root, 'mods'); const map = new Map();
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.jar$/i.test(name)) continue;
      const full = path.join(dir, name); let stat; try { stat = fs.statSync(full); } catch (_) { continue; }
      if (!stat.isFile()) continue;
      map.set(name, { name, full, size: stat.size, modifiedAt: stat.mtime.toISOString(), sha256: sha256Sync(full) });
    }
  } catch (_) {}
  return { root, dir, map };
}

function safeEqualHex(a, b) {
  try {
    const aa = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch (_) { return false; }
}

class DeveloperService {
  constructor(userDataDir, scriptRoot) {
    this.file = path.join(userDataDir, 'developer-secrets.json');
    this.scriptRoot = scriptRoot;
    this.publishWorkDir = path.join(userDataDir, 'pack-dist-publish');
    this.unlocked = false;
  }
  isMaintenanceBuild() { return process.env.ETERNAL_DEVELOPER_BUILD === '1' && process.platform === 'linux'; }
  load() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) { return {}; } }
  save(data) { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(data, null, 2), { mode: 0o600 }); }
  status() {
    const s = this.load(); let githubReady = false, githubLogin = '';
    const developerAllowed = this.isMaintenanceBuild();
    try {
      const v = spawnSync('gh', ['--version'], { encoding: 'utf8' });
      if (v.status === 0) {
        const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' }); githubReady = auth.status === 0;
        if (githubReady) { const me = spawnSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' }); if (me.status === 0) githubLogin = String(me.stdout || '').trim(); }
      }
    } catch (_) {}
    return {
      configured: developerAllowed && Boolean(s.passwordSalt && s.passwordHash), unlocked: developerAllowed && this.unlocked,
      curseforgeConfigured: developerAllowed && Boolean(s.curseforgeApiKey), githubReady, githubLogin,
      canSetup: developerAllowed, developerAllowed, maintenancePlatform: process.platform
    };
  }
  requireAvailable() { if (!this.isMaintenanceBuild()) throw new Error('El modo desarrollador solo está disponible en la build privada de mantenimiento.'); }
  setup(password) {
    this.requireAvailable();
    if (this.status().configured) throw new Error('El modo desarrollador ya tiene contraseña.');
    if (String(password || '').length < 6) throw new Error('Usá una contraseña de al menos 6 caracteres.');
    const salt = crypto.randomBytes(16).toString('hex'); const s = this.load();
    this.save({ ...s, passwordSalt: salt, passwordHash: hashPassword(password, salt) }); this.unlocked = true; return this.status();
  }
  unlock(password) {
    this.requireAvailable();
    const s = this.load(); if (!s.passwordSalt || !s.passwordHash) throw new Error('Primero configurá una contraseña de desarrollador.');
    if (!safeEqualHex(hashPassword(password, s.passwordSalt), s.passwordHash)) throw new Error('Contraseña incorrecta.');
    this.unlocked = true; return this.status();
  }
  lock() { this.unlocked = false; return this.status(); }
  changePassword(currentPassword, nextPassword) {
    this.unlock(currentPassword); if (String(nextPassword || '').length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    const s = this.load(); const salt = crypto.randomBytes(16).toString('hex'); this.save({ ...s, passwordSalt: salt, passwordHash: hashPassword(nextPassword, salt) }); this.unlocked = true; return this.status();
  }
  setCurseForgeApiKey(key) { this.requireUnlocked(); const s = this.load(); this.save({ ...s, curseforgeApiKey: String(key || '').trim() }); return this.status(); }
  getCurseForgeApiKey() { return this.isMaintenanceBuild() ? String(this.load().curseforgeApiKey || '') : ''; }
  requireUnlocked() { this.requireAvailable(); if (!this.unlocked) throw new Error('Modo desarrollador bloqueado.'); }
  preflight(source, test, repo) {
    this.requireUnlocked();
    const status = this.status();
    const src = scanModDirectory(source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'));
    const tst = scanModDirectory(test || path.join(os.homedir(), '.sklauncher', 'instances', 'test-1'));
    let repoReady = false;
    if (status.githubReady && repo && repo.includes('/')) {
      try { repoReady = spawnSync('gh', ['repo', 'view', repo, '--json', 'name'], { encoding:'utf8' }).status === 0; } catch (_) {}
    }
    const diff = this.compareTest(src.root, tst.root);
    return {
      githubReady: status.githubReady, githubLogin: status.githubLogin, repoReady, repo: repo || '',
      sourceReady: Boolean(src.root && fs.existsSync(path.join(src.root, 'mods'))), sourceRoot: src.root, sourceMods: src.map.size,
      testReady: Boolean(tst.root && fs.existsSync(path.join(tst.root, 'mods'))), testRoot: tst.root, testMods: tst.map.size,
      pendingTestChanges: Number(diff.counts?.testOnly || 0) + Number(diff.counts?.changed || 0), diff
    };
  }
  backupSourceMods(source) {
    this.requireUnlocked();
    const src = scanModDirectory(source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'));
    if (!src.root || !fs.existsSync(src.dir)) throw new Error('No encontré la carpeta mods de SIEGE.');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(src.root, '.launcher', 'developer-backups', `manual-${stamp}`);
    fs.mkdirSync(out, { recursive:true });
    let copied = 0;
    for (const mod of src.map.values()) { fs.copyFileSync(mod.full, path.join(out, mod.name)); copied++; }
    return { ok:true, directory:out, copied };
  }
  async chooseDirectory(dialog, mainWindow, title, current, fallback) {
    this.requireUnlocked();
    const result = await dialog.showOpenDialog(mainWindow, { title, defaultPath: current || fallback, properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] || null);
  }
  chooseSource(dialog, mainWindow, current) { return this.chooseDirectory(dialog, mainWindow, 'Elegir instancia maestra SIEGE', current, path.join(os.homedir(), '.sklauncher', 'instances', 'siege')); }
  chooseTest(dialog, mainWindow, current) { return this.chooseDirectory(dialog, mainWindow, 'Elegir instancia de pruebas test-1', current, path.join(os.homedir(), '.sklauncher', 'instances', 'test-1')); }
  resolveRoot(candidate) { return resolveMinecraftRoot(candidate); }

  compareTest(source, test) {
    this.requireUnlocked();
    const a = scanModDirectory(source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'));
    const b = scanModDirectory(test || path.join(os.homedir(), '.sklauncher', 'instances', 'test-1'));
    const testOnly = []; const sourceOnly = []; const changed = []; const same = [];
    for (const [name, mod] of b.map) {
      const old = a.map.get(name);
      if (!old) testOnly.push(mod);
      else if (old.sha256 !== mod.sha256) changed.push({ name, source: old, test: mod });
      else same.push(name);
    }
    for (const [name, mod] of a.map) if (!b.map.has(name)) sourceOnly.push(mod);
    const newest = [...testOnly, ...changed.map((x) => x.test)].sort((x,y)=>new Date(y.modifiedAt)-new Date(x.modifiedAt));
    return { sourceRoot:a.root, testRoot:b.root, counts:{testOnly:testOnly.length,sourceOnly:sourceOnly.length,changed:changed.length,same:same.length}, testOnly, sourceOnly, changed, newest };
  }
  promoteTestMod(source, test, filename) {
    this.requireUnlocked();
    const a = scanModDirectory(source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'));
    const b = scanModDirectory(test || path.join(os.homedir(), '.sklauncher', 'instances', 'test-1'));
    const name = path.basename(String(filename || ''));
    if (!/\.jar$/i.test(name) || !b.map.has(name)) throw new Error('No encontré ese mod en test-1.');
    fs.mkdirSync(a.dir, { recursive: true });
    const target = path.join(a.dir, name);
    if (fs.existsSync(target)) {
      const backupDir = path.join(a.root, '.launcher', 'developer-backups', new Date().toISOString().replace(/[:.]/g,'-'));
      fs.mkdirSync(backupDir, { recursive: true }); fs.copyFileSync(target, path.join(backupDir, name));
    }
    fs.copyFileSync(b.map.get(name).full, target);
    return { ok:true, filename:name, target, sha256:sha256Sync(target) };
  }
  previewPublish({ repo, source, version = '', notes = '', onLine = () => {} }) {
    this.requireUnlocked();
    if (!repo || !repo.includes('/')) return Promise.reject(new Error('Configurá el repositorio como USUARIO/REPO.'));
    const script = path.join(this.scriptRoot, 'publish-pack-github.js');
    fs.mkdirSync(this.publishWorkDir, { recursive: true });
    const args = [script, '--preview', '--repo', repo, '--source', source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'), '--out', this.publishWorkDir];
    if (version) args.push('--version', version); if (notes) args.push('--notes', notes);
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: this.publishWorkDir, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore','pipe','pipe'] });
      let output=''; const collect=(buf)=>{const text=String(buf);output+=text;text.split(/\r?\n/).filter(Boolean).forEach(onLine);};
      child.stdout.on('data',collect); child.stderr.on('data',collect); child.on('error',reject);
      child.on('close',code=>{
        if(code!==0) return reject(new Error(output.trim()||`Preview falló (${code})`));
        const line=output.split(/\r?\n/).find((x)=>x.startsWith('PREVIEW_JSON:'));
        if(!line) return reject(new Error('No pude leer el resumen previo de publicación.'));
        try{return resolve(JSON.parse(line.slice('PREVIEW_JSON:'.length)));}catch(err){return reject(err);}
      });
    });
  }

  publish({ repo, source, version = '', notes = '', expectedFingerprint = '', onLine = () => {} }) {
    this.requireUnlocked();
    if (!repo || !repo.includes('/')) return Promise.reject(new Error('Configurá el repositorio como USUARIO/REPO.'));
    const script = path.join(this.scriptRoot, 'publish-pack-github.js'); if (!fs.existsSync(script)) return Promise.reject(new Error('No encontré el publicador del modpack.'));
    fs.mkdirSync(this.publishWorkDir, { recursive: true });
    const args = [script, '--repo', repo, '--source', source || path.join(os.homedir(), '.sklauncher', 'instances', 'siege'), '--out', this.publishWorkDir];
    if (version) args.push('--version', version); if (notes) args.push('--notes', notes); if(expectedFingerprint) args.push('--expected-fingerprint', expectedFingerprint);
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: this.publishWorkDir, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; const collect = (buf) => { const text = String(buf); output += text; text.split(/\r?\n/).filter(Boolean).forEach(onLine); };
      child.stdout.on('data', collect); child.stderr.on('data', collect); child.on('error', reject);
      child.on('close', code => code === 0 ? resolve({ ok: true, output }) : reject(new Error(output.trim() || `Publicación falló (${code})`)));
    });
  }
}
module.exports = { DeveloperService };
