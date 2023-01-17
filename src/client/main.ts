/*eslint global-require:off*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

import mat4LookAt from 'gl-mat4/lookAt';
import * as engine from 'glov/client/engine';
import mat4ScaleRotateTranslate from 'glov/client/mat4ScaleRotateTranslate';
import {
  modelLoad,
  modelStartup,
} from 'glov/client/models';
import { netInit } from 'glov/client/net';
import { qRotateZ, quat } from 'glov/client/quat';
import { spriteSetGet } from 'glov/client/sprite_sets';
import {
  Sprite,
  spriteCreate,
} from 'glov/client/sprites';
import {
  textureBind,
  textureError,
} from 'glov/client/textures';
import {
  print,
  scaleSizes,
  setFontHeight,
} from 'glov/client/ui';
import { mat4, zaxis, zero_vec } from 'glov/common/vmath';

const { sin } = Math;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;

// Virtual viewport for our game logic
const game_width = 384;
const game_height = 256;

let sprite_test: Sprite;
function init(): void {
  sprite_test = spriteCreate({
    name: 'test',
  });
  modelStartup();
}

let mat_view = mat4();
let mat_obj = mat4();
let rot = quat();

function statePlay(dt: number): void {
  print(null,10,10,1, 'Test!');
  sprite_test.draw({
    x: 20 + sin(engine.frame_timestamp * 0.005) * 20,
    y: 20,
    w: 10,
    h: 10,
  });

  engine.start3DRendering();
  mat4LookAt(mat_view, [5,4,3], zero_vec, zaxis);
  engine.setGlobalMatrices(mat_view);
  qRotateZ(rot, rot, engine.frame_dt * 0.001);
  textureBind(0, textureError());
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [1,1,0.03]);
  let box = modelLoad('box');
  box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [0,0,0]);
  box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [1,0,0.01]);
  box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [0,1,0.02]);
  box.draw({ mat: mat_obj });
}

export function main(): void {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    netInit({ engine });
  }

  const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = 'off';
  let font_def;
  let ui_sprites;
  let pixel_perfect = 0;
  if (pixely === 'strict') {
    font_def = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };
    ui_sprites = spriteSetGet('pixely');
    pixel_perfect = 1;
  } else if (pixely && pixely !== 'off') {
    font_def = { info: font_info_04b03x2, texture: 'font/04b03_8x2' };
    ui_sprites = spriteSetGet('pixely');
  } else {
    font_def = { info: font_info_palanquin32, texture: 'font/palanquin32' };
  }

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font: font_def,
    viewport_postprocess: false,
    antialias: false,
    ui_sprites,
    pixel_perfect,
  })) {
    return;
  }
  // let font = engine.font;

  // Perfect sizes for pixely modes
  scaleSizes(13 / 32);
  setFontHeight(8);

  init();

  engine.setState(statePlay);
}
