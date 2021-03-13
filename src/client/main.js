/*eslint global-require:off*/
const glov_local_storage = require('./glov/local_storage.js');
glov_local_storage.storage_prefix = 'glovjs-playground'; // Before requiring anything else that might load from this

const engine = require('./glov/engine.js');
const { max, round } = Math;
const net = require('./glov/net.js');
const ui = require('./glov/ui.js');
const { clone, deepEqual } = require('../common/util.js');
const { vec4 } = require('./glov/vmath.js');
const {
  M_LEAF,
  M_INTERIOR,
  mazeGen,
} = require('./maze_gen.js');

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
export const game_width = 384*2;
export const game_height = 256*2;

export let sprites = {};

export function main() {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    net.init({ engine });
  }

  const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = 'on';
  let font;
  if (pixely === 'strict') {
    font = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };
  } else if (pixely && pixely !== 'off') {
    font = { info: font_info_04b03x2, texture: 'font/04b03_8x2' };
  } else {
    font = { info: font_info_palanquin32, texture: 'font/palanquin32' };
  }

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font,
    viewport_postprocess: false,
    antialias: false,
  })) {
    return;
  }
  font = engine.font;

  ui.scaleSizes(13 / 32 * 2);
  ui.setFontHeight(8*2);

  let params = {
    seed: 1,
    w: 100, // 40-200
    h: 100,
    min_dim: 2, // 2-6
    door_w: 2, // 2-3
    r1: 1, // 0-2
    treasure: 4/100/100,
    treasure_size: 2,
  };
  let gen_params;
  let maze;

  let color_bg = vec4(0,0,0,1);
  let color_tiles = [
    null, // M_OPEN
    vec4(1,1,1,1), // M_WALL
    null, // M_LEAF
    vec4(0,1,1,1), // M_TREASURE
    null, // M_INTERIOR
    vec4(1,0.8,0,1), // M_TORCH
    vec4(0.25, 0, 0, 1), // M_DOOR
  ];
  let temp_color = vec4(0,0,0,1);

  function test(dt) {
    gl.clearColor(0, 0.72, 1, 1);
    let z = Z.UI;

    let x = ui.button_height;
    let button_spacing = ui.button_height + 6;
    let y = ui.button_height;

    if (!deepEqual(params, gen_params)) {
      gen_params = clone(params);
      maze = mazeGen(params);
    }
    // if (ui.buttonText({ x, y, text: 'Test', w: ui.button_width * 0.5 }) || !maze) {
    //   mazeGen();
    // }
    // y += button_spacing;

    ui.print(null, x, y, z, `Seed: ${params.seed}`);
    y += ui.font_height;
    params.seed = round(ui.slider(params.seed, { x, y, z, min: 1, max: 9999 }));
    y += button_spacing;

    ui.print(null, x, y, z, `Size: ${params.w}`);
    y += ui.font_height;
    params.h = params.w = round(ui.slider(params.w, { x, y, z, min: 5, max: 256 }));
    y += button_spacing;

    ui.print(null, x, y, z, `Roominess: ${params.r1}`);
    y += ui.font_height;
    params.r1 = round(ui.slider(params.r1, { x, y, z, min: 0, max: 20 }));
    y += button_spacing;

    ui.print(null, x, y, z, `Min Room Width: ${params.min_dim}`);
    y += ui.font_height;
    params.min_dim = round(ui.slider(params.min_dim, { x, y, z, min: 1, max: 20 }));
    y += button_spacing;

    ui.print(null, x, y, z, `Door Width: ${params.door_w}`);
    y += ui.font_height;
    params.door_w = round(ui.slider(params.door_w, { x, y, z, min: 1, max: 20 }));
    y += button_spacing;

    ui.print(null, x, y, z, `Treasure: ${(params.treasure * 100).toFixed(2)}%`);
    y += ui.font_height;
    params.treasure = ui.slider(params.treasure, { x, y, z, min: 0, max: 20/100/100 });
    y += button_spacing;

    ui.print(null, x, y, z, `Treasure Size: ${params.treasure_size}`);
    y += ui.font_height;
    params.treasure_size = round(ui.slider(params.treasure_size, { x, y, z, min: 1, max: 10 }));
    y += button_spacing;

    y += button_spacing;

    ui.print(null, x, y, z, `Max recursion: ${maze.max_depth}`);
    y += ui.font_height;

    if (maze) {
      const { w, h } = gen_params;
      let max_dim = max(w, h);
      let x0 = game_width - game_height;
      let y0 = 0;
      let cell_size = game_height / max_dim;
      ui.drawRect(x0, y0, x0 + cell_size * w, y0 + cell_size * h, 9, color_bg);
      for (let yy = 0; yy < h; ++yy) {
        for (let xx = 0; xx < w; ++xx) {
          let v = maze[yy * w + xx];
          let tile = v & 0xF;
          x = x0 + xx * cell_size;
          y = y0 + yy * cell_size;
          if (color_tiles[tile]) {
            ui.drawRect(x, y, x + cell_size, y + cell_size, 10, color_tiles[tile]);
          } else {
            let depth = (v & 0xF0) >> 4;
            temp_color[0] = temp_color[1] = temp_color[2] = depth / 32;
            if (tile === M_INTERIOR) {
              temp_color[2] += 0.15;
            } else if (tile === M_LEAF) {
              temp_color[1] += 0.15;
              temp_color[2] += 0.15;
            }
            ui.drawRect(x, y, x + cell_size, y + cell_size, 10, temp_color);
          }
        }
      }
    }
  }

  function testInit(dt) {
    engine.setState(test);
    test(dt);
  }

  engine.setState(testInit);
}
