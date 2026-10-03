#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Eternal Craft Launcher Developer"
APP_ID="uy.eternalcraft.launcher.developer"
APP_HOME="$HOME/.local/opt/eternal-craft-launcher-developer"
APPIMAGE="$APP_HOME/Eternal-Craft-Launcher-Developer.AppImage"
WRAPPER="$HOME/.local/bin/eternal-craft-launcher-developer"
DESKTOP="$HOME/.local/share/applications/$APP_ID.desktop"
DESKTOP_DIRS=("$HOME/Escritorio" "$HOME/Desktop")
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
SOURCE="$HOME/.sklauncher/instances/siege"
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 0.25.0)"

launcher_pids() {
  ps -eo pid=,args= | awk -v executable="$APP_HOME/app/EternalCraftLauncherDeveloper" -v appimage="$APPIMAGE" \
    '$2 == executable || $2 == appimage { print $1 }'
}

launcher_main_pids() {
  ps -eo pid=,args= | awk -v executable="$APP_HOME/app/EternalCraftLauncherDeveloper" -v appimage="$APPIMAGE" \
    '($2 == executable || $2 == appimage) && $0 !~ /--type=/ { print $1 }'
}

stop_existing_launcher() {
  local main_pids all_pids pid attempt
  main_pids="$(launcher_main_pids)"
  all_pids="$(launcher_pids)"
  if [[ -z "$main_pids" && -z "$all_pids" ]]; then return 0; fi

  echo "→ Cerrando la versión abierta antes de reemplazar sus archivos..."
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null || true
  done <<< "$main_pids"

  for attempt in {1..15}; do
    all_pids="$(launcher_pids)"
    [[ -z "$all_pids" ]] && { echo "✓ Launcher cerrado."; return 0; }
    sleep 1
  done

  # A main process may have exited while a Chromium helper remained behind.
  # Ask only those exact launcher processes to exit; never force-kill them.
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null || true
  done <<< "$all_pids"
  for attempt in {1..5}; do
    all_pids="$(launcher_pids)"
    [[ -z "$all_pids" ]] && { echo "✓ Procesos auxiliares cerrados."; return 0; }
    sleep 1
  done

  echo "ERROR: el launcher no terminó de cerrarse. No se reemplazaron los archivos para evitar una instalación mezclada."
  return 1
}

preflight_writable_directory() {
  local directory="$1" probe
  mkdir -p "$directory" || {
    echo "ERROR: no se puede preparar el directorio $directory. No se modificó la instalación actual."
    return 1
  }
  probe="$(mktemp "$directory/.eternal-craft-write-test.XXXXXX")" || {
    echo "ERROR: el directorio $directory no permite escrituras. No se modificó la instalación actual."
    return 1
  }
  rm -f "$probe"
}

printf '\n══════════════════════════════════════════════\n'
printf '  ETERNAL CRAFT · INSTALAR LAUNCHER v%s\n' "$VERSION"
printf '══════════════════════════════════════════════\n\n'
command -v npm >/dev/null || { echo "Falta npm/Node.js."; exit 1; }

echo "→ Preparando dependencias..."
npm install --no-audit --no-fund

echo "→ Sincronizando fondos desde la instancia SIEGE..."
node scripts/sync-siege-visuals.js --source="$SOURCE" || true
echo "→ Completando recursos visuales faltantes desde GitHub..."
node scripts/fetch-siege-visuals-github.js || true

echo "→ Compilando AppImage propia..."
npm run check
npm run dist:developer:linux
BUILT="$(find dist-developer -maxdepth 1 -type f -name "Eternal-Craft-Launcher-Developer-${VERSION}-*.AppImage" -print -quit)"
if [[ -z "$BUILT" ]]; then
  echo "No se encontró una AppImage que coincida con la versión ${VERSION}."
  echo "Artefactos disponibles:"
  find dist-developer -maxdepth 1 -type f -name '*.AppImage' -print | sort -V
  exit 1
fi

# A single-instance lock can route a fresh desktop launch to the old process.
# Stop it only after the new build is ready, and before touching installed files.
for target_dir in "$APP_HOME" "$(dirname "$WRAPPER")" "$(dirname "$DESKTOP")" "$ICON_DIR"; do
  preflight_writable_directory "$target_dir"
done

stop_existing_launcher

mkdir -p "$APP_HOME" "$(dirname "$DESKTOP")" "$ICON_DIR" "$HOME/.local/bin"
if [[ -f "$APPIMAGE" ]]; then cp -f "$APPIMAGE" "$APPIMAGE.previous" || true; fi
cp -f "$BUILT" "$APPIMAGE"
chmod +x "$APPIMAGE"

# Keep the extracted AppDir in sync too. Fedora systems without /dev/fuse use
# this copy directly, so refreshing only the AppImage would keep launching the
# previous build forever.
APP_STAGING="$APP_HOME/app.new"
rm -rf "$APP_STAGING"
mkdir -p "$APP_STAGING"
cp -a dist-developer/linux-unpacked/. "$APP_STAGING/"
if [[ -d "$APP_HOME/app" ]]; then
  APP_BACKUP="$APP_HOME/app.previous-${VERSION}-$(date +%Y%m%d-%H%M%S)"
  mv "$APP_HOME/app" "$APP_BACKUP"
fi
mv "$APP_STAGING" "$APP_HOME/app"

cp -f resources/icons/icon.png "$ICON_DIR/$APP_ID.png"

cat > "$WRAPPER" <<WRAPPER
#!/usr/bin/env bash
set -euo pipefail
if [[ -x "$APPIMAGE" ]]; then
  # AppImageUpdater needs APPIMAGE to identify and replace this exact file.
  # Use FUSE when available; otherwise AppImage's built-in extraction mode.
  if [[ -r /dev/fuse && -w /dev/fuse ]]; then
    exec "$APPIMAGE" "\$@"
  fi
  exec "$APPIMAGE" --appimage-extract-and-run "\$@"
fi
if [[ -x "$APP_HOME/app/EternalCraftLauncherDeveloper" ]]; then
  # Recovery fallback only: extracted AppDir installs cannot self-update.
  exec "$APP_HOME/app/EternalCraftLauncherDeveloper" "\$@"
fi
echo "No se encontró Eternal Craft Launcher Developer en $APPIMAGE ni en $APP_HOME/app." >&2
exit 1
WRAPPER
chmod +x "$WRAPPER"

cat > "$DESKTOP" <<DESKTOP
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Herramientas privadas de desarrollo para Eternal Craft // SIEGE
Exec=$WRAPPER %U
Icon=$APP_ID
Terminal=false
Categories=Game;
Keywords=minecraft;eternal craft;siege;mods;launcher;
StartupWMClass=uy.eternalcraft.launcher.developer
X-GNOME-SingleWindow=true
DESKTOP
chmod +x "$DESKTOP"
for desktop_dir in "${DESKTOP_DIRS[@]}"; do
  if [[ -d "$desktop_dir" ]]; then
    cp -f "$DESKTOP" "$desktop_dir/Eternal Craft Launcher Developer.desktop"
    chmod +x "$desktop_dir/Eternal Craft Launcher Developer.desktop"
  fi
done
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
command -v kbuildsycoca6 >/dev/null && kbuildsycoca6 >/dev/null 2>&1 || true

echo
echo "✓ Eternal Craft Launcher Developer quedó instalado como aplicación propia."
echo "  Buscalo en el menú de aplicaciones; este acceso es solo para mantenimiento y publicación privada."
echo
if [[ "${1:-}" != "--no-launch" ]]; then
  nohup "$WRAPPER" >/tmp/eternal-craft-launcher.log 2>&1 &
else
  echo "El launcher quedó cerrado, tal como se solicitó."
fi
