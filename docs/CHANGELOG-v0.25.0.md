# Eternal Craft Launcher 0.25.0

## Safety-first mod management

- **Install Plan** before adding catálogo externo projects: resolves required dependencies, estimates the download and surfaces client/server compatibility warnings before touching the instance.
- **Queue preflight** aggregates downloads, dependencies and warnings before installing several projects.
- **Pinned mods** are excluded from automatic and bulk catálogo externo updates until explicitly released.
- **Release channels** for personal mods: release, beta or alpha, with release as the default.
- **Source provenance** in the library: official pack, catálogo externo, proveedor externo or unverified local file.

## Crash Guard

- Local change journal for installs, updates, enable/disable operations and game exits.
- Correlates recent personal-mod changes with an unexpected game exit.
- Can quarantine suspected personal mods in one action and creates a recovery point first.

## Personal Vault

- Optional, user-owned sync folder. No Eternal Craft account or proprietary cloud is required.
- Always includes `options.txt` and `servers.dat` when present.
- Optional screenshots and saves.
- Supports extra user-selected relative paths such as `figura` or `resourcepacks`.
- Explicitly rejects `mods`, `.launcher`, absolute paths and path traversal.
- Detects newer local files before restore and asks before overwriting them.
- A forced restore creates a recovery point first when recovery protection is enabled.
- Works with an ordinary local folder or a folder already synced by OneDrive, Dropbox, Nextcloud, Syncthing and similar tools.

## Developer workflow

- Preview fingerprint protection remains mandatory: publishing is rejected when SIEGE changed after the preview.
- `test-1 → SIEGE` promotion remains separate from publishing.
- Change history and Crash Guard also help diagnose developer-added mods before promotion.

## Platform and compatibility

- Launcher: `0.25.0`
- Required by newly generated packs: `minimumLauncher: 0.25.0`
- Minecraft: `1.20.1`
- Forge: `47.4.10`
