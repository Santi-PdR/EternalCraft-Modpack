# Eternal Craft Launcher 0.25.17

Official launcher for **Eternal Craft // SIEGE**.

- Minecraft **1.20.1**
- Forge **47.4.10**
- Server connection is managed by the modpack configuration; the launcher does not display a potentially stale online/offline status.
- Player builds: **Windows**
- Maintainer build: **Fedora/Linux** with Developer Mode

Eternal Craft Launcher is intentionally not a generic multi-instance launcher. It manages one official SIEGE installation and aims to make installing, repairing, updating and launching that pack safe and simple.

## 0.25.0 — Safety & continuity pass

### Mods

- Modrinth browser locked to Forge 1.20.1 with categories, environment and sorting.
- Optional CurseForge integration through the official API/proxy architecture.
- Install Plan before Modrinth changes: required dependencies, estimated download size, release channel and compatibility warnings.
- Queue preflight before installing several mods.
- Personal mod release channels: **stable**, **stable + beta**, or **all**.
- **Pinned versions** opt out of automatic/bulk updates.
- Source provenance labels: official pack, Modrinth, CurseForge or local/unverified.
- Official files stay protected from player mod management.

### Crash Guard

- Local change journal for installs, updates, toggles and game exits.
- Correlates unexpected exits with recently changed personal mods.
- Can quarantine likely suspects with one action.
- Creates a recovery point before risky automatic recovery actions.

### Personal Vault

Optional user-owned continuity layer. It does not require an Eternal Craft account or proprietary cloud.

- Syncs `options.txt` and `servers.dat` when present.
- Optional screenshots.
- Optional worlds/saves, off by default.
- Extra user-selected relative folders such as `figura` or `resourcepacks`.
- Rejects `mods`, `.launcher`, absolute paths and path traversal.
- Detects local-newer conflicts before restore.
- Forced restore can create a recovery point first.
- Works with a normal folder or one already synced by OneDrive, Dropbox, Nextcloud, Syncthing and similar software.

## Player experience

- Native display resolution by default, with manual override.
- Dedicated GPU preference enabled by default.
- RAM recommendation and presets.
- Managed Java 17 when needed.
- Server endpoint is kept in the pack configuration; the launcher avoids showing a stale online/offline indicator for exaroton lobby endpoints.
- Differential pack updates using SHA-256, staging, cache and rollback.
- Offline manifest cache.
- Update Center for launcher, pack, personal mods and runtime.
- Safe Launch temporarily disables only personal mods.
- Manual and automatic recovery points.
- Local playtime/session statistics.
- Connectivity, storage and diagnostic tools.
- Themes, SIEGE backgrounds, UI scale, density and reduced-motion controls.
- System tray, native notifications, autostart and Windows Jump List integration.

## Developer Mode — Fedora/Linux only

Developer Mode is hidden from player Windows builds and protected by a local password.

- Master source: `~/.sklauncher/instances/siege`
- Test instance: `~/.sklauncher/instances/test-1`
- Install/test mods directly in `test-1`
- SHA-256 comparison `test-1 → SIEGE`
- Promote individual or all changed mods with backup
- Publication preflight
- Preview exact changed files before publishing
- Source fingerprint protection: publishing is rejected if SIEGE changed after preview
- Differential GitHub release publishing

La primera publicación puede tardar varios minutos si la instancia tiene cientos de archivos: cada hash nuevo se conserva como asset reutilizable para que las siguientes versiones suban únicamente los cambios. El publicador usa lotes pequeños y, si GitHub rechaza un lote, reintenta esos archivos de forma individual sin perder el progreso.

## Build / install on Fedora

```bash
chmod +x install-app.sh
./install-app.sh
```

This builds and installs the AppImage in the user's local application directories. No root access is required for the local app installation flow.

## Windows distribution

The project includes Electron Builder configuration and GitHub Actions for Windows NSIS/portable artifacts. Player builds do not expose Developer Mode.

## Privacy and secrets

- Session statistics and Crash Guard history stay local.
- Exported settings exclude Developer password and CurseForge API key.
- Personal Vault is opt-in and points to a folder chosen by the user.
- GitHub authentication uses the maintainer's existing local `gh` session instead of storing a GitHub password in the launcher.

## Microsoft account and Discord

- The player can sign in from **Ajustes → Juego → Cuenta premium**. Microsoft authentication opens in a separate account window; only the refresh token is kept in the local user-data folder with restrictive file permissions. No Microsoft password, token or CurseForge key is committed to GitHub.
- Discord channels are presented as official links from the launcher. Reading messages in real time would require a Discord bot or a public feed hosted by the server; the launcher does not embed user credentials or scrape private channels. The configured channel links remain available without that extra service.

See `docs/CHANGELOG-v0.25.0.md` and `docs/LAUNCHER-LANDSCAPE-v0.25.0.md` for this release's design notes.
