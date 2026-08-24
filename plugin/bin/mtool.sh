#!/bin/sh
# mtool launcher for the methodology plugin. Pre-package era: mtool runs
# from a methodology-tools checkout via tsx. Resolution order:
#   1. $MTOOL_HOME — a methodology-tools checkout (set this for
#      marketplace-installed copies of the plugin);
#   2. the checkout this plugin lives in (dev layout: plugin/ inside
#      the methodology-tools repo).
# Documented limitation until mtool ships to a package registry.
set -e
HOME_DIR="${MTOOL_HOME:-}"
if [ -z "$HOME_DIR" ]; then
  CANDIDATE="$(cd "$(dirname "$0")/../.." && pwd)"
  if [ -f "$CANDIDATE/src/cli.ts" ]; then
    HOME_DIR="$CANDIDATE"
  fi
fi
if [ -z "$HOME_DIR" ] || [ ! -f "$HOME_DIR/src/cli.ts" ]; then
  echo "mtool: no methodology-tools checkout found — set MTOOL_HOME" >&2
  exit 2
fi
if [ ! -x "$HOME_DIR/node_modules/.bin/tsx" ]; then
  echo "mtool: run 'npm install' in $HOME_DIR first" >&2
  exit 2
fi
exec node "$HOME_DIR/node_modules/.bin/tsx" "$HOME_DIR/src/cli.ts" "$@"
