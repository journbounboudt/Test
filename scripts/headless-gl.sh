#!/usr/bin/env bash
# Starts a headless Chrome with software WebGL (SwiftShader) on a debugging port, for art
# rendering and visual checks in GPU-less CI/sandboxes. Usage: scripts/headless-gl.sh [port] [extra flags]
set -euo pipefail
PORT="${1:-9333}"
shift || true
CHROME="${CHROME_BIN:-$(ls -d "$HOME"/.agent-browser/browsers/chrome-*/chrome 2>/dev/null | head -1)}"
DIR="$(dirname "$CHROME")"
PIDFILE="/tmp/vr-chrome-$PORT.pid"
if [[ -f "$PIDFILE" ]]; then kill "$(cat "$PIDFILE")" 2>/dev/null || true; sleep 1; fi
rm -rf "/tmp/vr-chrome-$PORT"
VK_ICD_FILENAMES="$DIR/vk_swiftshader_icd.json" nohup "$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --ignore-gpu-blocklist --remote-debugging-port="$PORT" --user-data-dir="/tmp/vr-chrome-$PORT" --disable-gpu-sandbox --use-angle=swiftshader "$@" about:blank \
  > "/tmp/vr-chrome-$PORT.log" 2>&1 &
echo $! > "$PIDFILE"
sleep 2
echo "chrome pid $(cat "$PIDFILE") on port $PORT"
