#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

REPO="${1:-Santi-PdR/EternalCraft-Modpack}"
VERSION="$(node -p "require('./package.json').version")"
TAG="launcher-v$VERSION"

command -v gh >/dev/null || { echo "Falta GitHub CLI (gh)."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Iniciá sesión una sola vez con: gh auth login"; exit 1; }
command -v git >/dev/null || { echo "Falta git."; exit 1; }

if [[ ! -d .git ]]; then
  git init -b main
  git config user.name "Eternal Craft Publisher" 2>/dev/null || true
  git config user.email "launcher@eternalcraft.local" 2>/dev/null || true
fi

git add .
if ! git diff --cached --quiet; then
  git commit -m "Eternal Craft Launcher v$VERSION"
fi

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  echo "→ Creando $REPO..."
  gh repo create "$REPO" --public --description "Launcher oficial de Eternal Craft // SIEGE" --source=. --remote=origin --push
else
  URL="https://github.com/$REPO.git"
  if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$URL"; else git remote add origin "$URL"; fi
  git branch -M main
  git push -u origin main
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then git tag -d "$TAG" >/dev/null; fi
git tag "$TAG"
git push origin "$TAG" --force

echo
echo "✓ Código publicado. GitHub Actions está generando Windows y Linux."
echo "  Actions: https://github.com/$REPO/actions"
echo "  Release: https://github.com/$REPO/releases/tag/$TAG"
