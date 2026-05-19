#!/usr/bin/env bash
# Launch Extension Development Host with a test workspace folder.
# Usage: GIT_TEST_FOLDER=/path/to/your/repos ./scripts/open-debug-host.sh
set -euo pipefail

EXT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="${GIT_TEST_FOLDER:-${1:-}}"

if [[ -z "$TEST_DIR" ]]; then
  echo "Usage: GIT_TEST_FOLDER=/path/to/workspace $0" >&2
  echo "   or: $0 /path/to/workspace" >&2
  exit 1
fi

if [[ ! -d "$TEST_DIR" ]]; then
  echo "Folder not found: $TEST_DIR" >&2
  exit 1
fi

cd "$EXT_DIR"
npm run compile --silent

CURSOR_BIN="${CURSOR_BIN:-cursor}"
if ! command -v "$CURSOR_BIN" >/dev/null 2>&1; then
  echo "Cursor/VS Code CLI not found. Set CURSOR_BIN=/path/to/cursor" >&2
  exit 1
fi

exec "$CURSOR_BIN" --extensionDevelopmentPath="$EXT_DIR" "$TEST_DIR"
