const fs = require('fs');
const path = require('path');
const { Auth } = require('msmc');

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
  logout() {
    this.account = null;
    try { fs.rmSync(this.file, { force: true }); } catch (_) {}
    return this.status();
  }
}

module.exports = { AuthService };
