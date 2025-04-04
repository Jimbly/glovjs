/* eslint n/global-require:off */
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

import assert from 'assert';
import { platformParameterGet, platformSetRichPresence } from 'glov/client/client_config';
import { editBox } from 'glov/client/edit_box';
import * as engine from 'glov/client/engine';
import {
  getFrameTimestamp,
  setState,
} from 'glov/client/engine';
import {
  ALIGN,
  fontStyle,
  fontStyleColored,
} from 'glov/client/font';
import {
  inputClick,
  keyDown,
  keyDownEdge,
  KEYS,
  mouseDownOverBounds,
  mouseOver,
  PAD,
  padButtonDown,
  padButtonDownEdge,
} from 'glov/client/input';
import { netInit } from 'glov/client/net';
import * as particles from 'glov/client/particles';
import {
  scoreAlloc,
  scoreDebugFriendCode,
  scoreDebugUserID,
  ScoreSystem,
} from 'glov/client/score';
import { scoresDraw } from 'glov/client/score_ui';
import * as settings from 'glov/client/settings';
import { settingsSet } from 'glov/client/settings';
import { slider } from 'glov/client/slider';
import {
  FADE_IN,
  FADE_OUT,
  sound3DListener,
  soundLoad,
  soundPlay,
  soundPlayMusic,
} from 'glov/client/sound';
import { spineCreate } from 'glov/client/spine';
import { spotSuppressPad } from 'glov/client/spot';
import {
  SpriteAnimation,
  spriteAnimationCreate,
} from 'glov/client/sprite_animation';
import { spriteSetGet } from 'glov/client/sprite_sets';
import {
  BLEND_ADDITIVE,
  Sprite,
  spriteCreate,
  spriteQueueSprite,
} from 'glov/client/sprites';
import * as transition from 'glov/client/transition';
import {
  ButtonRet,
  buttonText,
  drawLine,
  drawRect,
  LINE_ALIGN,
  LINE_CAP_ROUND,
  LINE_CAP_SQUARE,
  makeColorSet,
  panel,
  print,
  scaleSizes,
  setFontHeight,
  uiButtonHeight,
  uiButtonWidth,
  uiGetFont,
  uiHandlingNav,
  sprites as uisprites,
  uiTextHeight,
} from 'glov/client/ui';
import * as ui_test from 'glov/client/ui_test';
import type { TSMap } from 'glov/common/types';
import {
  clamp,
  clone,
  easeIn,
  easeInOut,
  easeOut,
  identity,
  lerp,
  tweenBounceOut,
  tweenElasticIn,
  tweenElasticInOut,
  tweenElasticOut,
  tweenExpoIn,
  tweenExpoInOut,
  tweenExpoOut,
} from 'glov/common/util';
import {
  rovec4,
  v4clone,
  v4copy,
  vec2,
  vec4,
} from 'glov/common/vmath';
import * as particle_data from './particle_data';
import { test3D } from './test_3d';

const { ceil, cos, max, floor, PI, random, round, sin, sqrt } = Math;
// TODO: Migrate to TypeScript
type Spine = ReturnType<typeof spineCreate>;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
const game_width = 320;
const game_height = 240;

type SpriteDict = {
  test: Sprite[];
  white: Sprite;
  test_tint: Sprite;
  game_bg: Sprite;
  animation: SpriteAnimation;
};
let sprites: SpriteDict = {} as SpriteDict;

const music_file = 'music_test.ogg';

// Persistent flags system for testing parameters
let flags: TSMap<boolean | string> = {};
function flagGet<T=boolean>(key: string, dflt?: T): T;
function flagGet(key: string, dflt?: boolean | string): boolean | string {
  if (flags[key] === undefined) {
    flags[key] = local_storage.getJSON(`flag_${key}`, dflt) || false;
  }
  return flags[key]!;
}
function flagToggle(key: string): void {
  flags[key] = !flagGet(key);
  local_storage.setJSON(`flag_${key}`, flags[key]);
}
function flagSet(key: string, value: boolean | string): void {
  flags[key] = value;
  local_storage.setJSON(`flag_${key}`, flags[key]);
}

const color_white = vec4(1, 1, 1, 1);
const colors_active = makeColorSet(vec4(0.5, 1, 0.5, 1));
const colors_inactive = makeColorSet(vec4(0.5, 0.5, 0.5, 1));

function perfTestSprites(): void {
  if (!sprites.test) {
    sprites.test = [
      spriteCreate({ name: 'test', size: vec2(1, 1), origin: vec2(0.5, 0.5) }),
      spriteCreate({ url: 'img/test.png?1', size: vec2(1, 1), origin: vec2(0.5, 0.5) }),
    ];
  }

  let mode = 4;
  let count = [
    80000, // one sprite, pre-sorted
    40000, // one sprite, unsorted
    20000, // two sprites, unsorted, small batches
    60000, // two sprites, sorted, bigger batches, sprite API
    60000, // two sprites, sorted, bigger batches, raw API
  ][mode];
  if (mode === 3 || mode === 4) {
    let z = 0;
    for (let ii = 0; ii < count;) {
      let subc = floor(500 + Math.random() * 100);
      let idx = mode <= 1 ? 0 : Math.round(Math.random());
      let sprite = sprites.test[idx];
      for (let jj = 0; jj < subc; ++jj) {
        if (mode === 4) {
          // spriteQueueRaw(sprite.texs,
          //   Math.random() * game_width - 3, Math.random() * game_height - 3, z,
          //   6, 6, 0, 0, 1, 1, color_white);
          spriteQueueSprite(sprite,
            Math.random() * game_width, Math.random() * game_height, z,
            6, 6, 0, sprite.uvs, color_white);
        } else {
          sprites.test[idx]!.draw({
            x: Math.random() * game_width,
            y: Math.random() * game_height,
            z,
            w: 6, h: 6,
          });
        }
        z+=0.01;
      }
      ii += subc;
    }
  } else {
    for (let ii = 0; ii < count; ++ii) {
      let idx = mode <= 1 ? 0 : Math.round(Math.random());
      sprites.test[idx].draw({
        x: Math.random() * game_width,
        y: Math.random() * game_height,
        z: mode === 0 ? ii : Math.random(),
        w: 6, h: 6,
      });
    }
  }
}

const color_black = vec4(0,0,0,1);
let line_precise = 1;
function lineTest(): void {
  const line_len = 20;
  let y_values = [
    20, 25.25, 30.5, 35.667,
    45 + sin(getFrameTimestamp() * 0.001) * 5
  ];
  let widths = [0.5, 1, 1.5, 2, 4];
  let z = Z.UI;
  line_precise = slider(line_precise, { x: 2, y: 2, min: 0, max: 1 });
  for (let widx = 0; widx < widths.length; ++widx) {
    let width = widths[widx];
    let x0 = 10 + widx * (line_len + 4);
    for (let jj = 0; jj < y_values.length; ++jj) {
      let x = x0 + jj * 2;
      let y = y_values[jj];
      drawLine(x, y, x + line_len, y, z, width, line_precise, color_black,
        LINE_ALIGN|LINE_CAP_SQUARE);
      z += 0.1;
      drawLine(x, y, x + line_len, y + 4.5, z, width, line_precise, color_black,
        LINE_ALIGN|LINE_CAP_ROUND);
      z += 0.1;
      drawLine(x, y, x, y + line_len / 2, z, width, line_precise, color_black,
        LINE_ALIGN|LINE_CAP_SQUARE);
      z += 0.1;
    }
  }
  drawLine(50, 72, 250, 200, z, 20, line_precise, color_black, LINE_CAP_ROUND);
}

type TweenData = { x: number; y: number; rot: number; r: number; g: number; b: number };
type TweenElem = {
  prev: TweenData;
  next: TweenData;
};
let tween_elems: TweenElem[];
const TWEEN_MAX = 100;
let tween_start = 0;
const tween_time = 1500;
type Easer = (v:number) => number;
let easing: Easer = identity;
const EASERS: Easer[] = [
  identity,
  (v) => easeIn(v, 2),
  (v) => easeOut(v, 2),
  (v) => easeInOut(v, 2),
  tweenExpoIn,
  tweenExpoOut,
  tweenExpoInOut,
  tweenElasticIn,
  tweenElasticOut,
  tweenElasticInOut,
  tweenBounceOut,
];
function randomRGB(o: TweenData): void {
  let r = random();
  let rgb = floor(random() * 3);
  if (rgb === 0) {
    o.r = r;
    o.g = 1 - r;
    o.b = 1;
  } else if (rgb === 1) {
    o.r = 1;
    o.g = r;
    o.b = 1 - r;
  } else if (rgb === 2) {
    o.r = 1 - r;
    o.g = 1;
    o.b = r;
  }
}
function tweenInit(): void {
  tween_elems = [];
  for (let ii = 0; ii < TWEEN_MAX; ++ii) {
    let elem: TweenData = {
      x: random(),
      y: random(),
      rot: random() * PI * 2,
      r: 1, g: 1, b: 1,
    };
    randomRGB(elem);
    tween_elems.push({
      prev: elem,
      next: clone(elem),
    });
  }
}
let temp_color = vec4(1, 1, 1, 1);
function tweenTest(): void {
  if (!tween_elems) {
    tweenInit();
  }
  let t = (getFrameTimestamp() - tween_start) / tween_time;
  let cycle = false;
  if (t > 1) {
    cycle = t > 1.5;
    t = 1;
  }
  t = easing(t);
  drawRect(1, 1, 119, 119, 99, [0,0,0,1]);
  for (let ii = 0; ii < tween_elems.length; ++ii) {
    let e = tween_elems[ii];
    temp_color[0] = lerp(t, e.prev.r, e.next.r);
    temp_color[1] = lerp(t, e.prev.g, e.next.g);
    temp_color[2] = lerp(t, e.prev.b, e.next.b);
    uisprites.white.draw({
      x: 10 + 100 * lerp(t, e.prev.x, e.next.x),
      y: 10 + 100 * lerp(t, e.prev.y, e.next.y),
      z: 100,
      w: 8,
      h: 8,
      rot: lerp(t, e.prev.rot, e.next.rot),
      color: temp_color,
      blend: BLEND_ADDITIVE,
    });
  }

  if (cycle) {
    tween_start = getFrameTimestamp();
    // easing = EASERS[(EASERS.indexOf(easing) + 1) % EASERS.length];
    easing = EASERS[floor(random() * EASERS.length)];
    let style = floor(random() * 3);
    let offs = floor(random() * TWEEN_MAX);
    let radius = 0.2 + 0.3 * random();
    let div = ceil(sqrt(TWEEN_MAX));
    for (let ii = 0; ii < tween_elems.length; ++ii) {
      let e = tween_elems[ii];
      let temp = e.next;
      e.next = e.prev;
      e.prev = temp;
      randomRGB(e.next);
      e.next.rot = random() * 2 * PI;
      switch (style) {
        case 0:
          e.next.x = random();
          e.next.y = random();
          break;
        case 1:
          e.next.x = 0.5 + radius * cos((ii + offs) / TWEEN_MAX * PI * 2);
          e.next.y = 0.5 + radius * sin((ii + offs) / TWEEN_MAX * PI * 2);
          break;
        case 2:
          e.next.x = floor(((ii + offs) % TWEEN_MAX) / div) / div;
          e.next.y = ((ii + offs) % TWEEN_MAX) % div / div;
          break;
        default:
          assert(false);
      }
    }
  }
}

type Score = {
  a: number;
  b: number;
};
const style_title = fontStyle(null, {
  color: 0xFFFFFFff,
  outline_width: 4,
  outline_color: 0x000000ff,
});
const style_header = fontStyleColored(style_title, 0xFFFF80ff);
const style_score = fontStyleColored(null, 0x222222ff);
const style_me = fontStyleColored(null, 0xFFFF80ff);

const ENCODE_A = 1000;
let score_system: ScoreSystem<Score>;
const SCORE_COLUMNS = [
  // widths are just proportional, scaled relative to `width` passed in
  { name: '', width: 3, align: ALIGN.HFIT | ALIGN.HRIGHT | ALIGN.VCENTER },
  { name: 'Name', width: 8, align: ALIGN.HFIT | ALIGN.VCENTER },
  { name: 'A', width: 4 },
  { name: 'B', width: 4 },
];
function myScoreToRow(row: unknown[], score: Score): void {
  row.push(score.a, score.b);
}
let my_score: Score = {
  a: 1,
  b: 1,
};
function scoresTest(): void {
  if (!score_system) {
    score_system = scoreAlloc({
      score_to_value: (score: Score): number => {
        return max(round(score.a), 0) * ENCODE_A + clamp(round(score.b), 0, ENCODE_A - 1);
      },
      value_to_score: (value: number): Score => {
        let b = value % ENCODE_A;
        value -= b;
        let a = floor(value / ENCODE_A);
        return { a, b };
      },
      level_defs: 1,
      score_key: 'test',
      asc: false,
      rel: 8,
      num_names: 3,
      histogram: false,
    });
  }

  let y = 10;
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let w = game_width / 2;
  let x = game_width - w - 8;
  let y0 = y;

  // Testing: allow entering score
  font.draw({
    style: style_title,
    x, y, w,
    text: 'My score',
    size: text_height,
    align: ALIGN.HCENTER,
  });
  y += text_height + 2;
  my_score.a = editBox<number>({
    x, y, w: w/2 - 2,
    type: 'number',
  }, my_score.a).text;
  my_score.b = editBox<number>({
    x: x + w/2 + 2, y, w: w/2 - 2,
    type: 'number',
  }, my_score.b).text;
  score_system.setScore(0, my_score);
  y += uiButtonHeight() - 2;
  font.draw({
    color: 0x000000ff,
    x, y, w,
    align: ALIGN.HFIT,
    text: `Score UID: ${scoreDebugUserID()}`,
  });
  y += text_height;
  font.draw({
    color: 0x000000ff,
    x, y, w,
    align: ALIGN.HFIT,
    text: `Friend Code: ${scoreDebugFriendCode()}`,
  });
  y += text_height + 2;

  // Demo: standard high score implementation
  font.draw({
    style: style_title,
    x, y, w,
    text: 'HIGH SCORES',
    size: text_height * 2,
    align: ALIGN.HCENTER,
  });
  y += text_height * 2 + 3;

  y = scoresDraw<Score>({
    score_system,
    allow_rename: true,
    x, y, width: w,
    height: game_height - y,
    z: Z.UI,
    size: text_height,
    line_height: text_height + 2,
    level_index: 0,
    columns: SCORE_COLUMNS,
    scoreToRow: myScoreToRow,
    style_score,
    style_me,
    style_header,
    color_me_background: rovec4(0,0,0,1),
    rename_button_size: 9,
  });

  panel({
    x: x - 4, y: y0 - 4, w: w + 8, h: y - y0 + 8,
  });
}

export function main(): void {
  if (platformParameterGet('reload_updates')) {
    // Enable auto-reload, etc
    netInit({ engine });
  }

  const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = flagGet('pixely', 'on');
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
    ui_sprites,
    pixel_perfect,
  })) {
    return;
  }
  let font = engine.font;

  // const font = engine.font;

  // Perfect sizes for pixely modes
  scaleSizes(13 / 32);
  setFontHeight(8);

  const color_red = vec4(1, 0, 0, 1);
  const color_yellow = vec4(1, 1, 0, 1);

  const sprite_size = 64;
  function initGraphics(): void {
    particles.preloadParticleData(particle_data);

    soundLoad('test');

    sprites.white = spriteCreate({ url: 'white' });

    sprites.test_tint = spriteCreate({
      name: 'tinted',
      ws: [16, 16, 16, 16],
      hs: [16, 16, 16],
      size: vec2(sprite_size, sprite_size),
      layers: 2,
      origin: vec2(0.5, 0.5),
    });
    sprites.animation = spriteAnimationCreate({
      idle_left: {
        frames: [0,1],
        times: [200, 500],
      },
      idle_right: {
        frames: [3,2],
        times: [200, 500],
      },
    });
    sprites.animation.setState('idle_left');

    sprites.game_bg = spriteCreate({
      url: 'white',
      size: vec2(game_width, game_height),
    });
  }

  let spine_inited = false;
  let spine_anim: Spine;
  function spineInit(): void {
    spine_inited = true;

    spine_anim = spineCreate({
      skel: 'spine/dino.skel',
      atlas: 'spine/dino.atlas',
      mix: {
        idle: {
          run: 0.25,
        },
        idle_left: {
          run_left: 0.25,
        },
      },
      anim: 'idle',
    });
  }

  let last_particles = 0;
  let pad_controls_sprite = false;

  let test_color_sprite = v4clone(color_white);
  let test_character = {
    x: (Math.random() * (game_width - sprite_size - 200) + (sprite_size * 0.5) + 200),
    y: (Math.random() * (game_height - sprite_size) + (sprite_size * 0.5)),
    dx: 0,
    dy: 0,
  };
  function test(dt: number): void {
    gl.clearColor(0, 0.72, 1, 1);
    if (pad_controls_sprite) {
      spotSuppressPad();
    }

    let status: string | null = null;
    let status_others: TSMap<string> | null = null;
    if (flagGet('ui_test')) {
      status = 'Testing UI';
      status_others = {
        steam_display: '#Test',
      };
      // let clip_test = 30;
      // glov_sprites.clip(Z.UI_TEST - 10, Z.UI_TEST + 10, clip_test, clip_test, 320-clip_test * 2, 240-clip_test * 2);
      ui_test.run(10, 10, Z.UI_TEST);
    }
    if (flagGet('font_test')) {
      status = 'Testing Fonts';
      status_others = {
        steam_display: '#Test',
      };
      ui_test.runFontTest(105, 20);
    }
    if (flagGet('tween_test')) {
      status = 'Testing Fonts';
      status_others = {
        steam_display: '#Test',
      };
      tweenTest();
    }
    if (flagGet('lines')) {
      status = 'Lines, lines, lines';
      status_others = {
        steam_display: '#Test',
      };
      lineTest();
    }
    if (flagGet('scores')) {
      status = 'Looking at scores';
      status_others = {
        steam_display: '#Test',
      };
      scoresTest();
    }
    platformSetRichPresence(status, status_others);

    test_character.dx = 0;
    test_character.dy = 0;
    if (!uiHandlingNav()) { // could do WASD regardless
      test_character.dx -= keyDown(KEYS.LEFT) + keyDown(KEYS.A) + padButtonDown(PAD.LEFT);
      test_character.dx += keyDown(KEYS.RIGHT) + keyDown(KEYS.D) + padButtonDown(PAD.RIGHT);
      test_character.dy -= keyDown(KEYS.UP) + keyDown(KEYS.W) + padButtonDown(PAD.UP);
      test_character.dy += keyDown(KEYS.DOWN) + keyDown(KEYS.S) + padButtonDown(PAD.DOWN);
    }
    if (test_character.dx < 0) {
      sprites.animation.setState('idle_left');
      if (spine_anim) {
        spine_anim.setAnimation(0, 'run_left', true);
      }
    } else if (test_character.dx > 0) {
      sprites.animation.setState('idle_right');
      if (spine_anim) {
        spine_anim.setAnimation(0, 'run', true);
      }
    } else if (spine_anim) {
      if (spine_anim.getAnimation(0) === 'run') {
        spine_anim.setAnimation(0, 'idle', true);
      } else if (spine_anim.getAnimation(0) === 'run_left') {
        spine_anim.setAnimation(0, 'idle_left', true);
      }
    }

    test_character.x += test_character.dx * 0.25;
    test_character.y += test_character.dy * 0.25;
    let bounds = {
      x: test_character.x - sprite_size/2,
      y: test_character.y - sprite_size/2,
      w: sprite_size,
      h: sprite_size,
    };
    const SOUND_SIZE_SCALE = 0.1;
    sound3DListener({ // 2D, screen centered, up coming out of the screen
      pos: [test_character.x * SOUND_SIZE_SCALE, test_character.y * SOUND_SIZE_SCALE, 0],
      forward: [0, -1, 0],
      up: [0, 0, -1],
    });
    if (mouseDownOverBounds(bounds)) {
      v4copy(test_color_sprite, color_yellow);
    } else if (inputClick(bounds) || !uiHandlingNav() && keyDownEdge(KEYS.SPACE)) {
      v4copy(test_color_sprite, (test_color_sprite[2] === 0) ? color_white : color_red);
      soundPlay('test', {
        // screen-centered sound
        pos: [game_width/2 * SOUND_SIZE_SCALE, game_height/2 * SOUND_SIZE_SCALE, 0],
      });
    } else if (mouseOver(bounds)) {
      v4copy(test_color_sprite, color_white);
      test_color_sprite[3] = 0.5;
    } else {
      v4copy(test_color_sprite, color_white);
      test_color_sprite[3] = 1;
    }

    // sprites.game_bg.draw({
    //   x: 0, y: 0, z: Z.BACKGROUND,
    //   color: [0, 0.72, 1, 1]
    // });
    if (flagGet('spine')) {
      if (!spine_inited) {
        spineInit();
      }
      spine_anim.update(dt * 2);
      spine_anim.draw({
        x: test_character.x, y: test_character.y, z: Z.SPRITES,
        scale: 0.25,
      });
    } else {
      sprites.test_tint.drawDualTint({
        x: test_character.x,
        y: test_character.y,
        z: Z.SPRITES,
        color: [1, 1, 0, 1],
        color1: [1, 0, 1, 1],
        frame: sprites.animation.getFrame(dt),
      });
    }

    if (flagGet('4color')) {
      sprites.test_tint.draw4Color({
        x: test_character.x,
        y: test_character.y + 64,
        z: Z.SPRITES,
        color_ul: [1, 0, 0, 1],
        color_ll: [0, 1, 0, 1],
        color_lr: [0, 0, 1, 1],
        color_ur: [1, 0, 1, 1],
        frame: sprites.animation.getFrame(),
      });
    }

    let font_test_idx = 0;

    print(fontStyleColored(null, 0x000000ff),
      test_character.x, test_character.y + (++font_test_idx * 20), Z.SPRITES,
      'TEXT!');
    let font_style = fontStyle(null, {
      outline_width: 1.0,
      outline_color: 0x800000ff,
      glow_xoffs: 3.25,
      glow_yoffs: 3.25,
      glow_inner: -2.5,
      glow_outer: 5,
      glow_color: 0x000000ff,
    });
    print(font_style,
      test_character.x, test_character.y + (++font_test_idx * uiTextHeight()), Z.SPRITES,
      'Outline and Drop Shadow');

    let x = uiButtonHeight();
    let button_spacing = uiButtonHeight() + 2;
    let y = game_height - 10 - button_spacing * 7;
    let mini_button_w = floor((uiButtonWidth() - 2) / 2);

    function miniButton(text: string, tooltip?: string, active?: boolean): ButtonRet | null {
      let ret = buttonText({
        x, y, text, tooltip,
        w: mini_button_w,
        colors: active ? colors_active : colors_inactive,
      });
      x += 2 + mini_button_w;
      if (x >= uiButtonWidth() * 1.25) {
        x = uiButtonHeight();
        y += button_spacing;
      }
      return ret;
    }

    if (buttonText({ x, y, text: `Pixely: ${flagGet('pixely') || 'Off'}`,
      tooltip: 'Toggles pixely or regular mode (requires reload)' })
    ) {
      if (flagGet<string>('pixely') === 'strict') {
        flagSet('pixely', false);
      } else if (flagGet<string>('pixely') === 'on') {
        flagSet('pixely', 'strict');
      } else {
        flagSet('pixely', 'on');
      }
      if (document.location.reload) {
        document.location.reload();
      } else {
        document.location = String(document.location);
      }
    }
    y += button_spacing;

    let rs3d_disabled = !flagGet('3d_test') || engine.render_width;
    if (buttonText({ x, y, text: `RenderScale3D: ${rs3d_disabled ? '' : settings.render_scale}`,
      tooltip: 'Changes render_scale',
      disabled: rs3d_disabled })
    ) {
      if (settings.render_scale === 1) {
        settingsSet('render_scale', 0.25);
      } else {
        settingsSet('render_scale', 1);
      }
    }
    y += button_spacing;

    if (buttonText({ x, y, text: `RenderScaleAll: ${settings.render_scale_all}`,
      tooltip: 'Changes render_scale_all' })
    ) {
      if (settings.render_scale_all === 1) {
        settingsSet('render_scale_all', 0.5);
      } else {
        settingsSet('render_scale_all', 1);
      }
    }
    y += button_spacing;

    font.drawSizedAligned(null, x, y, Z.UI, uiTextHeight(), ALIGN.HCENTER, uiButtonWidth(), 0, 'Tests');
    y += uiTextHeight() + 1;

    let do_3d = flagGet('3d_test'); // before the toggle, so transition looks good
    if (miniButton('3D', 'Toggles visibility of a 3D test', flagGet('3d_test'))) {
      flagToggle('3d_test');
      transition.queue(Z.TRANSITION_FINAL, transition.fade(500));
    }

    if (miniButton('Font', 'Toggles visibility of general Font tests', flagGet('font_test'))) {
      flagToggle('font_test');
      transition.queue(Z.TRANSITION_FINAL, transition.randomTransition());
    }

    if (miniButton('Tween', 'Toggles visibility of tweening test', flagGet('tween_test'))) {
      flagToggle('tween_test');
      transition.queue(Z.TRANSITION_FINAL, transition.randomTransition());
    }

    if (miniButton('UI', 'Toggles visibility of general UI tests', flagGet('ui_test'))) {
      flagToggle('ui_test');
      if (flagGet('ui_test')) {
        flagSet('lines', false);
        flagSet('scores', false);
      }
    }

    if (miniButton('Lines', 'Toggles line drawing', flagGet('lines'))) {
      flagToggle('lines');
      if (flagGet('lines')) {
        flagSet('ui_test', false);
        flagSet('scores', false);
      }
    }

    if (miniButton('Scores', 'Toggles High Score testing', flagGet('scores'))) {
      flagToggle('scores');
      if (flagGet('scores')) {
        flagSet('ui_test', false);
        flagSet('lines', false);
      }
    }

    if (miniButton('FX', 'Toggles particles', flagGet('particles'))) {
      flagToggle('particles');
    }

    if (miniButton('Music', 'Toggles playing a looping background music track', flagGet('music'))) {
      flagToggle('music');
      if (flagGet('music')) {
        soundPlayMusic(music_file, 1, FADE_IN);
      } else {
        soundPlayMusic(music_file, 0, FADE_OUT);
      }
    }

    if (miniButton('Spine', 'Toggles Spine animation testing', flagGet('spine'))) {
      flagToggle('spine');
    }

    if (flagGet('particles')) {
      if (getFrameTimestamp() - last_particles > 1000) {
        last_particles = getFrameTimestamp();
        engine.glov_particles.createSystem(particle_data.defs.explosion,
          //[test_character.x, test_character.y, Z.PARTICLES]
          [100 + Math.random() * 120, 100 + Math.random() * 140, Z.PARTICLES]
        );
      }
    }

    if (flagGet('perf_test')) {
      perfTestSprites();
    }

    if (do_3d) {
      test3D();
    }


    // Debuggin full canvas stretching
    // const camera2d = require('glov/client/camera2d.js');
    // drawLine(camera2d.x0(), camera2d.y0(), camera2d.x1(), camera2d.y1(), Z.BORDERS + 1, 1, 0.95,[1,0,1,0.5]);
    // drawLine(camera2d.x1(), camera2d.y0(), camera2d.x0(), camera2d.y1(), Z.BORDERS + 1, 1, 0.95,[1,0,1,0.5]);

    // Debugging touch state on mobile
    // const glov_camera2d = require('glov/client/camera2d.js');
    // engine.font.drawSizedWrapped(engine.fps_style, glov_camera2d.x0(), glov_camera2d.y0(), Z.FPSMETER,
    //   glov_camera2d.w(), 0, 22, JSON.stringify({
    //     last_touch_state: input.last_touch_state,
    //     touch_state: input.touch_state,
    //   }, undefined, 2));

    if (keyDownEdge(KEYS.ESC) || padButtonDownEdge(PAD.B)) {
      pad_controls_sprite = !pad_controls_sprite;
    }
  }

  function testInit(dt: number): void {
    // May want this: ensure we don't have extra images bundled? webFSReportUnused();
    setState(test);
    if (flagGet('music')) {
      soundPlayMusic(music_file);
    }
    test(dt);
  }

  initGraphics();
  setState(testInit);
}
