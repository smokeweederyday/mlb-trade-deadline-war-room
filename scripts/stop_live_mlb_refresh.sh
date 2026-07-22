#!/bin/zsh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PID_FILE=".runtime/live-mlb-refresh.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "MLB live refresh is not running."
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"

if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "STOPPED: MLB live refresh PID $PID"
else
  echo "Removed stale MLB live-refresh PID file."
fi

rm -f "$PID_FILE"
