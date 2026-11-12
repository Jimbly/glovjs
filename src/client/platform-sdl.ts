/* globals HTMLImageElement */

// eslint-disable-next-line import/order
import { platformRegister } from 'glov/common/platform';
platformRegister('sdl', {
  devmode: 'auto',
  reload: false,
  reload_updates: false,
  random_creation_name: false,
  exit: true,
});

import assert from 'assert';
import fs from 'fs';
import repl from 'repl';
import zlib from 'zlib';
import { setCrashMessage } from 'glov/client/bootstrap';
import { setAbilityReloadUpdates } from 'glov/client/client_config';
import {
  internal as engine_internal,
  hrnow,
} from 'glov/client/engine';
const { needReposSet, setCanvasDims, tick, disableNumberExtend } = engine_internal;
import { FetchInternalParams, fetchNative } from 'glov/client/fetch';
import type {
  PlatformAdapter,
  PlatformSoundAPI,
  PlatformStartupParam,
  PlatformStartupRet,
} from 'glov/client/platform-adapter';
import { settingsGet } from 'glov/client/settings';
import { ErrorCallback, VoidFunc } from 'glov/common/types';
import { sdlEventsStartup } from './platform-sdl-events';
import { sdlSoundGetAPI } from './platform-sdl-sound';
import { sdlWindowStateLoad, sdlWindowStateTrack } from './sdl-window-state';
const createContext = require('@kmamal/gl');
const sdl = require('@kmamal/sdl');
const { PNG } = require('pngjs');

const { round, min, max } = Math;

function setEditBoxNearBottom(frame_index: number, required_padding_dom_coords: number): void {
  // TODO?
}

setCrashMessage('We apologize, a fatal error has occurred.\n\n' +
  'Please report this error to the developer, and then restart the app.');

export type SDLWindow = {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  destroyed: boolean;
  visible: boolean;
  maximize(): void;
  on<T=unknown>(event: string, cb: (e: T) => void): void;
  title: string;
  setTitle(title: string): void;
  fullscreen: boolean;
  setFullscreen(fullscreen: boolean): void;
  borderless: boolean;
  setBorderless(borderless: boolean): void;
  mouseCaptured: boolean;
  relativeMouseMode: boolean;
  setRelativeMouseMode(relative: boolean): void;
  setIcon(width: number, height: number, stride: number, format: string, buffer: Buffer): void;
};

let sdlwindow: SDLWindow;

let application_root: string; // with trailing slash

// Cached window size, kept up to date by the 'resize' event.  Don't read the
// window.width/pixelWidth/etc. getters while rendering: they poll for events
// internally, which can process the close event and destroy the window in the
// middle of a frame.
let view = {
  w: 0,
  h: 0,
  pw: 0,
  ph: 0,
};

let resize_ext: null | {
  resize(w: number, h: number): void;
};

type SDLWebGLContextAttributes = {
  alpha: boolean;
  depth: boolean;
  stencil: boolean;
  antialias: boolean;
  premultiplyAlpha: boolean;
  preserveDrawingBuffer: boolean;
  preferLowPowerToHighPerformance: boolean;
  failIfMajorPerformanceCaveat: boolean;
  createWebGL2Context: boolean;
};

type SDLWebGLContext = WebGL2RenderingContext & {
  swap(): void;
  setSwapInterval?(interval: number): boolean;
};

function checkResize(): void {
  // nothing at run-time, just during resize event?
}

let gl: SDLWebGLContext | null = null;

let last_swap_time = 0;

function renderFrame(): void {
  if (!gl) {
    return;
  }
  tick(); // note: may never return (if it crashes)
  // TODO: do we want to call gl.swap() if a crash happens?
  // TODO: don't call swap if tick chose not to render anything
  profilerStart('gl.swap');
  let start = Date.now();
  gl.swap();
  last_swap_time = Date.now() - start;
  profilerStop();
}

function checkResizeInternal(): void {
  view.w = sdlwindow.width;
  view.h = sdlwindow.height;
  view.pw = sdlwindow.pixelWidth;
  view.ph = sdlwindow.pixelHeight;

  setCanvasDims(view.pw, view.ph);

  resize_ext?.resize(view.pw, view.ph);
  if (gl) {
    // engine handles viewport, not us, but is this needed before this extra swap?
    // gl.viewport(0, 0, view.w, view.h);
    gl.swap();
    // On Windows, dragging the window edge runs a modal OS loop that blocks the
    // Node event loop (setTimeout never fires), but SDL still dispatches 'resize'
    // events from inside it.  Render here so the window keeps updating.
    renderFrame();
  }
  needReposSet(1);
}

function startup(param: PlatformStartupParam): PlatformStartupRet {
  let { antialias } = param;
  application_root = (window as unknown as { application_root: string }).application_root;

  let window_state = sdlWindowStateLoad();
  sdlwindow = sdl.video.createWindow({
    // fullscreen: true,
    resizable: true,
    opengl: true,
    ...window_state.create_opts,
  });
  sdlWindowStateTrack(sdlwindow);
  sdlEventsStartup(sdlwindow);
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  loadImageData('favicon.png', false, function (err, img) {
    if (err || !img) {
      return void console.error(`Error loading window icon: ${err}`);
    }
    let png = img as unknown as { width: number; height: number; data: Buffer };
    sdlwindow.setIcon(png.width, png.height, png.width * 4, 'rgba32', png.data);
  });

  checkResizeInternal();
  sdlwindow.on('resize', checkResizeInternal);
  sdlwindow.on('close', function () {
    // TODO: wait for storage saving to finish
    process.exit(0);
  });

  gl = createContext(view.pw, view.ph, {
    window: sdlwindow,
    antialias,
    createWebGL2Context: true,
  }) as SDLWebGLContext | null;
  let good = false;
  let webgl2 = false;
  if (gl) {
    window.gl = (globalThis as unknown as { gl: WebGLRenderingContext }).gl = gl;
    good = true;
    resize_ext = gl.getExtension('STACKGL_resize_drawingbuffer');
    if (gl.setSwapInterval) {
      // ANGLE's OpenGL backend on Linux (GLX) doesn't do vsync unless explicitly asked, despite EGL's default
      if (!gl.setSwapInterval(1)) {
        console.log('Driver rejected setSwapInterval(1)');
      }
    }
    let attributes = gl.getContextAttributes() as SDLWebGLContextAttributes;
    antialias = attributes.antialias;
    webgl2 = attributes.createWebGL2Context;
  }
  if (window_state.maximized) {
    // After creating the context; the resulting 'resize' event resizes the drawing buffer
    sdlwindow.maximize();
  }
  return {
    antialias,
    antialias_unavailable: param.antialias && !antialias,
    good,
    webgl2,
  };
}

let frames_requested = 0;
function tickWrap(): void {
  frames_requested--;
  let hrtime = hrnow();
  renderFrame(); // note: may never return (if it crashes)
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  requestFrame(hrnow() - hrtime);
}

const MAX_FRAME_TIME = 10000;
let last_delay_time = 0;
function requestFrame(user_time?: number): void {
  if (sdlwindow.destroyed) {
    return;
  }
  let max_fps = settingsGet('max_fps');
  if (frames_requested) {
    return;
  }
  frames_requested++;
  if (max_fps) {
    last_delay_time = 0;
    let desired_delay = min(MAX_FRAME_TIME, max(0, round(1000 / max_fps - (user_time || 0))));
    setTimeout(tickWrap, desired_delay);
  } else {
    if (last_swap_time + last_delay_time > 3) {
      // Do a manual delay by how long we'd expect to be stuck in gl.swap(), so that:
      //  A) the timestamp of the start of the frame is more accurate
      //  B) the Node.js event loop is not starved
      last_delay_time = last_swap_time + last_delay_time - 3;
      setTimeout(tickWrap, last_delay_time);
    } else {
      last_delay_time = 0;
      setTimeout(tickWrap, 0);
    }
  }
}

function imageFromBuffer(buf: Uint8Array, done: ErrorCallback<HTMLImageElement>): void {
  let png;
  profilerStart('imageFromBuffer');
  try {
    png = PNG.sync.read(Buffer.from(buf));
  } catch (e) {
    profilerStop();
    return void done(`Error decoding image: ${e}`);
  }
  png.is_sdl_png = true;
  profilerStop();
  done(null, png);
}

function loadFile(filename: string, done: ErrorCallback<Buffer>): void {
  fs.readFile(filename + '.gz', function (err, data) {
    if (err) {
      return fs.readFile(filename, done);
    }
    // Using extra-large chunkSize here because the Node.js event loop is often starved
    zlib.gunzip(data, { chunkSize: 1024 * 1024 }, function (err, data2) {
      done(err, data2);
    });
  });
}

function loadImageData(
  url: string,
  prefer_arraybuffer: boolean,
  done: ErrorCallback<HTMLImageElement | ArrayBuffer>
): void {
  assert(!url.startsWith('http'));
  let filename = `${application_root}${url}`;
  let ext = url.match(/\.([^.]+)$/)?.[1];
  if (ext !== 'png' && !prefer_arraybuffer) {
    return done(`Format not supported: ${url}`);
  }

  loadFile(filename, function (err, data) {
    if (err) {
      return done(err);
    }
    assert(data);
    if (ext === 'png') {
      // Note: ignoring prefer_arraybuffer, client JS can't decode an ArrayBuffer PNG without a browser
      let png;
      profilerStart('loadImageData:pngread');
      try {
        png = PNG.sync.read(data);
      } catch (e) {
        profilerStop();
        return void done(`Error decoding image: ${e}`);
      }
      profilerStop();
      png.is_sdl_png = true;
      done(null, png);
    } else if (prefer_arraybuffer) {
      if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
        done(null, data.buffer);
      } else {
        done(null, data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength));
      }
    } else {
      assert(false);
    }
  });
}

function getSoundAPI(): PlatformSoundAPI {
  return sdlSoundGetAPI();
}

function fetchIsWeb(params: FetchInternalParams): boolean {
  let { url } = params;
  if (url.startsWith('api/')) {
    // development debug endpoint, modify host
    params.url = `http://localhost:3000/${url}`;
    return true;
  }
  if (url.startsWith('http')) {
    return true;
  }
  return false;
}
function fetchSDL(params: FetchInternalParams, done: ErrorCallback<unknown>): void {
  if (fetchIsWeb(params)) {
    return fetchNative(params, done);
  }
  console.log(`unhandled fetch ${params.url}:${params.response_type}`);
}

function loadScript(url: string, done: VoidFunc): void {
  // TODO
}

function clipboardWrite(text: string): boolean {
  // TODO
  return false;
}

function clipboardRead(): string | null {
  // TODO
  return null;
}

const platform_sdl: PlatformAdapter = {
  fetch: fetchSDL,
  startup,
  checkResize,
  requestFrame,
  setEditBoxNearBottom,
  loadImageData,
  imageFromBuffer,
  getSoundAPI,
  loadScript,
  clipboardWrite,
  clipboardRead,
};

assert(!window.platform_adapter);
window.platform_adapter = platform_sdl;

setAbilityReloadUpdates(false);

function startConsole(): void {
  disableNumberExtend(); // breaks REPL

  const repl_inst = repl.start({
    prompt: 'app > ',
    useGlobal: false,
  });

  repl_inst.context.platform_adapter = platform_sdl;
}

if (window.glov_platform_devmode) { // TODO: or --console
  startConsole();
}
