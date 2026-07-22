#!/bin/zsh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p .runtime logs

PID_FILE=".runtime/live-mlb-refresh.pid"
LOG_FILE="logs/live-mlb-refresh.log"
TODAY="$(TZ=America/New_York date +%F)"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "MLB live refresh is already running as PID $OLD_PID."
    exit 0
  fi
  rm -f "$PID_FILE"
fi

nohup python3 -u scripts/live_mlb_refresh.py \
  --date "$TODAY" \
  --interval 2 \
  --pregame-interval 10 \
  --settled-interval 60 \
  >>"$LOG_FILE" 2>&1 &

PID=$!
echo "$PID" > "$PID_FILE"

sleep 1

if kill -0 "$PID" 2>/dev/null; then
  echo "STARTED: MLB live refresh"
  echo "PID: $PID"
  echo "DATE: $TODAY"
  echo "LOG: $ROOT/$LOG_FILE"
else
  echo "ERROR: live refresh failed to start."
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi
