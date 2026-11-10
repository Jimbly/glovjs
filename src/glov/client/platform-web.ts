/* globals HTMLElement, HTMLCanvasElement, HTMLImageElement, navigator */
/* globals XMLHttpRequest */
/* globals requestAnimationFrame */
import assert from 'assert';
import {
  DataObject,
  ErrorCallback,
  TSMap,
  VoidFunc,
} from 'glov/common/types';
import {
  clamp,
  nearSame,
} from 'glov/common/util';
import {
  v4copy,
  v4same,
  v4scale,
  v4set,
  Vec4,
  vec4,
} from 'glov/common/vmath';
import {
  is_android,
  is_ios,
  is_ios_chrome,
  is_ios_safari,
  is_ipad,
  safari_version_major,
  safari_version_minor,
} from './browser';
import * as camera2d from './camera2d';
import { MODE_DEVELOPMENT } from './client_config';
import * as cmds from './cmds';
import {
  debugDefineIsSet,
  internal as engine_internal,
  getFrameIndex,
  hrnow,
  isLoading,
  renderNeeded,
} from './engine';
const { needReposSet, setCanvasDims, tick } = engine_internal;
import { ERR_CONNECTION, ERR_TIMEOUT, fetch, FetchInternalParams, fetchNative } from './fetch';
import {
  localStorageGetJSON,
  localStorageSetJSON,
} from './local_storage';
import type {
  PlatformAdapter,
  PlatformSoundAPI,
  PlatformStartupParam,
  PlatformStartupRet,
} from './platform-adapter';
import { webSoundGetAPI } from './platform-web-sound';
import { settingsGet } from './settings';

const { max, min, round } = Math;

let canvas: HTMLCanvasElement;

// Get safe area by examining safe-area-inset padded element
function getSafeAreaFromDOM(out: Vec4, safearea: HTMLElement, view_w: number, view_h: number): void {
  if (safearea && safearea.offsetWidth && safearea.offsetHeight) {
    out[0] = safearea.offsetLeft;
    out[1] = view_w - safearea.offsetWidth - safearea.offsetLeft;
    // "view_h - window.innerHeight" is for iOS 12
    out[2] = max(safearea.offsetTop, view_h - window.innerHeight);
    out[3] = view_h - safearea.offsetHeight - safearea.offsetTop;
  }
}

const SAFARI_FULLSCREEN_ASPECT = (function () {
  let screen = window.screen;
  if (!is_ios_safari || !screen) {
    return 0;
  }
  const SAFARI_DIMS = { // wxh : [fullscreen aspect]
    // iPhone 12 Pro Max
    '926,428': 926/428,
    // iPhone 12
    '844,390': 844/390,
    // iPhone XR
    // iPhone 11 Pro Max
    // iPhone XS Max
    // iPhone 11
    '896,414': 896/414,
    // iPhone 11 Pro
    // iPhone X (probably)
    '812,375': 812/375,
    // iPhone 8 Plus
    '736,414': 736/414,
    // iPhone 6s+
    // iPhone 6+
    '716,414': 736/414, // (screen.availWidth reports 20 less)
    // iPhone 8
    // iPhone 7 (10.1)
    // iPhone 7 (11.4)
    '667,375': 667/375,
    // iPhone 6s
    // iPhone 6
    '647,375': 667/375, // (screen.availWidth reports 20 less)
    // iPhone 5s
    '548,320': 568/320, // (screen.availWidth reports 20 less)
  } as TSMap<number>;
  let key = `${max(screen.availWidth, screen.availHeight)},${min(screen.availWidth, screen.availHeight)}`;
  return SAFARI_DIMS[key] || 0;
}());
function safariTopSafeArea(view_w: number, view_h: number): number {
  if (is_ios_safari && safari_version_major < 16) {
    // Definitely needed on v14 and lower; seen this needed on v15.1 as well
    // Detect if the URL bar is hidden, but should be a safe area
    if (SAFARI_FULLSCREEN_ASPECT && nearSame(view_w/view_h, SAFARI_FULLSCREEN_ASPECT, 0.001)) {
      // Note: if user has scaling enabled, the padding required might be different
      //   but the same holds true for the safe area padding detected via CSS!
      return 28; // seems to be visually around 50pts, but touch area of ~25 pts on all devices
    }
  }
  return 0;
}
function isPortrait(view_w: number, view_h: number): boolean {
  return view_h >= view_w * 0.8;
}
let kb_up_last_w = 0;
let kb_up_last_h = 0;
let kb_up_ret = false;
let kb_up_frame = 0;
function isKeyboardUp(view_w?: number, view_h?: number): boolean {
  if (!view_w) {
    return kb_up_ret;
  }
  assert(view_h !== undefined);
  if (!nearSame(view_w, kb_up_last_w, 5)) {
    // init, or just rotated, assume not up
    kb_up_ret = false;
  } else if (!nearSame(view_h, kb_up_last_h, 5)) {
    // same width
    if (view_h < kb_up_last_h) {
      // shrunk
      kb_up_ret = true;
    } else if (view_h > kb_up_last_h) {
      // expanded
      kb_up_ret = false;
    }
  }
  kb_up_last_w = view_w;
  kb_up_last_h = view_h;
  ++kb_up_frame;
  if (kb_up_frame < 3) {
    // window.innerHeight and related shrink during the first couple frames on iOS 12.1
    //   if in landscape and there's a URL bar / other tabs open
    kb_up_ret = false;
  }
  return kb_up_ret;
}
function safariBottomSafeArea(view_w: number, view_h: number): number {
  // iOS === 15.0 doesn't respect safe area; 15.1 is offset
  if (is_ios_safari && safari_version_major === 15 && safari_version_minor < 2 &&
    isKeyboardUp() &&
    isPortrait(view_w, view_h)
  ) {
    if (safari_version_minor === 0) {
      // unknown whether or not this is correct on iPad, assuming needed now to be safe
      return 52;
    } else if (safari_version_minor === 1) {
      if (!is_ipad) {
        return 8; // v15.1
      }
    }
  }
  if (is_ios_chrome && is_ipad && safari_version_major >= 13 &&
    isKeyboardUp()
  ) {
    // seen specific issue resolved by this on at least: 13.2/4 14.0/1/5 15.1/5 16.0/1/2/3
    // v17 doesn't seem to (always?) have a fixed offset, is also buggy with
    //   scroll pos, so let's add some safe area so it's more likely to be visible
    // Note: v12 has no visual viewport, so we can't tell if the keyboard is up
    return 44;
  }
  return 0;
}

let edit_box_near_bottom_frame = -1;
let edit_box_near_bottom_pad = 0;
function setEditBoxNearBottom(frame_index: number, required_padding_dom_coords: number): void {
  edit_box_near_bottom_frame = frame_index;
  edit_box_near_bottom_pad = required_padding_dom_coords;
}

let last_canvas_width: number;
let last_canvas_height: number;
let last_body_height: number;
let safearea_elem: HTMLElement;
let safearea_ignore_bottom = false;
let safearea_dom = vec4();
let safearea_canvas = vec4();
let last_safearea_canvas = vec4();
let dom_to_canvas_ratio;
let width: number;
let height: number;
function checkResize(): void {
  profilerStart('checkResize');
  // use VisualViewport on at least iOS Safari - deal with tabs and keyboard
  //   shrinking the viewport without changing the window height
  let vv = window.visualViewport;
  let dom_to_pixels = window.devicePixelRatio || 1;
  dom_to_canvas_ratio = dom_to_pixels * settingsGet('render_scale_all');
  let view_w = vv ? vv.width : window.innerWidth;
  let view_h = vv ? vv.height :
    is_ios_safari && window.pageYOffset ? document.documentElement.clientHeight : window.innerHeight;
  if (view_h !== last_body_height) {
    // set this *before* getting canvas and safearea_elem dims below
    last_body_height = view_h;
    if (document.body) {
      document.body.style.height = `${view_h}px`;
    }
  }
  // safearea_dom - left, right, top, bottom PADDING values
  v4set(safearea_dom, 0, 0, 0, 0);
  getSafeAreaFromDOM(safearea_dom, safearea_elem, view_w, view_h);
  isKeyboardUp(view_w, view_h - safearea_dom[2] - safearea_dom[3]);
  safearea_dom[2] = max(safearea_dom[2], safariTopSafeArea(view_w, view_h));
  if (safearea_dom[3] && (
    // iOS 15.0: Keyboard is up, but safe area is not being removed, remove it.
    is_ios && isKeyboardUp() ||
    // General: Possibly ignoring bottom safe area by app request, it seems not
    //  useful on iPhones (does not adjust when keyboard is up, only obscured in
    //  the middle, if obeying left/right safe area)
    safearea_ignore_bottom
  )) {
    safearea_dom[3] = 0;
  }
  safearea_dom[3] = max(safearea_dom[3], safariBottomSafeArea(view_w, view_h));

  if (edit_box_near_bottom_frame === getFrameIndex() - 1 && is_android && isKeyboardUp()) {
    // on Android, need extra "safe area" to get at the grabbers for selecting text
    safearea_dom[3] = max(safearea_dom[3], edit_box_near_bottom_pad);
  }

  let rect = canvas.getBoundingClientRect();
  let new_width = round(rect.width * dom_to_canvas_ratio) || 1;
  let new_height = round(rect.height * dom_to_canvas_ratio) || 1;

  if (cmds.safearea[0] === -1) {
    v4scale(safearea_canvas, safearea_dom, dom_to_canvas_ratio);
  } else {
    v4set(safearea_canvas,
      new_width * clamp(cmds.safearea[0], 0, 25)/100,
      new_width * clamp(cmds.safearea[1], 0, 25)/100,
      new_height * clamp(cmds.safearea[2], 0, 25)/100,
      new_height * clamp(cmds.safearea[3], 0, 25)/100);
  }
  if (!v4same(safearea_canvas, last_safearea_canvas)) {
    v4copy(last_safearea_canvas, safearea_canvas);
    camera2d.setSafeAreaPadding(safearea_canvas[0], safearea_canvas[1], safearea_canvas[2], safearea_canvas[3]);
    needReposSet(1);
  }

  if (new_width !== last_canvas_width || new_height !== last_canvas_height) {
    (window as unknown as DataObject).pixel_scale = dom_to_canvas_ratio; // for debug
    last_canvas_width = canvas.width = new_width || 1;
    last_canvas_height = canvas.height = new_height || 1;

    width = canvas.width;
    height = canvas.height;
    setCanvasDims(width, height);

    // For the next 10 frames, make sure font size is correct
    needReposSet(10);
    renderNeeded();
  }
  if (window.visualViewport && (is_ios_safari || true)) {
    // Note: used to also have: || need_repos // or screen was just rotated / resized

    // we have accurate view information, force scroll to top, always
    // should maybe do this any time an edit box is not in focus as well
    if (window.pageYOffset || window.document.body && window.document.body.scrollTop) {
      window.scroll(0,0);
    }
  }
  profilerStop('checkResize');
}


const MAX_FRAME_TIME = 10000;
let frames_requested = 0;
let last_tick_hr2 = 0;
let frame_limit_time_left = 0;
export let last_raw_tick_times: number[] = [];
export let last_raw_tick_skipped: boolean[] = [];
export let last_raw_tick_index = 0;
function tickWrap(): void {
  frames_requested--;

  // Deal with requestAnimationFrame firing out tick function more often than max_fps
  let hrtime2 = hrnow();
  let dt_raw = hrtime2 - last_tick_hr2;
  last_tick_hr2 = hrtime2;
  let last_raw_tick_index_use = last_raw_tick_index;
  last_raw_tick_times[last_raw_tick_index_use] = dt_raw;
  last_raw_tick_skipped[last_raw_tick_index_use] = false;
  last_raw_tick_index = (last_raw_tick_index_use + 1) % 24;
  let max_fps = settingsGet('max_fps');
  if (max_fps && (max_fps <= settingsGet('use_animation_frame') || max_fps >= 250)) {
    // using requestAnimationFrame, need to apply max_fps ourselves
    frame_limit_time_left -= dt_raw;
    if (frame_limit_time_left > 0) {
      // too early, skip this frame, do not count any of this time, pretend this frame never happened.
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      requestFrame();
      last_raw_tick_skipped[last_raw_tick_index_use] = true;
      return;
    }
    let frame_time = min(MAX_FRAME_TIME, 1000 / max_fps);
    if (max_fps < 250) {
      frame_time -= 0.1;
    }
    frame_limit_time_left += frame_time;
    if (frame_limit_time_left < 0) {
      // more than two frames passed, don't accumulate extra frames
      frame_limit_time_left = 0;
    }
  }

  tick(); // note: may never return (if it crashes)
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  requestFrame(hrnow() - hrtime2);
}
function requestFrame(user_time?: number): void {
  let max_fps = settingsGet('max_fps');
  let desired_frames = (max_fps >= 250) ? 10 : 1;
  if (frames_requested >= desired_frames) {
    return;
  }
  if (debugDefineIsSet('SLOWLOAD') && isLoading()) {
    // Safari on CrossBrowserTesting needs this in order to have some time to load/decode audio data
    // TODO: Instead, generally, if loading, compare last_tick_cpu vs dt, and if
    //   we're not idle for at least half of the time and we have *internal*
    //   loads (textures, sounds, models, NOT user code), delay so that we are.
    max_fps = 2;
  }
  if (desired_frames > 1) {
    // Ensure we have at least that many frames queued up at any point in time, so they
    // can fire at less than the normal 4ms browser delay of setTimeout()
    while (frames_requested < desired_frames) {
      setTimeout(tickWrap, 1);
      frames_requested++;
    }
  } else if (max_fps && max_fps > settingsGet('use_animation_frame')) {
    let desired_delay = min(MAX_FRAME_TIME, max(0, round(1000 / max_fps - (user_time || 0))));
    frames_requested++;
    setTimeout(tickWrap, desired_delay);
  } else {
    frames_requested++;
    requestAnimationFrame(tickWrap);
  }
}

type DiableWebGL2Data = {
  ua: string;
  ts: number;
};

function startup(param: PlatformStartupParam): PlatformStartupRet {
  let { antialias } = param;

  safearea_ignore_bottom = param.safearea_ignore_bottom || false;

  canvas = document.getElementById('canvas') as HTMLCanvasElement;
  safearea_elem = document.getElementById('safearea') as HTMLElement;

  // resize the canvas to fill browser window dynamically
  window.addEventListener('resize', checkResize, false);
  checkResize();

  let powerPreference = param.high ? 'high-performance' : 'default';

  let context_names = ['webgl2', 'webgl', 'experimental-webgl'];
  let force_webgl1 = debugDefineIsSet('NOWEBGL2');
  let disable_data = localStorageGetJSON<DiableWebGL2Data>('webgl2_disable');
  // Check if a previous, recent run had an error that hinted we should disable WebGL2
  if (disable_data && disable_data.ua === navigator.userAgent && disable_data.ts > Date.now() - 7*24*60*60*1000) {
    console.log('Disabling WebGL2 because a previous run encountered a related error');
    force_webgl1 = true;
  }
  if (MODE_DEVELOPMENT && !(debugDefineIsSet('FORCEWEBGL2') || param.force_webgl2)) {
    let rc = localStorageGetJSON('run_count', 0) + 1;
    localStorageSetJSON('run_count', rc);
    if (rc % 2) {
      force_webgl1 = true;
    }
  }
  if (force_webgl1) {
    context_names.splice(0, 1);
  }
  let context_opts = [
    { antialias, powerPreference, alpha: false },
    { powerPreference, alpha: false },
    { antialias, alpha: false },
    { alpha: false },
    {},
  ];
  let good = false;
  let webgl2 = false;
  let antialias_unavailable = false;
  for (let i = 0; !good && i < context_names.length; i += 1) {
    for (let jj = 0; !good && jj < context_opts.length; ++jj) {
      try {
        let gl = canvas.getContext(context_names[i], context_opts[jj]) as
          WebGLRenderingContext | WebGL2RenderingContext;
        if (gl) {
          window.gl = gl;
          if (context_names[i] === 'webgl2') {
            webgl2 = true;
          }
          if (antialias && !context_opts[jj].antialias) {
            antialias_unavailable = true;
            antialias = false;
          }
          good = true;
          break;
        }
      } catch (e) {
        // ignore
      }
    }
  }
  if (!window.requestAnimationFrame) {
    // SamsungBrowser/1.1 - apparently has WebGL, but not requestAnimationFrame; also not binary WebSockets
    good = false;
  }

  return {
    good,
    antialias,
    antialias_unavailable,
    webgl2,
  };
}

function fetchWeb(params: FetchInternalParams, done: ErrorCallback<unknown>): void {
  let { method, url, response_type, label, body, headers, timeout } = params;
  if ((window as { fetch?: unknown }).fetch && false) {
    // This mostly works, however it creates larger (untracked) stalls when loading textures
    fetchNative(params, done);
    return;
  }

  let xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  if (timeout) {
    xhr.timeout = timeout;
  }
  if (response_type && response_type !== 'json') {
    xhr.responseType = response_type;
  }
  for (let header in headers) {
    xhr.setRequestHeader(header, headers[header]);
  }
  xhr.onload = function () {
    profilerStart(`fetch_onload:${label}`);
    if ((xhr.status !== 0 && xhr.status < 200) || xhr.status >= 300) {
      let text;
      if (response_type !== 'arraybuffer') {
        try {
          text = xhr.responseText;
        } catch (e) {
          // ignored
        }
      }
      done(String(xhr.status), text || '');
    } else {
      if (response_type === 'json') {
        let text;
        let obj;
        try {
          text = xhr.responseText;
          obj = JSON.parse(text);
        } catch (e) {
          console.error(`Received invalid JSON response from ${url}: ${text || '<empty response>'}`);
          // Probably internal server error or such as the server is restarting
          done(e);
          profilerStop();
          return;
        }
        done(null, obj);
      } else if (response_type === 'arraybuffer') {
        profilerStart('access response');
        // non-trivial amount of time (37% of compressed texture loading!)
        let resp = xhr.response;
        profilerStop();
        if (resp) {
          done(null, resp);
        } else {
          done('empty response');
        }
      } else {
        done(null, xhr.responseText);
      }
    }
    profilerStop();
  };
  xhr.onabort = xhr.onerror = () => {
    profilerStart(`fetch_onerror:${label}`);
    done(ERR_CONNECTION);
    profilerStop();
  };
  xhr.ontimeout = function () {
    profilerStart(`fetch_ontimeout:${label}`);
    done(ERR_TIMEOUT);
    profilerStop();
  };
  if (body !== undefined) {
    if (typeof body === 'object') {
      xhr.setRequestHeader('Content-Type', 'application/json');
      body = JSON.stringify(body);
    } else {
      body = String(body);
    }
  }
  xhr.send(body);
}

function loadImage(
  url: string,
  prefer_arraybuffer: boolean,
  done: ErrorCallback<HTMLImageElement | ArrayBuffer>
): void {
  if (prefer_arraybuffer) {
    fetch({
      url,
      response_type: 'arraybuffer',
    }, done);
    return;
  }

  // Old browser (IE, old iOS) fallback path
  let img = new Image();
  img.onload = function () {
    done(null, img);
  };
  img.onerror = function () {
    done('error', null);
  };
  img.crossOrigin = 'anonymous';
  img.src = url;
}

function getSoundAPI(): PlatformSoundAPI {
  return webSoundGetAPI();
}

function loadScript(url: string, cb: VoidFunc): void {
  let scriptTag = document.createElement('script');
  scriptTag.src = url;
  scriptTag.onload = cb;
  document.getElementsByTagName('head')[0].appendChild(scriptTag);
}

const platform_web: PlatformAdapter = {
  startup,
  checkResize,
  requestFrame,
  setEditBoxNearBottom,
  loadImage,
  getSoundAPI,
  fetch: fetchWeb,
  loadScript,
};


assert(!window.platform_adapter);
window.platform_adapter = platform_web;
