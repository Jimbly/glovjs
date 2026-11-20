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
    // Only used by alphafix
    return () => nativeRequire(`../native/alphafix/${platarch}/alphafix.node`);
  }
  let m;
  if ((m = mod.match(/^\.\/dist\/(.*steamworksjs.*\.node)$/))) {
    return nativeRequire(`../native/steamworks/${m[1]}`);
  }
  return null;
};
