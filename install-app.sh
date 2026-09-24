#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Eternal Craft Launcher"
APP_ID="uy.eternalcraft.launcher"
APP_HOME="$HOME/.local/opt/eternal-craft-launcher"
APPIMAGE="$APP_HOME/Eternal-Craft-Launcher.AppImage"
WRAPPER="$HOME/.local/bin/eternal-craft-launcher"
DESKTOP="$HOME/.local/share/applications/$APP_ID.desktop"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
SOURCE="$HOME/.sklauncher/instances/siege"
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 0.25.0)"

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
npm run dist:linux
BUILT="$(find dist -maxdepth 1 -type f -name '*.AppImage' | head -n1)"
[[ -n "$BUILT" ]] || { echo "No se generó la AppImage."; exit 1; }

mkdir -p "$APP_HOME" "$(dirname "$DESKTOP")" "$ICON_DIR" "$HOME/.local/bin"
if [[ -f "$APPIMAGE" ]]; then cp -f "$APPIMAGE" "$APPIMAGE.previous" || true; fi
cp -f "$BUILT" "$APPIMAGE"
chmod +x "$APPIMAGE"
cp -f resources/icons/icon.png "$ICON_DIR/$APP_ID.png"

cat > "$WRAPPER" <<WRAPPER
#!/usr/bin/env bash
exec "$APPIMAGE" "\$@"
WRAPPER
chmod +x "$WRAPPER"

cat > "$DESKTOP" <<DESKTOP
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Launcher oficial de Eternal Craft // SIEGE
Exec=$WRAPPER %U
Icon=$APP_ID
Terminal=false
Categories=Game;
Keywords=minecraft;eternal craft;siege;mods;launcher;
StartupWMClass=uy.eternalcraft.launcher
X-GNOME-SingleWindow=true
DESKTOP
chmod +x "$DESKTOP"
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
command -v kbuildsycoca6 >/dev/null && kbuildsycoca6 >/dev/null 2>&1 || true

echo
echo "✓ Eternal Craft Launcher quedó instalado como aplicación propia."
echo "  Buscalo en el menú de aplicaciones; no uses npm start para el uso normal."
echo
nohup "$WRAPPER" >/tmp/eternal-craft-launcher.log 2>&1 &
