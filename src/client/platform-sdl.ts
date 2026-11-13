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
import { default as createContext } from '@kmamal/gl';
import { default as sdl, Sdl } from '@kmamal/sdl';
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
import { CursorStyle } from 'glov/client/ui';
import { ErrorCallback, VoidFunc } from 'glov/common/types';
import { sdlEventQueue, sdlEventsDispatchQueued, sdlEventsStartup } from './platform-sdl-events';
import { sdlSoundGetAPI } from './platform-sdl-sound';
import { sdlWindowStateLoad, sdlWindowStateTrack } from './sdl-window-state';
const { PNG } = require('pngjs');

const { round, min, max } = Math;

function setEditBoxNearBottom(frame_index: number, required_padding_dom_coords: number): void {
  // TODO?
}

setCrashMessage('We apologize, a fatal error has occurred.\n\n' +
  'Please report this error to the developer, and then restart the app.');

export type SDLWindow = Sdl.Video.Window;

let sdlwindow: SDLWindow;

let application_root: string; // with trailing slash

// Cached window size, kept up to date by the 'resize' event.  Don't read the
// window.width/pixelWidth/etc. getters while rendering: they poll for events
// internally, dispatching events in the middle of a frame.
let view = {
  w: 0,
  h: 0,
  pw: 0,
  ph: 0,
};

let resize_ext: createContext.STACKGL_resize_drawingbuffer | null = null;

type SDLWebGLContext = createContext.WebGL2RenderingContext & createContext.WindowRenderingContext & {
  setSwapInterval?(interval: number): boolean;
};

function checkResize(): void {
  // nothing at run-time, just during resize event?
}

let gl: SDLWebGLContext | null = null;

let last_swap_time = 0;
// Many node-sdl APIs (window getters, clipboard, audio, etc) synchronously poll
//   and dispatch SDL events, so event handlers can run in the middle of a frame
//   (input events are queued in platform-sdl-events, resizes are deferred here).
let in_render_frame = false;
let resize_pending = false;

function renderFrame(): void {
  if (!gl) {
    return;
  }
  in_render_frame = true;
  try {
    sdlEventsDispatchQueued();
    tick(); // note: may never return (if it crashes)
  } finally {
    in_render_frame = false;
  }
  // TODO: don't call swap if tick chose not to render anything
  profilerStart('gl.swap');
  let start = Date.now();
  gl.swap();
  last_swap_time = Date.now() - start;
  profilerStop();
  if (resize_pending) {
    resize_pending = false;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    checkResizeInternal();
  }
}

function checkResizeInternal(): void {
  if (in_render_frame) {
    // Don't change canvas dims or render recursively mid-frame, handle after this frame
    resize_pending = true;
    return;
  }
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

let closing = false;
function onCloseRequested(): void {
  if (closing) {
    return;
  }
  closing = true;
  // TODO: wait for storage saving to finish
  sdlwindow.destroy(); // emits 'close', which sdl-window-state uses to save the window state
  process.exit(0);
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
  // Keep the window alive (it may be mid-frame) and handle the close request
  //   along with other queued events
  sdlwindow.on('beforeClose', function (evt) {
    evt.prevent();
    sdlEventQueue(onCloseRequested);
  });

  gl = createContext(view.pw, view.ph, {
    window: sdlwindow,
    antialias,
    createWebGL2Context: true,
  });
  let good = false;
  let webgl2 = false;
  if (gl) {
    let dom_gl = gl as unknown as WebGL2RenderingContext;
    window.gl = (globalThis as unknown as { gl: WebGLRenderingContext }).gl = dom_gl;
    good = true;
    resize_ext = gl.getExtension('STACKGL_resize_drawingbuffer');
    if (gl.setSwapInterval) {
      // ANGLE's OpenGL backend on Linux (GLX) doesn't do vsync unless explicitly asked, despite EGL's default
      if (!gl.setSwapInterval(1)) {
        console.log('Driver rejected setSwapInterval(1)');
      }
    }
    let attributes = gl.getContextAttributes()!;
    antialias = Boolean(attributes.antialias);
    webgl2 = Boolean(attributes.createWebGL2Context);
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
  try {
    sdl.clipboard.setText(text);
    return true;
  } catch (e) {
    console.error('Error writing to clipboard:', e);
    return false;
  }
}

function clipboardRead(): string | null {
  try {
    return sdl.clipboard.text;
  } catch (e) {
    console.error('Error reading from clipboard:', e);
    return null;
  }
}

const CURSOR_STYLES: Record<CursorStyle, Sdl.Mouse.Cursor> = {
  default: 'default',
  none: 'default',
  wait: 'wait',
  pointer: 'pointer',
  text: 'text',
  move: 'move',
};
let cursor_shown = true;
function cursorStyle(style: CursorStyle): void {
  let show = style !== 'none';
  if (show !== cursor_shown) {
    // TODO: if used, probably need some auto-unhiding upon blur, etc
    sdl.mouse.showCursor(show);
    cursor_shown = show;
  }
  if (style !== 'none') {
    sdl.mouse.setCursor(CURSOR_STYLES[style]);
  }
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
  cursorStyle,
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
