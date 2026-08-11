#!/bin/zsh

set -u

export PATH="/Users/Admin/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/usr/sbin:/sbin"
SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"

cd "$PROJECT_DIR" || exit 1
exec /usr/local/bin/node scripts/codex-task-bridge.mjs
