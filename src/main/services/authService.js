const fs = require('fs');
const path = require('path');
const { Auth } = require('msmc');
const fsp = require('fs/promises');

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`La operación de Microsoft superó el tiempo de espera (${Math.round(timeoutMs / 1000)} s).`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Microsoft/Xbox/Minecraft authentication for premium accounts.
 * Only the long-lived Microsoft refresh token is persisted locally. Passwords
 * and browser cookies never enter the launcher or the repository.
 */
class AuthService {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'minecraft-account.json');
    this.account = null;
    this.load();
  }
  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data && data.refreshToken && data.profile?.id && data.profile?.name) this.account = data;
    } catch (_) { this.account = null; }
    return this.account;
  }
  save(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), { mode: 0o600 });
    try { fs.chmodSync(this.file, 0o600); } catch (_) {}
    this.account = data;
  }
  status() {
    const profile = this.account?.profile;
    return { authenticated: Boolean(profile && this.account?.refreshToken), name: profile?.name || '', id: profile?.id || '', skins: profile?.skins || [], capes: profile?.capes || [] };
  }
  async login() {
    const auth = new Auth('select_account');
    const xbox = await auth.launch('electron', { width: 520, height: 700, resizable: false, autoHideMenuBar: true, title: 'Iniciar sesión con Microsoft' });
    const minecraft = await xbox.getMinecraft();
    if (!minecraft?.profile?.id || !minecraft?.profile?.name) throw new Error('La cuenta Microsoft no tiene un perfil de Minecraft Java válido.');
    this.save({ refreshToken: xbox.save(), profile: minecraft.profile, signedInAt: new Date().toISOString() });
    return this.status();
  }
  async getAuthorization() {
    if (!this.account?.refreshToken) return null;
    const auth = new Auth('select_account');
    const xbox = await auth.refresh(this.account.refreshToken);
    const minecraft = await xbox.getMinecraft();
    this.save({ refreshToken: xbox.save(), profile: minecraft.profile, signedInAt: this.account.signedInAt || new Date().toISOString() });
    return { authorization: minecraft.mclc(true), profile: minecraft.profile };
  }
  async refreshProfile() {
    if (!this.account?.refreshToken) return this.status();
    await this.getAuthorization();
    return this.status();
  }
  async minecraftToken() {
    const session = await this.getAuthorization();
    const authorization = session?.authorization || {};
    const token = authorization.access_token || authorization.accessToken || authorization.token;
    if (!token) throw new Error('Microsoft no devolvió un token de Minecraft válido.');
    return token;
  }
  async listSkins() {
    if (!this.account?.refreshToken) throw new Error('Iniciá sesión con Microsoft para ver tus skins.');
    const token = await this.minecraftToken();
    const response = await fetchWithTimeout('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`No pude consultar tus skins (HTTP ${response.status}).`);
    const profile = await response.json();
    if (profile?.id && profile?.name) this.save({ ...this.account, profile, refreshedAt: new Date().toISOString() });
    return this.status();
  }
  async uploadSkin(filePath, variant = 'classic') {
    if (!this.account?.refreshToken) throw new Error('Iniciá sesión con Microsoft antes de subir una skin.');
    const absolute = path.resolve(String(filePath || ''));
    if (path.extname(absolute).toLowerCase() !== '.png') throw new Error('Las skins deben ser archivos PNG.');
    const stat = await fsp.stat(absolute).catch(() => null);
    if (!stat?.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('La skin no existe o supera el límite de 2 MB.');
    const token = await this.minecraftToken();
    const bytes = await fsp.readFile(absolute);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('El archivo elegido no es un PNG válido.');
    const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
    if (!((width === 64 && height === 64) || (width === 128 && height === 128))) throw new Error('La skin debe medir 64×64 o 128×128 píxeles.');
    const form = new FormData();
    form.append('variant', variant === 'slim' ? 'slim' : 'classic');
    form.append('file', new Blob([bytes], { type: 'image/png' }), path.basename(absolute));
    const response = await fetchWithTimeout('https://api.minecraftservices.com/minecraft/profile/skins', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Microsoft rechazó la skin (HTTP ${response.status})${detail ? `: ${detail.slice(0, 180)}` : '.'}`);
    }
    return this.listSkins();
  }
  logout() {
    this.account = null;
    try { fs.rmSync(this.file, { force: true }); } catch (_) {}
    return this.status();
  }
}

module.exports = { AuthService };
