#!/usr/bin/env bash
# Idempotent: installs Blender 4.2.3 LTS (headless) into /tmp/tools plus the X/GL libs it needs.
# Used by tools/blender/build.sh to regenerate apps/client/public/models/runner.glb.
set -euo pipefail
VERSION="4.2.3"
TOOLS="${BLENDER_TOOLS_DIR:-/tmp/tools}"
DIR="$TOOLS/blender-$VERSION-linux-x64"
URL="https://download.blender.org/release/Blender4.2/blender-$VERSION-linux-x64.tar.xz"

LIBS=(libsm6 libxi6 libxrender1 libxkbcommon0 libxxf86vm1 libxfixes3 libgl1 libegl1)
missing=()
for lib in "${LIBS[@]}"; do dpkg -s "$lib" >/dev/null 2>&1 || missing+=("$lib"); done
if ((${#missing[@]})); then
  SUDO=""; [[ $(id -u) -ne 0 ]] && SUDO="sudo -n"
  $SUDO apt-get update -y >/dev/null
  $SUDO apt-get install -y "${missing[@]}"
fi

if [[ ! -x "$DIR/blender" ]]; then
  mkdir -p "$TOOLS"
  curl -fL --retry 3 "$URL" -o "$TOOLS/blender.tar.xz"
  tar -xJf "$TOOLS/blender.tar.xz" -C "$TOOLS"
  rm -f "$TOOLS/blender.tar.xz"
fi
"$DIR/blender" -b --version | head -1
echo "BLENDER=$DIR/blender"
