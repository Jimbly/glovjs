/* globals self */
const glob = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self;
let nativeRequire = require;

const platarch = `${process.platform}-${process.arch}`;
glob.glov_require_deps = function (mod) {
  if (mod === '../../dist/sdl.node') {
    return nativeRequire(`../native/sdl/${platarch}/sdl.node`);
  }
  if (mod === '../../dist/webgl.node') {
    return nativeRequire(`../native/gl/${platarch}/webgl.node`);
  }
  if (mod === 'node-gyp-build') {
    // Native prebuild packages get a __dirname of "<outdir>/<name>.node" (see nodeGypDirname in sdl-build.js)
    return function (dir) {
      let m2 = dir.match(/^(native\/.*)\/([^/]+\.node)$/);
      if (!m2) {
        throw new Error(`node-gyp-build: unmapped native module "${dir}"`);
      }
      return nativeRequire(`../${m2[1]}/${platarch}/${m2[2]}`);
    };
  }
  let m;
  if ((m = mod.match(/^\.\/dist\/(.*steamworksjs.*\.node)$/))) {
    return nativeRequire(`../native/steamworks/${m[1]}`);
  }
  return null;
};
