# Eternal Craft Launcher 0.40.1

Official launcher for **Eternal Craft // SIEGE**.

- Minecraft **1.20.1**
- Forge **47.4.10**
- Server connection is managed by the modpack configuration; the launcher does not display a potentially stale online/offline status.
- Player builds: **Windows**
- Maintainer build: **Fedora/Linux** with Developer Mode

Eternal Craft Launcher is intentionally not a generic multi-instance launcher. It manages one official SIEGE installation and aims to make installing, repairing, updating and launching that pack safe and simple.

## 0.40.1 — Dummies vs Noobs backgrounds and theme polish

This patch keeps the existing SIEGE layout and removes generated placeholder scenes. The appearance gallery now uses only the Dummies vs Noobs artwork shipped with the launcher, while themes apply consistently to navigation, panels, controls, labels, shadows and the play surface.

## 0.40.0 — Visual system and launcher polish

The 0.40 line keeps the current SIEGE workflow while adding a stronger visual system: richer theme presets, expanded background scenes, clearer button hierarchy, keyboard focus states and responsive action wrapping. Appearance changes are saved with the launcher configuration and remain compatible with older settings files.

### Mods

- Installed-mods workspace focused on the local SIEGE instance, with search, filters, sorting and update actions.
- Official pack files stay protected; personal mods can be enabled, disabled, updated or removed from the installed list.
- Modrinth metadata is used for update checks without exposing a public add/explore catalog to players.
- Fourteen theme presets and thirteen Dummies vs Noobs background scenes, including Neon Relay, Verdant Ops and Monolith Black.
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

La primera publicación puede tardar varios minutos si la instancia tiene cientos de archivos: cada hash nuevo se conserva como asset reutilizable para que las siguientes versiones suban únicamente los cambios. El publicador usa lotes pequeños, reintenta los archivos individualmente si GitHub rechaza un lote y salta automáticamente los assets que ya existen si una publicación se reanuda.

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
