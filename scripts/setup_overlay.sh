#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/../app" && pwd)"

cd "$APP_DIR"

if [ "${1:-}" = "--force" ] || [ ! -x "node_modules/.bin/electron" ]; then
  npm install
else
  printf 'Overlay dependencies already installed in %s\n' "$APP_DIR"
fi
