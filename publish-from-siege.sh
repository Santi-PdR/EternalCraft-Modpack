#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${1:-}"
REPO="${2:-${ETERNAL_PACK_REPO:-}}"
SOURCE="$HOME/.sklauncher/instances/siege"
if [[ -z "$VERSION" || -z "$REPO" ]]; then
  echo "Uso: ./publish-from-siege.sh VERSION USUARIO/REPO"
  echo "Ejemplo: ./publish-from-siege.sh 0.7.1 Santi-PdR/EternalCraft-Modpack"
  exit 1
fi
npm install
node scripts/publish-pack-github.js --repo "$REPO" --source "$SOURCE" --version "$VERSION"
