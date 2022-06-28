export const SPOT_NAV_NONE = 0;
export const SPOT_NAV_LEFT = 1;
export const SPOT_NAV_UP = 2;
export const SPOT_NAV_RIGHT = 3;
export const SPOT_NAV_DOWN = 4;
export const SPOT_NAV_NEXT = 5;
export const SPOT_NAV_PREV = 6;
const SPOT_NAV_MAX = 7;

export const BUTTON_ANY = -2; // same as input.ANY

export const SPOT_DEFAULT = {
  key: undefined, // string | undefined (defaults to from x,y otherwise)
  disabled: false, // boolean
  tooltip: null, // string | LocalizableString
  in_event_cb: null, // for clicks and key presses
  drag_target: false, // receive dragDrop events
  drag_over: false, // consume dragOver events
  button: BUTTON_ANY, // respond to which mouse button
  is_button: false, // can be activated/clicked/etc
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
  // (silently) ensures we have the focus this frame (e.g. if dragging a slider, the slider
  // should retain focus even without mouseover)
  focus_steal: false,
  // optional map of SPOT_NAV_* to either:
  //   null: indicates the spot should not do navigation, but allow the caller to handle (sets param.out.nav)
  //   a string key: a custom element to target with navigation
  custom_nav: null,
};

export const SPOT_DEFAULT_BUTTON = {
  ...SPOT_DEFAULT,
  is_button: true,
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

import assert from 'assert';
const { abs } = Math;
import * as camera2d from './camera2d.js';
import * as engine from './engine.js';
// import { getFrameIndex } from './engine.js';
import {
  KEYS,
  PAD,
  drag,
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

let focus_sub_rect = null;
let focus_sub_rect_elem;
let sub_stack = [];
let focus_key = null;
let focus_pos = { x: 0, y: 0, w: 0, h: 0 };
let frame_spots = [];
let focus_next = []; // indexed by SPOT_NAV_*
let focus_next_via = []; // just for spotDebug
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

function findBestTargetInternal(nav, dom_pos, targets, precision, filter) {
  let start_x = dom_pos.x * 2 + dom_pos.w;
  let start_y = dom_pos.y * 2 + dom_pos.h;
  let best = null;
  let bestd = Infinity;
  for (let ii = 0; ii < targets.length; ++ii) {
    let param = targets[ii];
    if (!filter(param)) {
      continue;
    }
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
function spotDebugList(show_all, list) {
  for (let ii = 0; ii < list.length; ++ii) {
    let area = list[ii];
    let pos = area.dom_pos;
    let color;
    if (area.spot_debug_ignore) {
      continue;
    }
    if (area.only_mouseover) {
      color = [1,0.5,0, 0.5];
    } else {
      const def = area.def || SPOT_DEFAULT;
      const pad_focusable = area.pad_focusable === undefined ? def.pad_focusable : area.pad_focusable;
      if (!pad_focusable) {
        continue;
      }
      for (let jj = ii; jj < list.length; ++jj) {
        if (ii === jj) {
          continue;
        }
        let other = list[jj];
        if (other.sub_rect !== area.sub_rect) {
          continue;
        }
        if (other.only_mouseover || !(other.pad_focusable ?? other.def?.pad_focusable)) {
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
}
function spotDebug() {
  camera2d.push();
  camera2d.setDOMMapped();
  let show_all = keyDown(KEYS.SHIFT);
  spotDebugList(show_all, frame_spots);

  if (pad_mode || show_all) {
    for (let ii = SPOT_NAV_LEFT; ii <= SPOT_NAV_DOWN; ++ii) {
      let next = focus_next[ii];
      if (next) {
        let pos = focus_pos;
        next = next.dom_pos;
        let via = focus_next_via[ii];
        if (via) {
          pos = via.dom_pos;
          drawLine(pos.x + pos.w/2, pos.y + pos.h/2, next.x + next.w/2, next.y+next.h/2,
            Z.DEBUG, 1, 0.95, [1, 0.5, 0, 1]);
          pos = focus_pos;
          next = via.dom_pos;
        }
        drawLine(pos.x + pos.w/2, pos.y + pos.h/2, next.x + next.w/2, next.y+next.h/2,
          Z.DEBUG, 1, 0.95, [1, 1, 0, 1]);
      }
    }
  }

  camera2d.pop();
}

let filter_sub_rect;
let filter_not;
function filterMatchesSubrect(param) {
  return param !== filter_not && param.sub_rect === filter_sub_rect;
}

function overlaps(r1, r2) {
  return r1.x + r1.w > r2.x && r1.x < r2.x + r2.w &&
    r1.y + r1.h > r2.y && r1.y < r2.y + r2.h;
}
function contains(outer, inner) {
  return inner.x >= outer.x && inner.x + inner.w <= outer.x + outer.w &&
    inner.y >= outer.y && inner.y + inner.h <= outer.y + outer.h;
}

function filterInSubrectView(param) {
  if (param.sub_rect !== filter_sub_rect) {
    return false;
  }
  return overlaps(param.dom_pos, filter_sub_rect.dom_pos);
}

const SUBRECT_FILTERS = [filterInSubrectView, filterMatchesSubrect];
function findBestWithinSubrect(nav, dom_pos, pad_focusable_list, best, precision_max) {
  // we hit a sub rect, find the best target inside it, first trying all
  //   in view (all precision), then all out of view
  filter_sub_rect = best;
  for (let jj = 0; jj < SUBRECT_FILTERS.length; ++jj) {
    let filter = SUBRECT_FILTERS[jj];
    for (let precision = 0; precision <= precision_max; ++precision) {
      let best_inside = findBestTargetInternal(nav, dom_pos, pad_focusable_list, precision, filter);
      if (best_inside) {
        return best_inside;
      }
    }
  }
  return null;
}

function findBestTargetFromSubRect(start_sub_rect, nav, dom_pos, pad_focusable_list, precision) {
  // Go to the one in the appropriate quadrant which has the smallest Manhattan distance
  filter_sub_rect = start_sub_rect;
  let best = findBestTargetInternal(nav, dom_pos, pad_focusable_list, precision, filterMatchesSubrect);
  if (best) {
    if (best.is_sub_rect) {
      focus_next_via[nav] = best;
      best = findBestWithinSubrect(nav, dom_pos, pad_focusable_list, best, precision);
      if (!best) {
        focus_next_via[nav] = undefined;
      }
    }
  }
  return best;
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
    focus_next[ii] = undefined;
    focus_next_via[ii] = undefined;
  }
  let start;
  let pad_focusable_list = [];
  let prev;
  for (let ii = 0; ii < frame_spots.length; ++ii) {
    let param = frame_spots[ii];
    if (param.is_sub_rect) {
      // Not actually "focusable", but need to target it to then target its contents
      pad_focusable_list.push(param);
    } else if (param.key_computed === focus_key) {
      if (!focus_next[SPOT_NAV_PREV] && prev) {
        focus_next[SPOT_NAV_PREV] = prev;
      }
      start = param;
    } else {
      const def = param.def || SPOT_DEFAULT;
      const pad_focusable = param.pad_focusable === undefined ? def.pad_focusable : param.pad_focusable;
      if (pad_focusable) {
        prev = param;
        if (!focus_next[SPOT_NAV_NEXT] && start) {
          focus_next[SPOT_NAV_NEXT] = param;
        }
        pad_focusable_list.push(param);
      }
    }
  }
  if (!focus_next[SPOT_NAV_PREV] && prev) {
    // but, didn't trigger above, must have been first, wrap to end
    focus_next[SPOT_NAV_PREV] = prev;
  }
  if (!focus_next[SPOT_NAV_NEXT]) {
    // nothing next, go to first non-sub_rect
    for (let ii = 0; ii < pad_focusable_list.length; ++ii) {
      let first = pad_focusable_list[ii];
      if (!first.is_sub_rect) {
        focus_next[SPOT_NAV_NEXT] = first;
        break;
      }
    }
  }
  let precision_max;
  let start_sub_rect;
  if (start) {
    start_sub_rect = start.sub_rect;
    focus_pos.x = start.dom_pos.x;
    focus_pos.y = start.dom_pos.y;
    focus_pos.w = start.dom_pos.w;
    focus_pos.h = start.dom_pos.h;
    precision_max = TARGET_HALF;
  } else {
    // use the subrect overlapped, if any
    start_sub_rect = null;
    for (let ii = 0; ii < frame_spots.length; ++ii) {
      let param = frame_spots[ii];
      if (param.is_sub_rect) {
        if (contains(param.dom_pos, focus_pos)) {
          start_sub_rect = param;
        }
      }
    }
    if (start_sub_rect) {
      precision_max = TARGET_HALF;
    } else {
      precision_max = TARGET_ALL;
    }
  }

  for (let nav = SPOT_NAV_LEFT; nav <= SPOT_NAV_DOWN; ++nav) {
    for (let precision = 0; precision <= precision_max; ++precision) {
      filter_not = null;
      let best = findBestTargetFromSubRect(start_sub_rect, nav, focus_pos, pad_focusable_list, precision);
      if (best) {
        focus_next[nav] = best;
        break;
      }
      if (start_sub_rect) {
        // Did not find anything within our subrect, try searching outside, from the subrect itself
        filter_not = start_sub_rect; // do not target oneself
        best = findBestTargetFromSubRect(start_sub_rect.sub_rect, nav, start_sub_rect.dom_pos,
          pad_focusable_list, precision);
        if (best) {
          focus_next[nav] = best;
          break;
        }
      }
    }
  }
  if (start) {
    const def = start.def || SPOT_DEFAULT;
    const custom_nav = start.custom_nav === undefined ? def.custom_nav : start.custom_nav;
    if (custom_nav) {
      let by_key;
      for (let key in custom_nav) {
        let target = custom_nav[key];
        if (!target) {
          focus_next[key] = null;
        } else {
          if (!by_key) {
            by_key = {};
            for (let ii = 0; ii < frame_spots.length; ++ii) {
              let param = frame_spots[ii];
              by_key[param.key_computed] = param;
            }
          }
          if (by_key[target]) {
            focus_next[key] = by_key[target];
          }
        }
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
  sub_stack.length = 0;
}

export function spotEndOfFrame() {
  spotCalcNavTargets();

  last_frame_autofocus_spots = frame_autofocus_spots;
  frame_spots = [];
  frame_autofocus_spots = {};
}

function frameSpotsPush(param) {
  assert(param.dom_pos);
  param.sub_rect = focus_sub_rect;
  frame_spots.push(param);
}

function spotEntirelyObscured(param) {
  let pos = param.dom_pos;
  for (let ii = 0; ii < frame_spots.length; ++ii) {
    let other = frame_spots[ii];
    if (other.is_sub_rect || other.sub_rect !== focus_sub_rect) {
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

export function spotSubPush() {
  sub_stack.push([focus_sub_rect, focus_sub_rect_elem]);
  focus_sub_rect = null;
  focusIdSet(null);
}
export function spotSubPop() {
  ([focus_sub_rect, focus_sub_rect_elem] = sub_stack.pop());
  if (focus_sub_rect) {
    focusIdSet(focus_sub_rect.key_computed);
  } else {
    focusIdSet(null);
  }
}

export function spotSubBegin(param) {
  assert(param.key);
  assert(!focus_sub_rect); // no recursive nesting supported yet
  spotKey(param);
  param.is_sub_rect = true;
  if (!param.dom_pos) {
    param.dom_pos = {};
  }
  camera2d.virtualToDomPosParam(param.dom_pos, param);
  if (!spotEntirelyObscured(param)) {
    frameSpotsPush(param);
  }
  focus_sub_rect = param;
  focus_sub_rect_elem = null;
  focusIdSet(focus_sub_rect.key_computed);
}

export function spotSubEnd() {
  assert(focus_sub_rect);
  focus_sub_rect = null;
  focusIdSet(null);
  return focus_sub_rect_elem;
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
    if (engine.defines.SPOT_DEBUG) {
      pos_param.spot_debug_ignore = param.eat_clicks || // just consuming mouseover, not a button / etc
        param.spot_debug_ignore;
    }
    frameSpotsPush(pos_param);
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

function spotFocusCheckNavButtonsFocused(param) {
  for (let ii = 1; ii < SPOT_NAV_MAX; ++ii) {
    if (focus_next[ii] !== undefined && keyCheck(ii)) {
      if (focus_next[ii]) {
        spotFocusSet(focus_next[ii], false, 'nav_focused');
      } else {
        param.out.nav = ii;
      }
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
  const focus_steal = param.focus_steal === undefined ? def.focus_steal : param.focus_steal;
  if (focus_steal) {
    // Silently steal (keep) focus
    focus_key = key;
  }
  if (focus_key === key) {
    // last_frame_focus_found = true;
    spotFocusCheckNavButtonsFocused(param);
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
      frameSpotsPush(param);
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
    if (focus_sub_rect && focus_key === key) {
      focus_sub_rect_elem = param;
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

export function spotFocusSteal(param, from_mouseover) {
  let key = spotKey(param);
  spotlog('spotFocusSteal', key, from_mouseover);
  // Silent, no sound, no checking parameters, just set the key string
  pad_mode = !from_mouseover;
  focus_key = key;
  // spotFocusSet(param, from_mouseover, 'spotFocusSteal');
}

// param:
//   See SPOT_DEFAULT, additionally:
//   x,y,w,h : number // only parameters not inherited from `def`
//   def: used for any undefined parameters (defaults to SPOT_DEFAULT)
//   out: object // holds return values, lazy-allocated if needed
// returns/modifies param.out:
//   focused : boolean // focused by any means
//   spot_state: one of SPOT_STATE_*
//   ret: number // if `param.is_button` and was activated (0/1 or more if clicked multiple times in a frame)
//   long_press: boolean // if button_long_press and ret and was a long press, set to true
//   button: number // if ret, set to mouse button used to click it
//   pos: vec2 // if ret, set to position of the click
//   double_click: boolean // if ret, set to true if it was a double click
//   drag: any // if drag_target and a drop happened, contains payload
//   nav: SPOT_NAV_* // if custom_nav, and the user navigated, set to the navigation event
export function spot(param) {
  const def = param.def || SPOT_DEFAULT;
  const disabled = param.disabled === undefined ? def.disabled : param.disabled;
  const tooltip = param.tooltip === undefined ? def.tooltip : param.tooltip;
  const is_button = param.is_button === undefined ? def.is_button : param.is_button;
  const button_long_press = param.button_long_press === undefined ? def.button_long_press : param.button_long_press;
  const in_event_cb = param.in_event_cb === undefined ? def.in_event_cb : param.in_event_cb;
  const drag_target = param.drag_target === undefined ? def.drag_target : param.drag_target;
  const drag_over = param.drag_over === undefined ? def.drag_over : param.drag_over;
  const touch_focuses = param.touch_focuses === undefined ? def.touch_focuses : param.touch_focuses;
  const focus_steal = param.focus_steal === undefined ? def.focus_steal : param.focus_steal;
  const custom_nav = param.custom_nav === undefined ? def.custom_nav : param.custom_nav;

  let out = param.out;
  if (!out) {
    out = param.out = {};
  }
  out.focused = false;
  out.ret = 0;
  if (button_long_press) {
    out.long_press = false;
  }
  if (drag_target) {
    out.drag = null;
  }
  if (custom_nav) {
    out.nav = SPOT_NAV_NONE;
  }

  let state = SPOT_STATE_REGULAR;
  let focused = spotFocusCheck(param); // sets allow_focus, param.out.nav
  if (disabled) {
    state = SPOT_STATE_DISABLED;
  } else {
    let button_click;
    if (drag_target && (param.drag = dragDrop(param))) {
      spotFocusSet(param, true, 'drag_drop');
      focused = true;
    } else if (button_long_press && (button_click = longPress(param)) ||
        is_button && (button_click = inputClick(param))
    ) {
      // TODO: change `ret` to be a count of how many clicks/taps happened?
      out.long_press = button_click.long_press;
      out.button = button_click.button;
      out.double_click = button_click.was_double_click;
      out.pos = button_click.pos;
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
            out.ret++;
            spotUnfocus();
            focused = false;
          }
        } else {
          // not focusing, would flicker a tooltip for 1 frame
          // also, unfocusing, in case it was focused via long_press_focuses
          out.ret++;
          spotUnfocus();
          focused = false;
        }
      } else {
        out.ret++;
        spotFocusSet(param, true, 'click');
        focused = true;
      }
    } else if (!is_button && touch_focuses && mousePosIsTouch() && inputClick(param)) {
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
    // Consume drag events (desired for drop-down menu temporarily overlapping a slider, generally fine?)
    drag(param);
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
  if (focused && !focus_steal && !is_mouseover && (mouseMoved() || mouseButtonHadEdge())) {
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
  if (is_button && mouseDown({
    x: param.x, y: param.y,
    w: param.w, h: param.h,
    do_max_dist: true, // Need to apply the same max_dist logic to mouseDown() as we do for click()
  })) {
    if (!disabled) {
      state = SPOT_STATE_DOWN;
    }
  }

  let button_activate = false;
  if (focused) {
    if (state === SPOT_STATE_REGULAR) {
      state = SPOT_STATE_FOCUSED;
    }
    if (is_button && !disabled) {
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
    out.ret++;
    out.button = 0;
    out.double_click = false;
    out.pos = null;
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
