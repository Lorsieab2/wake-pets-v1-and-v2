#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/../app" && pwd)"

if [ "${1:-}" = "stop" ]; then
  pkill -f 'wake-pets/app|pets-overlay/app' || true
  exit 0
fi

if [ "${1:-}" = "config" ]; then
  shift
  if [ "$#" -gt 0 ]; then
    set -- --config --pets "$@"
  else
    set -- --config
  fi
elif [ "$#" -gt 0 ] && [[ "${1}" != --* ]]; then
  set -- --pets "$@"
fi

if [ ! -x "$APP_DIR/node_modules/.bin/electron" ]; then
  "$SCRIPT_DIR/setup_overlay.sh"
fi

cd "$APP_DIR"
exec npm start -- "$@"
