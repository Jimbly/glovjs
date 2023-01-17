/*eslint global-require:off*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage.js');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

import * as mat4LookAt from 'gl-mat4/lookAt';
import * as engine from 'glov/client/engine.js';
import * as mat4ScaleRotateTranslate from 'glov/client/mat4ScaleRotateTranslate.js';
import * as models from 'glov/client/models.js';
import { modelStartup } from 'glov/client/models.js';
import * as net from 'glov/client/net.js';
import { qRotateZ, quat } from 'glov/client/quat.js';
import { spriteSetGet } from 'glov/client/sprite_sets.js';
import { createSprite } from 'glov/client/sprites.js';
import * as textures from 'glov/client/textures.js';
import * as ui from 'glov/client/ui.js';
import { mat4, zaxis, zero_vec } from 'glov/common/vmath.js';

const { sin } = Math;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;

// Virtual viewport for our game logic
const game_width = 384;
const game_height = 256;

let sprites = {};
function init() {
  sprites.test = createSprite({
    name: 'test',
  });
  modelStartup();
}

let mat_view = mat4();
let mat_obj = mat4();
let rot = quat();

function statePlay(dt) {
  ui.print(null,10,10,1, 'Test!');
  sprites.test.draw({
    x: 20 + sin(engine.frame_timestamp * 0.005) * 20,
    y: 20,
    w: 10,
    h: 10,
  });

  engine.start3DRendering();
  mat4LookAt(mat_view, [5,4,3], zero_vec, zaxis);
  engine.setGlobalMatrices(mat_view);
  qRotateZ(rot, rot, engine.frame_dt * 0.001);
  textures.bind(0, textures.textures.error);
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [1,1,0.03]);
  models.models.box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [0,0,0]);
  models.models.box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [1,0,0.01]);
  models.models.box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [0,1,0.02]);
  models.models.box.draw({ mat: mat_obj });
}

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
  let ui_sprites;
  if (pixely === 'strict') {
    font = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };
    ui_sprites = spriteSetGet('pixely');
  } else if (pixely && pixely !== 'off') {
    font = { info: font_info_04b03x2, texture: 'font/04b03_8x2' };
    ui_sprites = spriteSetGet('pixely');
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
    ui_sprites,
  })) {
    return;
  }
  font = engine.font;

  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  init();

  engine.setState(statePlay);
}
