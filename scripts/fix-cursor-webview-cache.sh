#!/usr/bin/env bash
# Fix "Could not register service worker / document is in an invalid state"
# when opening PNG/SVG preview, extension panels, etc. in Cursor.
#
# Usage: close Cursor completely, then run:
#   bash scripts/fix-cursor-webview-cache.sh

set -euo pipefail

CURSOR_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/Cursor"

if pgrep -f '[Cc]ursor|cursor\.appimage' >/dev/null 2>&1; then
  echo "ERROR: Cursor is still running."
  echo "Quit Cursor completely (all windows), then run this script again."
  echo "Tip: pgrep -af cursor"
  exit 1
fi

echo "Clearing Cursor webview / GPU caches in: $CURSOR_CONFIG"

rm -rf \
  "$CURSOR_CONFIG/Service Worker" \
  "$CURSOR_CONFIG/WebStorage" \
  "$CURSOR_CONFIG/GPUCache" \
  "$CURSOR_CONFIG/Code Cache" \
  "$CURSOR_CONFIG/Cache/Cache_Data" \
  "$CURSOR_CONFIG/CachedData" \
  "$CURSOR_CONFIG/DawnWebGPUCache" \
  "$CURSOR_CONFIG/DawnGraphiteCache"

echo "Done. Start Cursor again."
echo "If PNG preview still fails: Help → Check for Updates, then reload window."
