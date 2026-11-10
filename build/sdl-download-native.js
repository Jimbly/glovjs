/* globals fetch */
// Downloads prebuilt @kmamal/sdl and @kmamal/gl binaries for all platforms into
//   src/sdl/native/{sdl,gl}/<platform>-<arch>/ (see src/client/require_deps.js)
// Usage: node build/download-native.js [--abi=127]
//   --abi: Node ABI of the runtime for @kmamal/gl (defaults to the running Node's)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const argv = require('minimist')(process.argv.slice(2));

const root = path.join(__dirname, '..');
const abi = argv.abi || process.versions.modules;

const PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-arm64', 'darwin-x64'];

function pkgVersion(name) {
  // eslint-disable-next-line import/no-dynamic-require
  return require(path.join(root, 'node_modules', name, 'package.json')).version; // eslint-disable-line n/global-require
}

const LIBS = {
  sdl: (v, plat) => `https://github.com/kmamal/node-sdl/releases/download/v${v}/sdl.node-v${v}-${plat}.tar.gz`,
  gl: (v, plat) => `https://github.com/kmamal/headless-gl/releases/download/v${v}/gl-v${v}-node_v${abi}-${plat}.tar.gz`,
};

function tarField(header, start, len) {
  return header.toString('utf8', start, start + len).replace(/\0.*$/s, '');
}

// Returns [{ name, mode, data }] for regular files and [{ name, link }] for symlinks
function untar(buf) {
  let entries = [];
  for (let pos = 0; pos + 512 <= buf.length && buf[pos];) {
    let header = buf.subarray(pos, pos + 512);
    let size = parseInt(tarField(header, 124, 12), 8);
    let type = String.fromCharCode(header[156]);
    let name = tarField(header, 0, 100).replace(/^\.\//, '');
    if (type === '0' || type === '\0') {
      entries.push({
        name,
        mode: parseInt(tarField(header, 100, 8), 8),
        data: buf.subarray(pos + 512, pos + 512 + size)
      });
    } else if (type === '2') {
      entries.push({ name, link: tarField(header, 157, 100) });
    } else {
      // Directories and PAX headers (e.g. macOS xattrs) are not needed
      assert('5xg'.includes(type), `Unsupported tar entry type "${type}" for ${name}`);
    }
    pos += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

async function fetchAndExtract(url, out_dir) {
  console.log(`Fetching ${url}`);
  let response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  let entries = untar(zlib.gunzipSync(Buffer.from(await response.arrayBuffer())));
  let files = {};
  for (let entry of entries) {
    assert(!entry.name.includes('/'), `Unexpected path in archive: ${entry.name}`);
    if (entry.data) {
      files[entry.name] = entry;
    }
  }
  for (let entry of entries) {
    if (entry.data || (/\.(so|dylib)$/).test(entry.name)) {
      // Skip unversioned symlinks (libSDL3.so, libSDL3.dylib): link-time only
      continue;
    }
    // Write needed symlinks (libSDL3.so.0) as copies so they survive Windows and git
    let target = files[entry.link];
    assert(target, `Unresolved symlink in archive: ${entry.name} -> ${entry.link}`);
    files[entry.name] = { ...target, name: entry.name };
    if ((/\.so\.\d+\.\d+\.\d+$/).test(target.name)) {
      // Full-version file (libSDL3.so.0.4.14) is only loaded via its soname
      delete files[target.name];
    }
  }

  fs.rmSync(out_dir, { recursive: true, force: true });
  fs.mkdirSync(out_dir, { recursive: true });
  for (let name in files) {
    let out_path = path.join(out_dir, name);
    fs.writeFileSync(out_path, files[name].data, { mode: files[name].mode });
    console.log(`  ${path.relative(root, out_path)} (${files[name].data.length} bytes)`);
  }
}

async function main() {
  console.log(`Using Node ABI ${abi} for @kmamal/gl`);
  for (let lib in LIBS) {
    let version = pkgVersion(`@kmamal/${lib}`);
    for (let plat of PLATFORMS) {
      // eslint-disable-next-line no-await-in-loop
      await fetchAndExtract(LIBS[lib](version, plat), path.join(root, 'src/sdl/native', lib, plat));
    }
  }
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
