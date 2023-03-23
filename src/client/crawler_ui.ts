import * as engine from 'glov/client/engine';
import * as input from 'glov/client/input';
import {
  keyDown,
  keyDownEdge,
  keyUpEdge,
  padButtonDown,
  padButtonDownEdge,
  padButtonUpEdge,
} from 'glov/client/input';
import {
  SPOT_DEFAULT_BUTTON,
  SPOT_DEFAULT_BUTTON_DISABLED,
  SPOT_STATE_DISABLED,
  SPOT_STATE_DOWN,
  SPOT_STATE_FOCUSED,
  SPOT_STATE_REGULAR,
  SpotParam,
  SpotStateEnum,
  spot,
  spotSetPadMode,
} from 'glov/client/spot';
import {
  Sprite,
  SpriteDrawParams,
} from 'glov/client/sprites';
import {
  ButtonParam,
  ButtonStateString,
  playUISound,
} from 'glov/client/ui';

const SPOT_STATE_TO_UI_BUTTON_STATE: Record<SpotStateEnum, ButtonStateString> = {
  [SPOT_STATE_REGULAR]: 'regular',
  [SPOT_STATE_DOWN]: 'down',
  [SPOT_STATE_FOCUSED]: 'rollover',
  [SPOT_STATE_DISABLED]: 'disabled',
};


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
}): CrawlerNavButtonRet {
  const { x, y, z, w, h, frame, keys, pads, no_visible_ui, do_up_edge, disabled } = param;
  let button_param: SpotParam & ButtonParam & SpriteDrawParams = {
    def: disabled ? SPOT_DEFAULT_BUTTON_DISABLED : SPOT_DEFAULT_BUTTON,
    // pad_focusable: false,
    frame,
    x, y, z, w, h,
    disabled,
  };
  // Deal with down edge, down time, rollover ourself, combined with key and pad handling
  let state: SpotStateEnum = SPOT_STATE_REGULAR;
  let nav_ret: CrawlerNavButtonRet = {
    down_edge: 0,
    down: 0,
    up_edge: 0,
  };
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
        playUISound('button_click');
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
        playUISound('button_click');
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
  }
  return nav_ret;
}
