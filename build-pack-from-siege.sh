#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SOURCE="$HOME/.sklauncher/instances/siege"
VERSION="${1:-$(date +%Y.%m.%d-%H%M)}"
node scripts/sync-siege-visuals.js --source="$SOURCE" || true
node scripts/build-pack.js --source "$SOURCE" --version "$VERSION"
echo
echo "Pack creado en: $(pwd)/pack-dist"
