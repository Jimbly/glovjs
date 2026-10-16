import { actionEdge } from 'glov/client/actions';
import { bindUIRun, DEFAULT_BINDABLE_CMDS } from 'glov/client/bind_ui';
import { setState } from 'glov/client/engine';
import { ALIGN } from 'glov/client/font';
import { MenuItem } from 'glov/client/selection_box';
import { settingsGet, settingsSet } from 'glov/client/settings';
import { SimpleMenu, simpleMenuCreate } from 'glov/client/simple_menu';
import { uiGetFont, uiTextHeight } from 'glov/client/ui';
import { FONT_HEIGHT, game_height, game_width } from './globals';
import {
  backToGame,
  gameMusic,
  queueTransition,
  saveGame,
} from './main';
import { palette_font } from './palette';
import { titleInit, titleMusic } from './title';

const { floor, round } = Math;

const BIND_CMDS = {
  ...DEFAULT_BINDABLE_CMDS,
  menu: 'Menu',
};

function stateBinds(dt: number): void {
  const z = Z.MODAL + 2;
  const SCREEN_PAD = 8;

  let w = floor(game_width * 3/4);
  if (bindUIRun({
    x: (game_width - w) / 2,
    y: SCREEN_PAD,
    w,
    h: game_height - SCREEN_PAD * 2,
    z,
    pad: uiTextHeight() / 4,
    bindable_cmds: BIND_CMDS,
    // label_style: style_yellow,
    // header_style: style_gold2,
    // alt_background_color: [1, 1, 1, 0.1],
  })) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    setState(stateOptionsMenu);
  }
}

let options_from: 'title' | 'game';

let options_menu: SimpleMenu;

const OPTIONS_MENU_W = round(game_width / 3);

function stateOptionsMenu(dt: number): void {
  if (options_from === 'title') {
    titleMusic();
  } else {
    gameMusic();
  }
  let W = game_width;

  let y = options_from === 'title' ? floor(game_height / 4) :
    game_height / 2;
  let font = uiGetFont();

  if (!options_menu) {
    options_menu = simpleMenuCreate({
      x: floor((game_width - OPTIONS_MENU_W)/2),
      y: floor(game_height / 4),
      z: Z.MODAL + 2,
      width: OPTIONS_MENU_W,
      nav_loop: true,
    });
  }

  const BUTTON_H = 8;
  let button_w = BUTTON_H * 10 + 10;
  let button_x = floor((W - button_w) / 2);
  let button_h = BUTTON_H;
  let button_param = {
    x: button_x,
    w: button_w,
    h: button_h,
    align: ALIGN.HCENTER,
  };

  font.draw({
    ...button_param,
    y: y - FONT_HEIGHT * 2,
    color: palette_font[7],
    text: '- OPTIONS -',
  });


  let items: MenuItem[] = [];
  if (options_from === 'game') {
    items.push({
      name: 'Return to game',
      cb: function () {
        queueTransition();
        backToGame();
      },
    });
  }
  let volume_sound_index = items.length;
  items.push({
    value: settingsGet('volume_sound'),
    name: `SFX Vol: ${(settingsGet('volume_sound') * 100).toFixed(0)}`,
    slider: true,
    value_inc: 0.05,
    value_min: 0,
    value_max: 1,
  });
  let volume_music_index = items.length;
  items.push({
    value: settingsGet('volume_music'),
    name: `Mus Vol: ${(settingsGet('volume_music') * 100).toFixed(0)}`,
    slider: true,
    value_inc: 0.05,
    value_min: 0,
    value_max: 1,
  });
  items.push({
    name: 'Controls',
    cb: () => {
      setState(stateBinds);
    },
  });
  if (options_from === 'game') {
    items.push({
      name: 'Save and Exit',
      cb: function () {
        saveGame();
        queueTransition();
        titleInit();
      },
    });
  } else {
    items.push({
      name: 'Back to Title',
      cb: function () {
        queueTransition();
        titleInit();
      },
    });
  }

  options_menu.run({
    slider_w: floor(OPTIONS_MENU_W/2),
    items,
  });

  settingsSet('volume_sound', options_menu.getItem(volume_sound_index).value as number);
  settingsSet('volume_music', options_menu.getItem(volume_music_index).value as number);

  if (actionEdge('cancel') || actionEdge('menu')) {
    queueTransition();
    if (options_from === 'game') {
      backToGame();
    } else {
      titleInit();
    }
  }
}

export function optionsMenu(from: 'title' | 'game'): void {
  options_from = from;
  setState(stateOptionsMenu);
}
