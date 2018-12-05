/* global WebGLTurbulenzEngine:false */
/* global TurbulenzEngine:true */
/* global TextureEffects:true */
/* global VMath: false */
/* global $:false */
/* global Z:false */

const { Draw2D } = require('./tz/draw2d.js');

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

let after_loading_state = null;
let is_loading = true;
export function setState(new_state) {
  if (is_loading) {
    after_loading_state = new_state;
  } else {
    app_state = new_state;
  }
}

let do_borders = true;

let app_tick_functions = [];
export function addTickFunc(cb) {
  app_tick_functions.push(cb);
}

let render_targets = [];
let render_target_idx = 0;
let frame_effects = [];

function resetEffects() {
  render_target_idx = 0;
  frame_effects.length = 0;
}

function getTarget() {
  if (render_target_idx >= render_targets.length) {
    render_targets.push(draw_2d.createRenderTarget({}));
  }
  return render_targets[render_target_idx++];
}

function doFrameEffect(index) {
  frame_effects[index].fn(draw_2d.getRenderTargetTexture(frame_effects[index].src),
    draw_2d.getRenderTarget(frame_effects[index].dest));
  draw_2d.setRenderTarget(frame_effects[index].dest);
}

let last_tick = Date.now();
function tick() {
  if (!graphics_device.beginFrame()) {
    resetEffects();
    return;
  }
  let now = Date.now();
  let dt = Math.min(Math.max(now - last_tick, 1), 250);
  this_frame_time = dt;
  last_tick = now;
  global_timer += dt;
  ++global_frame_index;

  glov_camera.tick();
  glov_camera.set2DAspectFixed(game_width, game_height);
  sound_manager.tick(dt);
  glov_input.tick();
  glov_ui.tick();

  if (window.need_repos) {
    --window.need_repos;
    let ul = [];
    glov_camera.virtualToPhysical(ul, [0,0]);
    let lr = [];
    glov_camera.virtualToPhysical(lr, [game_width-1,game_height-1]);
    let viewport = [ul[0], ul[1], lr[0], lr[1]];
    let height = viewport[3] - viewport[1];
    // default font size of 16 when at height of game_height
    let font_size = Math.min(256, Math.max(2, Math.floor(height/800 * 16)));
    $('#gamescreen').css({
      left: viewport[0],
      top: viewport[1],
      width: viewport[2] - viewport[0],
      height: height,
      'font-size': font_size,
    });
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

  glov_particles.tick(dt); // *after* app_tick, so newly added/killed particles can be queued into the draw list

  if (frame_effects.length) {
    draw_2d.setRenderTarget(frame_effects[0].src);
  } else {
    draw_2d.setBackBuffer();
  }
  draw_2d.clear([0, 0, 0, 1]);

  draw_list.draw();

  if (frame_effects.length) {
    draw_2d.setBackBuffer();
    draw_2d.copyRenderTarget(frame_effects[frame_effects.length - 1].dest);
  }

  glov_ui.endFrame();
  graphics_device.endFrame();
  glov_input.endFrame();
  resetEffects();
}


export function startup(params) {
  TurbulenzEngine = WebGLTurbulenzEngine.create({
    canvas: params.canvas,
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
  const glov_font = require('./font.js');
  glov_font.populateDraw2DParams(draw2d_params);
  draw_2d = Draw2D.create(draw2d_params);
  glov_camera = require('./camera.js').create(graphics_device, draw_2d);
  const input_device = TurbulenzEngine.createInputDevice({});
  glov_input = require('./input.js').create(input_device, draw_2d, glov_camera);
  draw_list = require('./draw_list.js').create(draw_2d, glov_camera);
  glov_sprite = require('./sprite.js').create(graphics_device, draw_list);
  glov_particles = require('./particles.js').create(draw_list, glov_sprite);

  effects = TextureEffects.create({
    graphicsDevice: graphics_device,
    mathDevice: VMath,
  });

  draw_list.setNearest(params.pixely);

  sound_manager = require('./sound_manager.js').create();

  const font_info_arial32 = require('../img/font/arial32.json');
  const font_info_04b03 = require('../img/font/04b03_8x2.json');
  font = params.font ?
    glov_font.create(draw_list, params.font.info, glov_sprite.loadTexture(params.font.texture)) :
    glov_font.create(draw_list, params.pixely ? font_info_04b03 : font_info_arial32,
      glov_sprite.loadTexture(params.pixely ? 'font/04b03_8x2.png' : 'font/arial32.png'));
  glov_ui = require('./ui.js').create(font, draw_list, params.ui_sprites);
  glov_ui.bindSounds(sound_manager, { // TODO: Allow overriding?
    button_click: 'button_click',
    rollover: 'rollover',
  });

  glov_camera.set2DAspectFixed(game_width, game_height);

  if (params.state) {
    setState(params.state);
  }
  if (params.do_borders !== undefined) {
    do_borders = params.do_borders;
  }

  // TODO: Use requestAnimationFrame instead?
  TurbulenzEngine.setInterval(tick, 1000/60);
  /* eslint-enable global-require */
}

// Example effects can be found at:
// Src:  http://biz.turbulenz.com/sample_assets/textureeffects.js.html
// Demo: http://biz.turbulenz.com/samples#sample-modal/samplepage/sample_assets/textureeffects.canvas.release.html/samplesrc/sample_assets/textureeffects.js.html
export function queueFrameEffect(z, fn) {
  let src;
  if (frame_effects.length === 0) {
    src = getTarget();
  } else {
    src = frame_effects[frame_effects.length - 1].dest;
  }
  draw_list.queuefn(doFrameEffect.bind(null, frame_effects.length), 0, 0, z, null);
  let dest = getTarget();
  frame_effects.push({
    z,
    fn,
    src,
    dest,
  });
}

export function getTemporaryTarget() {
  return draw_2d.getRenderTarget(getTarget());
}

function loading() {
  let load_count = glov_sprite.loading() + sound_manager.loading();
  $('#loading_text').text(`Loading (${load_count})...`);
  if (!load_count) {
    $('.screen').hide();
    is_loading = false;
    app_state = after_loading_state;
  }
}
app_state = loading;
