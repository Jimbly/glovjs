// Steam launcher for macOS. Built as a universal binary; macOS picks the
// slice matching the CPU, and each slice launches the matching game build:
//   MyGame-macos (arm64 slice)   ->  MyGame-macos-arm64
//   MyGame-macos (x86_64 slice)  ->  MyGame-macos-x64
// The game builds must be in the same directory as the launcher.
//
// A compiled binary is used instead of a shell script because SIP strips
// DYLD_* variables (including Steam's DYLD_INSERT_LIBRARIES overlay hook)
// when launching protected binaries like /bin/bash or /usr/bin/arch.
//
// Build with build_launcher.sh (Zig + llvm-lipo), or on a Mac:
//   clang -O2 -arch arm64 -arch x86_64 -mmacosx-version-min=10.13 launcher.c -o MyGame-macos

#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#if defined(__aarch64__)
#define SUFFIX "-arm64"
#else
#define SUFFIX "-x64"
#endif

int main(int argc, char *argv[]) {
    (void)argc;
    char exe[PATH_MAX], target[PATH_MAX];
    uint32_t size = sizeof(exe);
    if (_NSGetExecutablePath(exe, &size) != 0 || !realpath(exe, target) ||
        strlcat(target, SUFFIX, sizeof(target)) >= sizeof(target)) {
        fprintf(stderr, "launcher: could not determine executable path\n");
        return 1;
    }
    argv[0] = target;
    execv(target, argv); // inherits environ, including DYLD_INSERT_LIBRARIES
    perror(target);
    return 1;
}
