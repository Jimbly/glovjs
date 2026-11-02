import { actionDown, actionEdge, ActionKey } from 'glov/client/actions';
import * as engine from 'glov/client/engine';
import { ALIGN, Font, FontStyle, fontStyle } from 'glov/client/font';
import { Box } from 'glov/client/geom_types';
import * as input from 'glov/client/input';
import {
  inputPadMode,
  inputTouchMode,
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
  getUIElemData,
  playUISound,
  uiGetFont,
} from 'glov/client/ui';

const SPOT_STATE_TO_UI_BUTTON_STATE: Record<SpotStateEnum, ButtonStateString> = {
  [SPOT_STATE_REGULAR]: 'regular',
  [SPOT_STATE_DOWN]: 'down',
  [SPOT_STATE_FOCUSED]: 'rollover',
  [SPOT_STATE_DISABLED]: 'disabled',
};

let hotkey_font: Font | null = null;
let hotkey_font_style = fontStyle(null, {
  color: 0x000000ff,
  outline_color: 0xFFFFFFff,
  outline_width: 3,
});
let hotkey_font_size = 6;
let hotkey_font_pad_h = 2;
let hotkey_font_pad_v = 3.2;
let hotkey_font_align = ALIGN.HLEFT;
export function crawerUISetHotkeyFont(
  font: Font,
  font_style: FontStyle,
  font_size: number,
  font_pad_h: number,
  font_pad_v: number,
  align: ALIGN,
): void {
  hotkey_font = font;
  hotkey_font_style = font_style;
  hotkey_font_size = font_size;
  hotkey_font_pad_h = font_pad_h;
  hotkey_font_pad_v = font_pad_v;
  hotkey_font_align = align;
}

// const PADNAMES = [
//   'A',
//   'B',
//   'X',
//   'Y',
//   'LB',
//   'RB',
//   'LT',
//   'RT',
//   'Back',
//   '▶', // START
//   'LS',
//   'RS',
//   // '↑', // don't show these, should be obvious from the buttons
//   // '↓',
//   // '←',
//   // '→',
// ];

type ButtonState = {
  seen_down_edge: boolean;
};
function allocButtonState(): ButtonState {
  return { seen_down_edge: false };
}

export type FocusCallback = (hotzone: Box, key: string) => void;
let focus_callback: null | FocusCallback = null;
export function crawlerUISetFocusCallback(cb: FocusCallback | null): void {
  focus_callback = cb;
}

export type CrawlerNavButtonRet = {
  down_edge: number;
  down: number;
  up_edge: number;
};
export function crawlerOnScreenButton(param: {
  x: number; y: number; z?: number;
  w: number; h: number;
  frame: number;
  actions: ActionKey[];
  no_visible_ui: boolean;
  do_up_edge: boolean;
  disabled: boolean;
  button_sprites: Record<ButtonStateString, Sprite>;
  touch_hotzone?: Box;
  is_movement: boolean;
  show_hotkeys: boolean;
  key: string; // only for focus_callback
}): CrawlerNavButtonRet {
  const {
    x, y, z, w, h,
    frame, actions,
    no_visible_ui,
    do_up_edge,
    disabled,
    touch_hotzone,
    is_movement,
    show_hotkeys,
    key,
  } = param;

  let visible_hotkey: string | undefined;
  if (show_hotkeys) {
    if (inputTouchMode()) {
      // No hotkeys
    } else if (inputPadMode()) {
      // TODO: get name of primary controller bind from `actions`
      // if (pads && pads.length) {
      //   let pad = pads[0];
      //   visible_hotkey = PADNAMES[pad];
      // }
    } else {
      // keyboard hotkeys (note: removed show_hotkeys from parent here)
      // TODO: get name of primary keyboard bind from `actions`
      // if (keys.length) {
      //   let idx = keys[0];
      //   if (idx >= KEYS.A && idx <= KEYS.Z) {
      //     visible_hotkey = String.fromCharCode(idx);
      //   } else if (idx === KEYS.ESC) {
      //     visible_hotkey = 'ESC';
      //   }
      // }
    }
  }

  let sound_button = is_movement ? 'button_click2' : 'button_click';
  let button_param: SpotParam & ButtonParam & SpriteDrawParams = {
    def: disabled ? SPOT_DEFAULT_BUTTON_DISABLED : SPOT_DEFAULT_BUTTON,
    pad_focusable: false,
    frame,
    x, y, z, w, h,
    disabled,
    sound_button,
  };
  let button_state = getUIElemData('crawlerOnScreenButton', button_param, allocButtonState);
  // Deal with down edge, down time, rollover ourselves, combined with key and pad handling
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
        button_state.seen_down_edge = true;
      }
      let { spot_state, ret } = spot(button_param);
      if (spot_state === SPOT_STATE_DOWN) {
        nav_ret.down += engine.frame_dt;
      }
      state = spot_state;
      if (do_up_edge && button_state.seen_down_edge) {
        nav_ret.up_edge += ret;
      }
    }
    if (touch_hotzone) {
      if (input.mouseOver({
        ...touch_hotzone,
        peek_touch: true,
      })) {
        focus_callback?.(touch_hotzone, key);
        if (input.mouseDownEdge(touch_hotzone)) {
          playUISound(sound_button);
          nav_ret.down_edge++;
          nav_ret.down++;
          button_state.seen_down_edge = true;
        } else if (input.mouseDownMidClick(touch_hotzone) && button_state.seen_down_edge) {
          nav_ret.down++;
        }
      }
    }
    for (let ii = 0; ii < actions.length; ++ii) {
      let action = actions[ii];
      if (actionEdge(action)) {
        nav_ret.down_edge++;
        button_state.seen_down_edge = true;
        if (do_up_edge && !disabled) {
          nav_ret.up_edge++;
          spotSetPadMode(true);
          playUISound(sound_button);
        }
      }
      if (actionDown(action)) {
        nav_ret.down++;
      }
    }
  }

  if (disabled) {
    nav_ret.down_edge = nav_ret.up_edge = nav_ret.down = 0;
  }

  if (button_state.seen_down_edge && !nav_ret.down) {
    button_state.seen_down_edge = false;
  }
  if (!button_state.seen_down_edge && nav_ret.down) {
    nav_ret.down = 0;
  }

  if (nav_ret.down_edge || nav_ret.down) {
    state = SPOT_STATE_DOWN;
  }
  if (!no_visible_ui) {
    param.button_sprites[SPOT_STATE_TO_UI_BUTTON_STATE[state]].draw(button_param);
    if (visible_hotkey) {
      (hotkey_font || uiGetFont()).drawSizedAligned(hotkey_font_style, x + hotkey_font_pad_h, y + hotkey_font_pad_v,
        (z || Z.UI) + 0.1, hotkey_font_size, hotkey_font_align, w, h, visible_hotkey);
    }
  }
  return nav_ret;
}
