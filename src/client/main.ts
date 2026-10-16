/* eslint n/global-require:off */
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('ldXX'); // Before requiring anything else that might load from this

import { platformRegister } from 'glov/common/platform'; // eslint-disable-line import/order
platformRegister('discord', {
  devmode: 'off',
  reload: true,
  reload_updates: true,
  random_creation_name: true,
  exit: false,
});

platformRegister('itch', {
  devmode: 'off',
  reload: false,
  reload_updates: false,
  random_creation_name: true,
  exit: false,
});

import assert from 'assert';
import { actionBindKB, actionBindPad, actionEdge, actionRegister } from 'glov/client/actions';
import { bindUIStartup } from 'glov/client/bind_ui';
import { MODE_DEVELOPMENT, platformParameterGet } from 'glov/client/client_config';
import {
  debugDefineIsSet,
  startup as engineStartup,
  getFrameIndex,
  getFrameTimestamp,
  setBorderColor,
  setState,
} from 'glov/client/engine';
import { Font } from 'glov/client/font';
import { localStorageGet, localStorageGetJSON, localStorageSetJSON } from 'glov/client/local_storage';
import { markdownSetColorStyles } from 'glov/client/markdown_renderables';
import { netInit } from 'glov/client/net';
import { scoreAlloc, ScoreSystem } from 'glov/client/score';
import { spotSetAutofocusNonPad, spotSetPadMode } from 'glov/client/spot';
import { spriteSetGet } from 'glov/client/sprite_sets';
import {
  Sprite,
  spriteCreate,
} from 'glov/client/sprites';
import * as transition from 'glov/client/transition';
import {
  buttonText,
  print,
  scaleSizes,
  setFontHeight,
  uiButtonHeight,
  uiGetFont,
} from 'glov/client/ui';
import { FONT_HEIGHT, game_height, game_width } from './globals';
import { musicTimestamp, tickMusic } from './music';
import { optionsMenu } from './options';
import {
  font_styles,
  PAL_BLUE_DARK,
  PAL_BORDER,
  palette,
} from './palette';
import { SOUND_DATA } from './sound_data';
import { hiScoresInit, titleInit } from './title';

const { sin } = Math;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;

export type Score = {
  a: number;
  b: number;
};
let score_system: ScoreSystem<Score>;

let font: Font;

let sprite_test: Sprite;
function init(): void {
  sprite_test = spriteCreate({
    name: 'test',
  });

  const ENCODE_A = 10000;
  score_system = scoreAlloc({
    score_to_value: (score: Score): number => {
      return score.a + score.b * ENCODE_A;
    },
    value_to_score: (value: number): Score => {
      let a = value % ENCODE_A;
      value -= a;
      let b = value / ENCODE_A;
      return {
        a,
        b,
      };
    },
    level_defs: 1,
    score_key: 'LDXX',
    ls_key: 'ldXX',
    asc: false,
    rel: 12,
    num_names: 3,
    histogram: false,
  });
}
export function scoreSystem(): ScoreSystem<Score> {
  return score_system;
}

const TRANSITION_TIME = 250;
export function queueTransition(time?: number): void {
  if (getFrameIndex() > 1) {
    transition.queue(Z.TRANSITION_FINAL, transition.fade(time || TRANSITION_TIME));
  }
}

type GameData = {
  a: number;
  b: number;
};
class GameState {
  mode: 'explore' | 'combat' = 'explore';
  data: GameData = { a: 0, b: 0 };
}
let game_state: GameState;
export function gameState(): GameState {
  return game_state;
}
export function saveGame(): void {
  localStorageSetJSON<SavedGame>('savegame', game_state.data);
}

export function setScore(): void {
  let score: Score = {
    a: game_state.data.a,
    b: game_state.data.b,
  };
  score_system.setScore(0, score);
}

export function gameMusic(): void {
  tickMusic(`game_${game_state.mode}`);
}

function statePlay(dt: number): void {
  gameMusic();
  assert(font);
  print(null,10,10,1, `Test! ${musicTimestamp().toFixed(1)}`);
  let y = 20;
  sprite_test.draw({
    x: 20 + sin(getFrameTimestamp() * 0.005) * 20,
    y: 20,
    w: 10,
    h: 10,
  });
  y += FONT_HEIGHT + 2;

  if (buttonText({
    x: 20,
    y,
    text: `A: ${game_state.data.a}`,
  })) {
    game_state.data.a++;
    setScore();
    saveGame();
  }
  y += uiButtonHeight() + 2;

  if (buttonText({
    x: 20,
    y,
    text: `B: ${game_state.data.b}`,
  })) {
    game_state.data.b++;
    setScore();
    saveGame();
  }
  y += uiButtonHeight() + 2;

  if (buttonText({
    x: 20,
    y,
    text: `Mode: ${game_state.mode}`,
  })) {
    game_state.mode = game_state.mode === 'combat' ? 'explore' : 'combat';
  }
  y += uiButtonHeight() + 2;

  if (actionEdge('menu')) {
    queueTransition();
    optionsMenu('game');
  }
}

type SavedGame = GameData;

export function backToGame(): void {
  setState(statePlay);
}

export function newGameInit(): void {
  game_state = new GameState();
  setState(statePlay);
}

export function loadGame(): void {
  let data = localStorageGetJSON<SavedGame>('savegame');
  assert(data);
  game_state = new GameState();
  game_state.data = data;
  setState(statePlay);
}

export function canLoad(): boolean {
  return Boolean(localStorageGet('savegame'));
}

declare module 'glov/client/actions' {
  interface ActionRegistry {
    menu: 0;
  }
}

function actionsInit(): void {
  actionBindPad('BACK', 'cancel', 0, 'nav');

  actionRegister('menu');
  actionBindKB('ESC', 'menu');
  actionBindPad('START', 'menu');
}

export function main(): void {
  if (platformParameterGet('reload_updates') && MODE_DEVELOPMENT) {
    // Enable auto-reload, etc
    netInit({ engine: require('glov/client/engine') });
  }

  const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = 'on';
  let font_def;
  let ui_sprites;
  let pixel_perfect = 0;
  if (pixely === 'strict') {
    font_def = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };
    ui_sprites = spriteSetGet('pixely');
    pixel_perfect = 1;
  } else if (pixely && pixely !== 'off') {
    if (0) {
      // causing things to be off by half a pixel?!
      font_def = { info: font_info_04b03x2, texture: 'font/04b03_8x2' };
    } else {
      font_def = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };
    }
    ui_sprites = spriteSetGet('pixely');
  } else {
    font_def = { info: font_info_palanquin32, texture: 'font/palanquin32' };
  }

  if (!engineStartup({
    game_width,
    game_height,
    pixely,
    font: font_def,
    viewport_postprocess: false,
    antialias: false,
    ui_sprites,
    pixel_perfect,
    ui_sounds: SOUND_DATA,
    do_borders: true,
  })) {
    return;
  }
  font = uiGetFont();

  // Perfect sizes for pixely modes
  scaleSizes(13 / 32);
  setFontHeight(FONT_HEIGHT);

  setBorderColor(palette[PAL_BORDER]);
  let clear_color = palette[PAL_BLUE_DARK];
  gl.clearColor(clear_color[0], clear_color[1], clear_color[2], 1);

  markdownSetColorStyles(font_styles);

  spotSetPadMode(true);
  spotSetAutofocusNonPad(true);

  init();

  actionsInit();

  bindUIStartup();

  titleInit();

  if (MODE_DEVELOPMENT) {
    if (debugDefineIsSet('HISCORE')) {
      hiScoresInit();
    }
    if (debugDefineIsSet('OPTS')) {
      optionsMenu('title');
    }
    newGameInit();
  }
}
