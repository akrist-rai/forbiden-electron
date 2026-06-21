#!/usr/bin/env bash
# Cross-compile the Go engine for Android ARM64.
#
# Prerequisites:
#   - Android NDK installed (set ANDROID_NDK_HOME)
#   - Go installed with CGO capable of cross-compilation
#
# Usage:
#   bun run engine:build:android
#   (or) bash scripts/build-engine-android.sh

set -euo pipefail

if [[ -z "${ANDROID_NDK_HOME:-}" ]]; then
  echo "Error: ANDROID_NDK_HOME is not set." >&2
  echo "Set it to your NDK root, e.g.:" >&2
  echo "  export ANDROID_NDK_HOME=\$HOME/Android/Sdk/ndk/<version>" >&2
  exit 1
fi

NDK_BIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"

if [[ ! -d "$NDK_BIN" ]]; then
  echo "Error: NDK toolchain not found at $NDK_BIN" >&2
  echo "Check your ANDROID_NDK_HOME path." >&2
  exit 1
fi

CLANG="$NDK_BIN/aarch64-linux-android33-clang"
OUT="../src-tauri/binaries/forbiden-engine-aarch64-linux-android"

echo "[android-engine] Building Go engine for android/arm64..."
CC="$CLANG" CGO_ENABLED=1 GOOS=android GOARCH=arm64 \
  go build -o "$OUT" .

echo "[android-engine] Done → $OUT"
