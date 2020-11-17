/*eslint global-require:off*/
const glov_local_storage = require('./glov/local_storage.js');
glov_local_storage.storage_prefix = 'glovjs-playground'; // Before requiring anything else that might load from this

const assert = require('assert');
const engine = require('./glov/engine.js');
const { abs, max, min, round } = Math;
const net = require('./glov/net.js');
const { randCreate } = require('./glov/rand_alea.js');
const ui = require('./glov/ui.js');
const { clone, deepEqual, ridx, sign } = require('../common/util.js');
const { vec4 } = require('./glov/vmath.js');

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
export const game_width = 380;
export const game_height = 240;

export let sprites = {};

export function main() {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    net.init({ engine });
  }

  const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = 'off';
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

  // Perfect sizes for pixely modes
  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  let params = {
    w: 100,
    h: 100,
    min_dim: 2,
    door_w: 2,
    r1: 1,
    treasure: 4,
  };
  let gen_params;
  let maze;
  let rand = randCreate(1);
  let max_depth;

  function genMaze() {
    const { w, h, min_dim, door_w, r1, treasure } = params;
    const size = w * h;
    maze = new Uint8Array(size);
    gen_params = clone(params);
    max_depth = 0;

    function line(x0, y0, x1, y1, v) {
      v = v || 1;
      let dx = sign(x1 - x0);
      let dy = sign(y1 - y0);
      assert(abs(dx) + abs(dy) <= 1);
      maze[x0 + y0 * w] = v;
      while (x0 !== x1 || y0 !== y1) {
        x0 += dx;
        y0 += dy;
        maze[x0 + y0 * w] = v;
      }
    }
    function drawRect(x0, y0, x1, y1, v) {
      for (let xx = x0; xx <= x1; ++xx) {
        for (let yy = y0; yy <= y1; ++yy) {
          maze[xx + yy * w] = v;
        }
      }
    }
    let doors = [];
    function doorAt(depth, x, y) {
      max_depth = max(max_depth, depth);
      for (let ii = 0; ii < depth; ++ii) {
        if (x >= doors[ii].x &&
          x < doors[ii].x + door_w &&
          y >= doors[ii].y &&
          y < doors[ii].y + door_w
        ) {
          return true;
        }
      }
      return false;
    }
    let terminals = [];
    function divide(depth, x0, y0, x1, y1) {
      let dx = x1 - x0;
      let dy = y1 - y0;
      let r = 0.25 + r1;
      do {
        if (max(dx, dy) < min_dim * 2 + 1) {
          break;
        }
        if (min(dx, dy) <= min_dim) {
          break;
        }
        let offs = (rand.range(2) * 2 - 1) * r;
        r++;
        if (dx > dy) {
          // divide with vertical line
          let split = x0 + round((dx - door_w) / 2 + offs);
          if (split < x0 + min_dim || split > x1 - min_dim) {
            break;
          }
          if (doorAt(depth, split, y0 - 1) || doorAt(depth, split, y1 + 1)) {
            continue;
          }
          let door = y0 + rand.range(dy);
          if (door > y0) {
            line(split, y0, split, door - 1);
          }
          if (door <= y1 - door_w) {
            line(split, door + door_w, split, y1);
          }
          doors[depth] = { x: split, y: door };
          line(split, door, split, door + door_w - 1, 7 + depth);
          divide(depth + 1, x0, y0, split - 1, y1);
          divide(depth + 1, split + 1, y0, x1, y1);
        } else {
          // divide with horizontal line
          let split = y0 + round((dy - 1) / 2 + offs);
          if (split < y0 + min_dim || split > y1 - min_dim) {
            break;
          }
          if (doorAt(depth, x0 - 1, split) || doorAt(depth, x1 + 1, split)) {
            continue;
          }
          let door = x0 + rand.range(dx);
          if (door > x0) {
            line(x0, split, door - 1, split);
          }
          if (door <= x1 - door_w) {
            line(door + door_w, split, x1, split);
          }
          doors[depth] = { x: door, y: split };
          line(door, split, door + door_w - 1, split, 7 + depth);
          divide(depth + 1, x0, y0, x1, split - 1);
          divide(depth + 1, x0, split + 1, x1, y1);
        }
        return;
      } while (true);
      // failed to place anything, is it a dead end?
      let openings = 0;
      for (let ii = 0; ii < depth; ++ii) {
        let door = doors[ii];
        if ((door.x === x0 - 1 || door.x === x1 + 1) && door.y >= y0 && door.y <= y1) {
          openings++;
        } else if ((door.y === y0 - 1 || door.y === y1 + 1) && door.x >= x0 && door.x <= x1) {
          openings++;
        }
      }
      if (openings === 1) {
        drawRect(x0, y0, x1, y1, 2);
        terminals.push({ x0, x1, y0, y1 });
      } else {
        // hallway / adjoining multiple rooms
        // Also add a torch somewhere not overlapping a doorway
        let torch_pos = null;
        let count = 0;
        for (let xx = x0; xx <= x1; ++xx) {
          for (let yy = y0; yy <= y1; ++yy) {
            if (xx === x0 || xx === x1 || yy === y0 || yy === y1) {
              // on the edge, potential torch
              if (xx === x0 && doorAt(depth, xx - 1, yy) ||
                xx === x1 && doorAt(depth, xx + 1, yy) ||
                yy === y0 && doorAt(depth, xx, yy - 1) ||
                yy === y1 && doorAt(depth, xx, yy + 1)
              ) {
                // not valid
              } else {
                ++count;
                if (!rand.range(count)) {
                  torch_pos = xx + yy * w;
                }
              }
            } else {
              // paint interior
              maze[xx + yy * w] = 3;
            }
          }
        }
        if (torch_pos) {
          maze[torch_pos] = 5;
        }
      }
    }
    line(0, 0, w - 1, 0);
    line(w-1, 0, w-1, h-1);
    line(w-1, h-1, 0, h-1);
    line(0, h-1, 0, 0);
    divide(0, 1, 1, w-2, h-2);
    for (let ii = 0; ii < treasure && terminals.length; ++ii) {
      let idx = rand.range(terminals.length);
      let room = terminals[idx];
      ridx(terminals, idx);
      drawRect(room.x0, room.y0, room.x1, room.y1, 4);
    }
  }

  let color_bg = vec4(0,0,0,1);
  let color_tiles = [
    null,
    vec4(1,1,1,1),
    vec4(0,0.3,0.3,1),
    vec4(0,0,0.2,1),
    vec4(0,1,1,1),
    vec4(1,0.8,0,1),
    null,
  ];
  for (let ii = 0; ii < 32; ++ii) {
    color_tiles.push(vec4(0.125 + ii/33 * 0.5, 0, 0, 1));
  }

  function test(dt) {
    gl.clearColor(0, 0.72, 1, 1);
    let z = Z.UI;

    let x = ui.button_height;
    let button_spacing = ui.button_height + 6;
    let y = ui.button_height;

    if (!deepEqual(params, gen_params)) {
      genMaze();
    }
    // if (ui.buttonText({ x, y, text: 'Test', w: ui.button_width * 0.5 }) || !maze) {
    //   genMaze();
    // }
    // y += button_spacing;

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

    ui.print(null, x, y, z, `Treasure: ${params.treasure}`);
    y += ui.font_height;
    params.treasure = round(ui.slider(params.treasure, { x, y, z, min: 0, max: 20 }));
    y += button_spacing;

    y += button_spacing;
    ui.print(null, x, y, z, `Max depth: ${max_depth}`);

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
          if (v) {
            x = x0 + xx * cell_size;
            y = y0 + yy * cell_size;
            ui.drawRect(x, y, x + cell_size, y + cell_size, 10, color_tiles[v]);
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
