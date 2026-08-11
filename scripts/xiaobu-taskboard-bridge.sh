#!/bin/zsh

set -u

export PATH="/Users/Admin/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/usr/sbin:/sbin"
cd /Users/Admin/xiaobu-taskboard || exit 1
exec /usr/local/bin/node scripts/codex-task-bridge.mjs
