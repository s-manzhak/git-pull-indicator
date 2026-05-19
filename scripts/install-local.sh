#!/usr/bin/env bash
# Установка расширения в Cursor без F5 / Extension Development Host
set -euo pipefail

EXT_SRC="$(cd "$(dirname "$0")/.." && pwd)"
LINK_DIR="${HOME}/.cursor/extensions"
LINK_NAME="git-pull-indicator-dev"
LINK_PATH="${LINK_DIR}/${LINK_NAME}"

mkdir -p "$LINK_DIR"
rm -rf "$LINK_PATH"
ln -sfn "$EXT_SRC" "$LINK_PATH"

echo "Сборка TypeScript…"
(cd "$EXT_SRC" && npm run compile --silent)

echo "✓ Расширение установлено:"
echo "  $LINK_PATH -> $EXT_SRC"
echo ""
echo "Дальше:"
echo "  1. Cursor → Developer: Reload Window"
echo "  2. File → Open Folder → папка с вашими git-репозиториями"
echo "  3. Статус-бар: Git Pull: ~64 repos"
echo "  4. Боковая панель Git Pull → Repositories (↓ pull / ↑ push)"
echo ""
echo "Если в Explorer нет значков — включите:"
echo '  "explorer.decorations.badges": true'
echo '  "gitPullIndicator.useAsciiBadges": true'
