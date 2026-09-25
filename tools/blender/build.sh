#!/usr/bin/env bash
# Regenerates apps/client/public/models/runner.glb from tools/blender/build_runner.py.
#   tools/blender/build.sh                 # build + compress
#   tools/blender/build.sh --render /tmp/rv [--shots front,back]   # also render Cycles previews
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BLENDER="${BLENDER:-/tmp/tools/blender-4.2.3-linux-x64/blender}"
[[ -x "$BLENDER" ]] || bash "$ROOT/scripts/setup-blender.sh"
RAW="${TMPDIR:-/tmp}/runner.raw.glb"
OUT="$ROOT/apps/client/public/models/runner.glb"
mkdir -p "$(dirname "$OUT")"
"$BLENDER" -b --factory-startup --python "$ROOT/tools/blender/build_runner.py" -- --out "$RAW" "$@" 2>&1 \
  | grep -E "TRIS|EXPORTED|RENDERED|Error|Traceback|line [0-9]+" || true
[[ -s "$RAW" ]] || { echo "export failed" >&2; exit 1; }
# Meshopt compression + quantisation; three.js decodes it via GLTFLoader.setMeshoptDecoder.
# -kn keeps the named marker nodes (thruster.L/R, core.back/front) used by runner.ts.
npx -y gltfpack@0.22.0 -i "$RAW" -o "$OUT" -cc -kn -km -ke 2>&1 | grep -v "npm warn" || true
chmod 644 "$OUT"
ls -l "$OUT"
