#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/../app" && pwd)"

if [ ! -x "$APP_DIR/node_modules/.bin/electron" ]; then
  "$SCRIPT_DIR/setup_overlay.sh"
fi

cd "$APP_DIR"
exec npm start -- "$@"
