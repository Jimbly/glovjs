FROM python:3.13-slim-bookworm

# Zig: C cross-compiler that bundles macOS headers/libc stubs (no Apple SDK needed).
# llvm-14: provides llvm-lipo-14 for merging the arm64 + x86_64 builds.
RUN pip install --no-cache-dir ziglang==0.17.1 \
 && apt-get update \
 && apt-get install -y --no-install-recommends llvm-14 \
 && rm -rf /var/lib/apt/lists/* \
 && ln -s /usr/lib/llvm-*/bin/llvm-lipo /usr/local/bin/llvm-lipo

WORKDIR /work