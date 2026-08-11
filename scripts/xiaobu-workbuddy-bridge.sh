#!/bin/zsh

set -u

export PATH="/Users/Admin/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/usr/sbin:/sbin"
export XIAOBU_CUSTOM_BUBBLE_OVERLAY="1"
cd /Users/Admin/xiaobu-taskboard || exit 1
exec /usr/local/bin/node scripts/workbuddy-task-bridge.mjs
