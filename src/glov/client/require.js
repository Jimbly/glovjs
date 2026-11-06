/* globals self */
// Note: intentionally using `window` even if globalThis is the actual global object, for storing deps
const glob = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis;
let deps = glob.deps = glob.deps || {};

// But `require` must be on the actual global object
const glob2 = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self;
glob2.require = glob2.glov_require = function (mod) {
  if (!deps[mod]) {
    throw new Error(`Cannot find module '${mod}' (add it to deps.js or equivalent)`);
  }
  return deps[mod];
};
