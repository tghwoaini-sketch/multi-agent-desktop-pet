#!/bin/zsh

set -u

PROJECT_DIR="/Users/Admin/Documents/项目/交互看板"
DESK_URL="http://localhost:3001/work"
BRIDGE_URL="http://127.0.0.1:43127"
LOG_DIR="$PROJECT_DIR/logs"
PID_FILE="$LOG_DIR/desk.pid"
BRIDGE_PID_FILE="$LOG_DIR/codex-bridge.pid"

export PATH="/Users/Admin/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$LOG_DIR"

if ! curl --fail --silent --max-time 2 "$DESK_URL" >/dev/null 2>&1; then
  cd "$PROJECT_DIR" || exit 1
  nohup npm run desk >>"$LOG_DIR/taskboard.log" 2>&1 &
  echo $! >"$PID_FILE"
fi

for attempt in {1..20}; do
  curl --fail --silent --max-time 2 "$DESK_URL" >/dev/null 2>&1 && break
  sleep 1
done

# The web page and the Codex bridge are independent processes. A stale web
# server must not prevent the task bridge from being restarted.
if ! curl --fail --silent --max-time 2 "$BRIDGE_URL/control" >/dev/null 2>&1; then
  cd "$PROJECT_DIR" || exit 1
  nohup env XIAOBU_CODEX_BRIDGE_START_PAUSED=1 npm run codex:bridge >>"$LOG_DIR/codex-bridge.log" 2>&1 &
  echo $! >"$BRIDGE_PID_FILE"
fi

open /Users/Admin/Applications/OpenPets.app >/dev/null 2>&1 || true

for attempt in {1..10}; do
  if curl --fail --silent --max-time 2 "$BRIDGE_URL/control" >/dev/null 2>&1; then
    curl --fail --silent --max-time 2 -X POST "$BRIDGE_URL/control" \
      -H 'Content-Type: application/json' \
      -d '{"enabled":true}' >/dev/null 2>&1 || true
    break
  fi
  sleep 1
done
