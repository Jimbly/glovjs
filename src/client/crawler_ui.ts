import * as engine from 'glov/client/engine';
import { fontStyle } from 'glov/client/font';
import { Box } from 'glov/client/geom_types';
import * as input from 'glov/client/input';
import {
  inputPadMode,
  inputTouchMode,
  keyDown,
  keyDownEdge,
  KEYS,
  keyUpEdge,
  padButtonDown,
  padButtonDownEdge,
  padButtonUpEdge,
} from 'glov/client/input';
import {
  spot,
  SPOT_DEFAULT_BUTTON,
  SPOT_DEFAULT_BUTTON_DISABLED,
  SPOT_STATE_DISABLED,
  SPOT_STATE_DOWN,
  SPOT_STATE_FOCUSED,
  SPOT_STATE_REGULAR,
  SpotParam,
  spotSetPadMode,
  SpotStateEnum,
} from 'glov/client/spot';
import {
  Sprite,
  SpriteDrawParams,
} from 'glov/client/sprites';
import {
  ButtonParam,
  ButtonStateString,
  playUISound,
  uiGetFont,
} from 'glov/client/ui';

const SPOT_STATE_TO_UI_BUTTON_STATE: Record<SpotStateEnum, ButtonStateString> = {
  [SPOT_STATE_REGULAR]: 'regular',
  [SPOT_STATE_DOWN]: 'down',
  [SPOT_STATE_FOCUSED]: 'rollover',
  [SPOT_STATE_DISABLED]: 'disabled',
};

// TODO: allow overriding
let hotkey_font_style = fontStyle(null, {
  color: 0x000000ff,
  outline_color: 0xFFFFFFff,
  outline_width: 3,
});
let hotkey_font_size = 6;
let hotkey_font_pad_h = 2;
let hotkey_font_pad_v = 3.2;

const PADNAMES = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'BACK',
  'START',
  'LS',
  'RS',
  // '↑', // don't show these, should be obvious from the buttons
  // '↓',
  // '←',
  // '→',
];

export type CrawlerNavButtonRet = {
  down_edge: number;
  down: number;
  up_edge: number;
};
export function crawlerOnScreenButton(param: {
  x: number; y: number; z?: number;
  w: number; h: number;
  frame: number;
  keys: number[];
  pads: number[];
  no_visible_ui: boolean;
  do_up_edge: boolean;
  disabled: boolean;
  button_sprites: Record<ButtonStateString, Sprite>;
  touch_hotzone?: Box;
  is_movement: boolean;
  show_hotkeys: boolean;
}): CrawlerNavButtonRet {
  const {
    x, y, z, w, h,
    frame, keys, pads,
    no_visible_ui,
    do_up_edge,
    disabled,
    touch_hotzone,
    is_movement,
    show_hotkeys,
  } = param;

  let visible_hotkey: string | undefined;
  if (show_hotkeys) {
    if (inputTouchMode()) {
      // No hotkeys
    } else if (inputPadMode()) {
      if (pads && pads.length) {
        let pad = pads[0];
        visible_hotkey = PADNAMES[pad];
      }
    } else {
      // keyboard hotkeys (note: removed show_hotkeys from parent here)
      if (keys.length) {
        let idx = keys[0];
        if (idx >= KEYS.A && idx <= KEYS.Z) {
          visible_hotkey = String.fromCharCode(idx);
        } else if (idx === KEYS.ESC) {
          visible_hotkey = 'ESC';
        }
      }
    }
  }

  let sound_button = is_movement ? 'button_click2' : 'button_click'; // DCJAM
  let button_param: SpotParam & ButtonParam & SpriteDrawParams = {
    def: disabled ? SPOT_DEFAULT_BUTTON_DISABLED : SPOT_DEFAULT_BUTTON,
    // pad_focusable: false,
    frame,
    x, y, z, w, h,
    disabled,
    sound_button,
  };
  // Deal with down edge, down time, rollover ourself, combined with key and pad handling
  let state: SpotStateEnum = SPOT_STATE_REGULAR;
  let nav_ret: CrawlerNavButtonRet = {
    down_edge: 0,
    down: 0,
    up_edge: 0,
  };
  if (!disabled) {
    if (!no_visible_ui) {
      if (input.mouseDownEdge(button_param)) {
        nav_ret.down_edge++;
      }
      let { spot_state, ret } = spot(button_param);
      if (spot_state === SPOT_STATE_DOWN) {
        nav_ret.down += engine.frame_dt;
      }
      state = spot_state;
      if (do_up_edge) {
        nav_ret.up_edge+=ret;
      }
    }
    if (touch_hotzone) {
      if (input.mouseOver({
        ...touch_hotzone,
        peek: true,
      })) {
        if (input.mouseDownEdge(touch_hotzone)) {
          playUISound(sound_button);
          nav_ret.down_edge++;
          nav_ret.down++;
        } else if (input.mouseDownMidClick(touch_hotzone)) {
          nav_ret.down++;
        }
      }
    }
    for (let ii = 0; ii < keys.length; ++ii) {
      if (keyDownEdge(keys[ii])) {
        nav_ret.down_edge++;
      }
      if (keyDown(keys[ii])) {
        nav_ret.down++;
      }
      if (keyUpEdge(keys[ii])) {
        if (do_up_edge && !disabled) {
          nav_ret.up_edge++;
          spotSetPadMode(true);
          playUISound(sound_button);
        }
      }
    }
    for (let ii = 0; ii < pads.length; ++ii) {
      if (padButtonDownEdge(pads[ii])) {
        nav_ret.down_edge++;
      }
      if (padButtonDown(pads[ii])) {
        nav_ret.down++;
      }
      if (padButtonUpEdge(pads[ii])) {
        if (do_up_edge && !disabled) {
          nav_ret.up_edge++;
          spotSetPadMode(true);
          playUISound(sound_button);
        }
      }
    }
  }

  if (disabled) {
    nav_ret.down_edge = nav_ret.up_edge = nav_ret.down = 0;
  }

  if (nav_ret.down_edge || nav_ret.down) {
    state = SPOT_STATE_DOWN;
  }
  if (!no_visible_ui) {
    param.button_sprites[SPOT_STATE_TO_UI_BUTTON_STATE[state]].draw(button_param);
    if (visible_hotkey) {
      uiGetFont().drawSized(hotkey_font_style, x + hotkey_font_pad_h, y + hotkey_font_pad_v,
        (z || Z.UI) + 0.1, hotkey_font_size, visible_hotkey);
    }
  }
  return nav_ret;
}
