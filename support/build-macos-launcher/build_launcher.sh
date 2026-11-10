#!/bin/bash
# Builds launcher.c into a universal (arm64 + x86_64) macOS executable.
# Usage: ./build_launcher.sh [output-name]    (default: MyGame-macos)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

OUT="${1:-MyGame-macos}"

# Zig needs a writable cache; HOME may not be writable when run with --user.
export ZIG_GLOBAL_CACHE_DIR="${ZIG_GLOBAL_CACHE_DIR:-/tmp/zig-cache}"
export ZIG_LOCAL_CACHE_DIR="${ZIG_LOCAL_CACHE_DIR:-/tmp/zig-cache}"

if command -v zig >/dev/null; then ZIG=(zig); else ZIG=(python3 -m ziglang); fi
LIPO="$(command -v llvm-lipo || ls /usr/bin/llvm-lipo-* 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$LIPO" ] || { echo "error: llvm-lipo not found" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"${ZIG[@]}" cc -O2 -Wall -Wextra -target aarch64-macos launcher.c -o "$TMP/$OUT-arm64"
"${ZIG[@]}" cc -O2 -Wall -Wextra -target x86_64-macos  launcher.c -o "$TMP/$OUT-x64"
"$LIPO" -create "$TMP/$OUT-arm64" "$TMP/$OUT-x64" -output "$OUT"
chmod +x "$OUT"

"$LIPO" -info "$OUT"