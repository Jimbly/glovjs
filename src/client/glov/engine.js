/* global WebGLTurbulenzEngine:false */
/* global TurbulenzEngine:true */
/* global Draw2D: false */
/* global $: false */

export let glov_camera;
export let glov_input;
export let glov_sprite;
export let glov_ui;
export let sound_manager;
export let game_width;
export let game_height;
export let graphics_device;
export let draw_2d;
export let draw_list;
export let font;

let global_timer = 0;
export function getFrameTimestamp() {
  return global_timer;
}

export function startup(params) {
  TurbulenzEngine = WebGLTurbulenzEngine.create({
    canvas: params.canvas,
    fillParent: true
  });
  if (!TurbulenzEngine) {
    window.alert('Failed to init TurbulenzEngine (canvas)');
    return;
  }
  game_width = params.game_width || 1280;
  game_height = params.game_height || 960;

  graphics_device = TurbulenzEngine.createGraphicsDevice({});
  window.math_device = window.math_device || TurbulenzEngine.createMathDevice({});
  let draw2d_params = { graphicsDevice: graphics_device };
  const glov_font = require('./font.js');
  glov_font.populateDraw2DParams(draw2d_params);
  draw_2d = Draw2D.create(draw2d_params);
  glov_camera = require('./camera.js').create(graphics_device, draw_2d);
  const input_device = TurbulenzEngine.createInputDevice({});
  glov_input = require('./input.js').create(input_device, draw_2d, glov_camera);
  draw_list = require('./draw_list.js').create(draw_2d, glov_camera);
  glov_sprite = require('./sprite.js').create(graphics_device, draw_list);

  draw_list.setDefaultBucket(params.pixely ? 'alpha_nearest' : 'alpha');

  sound_manager = require('./sound_manager.js').create();

  const font_info_arial32 = require('../img/font/arial32.json');
  const font_info_arial12x2 = require('../img/font/04b03_8x2.json');
  font = glov_font.create(draw_list, params.pixely ? font_info_arial12x2 : font_info_arial32,
    glov_sprite.loadTexture(params.pixely ? 'font/04b03_8x2.png' : 'font/arial32.png'));
  glov_ui = require('./ui.js').create(glov_sprite, glov_input, font, draw_list);

  glov_camera.set2DAspectFixed(game_width, game_height);

}

let app_tick = null;
let last_tick = Date.now();
function tick() {
  if (!graphics_device.beginFrame()) {
    return;
  }
  let now = Date.now();
  let dt = Math.min(Math.max(now - last_tick, 1), 250);
  last_tick = now;
  global_timer += dt;

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

  draw_2d.setBackBuffer();
  draw_2d.clear([0, 0, 0, 1]);

  app_tick(dt);

  draw_list.draw();
  graphics_device.endFrame();
  glov_input.endFrame();
}

export function go(app_tick_in) {
  app_tick = app_tick_in;
  // TODO: Use requestAnimationFrame instead?
  TurbulenzEngine.setInterval(tick, 1000/60);
}
