#!/usr/bin/env bash
# Push the Go engine binary to the connected Android device for dev mode.
# In tauri android dev, assets aren't bundled in the APK, so we push directly.
# The app reads the binary from its data dir via resolve_engine_path().

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
: "${ANDROID_HOME:="$HOME/Android/Sdk"}"
ADB="$ANDROID_HOME/platform-tools/adb"
BINARY="$PROJECT_ROOT/src-tauri/binaries/forbiden-engine-aarch64-linux-android"
PKG="com.forbiden.ide"
TMP_PATH="/data/local/tmp/forbiden-engine"

if [[ ! -f "$BINARY" ]]; then
  echo "[push-engine] Binary not found at $BINARY" >&2
  echo "Run: bun run engine:build:android" >&2
  exit 1
fi

if ! "$ADB" devices | grep -q "device$"; then
  echo "[push-engine] No Android device connected." >&2
  exit 1
fi

echo "[push-engine] Pushing binary to device..."
"$ADB" push "$BINARY" "$TMP_PATH"
"$ADB" shell chmod 755 "$TMP_PATH"

# Copy to all candidate locations that Tauri might resolve on Android.
# Tauri data_dir() may point to the package root or the files/ subdir.
echo "[push-engine] Installing to app data directories..."
for DEST in \
  "/data/data/$PKG/files/forbiden-engine" \
  "/data/data/$PKG/forbiden-engine"; do
  "$ADB" shell "run-as $PKG sh -c 'cp $TMP_PATH $DEST && chmod 755 $DEST'" 2>/dev/null \
    || "$ADB" shell "cp $TMP_PATH $DEST 2>/dev/null && chmod 755 $DEST 2>/dev/null" \
    || true
  echo "[push-engine]   → $DEST"
done

echo "[push-engine] Done. Restart the app on your phone."
