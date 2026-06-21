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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default to the installed NDK if the env var isn't set (bun doesn't load ~/.bashrc)
: "${ANDROID_HOME:="$HOME/Android/Sdk"}"
: "${ANDROID_NDK_HOME:="$ANDROID_HOME/ndk/30.0.14904198"}"

NDK_BIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"

if [[ ! -d "$NDK_BIN" ]]; then
  echo "Error: NDK toolchain not found at $NDK_BIN" >&2
  echo "Check your ANDROID_NDK_HOME path." >&2
  exit 1
fi

CLANG="$NDK_BIN/aarch64-linux-android33-clang"
# Intermediate output in binaries/ (keeps the sidecar path for reference)
SIDECAR="$PROJECT_ROOT/src-tauri/binaries/forbiden-engine-aarch64-linux-android"
# Final destination: Vite public/ so it lands in dist/ and Tauri bundles it
# as an asset accessible via app.asset_resolver() on Android.
ASSET_DIR="$PROJECT_ROOT/public/native"
ASSET_OUT="$ASSET_DIR/forbiden-engine"

echo "[android-engine] Building Go engine for android/arm64..."
cd "$PROJECT_ROOT/engine"
CC="$CLANG" CGO_ENABLED=1 GOOS=android GOARCH=arm64 \
  go build -o "$SIDECAR" .

mkdir -p "$ASSET_DIR"
cp "$SIDECAR" "$ASSET_OUT"

echo "[android-engine] Done"
echo "  sidecar → $SIDECAR"
echo "  asset   → $ASSET_OUT  (bundled in APK via Vite dist/)"
