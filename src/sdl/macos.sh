#!/bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$DIR" || exit 1

ARM64_EXE="SDLProjectNameMacro-macos-arm64"
X64_EXE="SDLProjectNameMacro-macos-x64"

# Check the true hardware architecture, bypassing Rosetta emulation
IS_ARM64=$(sysctl -n hw.optional.arm64 2>/dev/null)

if [ "$IS_ARM64" = "1" ]; then
    # Hardware supports ARM64 natively - "Apple Silicon"
    # `arch -arm64` forces native execution even if
    # this script was itself started from a translated (x86_64) process.
    exec arch -arm64 "./$ARM64_EXE" "$@"
else
    # Intel Mac.
    exec "./$X64_EXE" "$@"
fi
