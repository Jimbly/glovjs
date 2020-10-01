// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
/* eslint-env browser */

require('./bootstrap.js'); // Just in case it's not in app.js

export let DEBUG = String(document.location).match(/^https?:\/\/localhost/);

require('not_worker'); // This module cannot be required from a worker bundle

const assert = require('assert');
const camera2d = require('./camera2d.js');
const cmds = require('./cmds.js');
const effects = require('./effects.js');
const glov_font = require('./font.js');
const geom = require('./geom.js');
const input = require('./input.js');
const local_storage = require('./local_storage.js');
const mat3FromMat4 = require('gl-mat3/fromMat4');
const mat4Copy = require('gl-mat4/copy');
const mat4Invert = require('gl-mat4/invert');
const mat4Mul = require('gl-mat4/multiply');
const mat4Transpose = require('gl-mat4/transpose');
const mat4Perspective = require('gl-mat4/perspective');
const { asin, cos, floor, min, max, PI, round, sin, sqrt } = Math;
const models = require('./models.js');
const perf = require('./perf.js');
const settings = require('./settings.js');
const shaders = require('./shaders.js');
const { soundLoading, soundStartup, soundTick } = require('./sound.js');
const sprites = require('./sprites.js');
const textures = require('./textures.js');
const { texturesTick } = textures;
const glov_transition = require('./transition.js');
const glov_ui = require('./ui.js');
const urlhash = require('./urlhash.js');
const { clamp, defaults, nearSame, ridx } = require('../../common/util.js');
const { mat3, mat4, vec3, vec4, v3mulMat4, v3iNormalize, v4copy, v4same, v4set } = require('./vmath.js');

export let canvas;
export let webgl2;
export let glov_particles;

export let width;
export let height;
export let pixel_aspect = 1;
export let dom_to_canvas_ratio = window.devicePixelRatio || 1;
export let antialias;

export let game_width;
export let game_height;

export let render_width;
export let render_height;

//eslint-disable-next-line no-use-before-define
export let defines = urlhash.register({ key: 'D', type: urlhash.TYPE_SET, change: definesChanged });

export let any_3d = false;
export let ZFAR;
export let ZNEAR;
export let fov_y = 1;
export let fov_x = 1;
export let fov_min = 60 * PI / 180;

export let mat_projection = mat4();
export let mat_view = mat4();
let mat_m = mat4();
export let mat_vp = mat4();
let mat_mv = mat4();
let mat_mv_no_skew = mat4();
let mat_mvp = mat4();
let mat_mv_inv_transform = mat3();
let mat_inv_view = mat3();
let projection_inverse = vec4();

export let light_diffuse = vec3(0.75, 0.75, 0.75);
let light_dir_vs = vec3(0, 0, 0);
export let light_ambient = vec3(0.25, 0.25, 0.25);
export let light_dir_ws = vec3(-1, -2, -3);

export let font;
export let app_state = null;
export const border_color = vec4(0, 0, 0, 1);

let no_render = false;

export function disableRender(new_value) {
  no_render = new_value;
  if (no_render) {
    glov_ui.cleanupDOMElems();
  }
}

let mat_temp = mat4();
export function setGlobalMatrices(_mat_view) {
  mat4Copy(mat_view, _mat_view);
  mat4Mul(mat_vp, mat_projection, mat_view);
  v3iNormalize(light_dir_ws);
  v3mulMat4(light_dir_vs, light_dir_ws, mat_view);
  mat4Invert(mat_temp, mat_view);
  mat3FromMat4(mat_inv_view, mat_temp);
}

// Just set up mat_vp and mat_projection
export function setMatVP(_mat_view) {
  // exports.setupProjection(fov_y, width, height, ZNEAR, ZFAR);
  mat4Copy(mat_view, _mat_view);
  mat4Mul(mat_vp, mat_projection, mat_view);
}

export function setFOV(new_fov) {
  fov_min = new_fov;
}

export function setGameDims(w, h) {
  game_width = w;
  game_height = h;
}

let is_ios_safari = (function () {
  let ua = window.navigator.userAgent;
  let is_ios = ua.match(/iPad/i) || ua.match(/iPhone/i);
  let webkit = ua.match(/WebKit/i);
  return is_ios && webkit && !ua.match(/CriOS/i);
}());

// Didn't need this for a while, but got slow on iOS recently :(
const postprocessing_reset_version = '4';
export let postprocessing = local_storage.get('glov_no_postprocessing') !== postprocessing_reset_version;
export function postprocessingAllow(allow) {
  local_storage.set('glov_no_postprocessing', allow ? undefined : postprocessing_reset_version);
  postprocessing = allow;
}

export function glCheckError() {
  let gl_err = gl.getError();
  if (gl_err) {
    console.error(gl_err);
    throw new Error(gl_err);
  }
}

export function releaseCanvas() {
  try {
    if (gl) {
      let ext = gl.getExtension('WEBGL_lose_context');
      if (ext) {
        ext.loseContext();
      }
    }
  } catch (ignored) {
    // nothing, it's fine
  }
}

let error_report_disabled = false;
export function reloadSafe() {
  // Do not report any errors after this point
  error_report_disabled = true;
  // Release canvas to not leak memory on Firefox
  releaseCanvas();
  document.location.reload();
}
window.reloadSafe = reloadSafe;

let reloading_defines = {};
export function defineCausesReload(define) {
  reloading_defines[define] = defines[define];
}
defineCausesReload('FORCEWEBGL2');
defineCausesReload('NOWEBGL2');
export function definesChanged() {
  for (let key in reloading_defines) {
    if (defines[key] !== reloading_defines[key]) {
      urlhash.onURLChange(reloadSafe);
      break;
    }
  }
  shaders.handleDefinesChanged();
}

function normalizeRow(m, idx) {
  let len = m[idx]*m[idx] + m[idx+1]*m[idx+1] + m[idx+2]*m[idx+2];
  if (len > 0) {
    len = 1 / sqrt(len);
    m[idx] *= len;
    m[idx+1] *= len;
    m[idx+2] *= len;
  }
}

export function updateMatrices(mat_model) {
  // PERFTODO: depending on rendering path, only some of these are needed (m + vp or just mvp)
  mat4Copy(mat_m, mat_model);

  mat4Mul(mat_mv, mat_view, mat_model);
  mat4Mul(mat_mvp, mat_projection, mat_mv);
  // TODO: Can expand and simplify all of this, especially below
  // Compute the inverse transform of thee model_view matrix, discarding scale,
  // to be used for getting normals into view space
  mat4Copy(mat_temp, mat_model);
  normalizeRow(mat_temp, 0);
  normalizeRow(mat_temp, 4);
  normalizeRow(mat_temp, 8);
  mat4Mul(mat_mv_no_skew, mat_view, mat_temp);
  mat4Invert(mat_temp, mat_mv_no_skew);
  mat4Transpose(mat_temp, mat_temp);
  mat3FromMat4(mat_mv_inv_transform, mat_temp);
}
export let frame_timestamp = 0;
export function getFrameTimestamp() {
  return frame_timestamp;
}

export let frame_index = 0;
export function getFrameIndex() {
  return frame_index;
}

export let frame_dt = 0;
export function getFrameDt() {
  return frame_dt;
}

export let hrtime = 0;

// Wall time, may contain large jumps, may be 0 or negative
let this_frame_time_actual = 0;
export function getFrameDtActual() {
  return this_frame_time_actual;
}

let after_loading_state = null;
export let is_loading = true;
export function setState(new_state) {
  if (is_loading) {
    after_loading_state = new_state;
  } else {
    app_state = new_state;
  }
}

export function stateActive(test_state) {
  if (is_loading) {
    return after_loading_state === test_state;
  } else {
    return app_state === test_state;
  }
}

let mspf = 1000;
let mspf_update_time = 0;
let mspf_frame_count = 0;
let last_tick_cpu = 0;
let mspf_tick = 1000;
// let net_time = 1000;
let mspf_tick_accum = 0;
// let net_time_accum = 0;
export const PERF_HISTORY_SIZE = 128;
export let perf_state = window.glov_perf_state = {
  fpsgraph: {
    index: 0,
    history: new Float32Array(PERF_HISTORY_SIZE * 2),
  },
  gpu_mem: {
    tex: 0,
    geom: 0,
  },
};
let fpsgraph = perf_state.fpsgraph;

perf.addMetric({
  name: 'fps',
  show_stat: 'show_fps', // always, if we're showing any metrics
  show_graph: 'fps_graph',
  labels: {
    'fps: ': () => (1000 / mspf).toFixed(1),
    'ms/f: ': () => mspf.toFixed(0),
    'cpu: ': () => mspf_tick.toFixed(0),
    // 'net: ': () => net_time.toFixed(0),
  },
  data: fpsgraph, // contain .index and .history (stride of colors.length)
  line_scale_top: 50,
  colors: [
    // vec4(0.161, 0.678, 1, 1), // net time
    vec4(1, 0.925, 0.153, 1), // cpu/tick time
    vec4(0, 0.894, 0.212, 1), // total time (GPU)
  ],
});

let do_borders = true;
let do_viewport_postprocess = false;
let need_repos = 0;

export function resizing() {
  return need_repos;
}

let app_tick_functions = [];
export function addTickFunc(cb) {
  app_tick_functions.push(cb);
}

let post_tick = [];
export function postTick(opts) {
  opts.ticks = opts.ticks || 1; // run in how many ticks?
  opts.inactive = opts.inactive || false; // run even if inactive?
  assert.equal(typeof opts.fn, 'function');
  post_tick.push(opts);
}

let temporary_textures = {};

function resetEffects() {
  for (let key in temporary_textures) {
    let temp = temporary_textures[key];
    // Release unused textures
    while (temp.list.length > temp.idx) {
      temp.list.pop().destroy();
    }
    if (!temp.idx) {
      delete temporary_textures[key];
    } else {
      temp.idx = 0;
    }
  }
}

const SAFARI_FULLSCREEN_ASPECT = (function () {
  let screen = window.screen;
  if (!is_ios_safari || !screen) {
    return 0;
  }
  const SAFARI_DIMS = { // wxh : [fullscreen aspect]
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
  };
  let key = `${max(screen.availWidth, screen.availHeight)},${min(screen.availWidth, screen.availHeight)}`;
  return SAFARI_DIMS[key] || 0;
}());
function safariTopSafeArea(view_w, view_h) {
  // Detect if the URL bar is hidden, but should be a safe area
  if (SAFARI_FULLSCREEN_ASPECT && nearSame(view_w/view_h, SAFARI_FULLSCREEN_ASPECT, 0.001)) {
    // Note: if user has scaling enabled, the padding required might be different
    //   but the same holds true for the safe area padding detected via CSS!
    return 50 * (window.devicePixelRatio || 1); // seems to be 50pts on all devices
  }
  return 0;
}


let last_canvas_width;
let last_canvas_height;
let last_body_height;
let safearea_elem;
let safearea_ignore_bottom = false;
let safearea_values = [0,0,0,0];
let last_safearea_values = [0,0,0,0];
function checkResize() {
  // use VisualViewport on at least iOS Safari - deal with tabs and keyboard
  //   shrinking the viewport without changing the window height
  let vv = window.visualViewport || {};
  dom_to_canvas_ratio = window.devicePixelRatio || 1;
  dom_to_canvas_ratio *= settings.render_scale;
  let view_w = (vv.width || window.innerWidth);
  let view_h = (vv.height || window.innerHeight);
  if (view_h !== last_body_height) {
    // set this *before* getting canvas and safearea_elem dims below
    last_body_height = view_h;
    document.body.style.height = `${view_h}px`;
  }
  let new_width = round(canvas.clientWidth * dom_to_canvas_ratio) || 1;
  let new_height = round(canvas.clientHeight * dom_to_canvas_ratio) || 1;

  if (cmds.safearea[0] === -1) {
    if (safearea_elem) {
      let sa_width = safearea_elem.offsetWidth;
      let sa_height = safearea_elem.offsetHeight;
      if (sa_width && sa_height) {
        v4set(safearea_values,
          safearea_elem.offsetLeft * dom_to_canvas_ratio,
          new_width - (sa_width + safearea_elem.offsetLeft) * dom_to_canvas_ratio,
          max(safearea_elem.offsetTop * dom_to_canvas_ratio, safariTopSafeArea(view_w, view_h) * settings.render_scale),
          // Note: Possibly ignoring bottom safe area, it seems not useful on iPhones (does not
          //  adjust when keyboard is up, only obscured in the middle, if obeying left/right safe area)
          safearea_ignore_bottom ? 0 : new_height - (sa_height + safearea_elem.offsetTop) * dom_to_canvas_ratio);
      }
    }
  } else {
    v4set(safearea_values,
      new_width * clamp(cmds.safearea[0], 0, 25)/100,
      new_width * clamp(cmds.safearea[1], 0, 25)/100,
      new_height * clamp(cmds.safearea[2], 0, 25)/100,
      new_height * clamp(cmds.safearea[3], 0, 25)/100);
  }
  if (!v4same(safearea_values, last_safearea_values)) {
    v4copy(last_safearea_values, safearea_values);
    camera2d.setSafeAreaPadding(safearea_values[0], safearea_values[1], safearea_values[2], safearea_values[3]);
    need_repos = max(need_repos, 1);
  }

  if (new_width !== last_canvas_width || new_height !== last_canvas_height) {
    window.pixel_scale = dom_to_canvas_ratio; // for debug
    last_canvas_width = canvas.width = new_width || 1;
    last_canvas_height = canvas.height = new_height || 1;
    // For the next 10 frames, make sure font size is correct
    need_repos = 10;
  }
  if (is_ios_safari && (window.visualViewport || need_repos)) {
    // we have accurate view information, or screen was just rotated / resized
    // force scroll to top
    window.scroll(0,0);
  }
}

export let viewport = vec4(0,0,1,1);
export function setViewport(xywh) {
  v4copy(viewport, xywh);
  gl.viewport(xywh[0], xywh[1], xywh[2], xywh[3]);
}

let last_temp_idx = 0;
export function getTemporaryTexture(w, h) {
  let key = w ? `${w}_${h}` : 'screen';
  let temp = temporary_textures[key];
  if (!temp) {
    temp = temporary_textures[key] = { list: [], idx: 0 };
  }
  if (temp.idx >= temp.list.length) {
    let tex = textures.createForCapture(`temp_${key}_${++last_temp_idx}`);
    temp.list.push(tex);
  }
  let tex = temp.list[temp.idx++];
  return tex;
}

export function captureFramebuffer(tex, w, h, do_filter_linear, do_wrap) {
  if (!w && render_width) {
    w = render_width;
    h = render_height;
  }
  if (!tex) {
    tex = getTemporaryTexture(w, h);
  }
  if (w) {
    tex.copyTexImage(viewport[0], viewport[1], w, h);
  } else {
    tex.copyTexImage(0, 0, width, height);
  }
  tex.setSamplerState({
    filter_min: do_filter_linear ? gl.LINEAR : gl.NEAREST,
    filter_mag: do_filter_linear ? gl.LINEAR : gl.NEAREST,
    wrap_s: do_wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE,
    wrap_t: do_wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE,
  });
  return tex;
}

let frame_requested = false;
function requestFrame() {
  if (frame_requested) {
    return;
  }
  frame_requested = true;
  let max_fps = settings.max_fps;
  if (defines.SLOWLOAD && is_loading) {
    // Safari on CrossBrowserTesting needs this in order to have some time to load/decode audio data
    // TODO: Instead, generally, if loading, compare last_tick_cpu vs dt, and if
    //   we're not idle for at least half of the time and we have *internal*
    //   loads (textures, sounds, models, NOT user code), delay so that we are.
    max_fps = 2;
  }
  if (max_fps) {
    // eslint-disable-next-line no-use-before-define
    setTimeout(tick, round(1000 / max_fps));
  } else {
    // eslint-disable-next-line no-use-before-define
    requestAnimationFrame(tick);
  }
}

let mat_projection_10;
export let had_3d_this_frame;

export function setupProjection(use_fov_y, use_width, use_height, znear, zfar) {
  mat4Perspective(mat_projection, use_fov_y, use_width/use_height, znear, zfar);
  mat_projection_10 = mat_projection[10];
  v4set(projection_inverse,
    2 / (use_width * mat_projection[0]), // projection_matrix.m00),
    2 / (use_height * mat_projection[5]), // projection_matrix.m11),
    -(1 + mat_projection[8]) / mat_projection[0], // projection_matrix.m20) / projection_matrix.m00,
    -(1 + mat_projection[9]) / mat_projection[5] // projection_matrix.m21) / projection_matrix.m11
  );
}

export function setZRange(znear, zfar) {
  ZNEAR = znear;
  ZFAR = zfar;
  if (had_3d_this_frame) {
    setupProjection(fov_y, width, height, ZNEAR, ZFAR);
  }
}

export function start3DRendering() {
  had_3d_this_frame = true;
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  setupProjection(fov_y, width, height, ZNEAR, ZFAR);

  gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // eslint-disable-line no-bitwise
  gl.enable(gl.CULL_FACE);
}

export function startSpriteRendering() {
  gl.disable(gl.CULL_FACE);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
}

export function projectionZBias(dist, at_z) {
  if (!dist) {
    mat_projection[10] = mat_projection_10;
    return;
  }
  //let e = 2 * ZFAR * ZNEAR / (ZFAR - ZNEAR) * (dist / (at_z * (at_z + dist)));
  let e = 0.2 * (dist / (at_z * (at_z + dist)));
  e = max(e, 2e-7);
  mat_projection[10] = mat_projection_10 + e;
}

function fixNatives(is_startup) {
  // If any browser extensions have added things to the Array prototype, remove them!
  let b = [];
  for (let a in b) {
    console[is_startup ? 'log' : 'error'](`Found invasive enumerable property "${a}" on Array.prototype, removing...`);
    let old_val = b[a];
    delete Array.prototype[a];
    // If this fails to work, perhaps try using Object.preventExtensions(Array.prototype) in an inline header script?
    // eslint-disable-next-line no-extend-native
    Object.defineProperty(Array.prototype, a, { value: old_val, enumerable: false });
  }
  for (let a in b) {
    // Failed: code that iterates arrays will fail
    assert(false, `Array.prototype has unremovable member ${a}`);
  }
}

export const hrnow = window.performance ? window.performance.now.bind(window.performance) : Date.now.bind(Date);

let last_tick = 0;
function tick(timestamp) {
  frame_requested = false;
  // if (timestamp < 1e12) { // high resolution timer
  //   this ends up being a value way back in time, relative to what hrnow() returns,
  //   and even back in time relative to input events already dispatched,
  //   causing timing confusion, so ignore it, just call hrnow()
  //   hrtime = timestamp;
  // } else { // probably integer milliseconds since epoch, or nothing
  hrtime = hrnow();
  // }
  let now = round(hrtime); // Code assumes integer milliseconds
  if (!last_tick) {
    last_tick = now;
  }
  this_frame_time_actual = now - last_tick;
  let dt = min(max(this_frame_time_actual, 1), 250);
  frame_dt = dt;
  last_tick = now;
  frame_timestamp += dt;
  ++frame_index;

  fixNatives(false);

  // let this_net_time = wsclient.getNetTime();
  // fpsgraph.history[(fpsgraph.index % PERF_HISTORY_SIZE) * 3 + 0] = this_net_time;
  fpsgraph.history[(fpsgraph.index % PERF_HISTORY_SIZE) * 2 + 1] = this_frame_time_actual;
  fpsgraph.index++;
  fpsgraph.history[(fpsgraph.index % PERF_HISTORY_SIZE) * 2 + 0] = 0;

  ++mspf_frame_count;
  mspf_tick_accum += last_tick_cpu;
  // net_time_accum += this_net_time;
  if (now - mspf_update_time > 1000) {
    if (!mspf_update_time) {
      mspf_update_time = now;
    } else {
      mspf = (now - mspf_update_time) / mspf_frame_count;
      mspf_tick = mspf_tick_accum / mspf_frame_count;
      mspf_tick_accum = 0;
      // net_time = net_time_accum / mspf_frame_count;
      // net_time_accum = 0;
      mspf_frame_count = 0;
      mspf_update_time = now;
    }
  }

  if (document.hidden || document.webkitHidden || no_render) {
    resetEffects();
    input.tickInputInactive();
    last_tick_cpu = 0;
    for (let ii = post_tick.length - 1; ii >= 0; --ii) {
      if (post_tick[ii].inactive && !--post_tick[ii].ticks) {
        post_tick[ii].fn();
        ridx(post_tick, ii);
      }
    }
    requestFrame();
    return;
  }

  had_3d_this_frame = false;
  checkResize();
  width = canvas.width;
  height = canvas.height;

  if (any_3d) {
    // setting the fov values for the frame even if we don't do 3D this frame, because something
    // might need it before start3DRendering() (e.g. mouse click inverse projection)
    if (width > height) {
      fov_y = fov_min;
      let rise = width/height * sin(fov_y / 2) / cos(fov_y / 2);
      fov_x = 2 * asin(rise / sqrt(rise * rise + 1));
    } else {
      fov_x = fov_min;
      let rise = height/width * sin(fov_x / 2) / cos(fov_x / 2);
      fov_y = 2 * asin(rise / sqrt(rise * rise + 1));
    }
  }
  textures.bind(0, textures.textures.error);

  camera2d.tickCamera2D();
  camera2d.setAspectFixed(game_width, game_height);

  soundTick(dt);
  input.tickInput();
  glov_ui.tickUI(dt);

  if (need_repos) {
    --need_repos;
    let ul = [];
    camera2d.virtualToDom(ul, [0,0]);
    let lr = [];
    camera2d.virtualToDom(lr, [game_width-1,game_height-1]);
    let viewport2 = [ul[0], ul[1], lr[0], lr[1]];
    let view_height = viewport2[3] - viewport2[1];
    // default font size of 16 when at height of game_height
    let font_size = min(256, max(2, floor(view_height/800 * 16)));
    let elem_fullscreen = document.getElementById('fullscreen');
    if (elem_fullscreen) {
      elem_fullscreen.style['font-size'] = `${font_size}px`;
    }
  }

  if (do_borders) {
    // Borders
    glov_ui.drawRect(camera2d.x0Real(), camera2d.y0Real(), camera2d.x1Real(), 0, Z.BORDERS, border_color);
    glov_ui.drawRect(camera2d.x0Real(), game_height, camera2d.x1Real(), camera2d.y1Real(), Z.BORDERS, border_color);
    glov_ui.drawRect(camera2d.x0Real(), 0, 0, game_height, Z.BORDERS, border_color);
    glov_ui.drawRect(game_width, 0, camera2d.x1Real(), game_height, Z.BORDERS, border_color);
  }

  if (settings.show_metrics) {
    perf.draw();
  }

  for (let ii = 0; ii < app_tick_functions.length; ++ii) {
    app_tick_functions[ii](dt);
  }
  if (app_state) {
    app_state(dt);
  }

  glov_particles.tick(dt); // *after* app_tick, so newly added/killed particles can be queued into the draw list
  glov_transition.render(dt);

  if (!had_3d_this_frame) {
    // delayed clear (and general GL init) until after app_state, app might change clear color
    gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    // TODO: for do_viewport_post_process, we need to enable gl.scissor to avoid clearing the whole screen!
    // gl.scissor(0, 0, viewport[2] - viewport[0], viewport[3] - viewport[1]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  startSpriteRendering();
  sprites.draw();

  glov_ui.endFrame();

  if (render_width) {
    let source = captureFramebuffer();
    let clear_color = [0, 0, 0, 1];
    let final_viewport = [
      camera2d.render_offset_x, camera2d.render_offset_y_bottom,
      camera2d.render_viewport_w, camera2d.render_viewport_h
    ];
    if (do_viewport_postprocess) {
      effects.applyPixelyExpand({ source, final_viewport, clear_color });
    } else {
      if (clear_color) {
        gl.clearColor(clear_color[0], clear_color[1], clear_color[2], clear_color[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      setViewport(final_viewport);
      // gl.scissor(0, 0, width, height);
      effects.applyCopy({ source });
    }
  }

  input.endFrame();
  resetEffects();
  texturesTick();

  for (let ii = post_tick.length - 1; ii >= 0; --ii) {
    if (!--post_tick[ii].ticks) {
      post_tick[ii].fn();
      ridx(post_tick, ii);
    }
  }

  last_tick_cpu = hrnow() - now;
  fpsgraph.history[(fpsgraph.index % PERF_HISTORY_SIZE) * 2 + 0] = last_tick_cpu;
  requestFrame();
}

let error_report_details = {};
let error_report_details_str = '';
export function setErrorReportDetails(key, value) {
  if (value) {
    error_report_details[key] = escape(String(value));
  } else {
    delete error_report_details[key];
  }
  error_report_details_str = `&${Object.keys(error_report_details)
    .map((k) => `${k}=${error_report_details[k]}`)
    .join('&')}`;
}
setErrorReportDetails('ver', BUILD_TIMESTAMP);
let last_error_time = 0;
let crash_idx = 0;
// Errors from plugins that we don't want to get reported to us, or show the user!
let filtered_errors = /avast_submit|vc_request_action/;
function glovErrorReport(msg, file, line, col) {
  ++crash_idx;
  let now = Date.now();
  setTimeout(requestFrame, 1);
  let dt = now - last_error_time;
  last_error_time = now;
  if (error_report_disabled) {
    return false;
  }
  if (dt < 30*1000) {
    // Less than 30 seconds since the last error, either we're erroring every
    // frame, or this is a secondary error caused by the first, do not report it.
    // Could maybe hash the error message and just report each message once, and
    // flag errors as primary or secondary.
    return false;
  }
  if (msg.match(filtered_errors)) {
    return false;
  }
  // Post to an error reporting endpoint that (probably) doesn't exist - it'll get in the logs anyway!
  let url = urlhash.getAPIPath(); // base like http://foo.com/bar/ (without index.html)
  url += `errorReport?cidx=${crash_idx}&file=${escape(file)}&line=${line}&col=${col}&url=${escape(location.href)}` +
    `&msg=${escape(msg)}${error_report_details_str}`;
  let xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.send(null);
  return true;
}

function periodiclyRequestFrame() {
  requestFrame();
  setTimeout(periodiclyRequestFrame, 5000);
}

export function startup(params) {
  fixNatives(true);

  canvas = document.getElementById('canvas');
  safearea_elem = document.getElementById('safearea');

  if (params.error_report !== false) {
    window.glov_error_report = glovErrorReport;
  }

  safearea_ignore_bottom = params.safearea_ignore_bottom || false;

  // resize the canvas to fill browser window dynamically
  window.addEventListener('resize', checkResize, false);
  checkResize();

  let is_pixely = params.pixely && params.pixely !== 'off';
  antialias = params.antialias || !is_pixely && params.antialias !== false;
  let powerPreference = params.high ? 'high-performance' : 'default';
  let context_names = ['webgl2', 'webgl', 'experimental-webgl'];
  let force_webgl1 = defines.NOWEBGL2;
  let disable_data = local_storage.getJSON('webgl2_disable');
  // Check if a previous, recent run had an error that hinted we should disable WebGL2
  if (disable_data && disable_data.ua === navigator.userAgent && disable_data.ts > Date.now() - 7*24*60*60*1000) {
    console.log('Disabling WebGL2 because a previous run encountered a related error');
    force_webgl1 = true;
  }
  if (DEBUG && !defines.FORCEWEBGL2) {
    let rc = local_storage.getJSON('run_count', 0) + 1;
    local_storage.setJSON('run_count', rc);
    if (rc % 2) {
      force_webgl1 = true;
    }
  }
  if (force_webgl1) {
    context_names.splice(0, 1);
  }
  let context_opts = [{ antialias, powerPreference }, { powerPreference }, {}];
  let good = false;
  webgl2 = false;
  for (let i = 0; !good && i < context_names.length; i += 1) {
    for (let jj = 0; !good && jj < context_opts.length; ++jj) {
      try {
        window.gl = canvas.getContext(context_names[i], context_opts[jj]);
        if (window.gl) {
          if (context_names[i] === 'webgl2') {
            webgl2 = true;
          }
          good = true;
          break;
        }
      } catch (e) {
        // ignore
      }
    }
  }
  if (!good) {
    // eslint-disable-next-line no-alert
    window.alert('Sorry, but your browser does not support WebGL or does not have it enabled.');
    document.getElementById('loading').style.visibility = 'hidden';
    document.getElementById('nowebgl').style.visibility = 'visible';
    return false;
  }
  console.log(`Using WebGL${webgl2?2:1}`);

  assert(gl);
  canvas.focus();
  width = canvas.width;
  height = canvas.height;
  game_width = params.game_width || 1280;
  game_height = params.game_height || 960;
  any_3d = params.any_3d || false;
  ZNEAR = params.znear || 0.7;
  ZFAR = params.zfar || 10000;
  if (params.pixely === 'strict') {
    render_width = game_width;
    render_height = game_height;
    if (params.viewport_postprocess) {
      do_viewport_postprocess = true;
    }
  } else {
    render_width = undefined;
    render_height = undefined;
  }
  pixel_aspect = params.pixel_aspect || 1;

  gl.depthFunc(gl.LEQUAL);
  // gl.enable(gl.SCISSOR_TEST);
  if (!any_3d) {
    gl.disable(gl.CULL_FACE);
  }
  gl.cullFace(gl.BACK);
  gl.clearColor(0, 0.1, 0.2, 1);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // Allow RGB texture data with non-mult-4 widths

  textures.startup();
  geom.startup();
  shaders.startup({
    light_diffuse,
    light_dir_vs,
    ambient: light_ambient,
    mat_m: mat_m,
    mat_mv: mat_mv,
    mat_vp: mat_vp,
    mvp: mat_mvp,
    mv_inv_trans: mat_mv_inv_transform,
    mat_inv_view: mat_inv_view,
    view: mat_view,
    projection: mat_projection,
    projection_inverse,
  });
  camera2d.startup();
  sprites.startup();
  input.startup(canvas, params);
  if (any_3d) {
    models.startup();
  }

  /* eslint-disable global-require */
  glov_particles = require('./particles.js').create();

  if (is_pixely) {
    textures.defaultFilters(gl.NEAREST, gl.NEAREST);
  } else {
    textures.defaultFilters(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
  }

  assert(params.font);
  // If not, something like:
  // const font_info_04b03x2 = require('../img/font/04b03_8x2.json');
  // const font_info_04b03x1 = require('../img/font/04b03_8x1.json');
  // const font_info_palanquin32 = require('../img/font/palanquin32.json');
  // if (params.pixely === 'strict') {
  //   font = glov_font.create(font_info_04b03x1, 'font/04b03_8x1');
  // } else if (is_pixely) {
  //   font = glov_font.create(font_info_04b03x2, 'font/04b03_8x2');
  // } else {
  //   font = glov_font.create(font_info_palanquin32, 'font/palanquin32');
  // }
  params.font = font = glov_font.create(params.font.info, params.font.texture);
  if (params.title_font) {
    params.title_font = glov_font.create(params.title_font.info, params.title_font.texture);
  }
  glov_ui.startup(params);

  soundStartup(params.sound);
  glov_ui.bindSounds(defaults(params.ui_sounds || {}, {
    button_click: 'button_click',
    rollover: 'rollover',
  }));

  camera2d.setAspectFixed(game_width, game_height);

  if (params.state) {
    setState(params.state);
  }
  if (params.do_borders !== undefined) {
    do_borders = params.do_borders;
  }
  if (params.show_fps !== undefined) {
    settings.show_fps = params.show_fps;
  }

  periodiclyRequestFrame();
  return true;
}

export function loadsPending() {
  return textures.load_count + soundLoading() + models.load_count;
}

function loading() {
  let load_count = loadsPending();
  let elem_loading_text = document.getElementById('loading_text');
  if (elem_loading_text) {
    elem_loading_text.innerText = `Loading (${load_count})...`;
  }
  if (!load_count) {
    is_loading = false;
    app_state = after_loading_state;
    // Clear after next frame, so something is rendered to the canvas
    postTick({
      ticks: 2,
      fn: function () {
        let loading_elem = document.getElementById('loading');
        if (loading_elem) {
          loading_elem.style.visibility = 'hidden';
        }
      }
    });
  }
}
app_state = loading;

window.glov_engine = exports;
