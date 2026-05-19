#!/usr/bin/env bash
# Alias for open-debug-host.sh
set -euo pipefail
exec "$(dirname "$0")/open-debug-host.sh" "$@"
