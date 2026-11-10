// eslint-disable-line n/hashbang
const assert = require('assert');
const fs = require('node:fs');
const util = require('node:util');

if (process.pkg) {
  // Append log lines to output.log in the current directory, since stdout isn't
  // visible when the game is launched from Steam.
  const LOG_FILE = __dirname + '/output.log';
  let logorig = console.log.bind(console);
  function log(...args) {
    const line = util.format(...args);
    logorig(line);

    try {
      fs.appendFileSync(LOG_FILE, line + '\n');
    } catch {
      // e.g. cwd not writable; don't let logging crash the app
    }
  }
  console.log = log;
}
console.log(`# Started ${new Date().toISOString()} on ${process.platform}-${process.arch}, cwd=${process.cwd()}`);

if (0) {
  const injectVar = { linux: 'LD_PRELOAD', darwin: 'DYLD_INSERT_LIBRARIES' }[process.platform];
  if (injectVar) {
    console.log(`${injectVar}=${process.env[injectVar] ?? '(unset)'}`);
  }
  const loaded = (process.report.getReport().sharedObjects || [])
    .filter((p) => (/gameoverlayrenderer/i).test(p));
  console.log(`Steam overlay library loaded: ${loaded.length ? loaded.join(', ') : 'NO'}`);
}

// Must be set before @kmamal/sdl is loaded
const SDL_HINTS = {
  SDL_MOUSE_FOCUS_CLICKTHROUGH: '1',
  // On Linux/X11, SDL3 selects XInput2 mouse events (XI_ButtonPress/Release,
  // XI_Motion) on its window. Once a client selects XI2 events of a type, the X
  // server stops delivering the matching core events (ButtonPress, MotionNotify)
  // to it, and those core events are what the Steam overlay intercepts via its
  // hooks.  With XI2 on, the overlay draws and gets keys (SDL keeps core key
  // events) but never sees mouse clicks. This must be set before SDL starts.
  // Cost: no XI2 touch/pen, raw relative mouse motion, or per-device mouse IDs.
  SDL_VIDEO_X11_XINPUT2: '0',
  // On macOS the Steam overlay (gameoverlayrenderer.dylib) draws by hooking
  // either CGLFlushDrawable (OpenGL) or CAMetalLayer nextDrawable /
  // MTLCommandBuffer presentDrawable: (Metal). The ANGLE in @kmamal/gl defaults
  // to its OpenGL (CGL) backend here, which presents through a CAOpenGLLayer
  // that Core Animation composites, so CGLFlushDrawable is never called and the
  // overlay never activates. ANGLE's Metal backend presents with
  // presentDrawable:, which the overlay does hook.
  // (Valid values include "metal" and "opengl")
  ANGLE_DEFAULT_PLATFORM: process.platform === 'darwin' ? 'metal' : undefined,
};
for (let key in SDL_HINTS) {
  if (process.env[key] === undefined && SDL_HINTS[key]) {
    process.env[key] = SDL_HINTS[key];
  }
}

assert(typeof window === 'undefined');
globalThis.window = {
  time_load_start: Date.now(),
  conf_platform: 'sdl',
};

function forwardSlashes(s) {
  return s.replace(/\\/g, '/');
}

let application_root;
if (process.pkg) {
  let application_path = forwardSlashes(process.execPath);
  let parts = application_path.split('/');
  parts.pop();
  application_root = parts.join('/') + '/';
} else {
  application_root = forwardSlashes(process.cwd());
}
if (!application_root.endsWith('/')) {
  application_root += '/';
}
application_root += 'data/';
globalThis.window.application_root = application_root;
let nonPkgRequire = require;
nonPkgRequire(application_root + 'fsdata.js');
nonPkgRequire(application_root + 'sdlapp_deps.bundle.js');
nonPkgRequire(application_root + 'sdlapp.bundle.js');
