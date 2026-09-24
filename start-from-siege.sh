#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SOURCE="${HOME}/.sklauncher/instances/siege"
echo "══════════════════════════════════════════════"
echo " ETERNAL CRAFT LAUNCHER · DEV DESDE SIEGE"
echo "══════════════════════════════════════════════"
echo
echo "→ Fuente maestra: $SOURCE"
echo "→ Preparando dependencias del launcher..."
npm install
echo "→ Sincronizando fondos reales de SIEGE si están disponibles..."
node scripts/sync-siege-visuals.js --source="$SOURCE" || true
echo "→ Construyendo el pack diferencial y abriendo el launcher..."
node scripts/dev-pack.js --source "$SOURCE" --version "1.0.0"
