/* global WebGLTurbulenzEngine:false */
/* global TurbulenzEngine:true */
/* global VMath: false */
/* global $:false */
/* global Z:false */

const { Draw2D } = require('./tz/draw2d.js');
const { TextureEffects } = require('./tz/texture_effects.js');

const glov_font = require('./font.js');
const glov_transition = require('./transition.js');
const local_storage = require('./local_storage.js');

VMath.zero_vec = VMath.v4BuildZero();
VMath.unit_vec = VMath.v4Build(1, 1, 1, 1);

export let glov_camera;
export let glov_input;
export let glov_sprite;
export let glov_ui;
export let glov_particles;
export let sound_manager;
export let game_width;
export let game_height;
export let graphics_device;
export let draw_2d;
export let draw_list;
export let font;
export let effects;
export let app_state = null;
export const pico8_colors = [
  VMath.v4Build(0, 0, 0, 1),
  VMath.v4Build(0.114, 0.169, 0.326, 1),
  VMath.v4Build(0.494, 0.145, 0.326, 1),
  VMath.v4Build(0.000, 0.529, 0.328, 1),
  VMath.v4Build(0.671, 0.322, 0.212, 1),
  VMath.v4Build(0.373, 0.341, 0.310, 1),
  VMath.v4Build(0.761, 0.765, 0.780, 1),
  VMath.v4Build(1.000, 0.945, 0.910, 1),
  VMath.v4Build(1.000, 0.000, 0.302, 1),
  VMath.v4Build(1.000, 0.639, 0.000, 1),
  VMath.v4Build(1.000, 0.925, 0.153, 1),
  VMath.v4Build(0.000, 0.894, 0.212, 1),
  VMath.v4Build(0.161, 0.678, 1.000, 1),
  VMath.v4Build(0.514, 0.463, 0.612, 1),
  VMath.v4Build(1.000, 0.467, 0.659, 1),
  VMath.v4Build(1.000, 0.800, 0.667, 1),
];

export let fps_style = glov_font.style({
  outline_width: 2, outline_color: 0x00000080,
  color: 0xFFFFFFff,
});

// *Maybe* don't need this logic anymore, postprocessing has been improved to be
// efficient on all devices.
const postprocessing_reset_version = '2';
export let postprocessing = local_storage.get('glov_no_postprocessing') !== postprocessing_reset_version;
export function postprocessingAllow(allow) {
  local_storage.set('glov_no_postprocessing', allow ? undefined : postprocessing_reset_version);
  postprocessing = allow;
}

let global_timer = 0;
export function getFrameTimestamp() {
  return global_timer;
}

let global_frame_index = 0;
export function getFrameIndex() {
  return global_frame_index;
}

let this_frame_time = 0;
export function getFrameDt() {
  return this_frame_time;
}

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

let mspf = 1000;
let mspf_update_time = Date.now();
let mspf_frame_count = 0;
let show_fps = true;

let do_borders = true;
let need_repos = 0;

let app_tick_functions = [];
export function addTickFunc(cb) {
  app_tick_functions.push(cb);
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

export function getTextureForCapture() {
  return graphics_device.createTexture({
    mipmaps: false,
    dynamic: true,
    src: null,
    format: 'R8G8B8', // or maybe 'R8G8B8A8'
    name: 'screen_temporary_tex',
    data: null,
    no_data: true,
  });
}

export function getTemporaryTexture(w, h) {
  let key = w ? `${w}_${h}` : 'screen';
  let temp = temporary_textures[key];
  if (!temp) {
    temp = temporary_textures[key] = { list: [], idx: 0 };
  }
  if (temp.idx >= temp.list.length) {
    let tex = getTextureForCapture();
    temp.list.push(tex);
  }
  return temp.list[temp.idx++];
}

export function captureFramebuffer(w, h) {
  let tex = getTemporaryTexture(w, h);
  if (w) {
    tex.copyTexImage(0, 0, w, h);
  } else {
    tex.copyTexImage();
  }
  return tex;
}

let last_tick = Date.now();
function tick() {
  if (!graphics_device.beginFrame()) {
    resetEffects();
    return;
  }
  let now = Date.now();
  this_frame_time_actual = now - last_tick;
  let dt = Math.min(Math.max(this_frame_time_actual, 1), 250);
  this_frame_time = dt;
  last_tick = now;
  global_timer += dt;
  ++global_frame_index;

  ++mspf_frame_count;
  if (now - mspf_update_time > 1000) {
    mspf = (now - mspf_update_time) / mspf_frame_count;
    mspf_frame_count = 0;
    mspf_update_time = now;
  }

  glov_camera.tick();
  glov_camera.set2DAspectFixed(game_width, game_height);
  sound_manager.tick(dt);
  glov_input.tick();
  glov_ui.tick(dt);

  if (need_repos) {
    --need_repos;
    let ul = [];
    glov_camera.virtualToPhysical(ul, [0,0]);
    let lr = [];
    glov_camera.virtualToPhysical(lr, [game_width-1,game_height-1]);
    let viewport = [ul[0], ul[1], lr[0], lr[1]];
    let height = viewport[3] - viewport[1];
    // default font size of 16 when at height of game_height
    let font_size = Math.min(256, Math.max(2, Math.floor(height/800 * 16)));
    $('#fullscreen').css({
      'font-size': font_size,
    });
  }

  if (do_borders) {
    // Borders
    glov_ui.drawRect(glov_camera.x0(), glov_camera.y0(), glov_camera.x1(), 0, Z.BORDERS,
      pico8_colors[0]);
    glov_ui.drawRect(glov_camera.x0(), game_height, glov_camera.x1(), glov_camera.y1(), Z.BORDERS,
      pico8_colors[0]);
    glov_ui.drawRect(glov_camera.x0(), 0, 0, game_height, Z.BORDERS,
      pico8_colors[0]);
    glov_ui.drawRect(game_width, 0, glov_camera.x1(), game_height, Z.BORDERS,
      pico8_colors[0]);
  }

  for (let ii = 0; ii < app_tick_functions.length; ++ii) {
    app_tick_functions[ii](dt);
  }
  if (app_state) {
    app_state(dt);
  }
  if (show_fps) {
    glov_camera.set2DAspectFixed(game_width, game_height);
    font.drawSizedAligned(fps_style, glov_camera.x0(), glov_camera.y0(), Z.FPSMETER, glov_ui.font_height,
      glov_font.ALIGN.HRIGHT, glov_camera.w(), 0, `FPS: ${(1000 / mspf).toFixed(1)} (${mspf.toFixed(0)}ms/f)`);
  }

  glov_particles.tick(dt); // *after* app_tick, so newly added/killed particles can be queued into the draw list
  glov_transition.render(dt);

  // Above is queuing, below is actual drawing

  draw_2d.setBackBuffer();
  draw_2d.clear([0, 0, 0, 1]);

  draw_list.draw();

  glov_ui.endFrame();
  graphics_device.endFrame();
  glov_input.endFrame();
  resetEffects();
}


export function startup(params) {
  let canvas = params.canvas;
  canvas.focus();
  TurbulenzEngine = WebGLTurbulenzEngine.create({
    canvas: canvas,
    fillParent: true
  });
  if (!TurbulenzEngine) {
    // eslint-disable-next-line no-alert
    window.alert('Failed to init TurbulenzEngine (canvas)');
    return;
  }
  game_width = params.game_width || 1280;
  game_height = params.game_height || 960;

  graphics_device = TurbulenzEngine.createGraphicsDevice({});
  let draw2d_params = { graphicsDevice: graphics_device, shaders: params.shaders || {} };
  /* eslint-disable global-require */
  glov_transition.populateDraw2DParams(draw2d_params);
  glov_font.populateDraw2DParams(draw2d_params);
  draw_2d = Draw2D.create(draw2d_params);
  glov_camera = require('./camera.js').create(graphics_device, draw_2d);
  const input_device = TurbulenzEngine.createInputDevice({});
  glov_input = require('./input.js').create(input_device, draw_2d, glov_camera);
  draw_list = require('./draw_list.js').create(draw_2d, glov_camera);
  glov_sprite = require('./sprite.js').create(graphics_device, draw_list);
  glov_particles = require('./particles.js').create(draw_list, glov_sprite);

  effects = new TextureEffects({
    graphicsDevice: graphics_device,
  });

  draw_list.setNearest(params.pixely);

  sound_manager = require('./sound_manager.js').create();

  const font_info_palanquin32 = require('../img/font/palanquin32.json');
  const font_info_04b03 = require('../img/font/04b03_8x2.json');
  font = params.font ?
    glov_font.create(draw_list, params.font.info, glov_sprite.loadTexture(params.font.texture)) :
    glov_font.create(draw_list, params.pixely ? font_info_04b03 : font_info_palanquin32,
      glov_sprite.loadTexture(params.pixely ? 'font/04b03_8x2.png' : 'font/palanquin32.png'));
  glov_ui = require('./ui.js').create(font, draw_list, params.ui_sprites);
  glov_ui.bindSounds(sound_manager, { // TODO: Allow overriding?
    button_click: 'button_click',
    rollover: 'rollover',
  });

  glov_camera.set2DAspectFixed(game_width, game_height);

  function onResize() {
    // This used to be here, but it breaks mobile devices / edit boxes
    //canvas.focus();

    // For the next 10 frames, make sure font size is correct
    need_repos = 10;
  }
  window.addEventListener('resize', onResize, false);
  onResize();

  if (params.state) {
    setState(params.state);
  }
  if (params.do_borders !== undefined) {
    do_borders = params.do_borders;
  }
  if (params.show_fps !== undefined) {
    show_fps = params.show_fps;
  }

  // TODO: Use requestAnimationFrame instead?
  TurbulenzEngine.setInterval(tick, 1000/60);
  /* eslint-enable global-require */
}

function loading() {
  let load_count = glov_sprite.loading() + sound_manager.loading();
  $('#loading_text').text(`Loading (${load_count})...`);
  if (!load_count) {
    $('#loading').hide();
    is_loading = false;
    app_state = after_loading_state;
  }
}
app_state = loading;

window.glov_engine = exports;
