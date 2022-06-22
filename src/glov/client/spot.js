import assert from 'assert';
import * as camera2d from './camera2d.js';
import * as engine from './engine.js';
// import { getFrameIndex } from './engine.js';
import {
  KEYS,
  PAD,
  dragDrop,
  dragOver,
  inputClick,
  inputEatenMouse,
  inputTouchMode,
  keyDown,
  keyDownEdge,
  longPress,
  mouseButtonHadEdge,
  mouseDomPos,
  mouseDown,
  mouseDownEdge,
  mouseMoved,
  mouseOver,
  mousePosIsTouch,
  padButtonDownEdge,
} from './input.js';
import * as ui from './ui.js';
import {
  checkHooks,
  drawLine,
  drawRect,
  drawTooltipBox,
  focusIdSet,
  playUISound,
} from './ui.js';
const { abs } = Math;

export const SPOT_DEFAULT = {
  key: undefined, // string | undefined (defaults to from x,y otherwise)
  disabled: false, // boolean
  tooltip: null, // string | LocalizableString
  in_event_cb: null, // for clicks and key presses
  drag_target: false, // receive dragDrop events
  drag_over: false, // consume dragOver events
  button: false, // can be activated/clicked/etc
  button_long_press: false, // detect long press differently than a regular click/tap
  pad_focusable: true, // is a target for keyboard/gamepad focus; set to false if only accessible via hotkey/button
  auto_focus: false, // if this spot is new this frame, and doing pad (not mouse/touch) focusing, automatically focus it
  long_press_focuses: true, // a long press will focus an element (triggering tooltips, etc, on touch devices)
  sound_button: 'button_click', // string // when activated
  sound_rollover: 'rollover', // string | null // when mouse movement triggers focus
  touch_focuses: false, // first touch focuses (on touch devices), showing tooltip, etc, second activates the button
  disabled_focusable: true, // allow focusing even if disabled (e.g. to show tooltip)
  hotkey: null, // optional keyboard hotkey
  hotpad: null, // optional gamepad button
};

export const SPOT_DEFAULT_BUTTON = {
  ...SPOT_DEFAULT,
  button: true,
};

export const SPOT_DEFAULT_BUTTON_DISABLED = {
  ...SPOT_DEFAULT,
  disabled: true,
  sound_rollover: null,
};

export const SPOT_DEFAULT_BUTTON_DRAW_ONLY = {
  // Matches previous { draw_only: true, draw_only_mouseover: true, disabled_mouseover: true } option to ui.buttonShared
  ...SPOT_DEFAULT,
  pad_focusable: false,
};

export const SPOT_DEFAULT_LABEL = {
  ...SPOT_DEFAULT,
  sound_rollover: null,
  touch_focuses: true, // usually want this?
};

export const SPOT_STATE_REGULAR = 1;
export const SPOT_STATE_DOWN = 2;
export const SPOT_STATE_FOCUSED = 3;
export const SPOT_STATE_DISABLED = 4;

// const SPOT_NAV_NONE = 0;
const SPOT_NAV_LEFT = 1;
const SPOT_NAV_UP = 2;
const SPOT_NAV_RIGHT = 3;
const SPOT_NAV_DOWN = 4;
const SPOT_NAV_NEXT = 5;
const SPOT_NAV_PREV = 6;
const SPOT_NAV_MAX = 7;

let focus_sub_rect = null;
let focus_key = null;
let focus_pos = { x: 0, y: 0, w: 0, h: 0 };
let frame_spots = [];
let focus_next = []; // indexed by SPOT_NAV_*
let frame_autofocus_spots = {};
let last_frame_autofocus_spots = {};
// pad_mode: really "non-mouse-mode" - touch triggers this in various situations
// non-pad_mode (mouse mode) requires constant mouse over state to maintain focus
let pad_mode = false;

export function spotPadMode() {
  return pad_mode;
}

function spotlog(...args) {
  // console.log(`spotlog(${getFrameIndex()}): `, ...args);
}

function spotKey(param) {
  let key = param.key || `${focus_sub_rect ? focus_sub_rect.key_computed : ''}_${param.x}_${param.y}`;
  if (param.key_computed) {
    assert.equal(param.key_computed, key);
  } else {
    param.key_computed = key;
  }
  return param.key_computed;
}

function spotFocusSet(param, from_mouseover, log) {
  if (from_mouseover && (!mouseMoved() || mousePosIsTouch())) {
    return false;
  }
  const def = param.def || SPOT_DEFAULT;
  const sound_rollover = param.sound_rollover === undefined ? def.sound_rollover : param.sound_rollover;
  const key = param.key_computed || spotKey(param);
  if ((sound_rollover || !from_mouseover) && focus_key !== key) {
    playUISound(sound_rollover || SPOT_DEFAULT.sound_rollover);
  }
  if (focus_key !== key || pad_mode !== !from_mouseover) {
    spotlog('spotFocusSet', key, log, from_mouseover ? '' : 'pad_mode');
  }
  pad_mode = !from_mouseover;
  focus_key = key;
  assert(param.dom_pos);
  return true;
}

const TARGET_QUAD = 0;
const TARGET_HALF = 1;
const TARGET_ALL = 2;

function findBestTarget(nav, dom_pos, targets, precision) {
  let start_x = dom_pos.x * 2 + dom_pos.w;
  let start_y = dom_pos.y * 2 + dom_pos.h;
  let best = null;
  let bestd = Infinity;
  for (let ii = 0; ii < targets.length; ++ii) {
    let param = targets[ii];
    let x = param.dom_pos.x * 2 + param.dom_pos.w;
    let y = param.dom_pos.y * 2 + param.dom_pos.h;
    let dx = x - start_x;
    let dy = y - start_y;
    if (precision === TARGET_QUAD) {
      let quadrant;
      if (abs(dx) > abs(dy)) {
        if (dx > 0) {
          quadrant = SPOT_NAV_RIGHT;
        } else {
          quadrant = SPOT_NAV_LEFT;
        }
      } else {
        if (dy > 0) {
          quadrant = SPOT_NAV_DOWN;
        } else {
          quadrant = SPOT_NAV_UP;
        }
      }
      if (quadrant !== nav) {
        continue;
      }
    } else if (precision === TARGET_HALF) {
      if (dx <= 0 && nav === SPOT_NAV_RIGHT ||
        dx >= 0 && nav === SPOT_NAV_LEFT ||
        dy <= 0 && nav === SPOT_NAV_DOWN ||
        dy >= 0 && nav === SPOT_NAV_UP
      ) {
        continue;
      }
    } else {
      // allow any, just find closest
    }
    let d = abs(dx) + abs(dy);
    if (d < bestd) {
      best = param;
      bestd = d;
    }
  }
  return best;
}

const EPSILON = 0.00001;
let debug_style;
function spotDebug() {
  camera2d.push();
  camera2d.setDOMMapped();
  let show_all = keyDown(KEYS.SHIFT);
  for (let ii = 0; ii < frame_spots.length; ++ii) {
    let area = frame_spots[ii];
    let pos = area.dom_pos;
    let color;
    if (area.only_mouseover) {
      if (!area.debug_ignore) {
        color = [1,0.5,0, 0.5];
      }
    } else {
      for (let jj = 0; jj < frame_spots.length; ++jj) {
        if (ii === jj) {
          continue;
        }
        let other = frame_spots[jj];
        if (other.only_mouseover) {
          continue;
        }
        let other_pos = other.dom_pos;
        if (pos.x < other_pos.x + other_pos.w - EPSILON && pos.x + pos.w > other_pos.x + EPSILON &&
          pos.y < other_pos.y + other_pos.h - EPSILON && pos.y + pos.h > other_pos.y + EPSILON
        ) {
          color = [1,0,0, 0.5];
        }
      }
    }
    if (!show_all && !color) {
      continue;
    }
    drawRect(pos.x, pos.y, pos.x + pos.w, pos.y + pos.h, Z.DEBUG, color || [1,1,0, 0.5]);
    if (!debug_style) {
      debug_style = ui.font.style(null, {
        color: 0x000000ff,
        outline_color: 0xFFFFFFcc,
        outline_width: 2,
      });
    }
    ui.font.drawSizedAligned(debug_style, pos.x, pos.y, Z.DEBUG, 8,
      ui.font.ALIGN.HVCENTERFIT, pos.w, pos.h, area.key_computed || 'unknown');
  }

  if (pad_mode) {
    for (let ii = SPOT_NAV_LEFT; ii <= SPOT_NAV_DOWN; ++ii) {
      let next = focus_next[ii];
      if (next) {
        let pos = focus_pos;
        next = next.dom_pos;
        drawLine(pos.x + pos.w/2, pos.y + pos.h/2, next.x + next.w/2, next.y+next.h/2,
          Z.DEBUG, 1, 0.95, [1, 1, 0, 1]);
      }
    }
  }

  camera2d.pop();
}

function spotCalcNavTargets() {
  // Computes, for each direction, where we would target from the current focus
  //   state, to be used next frame if a focus key is pressed.
  // Note: cannot compute this trivially only upon keypress since we do not know
  //   which keys to press until we reached a focused / focusable element.  We
  //   could, however, instead, do this at the beginning of the frame only if
  //   we peek at the key/pad state and see that it *might be* pressed this
  //   frame.
  for (let ii = 1; ii < SPOT_NAV_MAX; ++ii) {
    focus_next[ii] = null;
  }
  let start;
  let do_next = false;
  let pad_focusable_list = [];
  for (let ii = 0; ii < frame_spots.length; ++ii) {
    let param = frame_spots[ii];
    if (param.key_computed === focus_key) {
      if (!focus_next[SPOT_NAV_PREV] && pad_focusable_list.length) {
        focus_next[SPOT_NAV_PREV] = pad_focusable_list[pad_focusable_list.length - 1];
      }
      do_next = true;
      start = param;
    } else {
      const def = param.def || SPOT_DEFAULT;
      const pad_focusable = param.pad_focusable === undefined ? def.pad_focusable : param.pad_focusable;
      if (pad_focusable) {
        if (do_next) {
          focus_next[SPOT_NAV_NEXT] = param;
          do_next = false;
        }
        pad_focusable_list.push(param);
      }
    }
  }
  if (!focus_next[SPOT_NAV_PREV]) {
    // but, didn't trigger above, must have been first, wrap to end
    if (pad_focusable_list.length) {
      focus_next[SPOT_NAV_PREV] = pad_focusable_list[pad_focusable_list.length - 1];
    }
  }
  if (!focus_next[SPOT_NAV_NEXT]) {
    // nothing next, go to first
    if (pad_focusable_list.length) {
      focus_next[SPOT_NAV_NEXT] = pad_focusable_list[0];
    }
  }
  let precision_max;
  if (start) {
    focus_pos.x = start.dom_pos.x;
    focus_pos.y = start.dom_pos.y;
    focus_pos.w = start.dom_pos.w;
    focus_pos.h = start.dom_pos.h;
    precision_max = TARGET_HALF;
  } else {
    precision_max = TARGET_ALL;
  }
  for (let ii = SPOT_NAV_LEFT; ii <= SPOT_NAV_DOWN; ++ii) {
    for (let precision = 0; precision <= precision_max; ++precision) {
      // Go to the one in the appropriate quadrant which has the smallest Manhattan distance
      let best = findBestTarget(ii, focus_pos, pad_focusable_list, precision);
      if (best) {
        focus_next[ii] = best;
        break;
      }
    }
  }
}

export function spotTopOfFrame() {
  if (mouseMoved()) {
    let pos = mouseDomPos();
    focus_pos.x = pos[0];
    focus_pos.y = pos[1];
    focus_pos.w = 0;
    focus_pos.h = 0;
  }
  if (mouseDownEdge({ peek: true })) {
    pad_mode = false;
  }
}

export function spotEndOfFrame() {
  spotCalcNavTargets();

  last_frame_autofocus_spots = frame_autofocus_spots;
  frame_spots = [];
  frame_autofocus_spots = {};
}

export function spotSubBegin(param) {
  assert(param.key);
  assert(!focus_sub_rect); // no recursive nesting supported yet
  spotKey(param);
  focus_sub_rect = param;
  focusIdSet(param.key_computed);
}

export function spotSubEnd() {
  assert(focus_sub_rect);
  focus_sub_rect = null;
  focusIdSet(null);
}

function spotEntirelyObscured(param) {
  let pos = param.dom_pos;
  for (let ii = 0; ii < frame_spots.length; ++ii) {
    let other = frame_spots[ii];
    if (other.no_obscure_spots) {
      continue;
    }
    let other_pos = other.dom_pos;
    if (other_pos.x <= pos.x && other_pos.x + other_pos.w >= pos.x + pos.w &&
      other_pos.y <= pos.y && other_pos.y + other_pos.h >= pos.y + pos.h
    ) {
      return true;
    }
  }
  return false;
}

export function spotMouseverHook(pos_param, param) {
  if (inputEatenMouse()) {
    return;
  }
  if (param.key_computed) { // presumably in a call to `spot()`
    return;
  }
  if (!pos_param.dom_pos) {
    pos_param.dom_pos = {};
  }
  camera2d.virtualToDomPosParam(pos_param.dom_pos, pos_param);
  if (!spotEntirelyObscured(pos_param)) {
    pos_param.only_mouseover = true;
    pos_param.pad_focusable = false;
    pos_param.no_obscure_spots = param.no_obscure_spots;
    if (engine.defines.SPOT_DEBUG) {
      pos_param.debug_ignore = param.eat_clicks; // just consuming mouseover, not a button / etc
    }
    frame_spots.push(pos_param);
  }
}

function keyCheck(nav_dir) {
  switch (nav_dir) {
    case SPOT_NAV_LEFT:
      return keyDownEdge(KEYS.LEFT) || padButtonDownEdge(PAD.LEFT);
    case SPOT_NAV_UP:
      return keyDownEdge(KEYS.UP) || padButtonDownEdge(PAD.UP);
    case SPOT_NAV_RIGHT:
      return keyDownEdge(KEYS.RIGHT) || padButtonDownEdge(PAD.RIGHT);
    case SPOT_NAV_DOWN:
      return keyDownEdge(KEYS.DOWN) || padButtonDownEdge(PAD.DOWN);
    case SPOT_NAV_PREV:
      return keyDown(KEYS.SHIFT) && keyDownEdge(KEYS.TAB) || padButtonDownEdge(PAD.LEFT_BUMPER);
    case SPOT_NAV_NEXT:
      return keyDownEdge(KEYS.TAB) || padButtonDownEdge(PAD.RIGHT_BUMPER);
    default:
      assert(false);
  }
  return false;
}

function spotFocusCheckNavButtonsFocused() {
  for (let ii = 1; ii < SPOT_NAV_MAX; ++ii) {
    if (focus_next[ii] && keyCheck(ii)) {
      spotFocusSet(focus_next[ii], false, 'nav_focused');
    }
  }
}

function spotFocusCheckNavButtonsUnfocused(param) {
  for (let ii = 1; ii < SPOT_NAV_MAX; ++ii) {
    if (focus_next[ii] && focus_next[ii].key_computed === param.key_computed && keyCheck(ii)) {
      spotFocusSet(focus_next[ii], false, 'nav_unfocused');
    }
  }
}

let allow_focus;
function spotFocusCheck(param) {
  allow_focus = true;
  const key = spotKey(param); // Doing this even if disabled for spotDebug()
  const def = param.def || SPOT_DEFAULT;
  const disabled = param.disabled === undefined ? def.disabled : param.disabled;
  if (disabled) {
    const disabled_focusable = param.disabled_focusable === undefined ? def.disabled_focusable :
      param.disabled_focusable;
    if (!disabled_focusable) {
      allow_focus = false;
      return false;
    }
    // Otherwise disabled_focusable - allow focusing
  }
  if (focus_key === key) {
    // last_frame_focus_found = true;
    spotFocusCheckNavButtonsFocused();
  } else {
    spotFocusCheckNavButtonsUnfocused(param);
  }
  let focused = focus_key === key;
  if (!inputEatenMouse()) {
    if (!param.dom_pos) {
      param.dom_pos = {};
    }
    camera2d.virtualToDomPosParam(param.dom_pos, param);
    if (!spotEntirelyObscured(param)) {
      frame_spots.push(param);
      const auto_focus = param.auto_focus === undefined ? def.auto_focus : param.auto_focus;
      if (auto_focus) {
        if (!focused && !last_frame_autofocus_spots[key] && pad_mode) {
          spotlog('auto_focus', key);
          // play no sound, etc, just silently steal focus
          // spotFocusSet(param, false, 'auto_focus');
          focus_key = key;
          focused = true;
        }
        frame_autofocus_spots[key] = param;
      }
    }
  }

  return focused;
}

export function spotEndInput() {
  if (engine.defines.SPOT_DEBUG) {
    spotDebug();
  }
}

function spotUnfocus() {
  spotlog('spotUnfocus');
  focus_key = null;
  pad_mode = false;
}

// param:
//   See SPOT_DEFAULT, additionally:
//   x,y,w,h : number // only parameters not inherited from `def`
//   def: used for any undefined parameters (defaults to SPOT_DEFAULT)
//   out: object // holds return values, lazy-allocated if needed
// returns/modifies param.out:
//   focused : boolean // focused by any means
//   spot_state: one of SPOT_STATE_*
//   ret: boolean // if `param.button` and was activated
//   long_press: boolean // if button_long_press and ret and was a long press, set to true
//   button: number // if ret, set to mouse button used to click it
//   double_click: boolean // if ret, set to true if it was a double click
//   drag: any // if drag_target and a drop happened, contains payload
export function spot(param) {
  const def = param.def || SPOT_DEFAULT;
  const disabled = param.disabled === undefined ? def.disabled : param.disabled;
  const tooltip = param.tooltip === undefined ? def.tooltip : param.tooltip;
  const button = param.button === undefined ? def.button : param.button;
  const button_long_press = param.button_long_press === undefined ? def.button_long_press : param.button_long_press;
  const in_event_cb = param.in_event_cb === undefined ? def.in_event_cb : param.in_event_cb;
  const drag_target = param.drag_target === undefined ? def.drag_target : param.drag_target;
  const drag_over = param.drag_over === undefined ? def.drag_over : param.drag_over;
  const touch_focuses = param.touch_focuses === undefined ? def.touch_focuses : param.touch_focuses;

  let out = param.out;
  if (!out) {
    out = param.out = {};
  }
  out.focused = false;
  out.ret = false;
  if (button_long_press) {
    out.long_press = false;
  }
  if (drag_target) {
    out.drag = null;
  }


  let state = SPOT_STATE_REGULAR;
  let focused = spotFocusCheck(param); // sets allow_focus
  if (disabled) {
    state = SPOT_STATE_DISABLED;
  } else {
    let button_click;
    if (drag_target && (param.drag = dragDrop(param))) {
      spotFocusSet(param, true, 'drag_drop');
      focused = true;
    } else if (button_long_press && (button_click = longPress(param)) ||
        button && (button_click = inputClick(param))
    ) {
      out.long_press = button_click.long_press;
      out.button = button_click.button;
      out.double_click = button_click.was_double_click;
      if (mousePosIsTouch()) {
        if (touch_focuses) {
          if (!focused) {
            // Just focus, show tooltip
            // touch_changed_focus = true;
            // Considering this a "pad" focus, not mouse, as it's sticky
            spotFocusSet(param, false, 'touch_focus');
            focused = true;
          } else {
            // activate, and also unfocus
            out.ret = true;
            spotUnfocus();
            focused = false;
          }
        } else {
          // not focusing, would flicker a tooltip for 1 frame
          // also, unfocusing, in case it was focused via long_press_focuses
          out.ret = true;
          spotUnfocus();
          focused = false;
        }
      } else {
        out.ret = true;
        spotFocusSet(param, true, 'click');
        focused = true;
      }
    } else if (!button && touch_focuses && mousePosIsTouch() && inputClick(param)) {
      // Considering this a "pad" focus, not mouse, as it's sticky
      spotFocusSet(param, false, 'touch_focus');
      focused = true;
    } else if (drag_target && dragOver(param)) {
      spotFocusSet(param, true, 'drag_over');
      focused = true;
      if (mouseDown()) {
        state = SPOT_STATE_DOWN;
      }
    } else if (drag_over && dragOver(param)) {
      // do nothing, just consume event
      // not even set focus?
    }
  }
  // Long-press (on touch) focuses, a la mouse rollover
  if (allow_focus && inputTouchMode()) {
    const long_press_focuses = param.long_press_focuses === undefined ?
      def.long_press_focuses : param.long_press_focuses;
    if (long_press_focuses && longPress(param)) {
      // Considering this a "pad" focus, not mouse, as it's sticky
      spotFocusSet(param, false, 'long_press');
      focused = true;
    }
  }
  let is_mouseover = mouseOver(param);
  if (focused && !is_mouseover && (mouseMoved() || mouseButtonHadEdge())) {
    focused = false;
    spotUnfocus();
  }
  if (is_mouseover) {
    if (allow_focus) {
      if (spotFocusSet(param, true, 'mouseover')) {
        focused = true;
      }
    }
  }
  if (button && mouseDown({
    x: param.x, y: param.y,
    w: param.w, h: param.h,
    do_max_dist: true, // Need to apply the same max_dist logic to mouseDown() as we do for click()
  })) {
    state = SPOT_STATE_DOWN;
  }

  let button_activate = false;
  if (focused) {
    if (state === SPOT_STATE_REGULAR) {
      state = SPOT_STATE_FOCUSED;
    }
    if (button && !disabled) {
      let key_opts = in_event_cb ? { in_event_cb } : null;
      if (keyDownEdge(KEYS.SPACE, key_opts) || keyDownEdge(KEYS.RETURN, key_opts) || padButtonDownEdge(PAD.A)) {
        button_activate = true;
      }
    }
  }
  if (!disabled) {
    const hotkey = param.hotkey === undefined ? def.hotkey : param.hotkey;
    const hotpad = param.hotpad === undefined ? def.hotpad : param.hotpad;
    if (hotkey) {
      let key_opts = in_event_cb ? { in_event_cb } : null;
      if (keyDownEdge(hotkey, key_opts)) {
        button_activate = true;
      }
    }
    if (hotpad) {
      if (padButtonDownEdge(hotpad)) {
        button_activate = true;
      }
    }
  }
  if (button_activate) {
    out.ret = true;
    out.button = 0;
  }

  out.focused = focused;
  if (out.ret) {
    state = SPOT_STATE_DOWN;
    const sound_button = param.sound_button === undefined ? def.sound_button : param.sound_button;
    playUISound(sound_button);
  }
  if (out.focused && tooltip) {
    drawTooltipBox(param);
  }
  checkHooks(param, out.ret);
  out.spot_state = state;

  return out;
}
