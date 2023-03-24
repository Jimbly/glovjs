/*eslint global-require:off, comma-spacing:error*/
import * as local_storage from 'glov/client/local_storage.js'; // eslint-disable-line import/order
local_storage.setStoragePrefix('crawler'); // Before requiring anything else that might load from this

import assert from 'assert';
import { chatUICreate } from 'glov/client/chat_ui';
import { cmd_parse } from 'glov/client/cmds';
import * as engine from 'glov/client/engine';
import { Font, fontCreate } from 'glov/client/font';
import * as net from 'glov/client/net';
import * as settings from 'glov/client/settings';
import { spriteSetGet } from 'glov/client/sprite_sets';
import { spritesheetTextureOpts } from 'glov/client/spritesheet';
import { textureDefaultFilters } from 'glov/client/textures';
import * as ui from 'glov/client/ui';
// import './client_cmds.js'; // for side effects
import { crawlerBuildModeStartup } from './crawler_build_mode';
import { crawlerOnPixelyChange } from './crawler_play.js';
import { game_height, game_width } from './globals';
import { playStartup } from './play';
import { titleInit, titleStartup } from './title';

Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.CHAT = 60;
Z.UI = 100;
Z.STATUS = 100;
Z.MAP = Z.UI + 5; // also minimap
Z.FLOATERS = Z.UI + 25;
Z.CHAT_FOCUSED = 100;

let fonts: Font[] | undefined;

crawlerOnPixelyChange(function (new_value: number): void {
  assert(fonts);
  engine.setFonts(fonts[new_value] || fonts[2]);
});

export let chat_ui: ReturnType<typeof chatUICreate>;

export function main(): void {
  if (engine.DEBUG || true) {
    net.init({
      engine,
      cmd_parse,
      auto_create_user: true,
      allow_anon: true,
    });
  }

  const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = settings.pixely === 2 ? 'strict' : settings.pixely ? 'on' : false;
  let font;
  if (pixely === 'strict') {
    font = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };
  } else if (pixely && pixely !== 'off') {
    font = { info: font_info_04b03x2, texture: 'font/04b03_8x2' };
  } else {
    font = { info: font_info_palanquin32, texture: 'font/palanquin32' };
  }
  settings.set('use_fbos', 1); // Needed for our effects
  // Default style
  settings.set('pixely', 1);
  settings.set('filter', 0);
  settings.set('entity_split', 1);

  spritesheetTextureOpts('whitebox', { force_mipmaps: true });

  if (!engine.startup({
    game_width,
    game_height,
    pixely: true,
    font,
    viewport_postprocess: true,
    antialias: false,
    znear: 11,
    zfar: 2000,
    do_borders: true,
    show_fps: false,
    ui_sprites: {
      ...spriteSetGet('pixely'),
      // color_set_shades: [1, 1, 1],
      // button: { name: 'button', ws: [3, 20, 3], hs: [26] },
      // button_rollover: { name: 'button_rollover', ws: [3, 20, 3], hs: [26] },
      // button_down: { name: 'button_down', ws: [3, 20, 3], hs: [26] },
      // button_disabled: { name: 'button_disabled', ws: [3, 20, 3], hs: [26] },
      buttonselected_regular: { name: 'pixely/buttonselected', ws: [4, 5, 4], hs: [13] },
      buttonselected_down: { name: 'pixely/buttonselected_down', ws: [4, 5, 4], hs: [13] },
      buttonselected_rollover: { name: 'pixely/buttonselected', ws: [4, 5, 4], hs: [13] },
      buttonselected_disabled: { name: 'pixely/buttonselected_disabled', ws: [4, 5, 4], hs: [13] },
      // panel: { name: 'panel', ws: [3, 2, 3], hs: [3, 10, 3] },
      // menu_entry: { name: 'menu_entry', ws: [4, 5, 4], hs: [13] },
      // menu_selected: { name: 'menu_selected', ws: [4, 5, 4], hs: [13] },
      // menu_down: { name: 'menu_down', ws: [4, 5, 4], hs: [13] },
      // menu_header: { name: 'menu_header', ws: [4, 5, 12], hs: [13] },
      // scrollbar_bottom: { name: 'scrollbar_bottom', ws: [11], hs: [11] },
      // scrollbar_trough: { name: 'scrollbar_trough', ws: [11], hs: [16] },
      // scrollbar_top: { name: 'scrollbar_top', ws: [11], hs: [11] },
      // scrollbar_handle_grabber: { name: 'scrollbar_handle_grabber', ws: [11], hs: [11] },
      // scrollbar_handle: { name: 'scrollbar_handle', ws: [11], hs: [3, 5, 3] },
    },
  })) {
    return;
  }
  fonts = [
    fontCreate(font_info_palanquin32, 'font/palanquin32'),
    fontCreate(font_info_04b03x2, 'font/04b03_8x2'),
    fontCreate(font_info_04b03x1, 'font/04b03_8x1'),
  ];

  gl.clearColor(0, 0, 0, 1);

  // Actually not too bad:
  if (settings.filter) {
    textureDefaultFilters(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
  }

  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);
  // ui.uiSetFontStyleFocused(fontStyle(ui.uiGetFontStyleFocused(), {
  //   outline_width: 2.5,
  //   outline_color: dawnbringer.font_colors[8],
  // }));

  chat_ui = chatUICreate({
    max_len: 1000,
    w: 256,
    h: 38,
    outline_width: 3,
    fade_start_time: [10000, 5000],
    fade_time: [1000, 1000],
  });

  crawlerBuildModeStartup(fonts[0]);
  playStartup();
  titleStartup();

  engine.setState(titleInit);
}
