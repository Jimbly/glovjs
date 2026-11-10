FROM node:22-bookworm-slim

# RUN apt-get update && apt-get install -y \
#     git \
#     g++ \
#     libssl-dev \
#     libplist-dev \
#     make \
#     && rm -rf /var/lib/apt/lists/*

# RUN git clone git://git.saurik.com/ldid.git /tmp/ldid \
#     && cd /tmp/ldid \
#     && git submodule update --init \
#     && g++ -pipe -o ldid ldid.cpp -I. -x c lookup2.c -lcrypto -lplist-2.0 -Os -fwhole-program -flto -s -static \
#     && cp -f ldid /usr/local/bin/ldid \
#     && rm -rf /tmp/ldid

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download the pre-compiled, static ldid binary for Linux (amd64/x86_64)
RUN curl -k -L -o /usr/local/bin/ldid https://github.com/jesec/ldid-static/releases/download/v2.1.4/ldid-amd64 \
    && chmod +x /usr/local/bin/ldid

WORKDIR /app

ENV PKG_CACHE_PATH=/app/.pkg-cache/

# CMD ["ldid", "--help"]
# usage: ldid -S[entitlements.xml] <binary>
#    ldid -e MobileSafari
#    ldid -S cat
#    ldid -Stfp.xml gdb

# CMD ["npx", "@yao-pkg/pkg", "."]
# CMD ["llvm-lipo", "-create", "app-arm64", "app-x64", "-output", "app-universal"]
