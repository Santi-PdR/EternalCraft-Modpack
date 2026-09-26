# Eternal Craft Launcher 0.65.6

Official launcher for **Eternal Craft // SIEGE**.

- Minecraft **1.20.1**
- Forge **47.4.10**
- Server connection is managed by the modpack configuration; the launcher does not display a potentially stale online/offline status.
- Player builds: **Windows**
- Maintainer build: **Fedora/Linux** with Developer Mode

Eternal Craft Launcher is intentionally not a generic multi-instance launcher. It manages one official SIEGE installation and aims to make installing, repairing, updating and launching that pack safe and simple.

## 0.65.6 — Páginas recuperables y errores IPC aislados

- Las páginas de Mods, Modpack, Actualizaciones, Galería, Soporte y Ajustes siguen renderizando aunque no exista un canal remoto publicado.
- Los errores IPC y las salidas cerradas de terminal ya no pueden cerrar el proceso principal por un EPIPE.
- El modo desarrollador ya no contiene credenciales de servicios de mods: solo publica el modpack mediante GitHub CLI en la build privada de mantenimiento.
- La publicación se ejecuta en un proceso asíncrono con registro de progreso, sin bloquear la ventana mientras prepara o sube blobs grandes.
- El actualizador del launcher usa el feed de GitHub Releases y requiere una acción explícita para descargar y reiniciar con la nueva versión.
- Apariencia suma temas Graphite, Slate, Smoke e Iron para configuraciones oscuras y grises, con guardado automático y sin perfiles visuales acumulados.
- Se conserva la colección de fondos oficiales de Dummies vs Noobs y la protección de archivos oficiales del pack.

## 0.63.0 — Revisión integral del launcher

- Añade **Revisar todo** desde Inicio y desde la paleta de comandos (`Ctrl+Shift+R`) para actualizar en conjunto modpack, mods, soporte, almacenamiento, galería y Personal Vault sin bloquear la interfaz.
- Añade restablecimiento de filtros de Mods, marca de última comprobación del modpack y controles responsive para evitar solapamientos en barras y filtros.
- Añade **Restablecer apariencia**, aplicando valores seguros de tema, fondo, escala, densidad y efectos.
- Mantiene el contenido oficial de Mods instalado protegido y la galería local con filtros persistentes.

## 0.62.0 — Preferencias persistentes de Galería

- La Galería conserva búsqueda, tipo y orden entre sesiones.
- Se añadió un botón para restablecer todos los filtros sin perder la carpeta elegida.
- Las preferencias se limitan y validan al importar o exportar ajustes para mantener el archivo seguro y portable.

## 0.61.0 — Galería filtrable, perfiles visuales y publicación con preflight

- La Galería permite buscar por nombre, filtrar imágenes o videos y ordenar por fecha, nombre o tamaño.
- Ajustes permite guardar hasta ocho perfiles locales de tema, fondo, colores, densidad y efectos para aplicarlos con un clic.
- La publicación del modpack ejecuta un preflight obligatorio: valida GitHub CLI, repositorio, instancia SIEGE y carpeta `mods` antes de comenzar la subida.
- Los perfiles exportados solo contienen preferencias visuales; nunca incluyen contraseñas, API keys, tokens ni rutas privadas.

## 0.60.0 — Personalization studio, Microsoft skins and media vault

- Nueva Galería local para capturas y clips: el usuario elige una carpeta, filtra imágenes y videos, ve metadatos y abre archivos sin subirlos a ningún servicio.
- Galería de skins integrada para cuentas Microsoft, con consulta del perfil, modelos Classic/Slim y subida de PNG directamente a Minecraft Services.
- Estudio de personalización con color principal, color secundario, radio de tarjetas, temas, fondos, densidad, escala, transparencias, ruido y movimiento reducido.
- Preferencias de la Galería, la cuenta y la apariencia se guardan de forma atómica y se restauran al volver a abrir el launcher.
- La publicación del pack sigue aislada en la build privada de mantenimiento y conserva el flujo seguro de previsualización, preflight y subida reanudable.

## 0.51.0 — Full flow hardening and reliable publishing

- El login premium persiste el modo de cuenta y se renueva correctamente al volver a abrir el launcher.
- El chequeo de salud ya no bloquea el inicio por el ping de Exaroton; el estado del servidor es informativo y separado del diagnóstico local.
- Las operaciones de mods se serializan también en el proceso principal para evitar dobles clics, estados intermedios y archivos parcialmente modificados.
- Las comprobaciones de actualizaciones y compatibilidad comparten operaciones en curso, con avisos sin duplicados y guardado automático consistente para las preferencias visuales.
- El publicador envía el manifest mediante un archivo temporal para evitar `spawnSync E2BIG` en packs grandes.
- Mantenimiento abre directamente el `latest.log` más reciente y vuelve a la carpeta de logs si todavía no existe ninguno.

## 0.50.1 — Single-flight diagnostics and direct latest-log access

- Las comprobaciones de salud, Crash Guard y conectividad comparten una sola operación mientras están en curso; cambiar de pestaña o pulsar varias veces ya no duplica escaneos ni parpadeos.
- Mantenimiento abre directamente el `latest.log` más reciente y vuelve a la carpeta de logs si todavía no existe ninguno.
- Los errores de conectividad dejan un estado visible y un mensaje claro para que una comprobación no parezca congelada.

## 0.50.0 — Coordinated operations and visible autosave

- Las comprobaciones de modpack, mods, servidor y actualizaciones evitan solicitudes duplicadas si se pulsa varias veces.
- Los errores asíncronos inesperados se muestran como aviso controlado en vez de desaparecer silenciosamente.
- Ajustes muestra `PENDIENTE`, `GUARDANDO…`, `AUTOGUARDADO` o `NO GUARDADO` durante el guardado automático.
- El modo desarrollador conserva el aislamiento de la build privada y sus comprobaciones de GitHub ligeras.

## 0.40.3 — Developer status isolation and lighter settings

- El estado de GitHub del modo desarrollador solo se consulta en la build privada de mantenimiento.
- Las comprobaciones de sesión se cachean durante unos segundos para evitar congelar la interfaz al cambiar de pestaña o preparar una publicación.

## 0.40.2 — Stability and responsive interface hardening

This patch keeps settings autosave reliable while the onboarding profile is incomplete, keeps rotating backgrounds synchronized with their controls, holds pack operations long enough to show their final state, and improves the smallest supported desktop layouts so action groups wrap instead of overlapping. Exaroton lobby responses are shown as unconfirmed rather than online.

## 0.40.1 — Dummies vs Noobs backgrounds and theme polish

This patch keeps the existing SIEGE layout and removes generated placeholder scenes. The appearance gallery now uses only the Dummies vs Noobs artwork shipped with the launcher, while themes apply consistently to navigation, panels, controls, labels, shadows and the play surface.

## 0.40.0 — Visual system and launcher polish

The 0.40 line keeps the current SIEGE workflow while adding a stronger visual system: richer theme presets, expanded background scenes, clearer button hierarchy, keyboard focus states and responsive action wrapping. Appearance changes are saved with the launcher configuration and remain compatible with older settings files.

### Mods

- Installed-mods workspace focused on the local SIEGE instance, with search, filters, sorting and update actions.
- Official pack files stay protected; personal mods can be enabled, disabled, updated or removed from the installed list.
- - Fourteen theme presets and thirteen Dummies vs Noobs background scenes, including Neon Relay, Verdant Ops and Monolith Black.
- **Pinned versions** opt out of automatic/bulk updates.
- Source provenance labels: official pack or local/manual.
- Official files stay protected from player mod management; personal JARs remain local and manually managed.

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
- Exported settings exclude the Developer password and private credentials.
- Personal Vault is opt-in and points to a folder chosen by the user.
- GitHub authentication uses the maintainer's existing local `gh` session instead of storing a GitHub password in the launcher.

## Microsoft account and Discord

- The player can sign in from **Ajustes → Juego → Cuenta premium**. Microsoft authentication opens in a separate account window; only the refresh token is kept in the local user-data folder with restrictive file permissions. No Microsoft password or token is committed to GitHub.
- Discord channels are presented as official links from the launcher. Reading messages in real time would require a Discord bot or a public feed hosted by the server; the launcher does not embed user credentials or scrape private channels. The configured channel links remain available without that extra service.

See `docs/CHANGELOG-v0.25.0.md` and `docs/LAUNCHER-LANDSCAPE-v0.25.0.md` for this release's design notes.
