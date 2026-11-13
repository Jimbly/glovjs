// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
// Some code from Turbulenz: Copyright (c) 2012-2013 Turbulenz Limited
// Released under MIT License: https://opensource.org/licenses/MIT
/* global BeforeUnloadEvent, Element, Event, EventListener,
  FocusEvent, HTMLCanvasElement, Touch, TouchEvent */

import assert from 'assert';

const UP = 0; // only for key/mouse
const DOWN = 1;
const DOWN_EDGE = 2; // only for pads
const UP_EDGE = 3; // only for pads

// per-app overrideable options
const TOUCH_AS_MOUSE = true;
let map_analog_to_dpad = false; // default binds and actions should take care of this now

// legacy APIs
export const click = inputClick; // eslint-disable-line @typescript-eslint/no-use-before-define
export const mouseUpEdge = inputClick; // eslint-disable-line @typescript-eslint/no-use-before-define
export const drag = inputDrag; // eslint-disable-line @typescript-eslint/no-use-before-define

export const internal = {
  inputEndFrame, // eslint-disable-line @typescript-eslint/no-use-before-define
  inputStartup, // eslint-disable-line @typescript-eslint/no-use-before-define
  inputTick, // eslint-disable-line @typescript-eslint/no-use-before-define
  inputTickInactive, // eslint-disable-line @typescript-eslint/no-use-before-define
};

// eslint-disable-next-line import/order
import {
  arrayToSet,
  deprecate,
  empty,
} from 'glov/common/util';
deprecate(exports, 'mouseDown', 'mouseDownAnywhere, mouseDownMidClick, mouseDownOverBounds');

// eslint-disable-next-line import/order
import {
  ANY,
  BUTTON_ANY,
  BUTTON_LEFT,
  BUTTON_MIDDLE,
  BUTTON_POINTERLOCK,
  BUTTON_RIGHT,
  ButtonIndex,
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
  PAD_NUM_STICKS,
  PAD_TOTAL_BUTTONS,
  POINTERLOCK,
} from './input_constants';

// export * from './input_constants' - causes circular dependency failures
export {
  ANY,
  BUTTON_ANY,
  BUTTON_LEFT,
  BUTTON_MIDDLE,
  BUTTON_POINTERLOCK,
  BUTTON_RIGHT,
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
  POINTERLOCK,
};
export type { ButtonIndex };

export let KEYS = {
  BACKSPACE: 8,
  TAB: 9,
  ENTER: 13,
  RETURN: 13,
  SHIFT: 16,
  CTRL: 17,
  ALT: 18,
  PAUSE: 19,
  CAPS_LOCK: 20,
  ESC: 27,
  ESCAPE: 27,
  SPACE: 32,
  PAGEUP: 33,
  PAGEDOWN: 34,
  END: 35,
  HOME: 36,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  PRINT_SCREEN: 44,
  INS: 45,
  DEL: 46,

  '0': 48,
  '1': 49,
  '2': 50,
  '3': 51,
  '4': 52,
  '5': 53,
  '6': 54,
  '7': 55,
  '8': 56,
  '9': 57,

  A: 65,
  B: 66,
  C: 67,
  D: 68,
  E: 69,
  F: 70,
  G: 71,
  H: 72,
  I: 73,
  J: 74,
  K: 75,
  L: 76,
  M: 77,
  N: 78,
  O: 79,
  P: 80,
  Q: 81,
  R: 82,
  S: 83,
  T: 84,
  U: 85,
  V: 86,
  W: 87,
  X: 88,
  Y: 89,
  Z: 90,

  META_LEFT: 91,
  META_RIGHT: 92,
  CONTEXT_MENU: 93,

  NUMPAD0: 96,
  NUMPAD1: 97,
  NUMPAD2: 98,
  NUMPAD3: 99,
  NUMPAD4: 100,
  NUMPAD5: 101,
  NUMPAD6: 102,
  NUMPAD7: 103,
  NUMPAD8: 104,
  NUMPAD9: 105,
  NUMPAD_MULTIPLY: 106,
  NUMPAD_ADD: 107,
  NUMPAD_SUBTRACT: 109,
  NUMPAD_DECIMAL_POINT: 110,
  NUMPAD_DIVIDE: 111,

  F1: 112,
  F2: 113,
  F3: 114,
  F4: 115,
  F5: 116,
  F6: 117,
  F7: 118,
  F8: 119,
  F9: 120,
  F10: 121,
  F11: 122,
  F12: 123,

  NUM_LOCK: 144,
  SCROLL_LOCK: 145,
  SEMICOLON: 186,
  EQUALS: 187,
  COMMA: 188,
  MINUS: 189,
  PERIOD: 190,
  SLASH: 191,
  TILDE: 192,

  BRACKET_LEFT: 219,
  BACKSLASH: 220,
  BRACKET_RIGHT: 221,
  QUOTE: 222,
  INTLBACKSLASH: 226,
};
const KEYS_ORIG = KEYS;
if (typeof Proxy === 'function') {
  // Catch referencing keys that are not in our map
  KEYS = new Proxy(KEYS, {
    get: function (target, prop: string) {
      let ret = (target as TSMap<number>)[prop];
      assert(ret);
      return ret;
    }
  });
}
export const PAD = {
  A: 0,
  SELECT: 0, // GLOV name
  B: 1,
  CANCEL: 1, // GLOV name
  X: 2,
  Y: 3,
  LEFT_BUMPER: 4,
  LB: 4,
  RIGHT_BUMPER: 5,
  RB: 5,
  LEFT_TRIGGER: 6,
  LT: 6,
  RIGHT_TRIGGER: 7,
  RT: 7,
  BACK: 8,
  START: 9,
  LEFT_STICK: 10,
  RIGHT_STICK: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  CENTER: 16, // Guide / PS button
  LSTICK_UP: 20,
  LSTICK_LEFT: 21,
  LSTICK_DOWN: 22,
  LSTICK_RIGHT: 23,
  ANALOG_UP: 20, // alias for left stick
  ANALOG_LEFT: 21,
  ANALOG_DOWN: 22,
  ANALOG_RIGHT: 23,
  RSTICK_UP: 24,
  RSTICK_LEFT: 25,
  RSTICK_DOWN: 26,
  RSTICK_RIGHT: 27,
};

export type ValidKey = keyof typeof KEYS;
export type ValidKeyValue = typeof KEYS[ValidKey];
export type ValidPad = keyof typeof PAD;
export type ValidPadValue = typeof PAD[ValidPad];

import {
  Rec,
  TSMap,
  WithRequired,
} from 'glov/common/types';
import {
  v2add,
  v2copy,
  v2lengthSq,
  v2same,
  v2scale,
  v2set,
  v2sub,
  Vec2,
  vec2,
} from 'glov/common/vmath';
import { internal as actions_internal } from './actions';
const { actionEatAll } = actions_internal;
import { is_firefox, is_mac_osx } from './browser';
import * as camera2d from './camera2d';
import * as engine from './engine';
import {
  getFrameDt,
  getFrameIndex,
  releaseCanvas,
  renderNeeded,
} from './engine';
import { Box } from './geom_types';
import {
  inEventHandle,
  inEventOn,
  inEventTopOfFrame,
} from './in_event';
import {
  localStorageGetJSON,
  localStorageSetJSON,
} from './local_storage';
import * as pointer_lock from './pointer_lock';
import * as settings from './settings';
import { soundResume } from './sound';
import { spotMouseoverHook } from './spot';
import { EventCallback } from './ui';

const { abs, max, min, sqrt } = Math;

let pad_to_touch: number | undefined;

let canvas: HTMLCanvasElement;
let key_state_new: Rec<number, KeyData> = {};
let mouse_pos = vec2(); // in DOM coordinates, not canvas or virtual
let last_mouse_pos = vec2();
let mouse_pos_is_touch = false;
let mouse_over_captured = false;
let mouse_down: boolean[] = [];
let movement_questionable_frames = 0;
const MOVEMENT_QUESTIONABLE_FRAMES = 2; // Need at least 2

let input_eaten_kb = false;
let input_eaten_mouse = false;

let touches: TSMap<TouchData> = {}; // `m${button}` or touch_id -> TouchData
let no_active_touches = true;

export let touch_mode = localStorageGetJSON('touch_mode', false);
export let pad_mode = !touch_mode && localStorageGetJSON('pad_mode', false);

export function inputTouchMode(): boolean {
  return touch_mode;
}

export function inputPadMode(): boolean {
  return pad_mode;
}

export function inputEatenMouse(): boolean {
  return input_eaten_mouse;
}

export type TextInputEvent = {
  type: 'key' | 'char';
  code: number; // character code if 'char', QWERTY keyCode if 'key'
  mod: number; // probably only relevant if 'key', shift/alt/ctrl mods
};
let text_input_queue: TextInputEvent[] = [];
export function inputTextInputQueue(): TextInputEvent[] {
  return text_input_queue;
}

// From all-caps, no-underscores to actual key name
function normNamesInit(): TSMap<ValidKey | ValidPad> {
  let ret = Object.create(null);
  for (let key in KEYS_ORIG) {
    ret[key.replace(/_/g, '')] = key;
  }
  for (let key in PAD) {
    ret[key.replace(/_/g, '')] = key;
  }
  return ret;
}
const NORM_NAMES = normNamesInit();

export function inputNameNormalize(key: string): string {
  key = key.replace(/_/g, '').toUpperCase();
  return NORM_NAMES[key] || key;
}

export function inputValidKeyName(key: string): key is ValidKey {
  return Boolean((KEYS_ORIG as TSMap<number>)[key]);
}

export function inputLookupKeyName(key_code: number): ValidKey | null {
  let key: ValidKey;
  for (key in KEYS_ORIG) {
    if (KEYS_ORIG[key] === key_code) {
      return key;
    }
  }
  return null;
}

export function inputLookupPadName(pad_code: number): ValidPad | null {
  let key: ValidPad;
  for (key in PAD) {
    if (PAD[key] === pad_code) {
      return key;
    }
  }
  return null;
}

const REDUNANT_NAMES = arrayToSet([
  'SELECT', 'CANCEL', 'LB', 'RB', 'LT', 'RT',
  'ANALOG_UP',
  'ANALOG_LEFT',
  'ANALOG_DOWN',
  'ANALOG_RIGHT',
]);
export function inputValidPadName(key: string): key is ValidPad {
  if (REDUNANT_NAMES[key]) {
    // redundant names not allowed in binds system
    return false;
  }
  return Boolean(typeof (PAD as TSMap<number>)[key] === 'number');
}

let text_keys: Rec<number, true>;
function initTextInputKeys(): void {
  let all_textinput = [];
  function range(a: number, b: number): void {
    for (let ii = a; ii <= b; ++ii) {
      all_textinput.push(ii);
    }
  }
  range(KEYS.A, KEYS.Z);
  range(KEYS.NUMPAD0, KEYS.NUMPAD_DIVIDE);
  range(KEYS.SEMICOLON, KEYS.TILDE);
  range(KEYS.BRACKET_LEFT, KEYS.QUOTE);
  all_textinput.push(KEYS.INTLBACKSLASH);
  all_textinput.push(KEYS.BACKSPACE);
  all_textinput.push(KEYS.SPACE);
  text_keys = arrayToSet(all_textinput);
}
initTextInputKeys();

export function inputKeyIsText(key: number): true | undefined {
  return text_keys[key];
}

type EventInternal = { timestamp: number };
type EventWithTimestamp = Event | EventInternal;

function eventTimestamp(event: EventWithTimestamp | null): number {
  if (event) {
    if ((event as Event).timeStamp) {
      // browser event timestamp
      // assert((event.timeStamp < 1e12) === (engine.hrtime < 1e12));
      // Must both be high res times, or both not!
      if (((event as Event).timeStamp < 1e12) !== (engine.hrtime < 1e12)) {
        return engine.hrtime;
      }
      return (event as Event).timeStamp;
    }
    if ((event as EventInternal).timestamp) {
      // internal timestamp
      return (event as EventInternal).timestamp;
    }
  }
  return engine.hrtime;
}

class TouchData {
  delta = vec2();
  total = 0;
  start_time = Date.now();
  dispatched = false;
  dispatched_drag = false;
  dispatched_drag_over = false;
  long_press_dispatched = false;
  was_double_click = false;
  up_edge = 0;
  down_edge = 0;
  state = DOWN;
  down_time = 0;
  release = false;
  drag_payload_frame?: number;
  drag_payload?: unknown;
  origin_time: number;
  cur_pos: Vec2;
  start_pos: Vec2;
  button: ButtonIndex;
  touch: boolean;
  constructor(pos: Vec2, touch: boolean, button: ButtonIndex, event: EventWithTimestamp | null) {
    this.cur_pos = pos.slice(0) as Vec2;
    this.start_pos = pos.slice(0) as Vec2;
    this.touch = touch;
    this.button = button;
    this.origin_time = eventTimestamp(event);
  }

  down(event: EventWithTimestamp | null, is_edge: boolean): void {
    if (is_edge) {
      this.down_edge++;
    }
    this.state = DOWN;
    this.origin_time = eventTimestamp(event);
  }
}

const MIN_EVENT_TIME_DELTA = 0.01; // fractions of a millisecond
function timeDelta(event: EventWithTimestamp, origin_time: number): number {
  let et = eventTimestamp(event);
  // timestamps on events are often back in time relative to the last tick time
  return max(et - origin_time, MIN_EVENT_TIME_DELTA);
}

class KeyData {
  down_edge = 0;
  origin_time = 0;
  down_edge_time = 0;
  repeating = false;
  down_time = 0;
  up_edge = 0;
  state = UP;
  down_mod = 0;

  keyUp(event: EventWithTimestamp): void {
    ++this.up_edge;
    this.down_time += timeDelta(event, this.origin_time);
    this.state = UP;
  }
}

function setMouseToMid(): void {
  v2set(mouse_pos, engine.width*0.5/camera2d.domToCanvasRatio(), engine.height*0.5/camera2d.domToCanvasRatio());
}

export function pointerLocked(): boolean {
  return pointer_lock.isLocked();
}
let pointerlock_touch_id = `m${POINTERLOCK}`;
let pointerlock_frame = -1;
// only works reliably when called from an event handler
export function pointerLockEnter(debug_when: string): void {
  pointer_lock.enter(debug_when);
}
function onPointerLockEnter(): void {
  if (touch_mode) {
    return;
  }
  pointerlock_frame = getFrameIndex();
  let touch_data = touches[pointerlock_touch_id];
  setMouseToMid();
  if (touch_data) {
    v2copy(touch_data.start_pos, mouse_pos);
    touch_data.state = DOWN;
    touch_data.origin_time = engine.hrtime;
  } else {
    touch_data = touches[pointerlock_touch_id] = new TouchData(mouse_pos, false, POINTERLOCK, null);
  }
  movement_questionable_frames = MOVEMENT_QUESTIONABLE_FRAMES;
}
export function pointerLockJustEntered(num_frames: number): boolean {
  return getFrameIndex() <= pointerlock_frame + (num_frames || 1);
}
export function pointerLockExit(): void {
  let touch_data = touches[pointerlock_touch_id];
  if (touch_data) {
    v2copy(touch_data.cur_pos, mouse_pos);
    // no UP_EDGE for this
    touch_data.state = UP;
  }
  pointer_lock.exit();
  movement_questionable_frames = MOVEMENT_QUESTIONABLE_FRAMES;
}

let allow_all_events = false;
export function inputAllowAllEvents(allow: boolean): void {
  allow_all_events = allow;
}
export function inputAllEventsAllowed(): boolean {
  return allow_all_events;
}

let ctrl_checked = false;
let unload_protected = false;
// string messages and displayed (only on old browsers)
// false does not prevent unload
// null "silently" blocks unload (actually see default message on new browsers)
export type UnloadCB = () => (string | null | false);
let unload_override: UnloadCB | null = null;
// cb() returns a string to display a message (actual message is ignored), or false
//   to *not* block unload, or anything else to block the unload with a message
export function inputOverrideUnload(cb: UnloadCB | null): void {
  assert(!unload_override || !cb);
  unload_override = cb;
}
function beforeUnload(e: BeforeUnloadEvent): void {
  let unload_msg;
  if (unload_override) {
    unload_msg = unload_override();
    if (unload_msg === false) {
      // do *not* block the unload
    } else if (!unload_msg) {
      // no prompt, just block the unload
      e.preventDefault();
      return;
    }
  }
  if (unload_protected && ctrl_checked || unload_msg) {
    // Exit pointer lock if the browser didn't do that automatically
    pointerLockExit();
    // Cancel the event
    e.preventDefault();
    // Chrome requires returnValue to be set
    e.returnValue = unload_msg || 'Are you sure you want to quit?';
  } else {
    releaseCanvas();
  }
}
export function protectUnload(enable: boolean): void { // TODO: this should live in platform-web-input
  unload_protected = enable;
}

let last_input_time = 0;
export function inputLastTime(): number {
  return last_input_time;
}
function onUserInput(): void {
  soundResume();
  last_input_time = Date.now();
  renderNeeded();
}

function releaseAllKeysDown(evt: EventWithTimestamp): void {
  for (let code in key_state_new) {
    let ks = key_state_new[code]!;
    if (ks.state === DOWN) {
      ks.keyUp(evt);
    }
  }
}

export type KeyUpEvent = {
  timestamp: number;
  mod: number;
  code: number;
  debug: (string|number)[];
};
let frame_keyup: null | KeyUpEvent;
export function inputOnKeyUpInternal(event: KeyUpEvent): void {
  const { code } = event;
  renderNeeded();

  if (code === KEYS.ESC && pointerLocked()) {
    pointerLockExit();
  }
  // Letting through to our code regardless of no_stop, because we handle things like ESC in INPUT elements

  let ks = key_state_new[code];
  if (ks && ks.state === DOWN) {
    if (is_mac_osx && (code === KEYS.META_LEFT || code === KEYS.META_RIGHT)) { // was: event.key === 'Meta'
      // We don't get keyUp events for any keys released while CMD is held, so we must assume all are released
      releaseAllKeysDown(event);
    } else {
      ks.keyUp(event);
    }
  }

  frame_keyup = event;

  inEventHandle('keyup', event);
}

export function inputFrameKeyUp(): null | KeyUpEvent {
  return frame_keyup;
}

let keyboard_layout_map: Rec<number, string> = localStorageGetJSON('layout_map', {});
export function inputUpdateLayoutMap(code: number, name: string): void {
  name = name.toLowerCase();
  if (keyboard_layout_map[code] !== name) {
    keyboard_layout_map[code] = name;
    localStorageSetJSON('layout_map', keyboard_layout_map);
  }
}

// Only known/correct if it's been pushed
// This is used as a fallback to `keyboard.getLayoutMap` which does not exist on Firefox
export function inputKeyName(code: number): string | undefined {
  return keyboard_layout_map[code];
}

// Only known/correct if it's been pushed
// This is used as a fallback to `keyboard.getLayoutMap` which does not exist on Firefox
export function inputKeyInverseMapped(letter: string): number | undefined {
  letter = letter.toLowerCase();
  for (let key_code in keyboard_layout_map) {
    let v = keyboard_layout_map[key_code]!;
    if (v === letter) {
      return Number(key_code);
    }
  }
}


export function inputOnKeyDownInternal(event: {
  timestamp: number;
  mod: number;
  code: number;
}): void {
  onUserInput();
  const { code, mod, timestamp } = event;

  let ks = key_state_new[code];
  if (!ks) {
    ks = key_state_new[code] = new KeyData();
  }
  if (ks.state !== DOWN) { // not a repeat event
    ++ks.down_edge;
    ks.state = DOWN;
    ks.down_mod = mod;
    ks.origin_time = timestamp;
    ks.down_edge_time = ks.origin_time;
    ks.repeating = false;

    inEventHandle('keydown', event);
  }
  // Add to input queue even if it _is_ a repeat event
  text_input_queue.push({
    type: 'key',
    code,
    mod,
  });
}

export function inputOnTextInputInternal(event: {
  mod: number;
  text: string;
}): void {
  let { mod, text } = event;
  for (let ii = 0; ii < text.length; ++ii) {
    text_input_queue.push({
      type: 'char',
      code: text.charCodeAt(ii),
      mod,
    });
  }
}

let mouse_move_x = 0;
export function debugGetMouseMoveX(): number {
  let ret = mouse_move_x;
  mouse_move_x = 0;
  return ret;
}

let mouse_moved = false;
let mouse_button_had_edge = false;
let mouse_button_had_up_edge = false;
let temp_delta = vec2();
let last_abs_move = 0;
let last_abs_move_time = 0;
let last_move_x = 0;
let last_move_y = 0;
let seen_mousemove = false;
export type InputMouseEvent = {
  x: number;
  y: number;
  timestamp: number;
  button?: number;
  movement_x?: number;
  movement_y?: number;
  wheel_delta?: number;
};
function onMouseMove(event: InputMouseEvent): void {
  if (touch_mode) {
    localStorageSetJSON('touch_mode', false);
    touch_mode = false;
  }
  if (pad_mode) {
    localStorageSetJSON('pad_mode', false);
    pad_mode = false;
  }

  seen_mousemove = true;
  renderNeeded();
  mouse_moved = true;

  mouse_pos[0] = event.x;
  mouse_pos[1] = event.y;

  mouse_pos_is_touch = false;

  let movement_x = event.movement_x || 0;
  let movement_y = event.movement_y || 0;
  mouse_move_x += movement_x;

  let any_movement = false;
  if (pointerLocked()) {
    setMouseToMid();
    if (movement_x || movement_y) {
      // Smooth out (ignore) large jumps in movement
      // This is, I believe, just a bug with Chromium on Windows as it repositions the hidden mouse cursor
      let ts = event.timestamp || Date.now();
      let abs_x = abs(movement_x);
      let abs_y = abs(movement_y);
      let abs_move = abs_x + abs_y;
      if (abs_move > 200 && (abs_move > 3 * last_abs_move || ts - last_abs_move_time > 1000)) {
        console.log(`Ignoring mousemove with sudden large delta: ${movement_x},${movement_y}`);
      } else if (is_firefox && movement_x === last_move_x && movement_y === last_move_y && abs_x < 2 && abs_y < 2) {
        // Ignoring mousemove similar to previous and with very little delta, due to a Firefox bug
      } else {
        v2set(temp_delta, movement_x || 0, movement_y || 0);
        any_movement = true;
      }
      last_abs_move = abs_move;
      last_abs_move_time = ts;
      last_move_x = movement_x;
      last_move_y = movement_y;
    }
  } else {
    v2sub(temp_delta, mouse_pos, last_mouse_pos);
    if (temp_delta[0] || temp_delta[1]) {
      any_movement = true;
    }
    v2copy(last_mouse_pos, mouse_pos);
  }
  if (any_movement && movement_questionable_frames && v2lengthSq(temp_delta) > 100*100) {
    // giant movement right after entering or exiting pointer lock, ignore (Chrome bug)
    // We get these unreasonable jumps in both movementXY and the other, presumably
    // because pointerLocked() is slightly out of sync, though the large .movementX/Y
    // is clearly erroneous.
    any_movement = false;
  }
  if (any_movement) {
    for (let button = POINTERLOCK; button < mouse_down.length; ++button) {
      if (mouse_down[button] || button === POINTERLOCK && pointerLocked()) {
        let touch_data = touches[`m${button}`];
        if (touch_data) {
          v2add(touch_data.delta, touch_data.delta, temp_delta);
          touch_data.total += abs(temp_delta[0]) + abs(temp_delta[1]);
          v2copy(touch_data.cur_pos, mouse_pos);
        }
      }
    }
  }

}

export function inputOnMouseMoveInternal(event: InputMouseEvent): void {
  onMouseMove(event);
}

export function inputOnMouseDownInternal(event: InputMouseEvent, no_click: boolean): void {
  onMouseMove(event); // update mouse_pos
  onUserInput();

  let button = event.button as ButtonIndex;
  mouse_down[button] = true;
  let touch_id = `m${button}`;
  if (touches[touch_id]) {
    v2copy(touches[touch_id].start_pos, mouse_pos);
  } else {
    touches[touch_id] = new TouchData(mouse_pos, false, button, event);
  }
  touches[touch_id].down(event, !no_click);
  if (!no_click) {
    inEventHandle('mousedown', event);
  }
  mouse_button_had_edge = true;
}

let last_up_edges = [{
  timestamp: 0,
  pos: vec2(),
},{
  timestamp: 0,
  pos: vec2(),
}];
function registerMouseUpEdge(touch_data: TouchData, timestamp: number): void {
  touch_data.up_edge++;
  let t = last_up_edges[0];
  last_up_edges[0] = last_up_edges[1];
  last_up_edges[1] = t;
  v2copy(t.pos, touch_data.cur_pos);
  t.timestamp = timestamp;
}

export function inputOnMouseUpInternal(event: WithRequired<InputMouseEvent, 'button'>, no_click: boolean): void {
  onMouseMove(event); // update mouse_pos
  let button = event.button;
  if (mouse_down[button]) {
    let touch_id = `m${button}`;
    let touch_data = touches[touch_id];
    if (touch_data) {
      v2copy(touch_data.cur_pos, mouse_pos);
      if (!no_click) {
        registerMouseUpEdge(touch_data, eventTimestamp(event));
      }
      touch_data.state = UP;
      touch_data.down_time += timeDelta(event, touch_data.origin_time);
    }
    delete mouse_down[button];
  }
  mouse_button_had_edge = true;
  mouse_button_had_up_edge = true;
  if (!no_click) {
    inEventHandle('mouseup', event);
  }
}

type WheelEventData = {
  pos: Vec2;
  delta: number;
  dispatched: boolean;
};
let wheel_events: WheelEventData[] = [];
export function inputOnMouseWheelInternal(event: WithRequired<InputMouseEvent, 'wheel_delta'>): void {
  renderNeeded();
  let saved = mouse_moved; // don't trigger mouseMoved()
  onMouseMove(event);
  // onUserInput(); - Browser doesn't count mousewheel as user input :(
  mouse_moved = saved;
  wheel_events.push({
    // Note: must use `mouse_pos`, not `event.pageX`, if we're pointer locked, the position is updated
    pos: [mouse_pos[0], mouse_pos[1]],
    delta: event.wheel_delta,
    dispatched: false,
  });
}

let last_touch_pos = vec2();
let touch_pos = vec2();
let released_touch_id = 0;
function onTouchChange(event: TouchEvent): void {
  // eventlog(event);
  // Using .pageX/Y here because on iOS when a text entry is selected, it scrolls
  // our canvas offscreen.  Should maybe have the canvas resize and use clientX
  // instead, but this works well enough.
  onUserInput();
  if (pad_mode) {
    localStorageSetJSON('pad_mode', false);
    pad_mode = false;
  }
  if (event.cancelable !== false) {
    event.preventDefault();
  }
  let ct = event.touches;
  let seen: TSMap<true> = {};

  let new_count = ct.length;
  let old_count = 0;
  let first_valid_touch: Touch | undefined;
  // Look for press and movement
  for (let ii = 0; ii < ct.length; ++ii) {
    let touch = ct[ii];
    try {
      if (!isFinite(touch.pageX) || !isFinite(touch.pageY)) {
        // getting bad touch events sometimes (Moto phones?), simply ignore
        --new_count;
        continue;
      }
    } catch (e) {
      // getting "Permission denied to access property "pageX" rarely on Firefox, simply ignore
      --new_count;
      continue;
    }
    if (!first_valid_touch) {
      first_valid_touch = touch;
    }

    let last_touch = touches[touch.identifier];
    v2set(touch_pos, touch.pageX, touch.pageY);
    if (!last_touch) {
      last_touch = touches[touch.identifier] = new TouchData(touch_pos, true, 0, event);
      last_touch.down(event, true);
      mouse_button_had_edge = true;
      inEventHandle('mousedown', touch);
    } else {
      ++old_count;
      v2sub(temp_delta, touch_pos, last_touch.cur_pos);
      v2add(last_touch.delta, last_touch.delta, temp_delta);
      last_touch.total += abs(temp_delta[0]) + abs(temp_delta[1]);
      v2copy(last_touch.cur_pos, touch_pos);
    }

    seen[touch.identifier] = true;
    if (TOUCH_AS_MOUSE && new_count === 1) {
      // Single touch, treat as mouse movement
      v2copy(mouse_pos, touch_pos);
      mouse_pos_is_touch = true;
    }
  }
  // Look for release, if releasing exactly one final touch
  let released_touch: undefined | TouchData;
  let released_ids = [];
  for (let id in touches) {
    if (!seen[id]) {
      let touch = touches[id]!;
      if (touch.touch && touch.state === DOWN) {
        ++old_count;
        released_touch = touch;
        released_ids.push(id);
        inEventHandle('mouseup', { pageX: touch.cur_pos[0], pageY: touch.cur_pos[1] });
        registerMouseUpEdge(touch, eventTimestamp(event));
        mouse_button_had_edge = true;
        mouse_button_had_up_edge = true;
        touch.state = UP;
        touch.down_time += timeDelta(event, touch.origin_time);
        touch.release = true;
      }
    }
  }
  for (let ii = 0; ii < released_ids.length; ++ii) {
    let id = released_ids[ii];
    let touch = touches[id];
    // get new id, not overlapping with touch.identifier values,
    // so that if we get a new touch event before the next tick, we still see the release, etc
    let new_id = `r${++released_touch_id}`;
    delete touches[id];
    touches[new_id] = touch;
  }
  if (TOUCH_AS_MOUSE) {
    if (old_count === 1 && new_count === 0) {
      delete mouse_down[0];
      assert(released_touch);
      v2copy(mouse_pos, released_touch.cur_pos);
      mouse_pos_is_touch = true;
    } else if (new_count === 1) {
      assert(first_valid_touch);
      if (!old_count) {
        mouse_down[0] = true;
      }
      v2set(mouse_pos, first_valid_touch.pageX, first_valid_touch.pageY);
      mouse_pos_is_touch = true;
    } else if (new_count > 1) {
      // multiple touches, release mouse_down without emitting click
      delete mouse_down[0];
    }
  }

  if (first_valid_touch) {
    // we're potentially not currently in touch mode, and we have some touch
    //   event with a position
    // Want to switch to touch mode if:
    //   we get a touch event and have never seen a mousemove
    //   or, we get two touch events at different locations, with no mousemove in between
    // This should handle stylus input (sends both mousemove and touch events, but no clicks)
    v2set(touch_pos, first_valid_touch.pageX, first_valid_touch.pageY);
    if (!v2same(last_touch_pos, touch_pos)) {
      // touch in a new position
      if (seen_mousemove) {
        // do not switch to touch mode
        // clear flag and switch next time if it moves, but no mousemove event
        seen_mousemove = false;
      } else {
        // switch to touch mode if we're not already
        if (!touch_mode) {
          localStorageSetJSON('touch_mode', true);
          touch_mode = true;
        }
      }
      v2copy(last_touch_pos, touch_pos);
    }
  }
}

function onBlurOrFocus(evt: FocusEvent): void {
  renderNeeded();
  protectUnload(false);
  releaseAllKeysDown(evt);
}

let ANALOG_MAP: Rec<number, number[]> = {};
function genAnalogMap(): void {
  if (map_analog_to_dpad) {
    ANALOG_MAP[PAD.LEFT] = [PAD.LSTICK_LEFT, PAD.RSTICK_LEFT];
    ANALOG_MAP[PAD.RIGHT] = [PAD.LSTICK_RIGHT, PAD.RSTICK_RIGHT];
    ANALOG_MAP[PAD.UP] = [PAD.LSTICK_UP, PAD.RSTICK_UP];
    ANALOG_MAP[PAD.DOWN] = [PAD.LSTICK_DOWN, PAD.RSTICK_DOWN];
  }
  // Not for analog, but use this to allow ANY as a pad button parameter
  let any_arr = [];
  let key: ValidPad;
  for (key in PAD) {
    any_arr.push(PAD[key]);
  }
  ANALOG_MAP[ANY] = any_arr;
}

let passive_param: false | { passive: false } = false;
export function handleTouches(elem: Element): void {
  elem.addEventListener('touchstart', onTouchChange as EventListener, passive_param);
  elem.addEventListener('touchmove', onTouchChange as EventListener, passive_param);
  elem.addEventListener('touchend', onTouchChange as EventListener, passive_param);
  elem.addEventListener('touchcancel', onTouchChange as EventListener, passive_param);
}

function dummyListener(evt: Event): void {
  // nothing
}

export type InputStartupParams = {
  map_analog_to_dpad?: boolean;
  pad_to_touch?: number;
};
function inputStartup(_canvas: HTMLCanvasElement, params: InputStartupParams): void {
  canvas = _canvas;
  pointer_lock.startup(canvas, onPointerLockEnter);
  if (params.map_analog_to_dpad !== undefined) {
    map_analog_to_dpad = params.map_analog_to_dpad;
  }
  pad_to_touch = params.pad_to_touch;
  genAnalogMap();

  try {
    let opts = Object.defineProperty({}, 'passive', {
      get: function () {
        passive_param = { passive: false };
        return false;
      }
    });
    window.addEventListener('test', dummyListener, opts);
    window.removeEventListener('test', dummyListener, opts);
  } catch (e) {
    passive_param = false;
  }

  window.addEventListener('blur', onBlurOrFocus, false);
  window.addEventListener('focus', onBlurOrFocus, false);

  handleTouches(canvas);

  window.addEventListener('beforeunload', beforeUnload, false);
}


const DEADZONE = 0.26;
const DEADZONE_SQ = DEADZONE * DEADZONE;
const PAD_THRESHOLD = 0.5; // for turning analog motion into digital events

type PadStateEntry = {
  value: number;
  down_mod: number;
  down_edge_time: number;
  repeating: boolean;
};
type PadState = PadStateEntry[];
type GamepadData = {
  name: string;
  id: number;
  sticks: Vec2[];
  button_mask: number; // bitmask state of simple buttons as of last querying
  pad_state: PadState;
};
let gamepad_data: GamepadData[] = []; // Other tracking data per gamepad

function getGamepadData(idx: number): GamepadData {
  let gpd = gamepad_data[idx];
  if (!gpd) {
    gpd = gamepad_data[idx] = {
      name: 'unknown',
      id: idx,
      sticks: new Array(PAD_NUM_STICKS),
      button_mask: 0,
      pad_state: [],
    };
    for (let ii = 0; ii < PAD_NUM_STICKS; ++ii) {
      gpd.sticks[ii] = vec2();
    }
    for (let ii = 0; ii < PAD_TOTAL_BUTTONS; ++ii) {
      gpd.pad_state.push({
        value: 0,
        down_mod: 0,
        down_edge_time: 0,
        repeating: false,
      });
    }
  }
  return gpd;
}

export type FramePadUp = {
  code: number;
  mod: number;
};
let frame_padup: null | FramePadUp;
export function inputFramePadUp(): null | FramePadUp {
  return frame_padup;
}

export function inputOnGamepadButtonInternal(idx: number, padcode: number, is_down: boolean, timestamp: number): void {
  if (padcode >= PAD_TOTAL_BUTTONS) {
    return;
  }
  let gpd = getGamepadData(idx);
  let ps = gpd.pad_state;
  let pse = ps[padcode];
  let bit = 1<<padcode;
  if (is_down && !pse.value) {
    gpd.button_mask |= bit;
    pse.value = DOWN_EDGE;
    pse.down_mod = gpd.button_mask & ~bit;
    pse.down_edge_time = engine.hrtime;
    pse.repeating = false;
    onUserInput();
    if (touch_mode) {
      localStorageSetJSON('touch_mode', false);
      touch_mode = false;
    }
    if (!pad_mode) {
      localStorageSetJSON('pad_mode', true);
      pad_mode = true;
    }
    if (padcode === pad_to_touch) {
      let touch_id = `g${gpd.id}`;
      if (touches[touch_id]) {
        setMouseToMid();
        v2copy(touches[touch_id].start_pos, mouse_pos);
      } else {
        touches[touch_id] = new TouchData(mouse_pos, false, 0, null);
      }
      touches[touch_id].down(null, true);
    }
  } else if (!is_down && pse.value) {
    gpd.button_mask &= ~bit;
    frame_padup = {
      code: padcode,
      mod: pse.down_mod,
    };
    pse.value = UP_EDGE;
    if (padcode === pad_to_touch) {
      let touch_id = `g${gpd.id}`;
      let touch_data = touches[touch_id];
      if (touch_data) {
        setMouseToMid();
        v2copy(touch_data.cur_pos, mouse_pos);
        registerMouseUpEdge(touch_data, engine.hrtime);
        touch_data.state = UP;
        touch_data.down_time += max(engine.hrtime - touch_data.origin_time, MIN_EVENT_TIME_DELTA);
      }
    }
  }
}

export function inputOnGamepadStickInternal(idx: number, stick: number, x: number, y: number, timestamp: number): void {
  let gpd = getGamepadData(idx);
  let pair = gpd.sticks[stick];
  v2set(pair, x, y);
  let magnitude = v2lengthSq(pair);
  if (magnitude > DEADZONE_SQ) {
    magnitude = sqrt(magnitude);

    // Normalize lX and lY
    v2scale(pair, pair, 1 / magnitude);

    // Clip the magnitude at its max possible value
    magnitude = min(magnitude, 1);

    // Adjust magnitude relative to the end of the dead zone
    magnitude = ((magnitude - DEADZONE) / (1 - DEADZONE));

    v2scale(pair, pair, magnitude);
  } else {
    v2set(pair, 0, 0);
  }

  // Calculate virtual directional buttons
  if (stick <= 1) {
    let codeoffs = stick === 0 ? 0 : PAD.RSTICK_UP - PAD.LSTICK_UP;
    inputOnGamepadButtonInternal(idx, codeoffs + PAD.LSTICK_LEFT, pair[0] < -PAD_THRESHOLD, timestamp);
    inputOnGamepadButtonInternal(idx, codeoffs + PAD.LSTICK_RIGHT, pair[0] > PAD_THRESHOLD, timestamp);
    inputOnGamepadButtonInternal(idx, codeoffs + PAD.LSTICK_DOWN, pair[1] < -PAD_THRESHOLD, timestamp);
    inputOnGamepadButtonInternal(idx, codeoffs + PAD.LSTICK_UP, pair[1] > PAD_THRESHOLD, timestamp);
  }
}

export function padName(padindex?: number): string {
  padindex = padindex || 0;
  return gamepad_data[padindex]?.name || 'unknown';
}
export function inputOnGamepadNameInternal(idx: number, name: string | undefined): void {
  let gpd = getGamepadData(idx);
  gpd.name = name || 'unknown';
}

export function fakeTouchEvent(is_down: boolean): void {
  const touch_id = 'faketouch';
  let touch_data = touches[touch_id];
  if (touch_data && !is_down) {
    setMouseToMid();
    v2copy(touch_data.cur_pos, mouse_pos);
    registerMouseUpEdge(touch_data, engine.hrtime);
    touch_data.state = UP;
    touch_data.down_time += max(engine.hrtime - touch_data.origin_time, MIN_EVENT_TIME_DELTA);
  } else if (!touch_data && is_down) {
    setMouseToMid();
    touches[touch_id] = new TouchData(mouse_pos, false, 0, null);
  }
}

function gamepadUpdate(): void {
  // Apply "movement" to drag events
  if (pad_to_touch === undefined) {
    return;
  }
  for (let idx = 0; idx < gamepad_data.length; ++idx) {
    let gpd = gamepad_data[idx];
    if (!gpd) {
      continue;
    }
    let touch_data = touches[`g${gpd.id}`];
    if (!touch_data) {
      continue;
    }
    for (let stick_idx = 0; stick_idx < PAD_NUM_STICKS; ++stick_idx) {
      let pair = gpd.sticks[stick_idx];
      v2scale(temp_delta, pair, getFrameDt());
      v2add(touch_data.delta, touch_data.delta, temp_delta);
      touch_data.total += abs(temp_delta[0]) + abs(temp_delta[1]);
      setMouseToMid();
      v2copy(touch_data.cur_pos, mouse_pos);
    }
  }
}

function inputTick(): void {
  // browser frame has occurred since the call to inputEndFrame(),
  // we should now have `touches` and `key_state` populated with edge events
  if (movement_questionable_frames) {
    --movement_questionable_frames;
  }

  // update timing of key down states
  let hrtime = engine.hrtime;
  for (let code in key_state_new) {
    let ks = key_state_new[code]!;
    if (ks.state === DOWN) {
      ks.down_time += max(hrtime - ks.origin_time, MIN_EVENT_TIME_DELTA);
      // assert(hrtime >= ks.origin_time); - should be true, but often isn't
      ks.origin_time = hrtime;
    }
  }

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (touch_data.state === DOWN) {
      touch_data.down_time += max(hrtime - touch_data.origin_time, MIN_EVENT_TIME_DELTA);
      // assert(hrtime >= touch_data.origin_time); - should be true, but often isn't
      touch_data.origin_time = hrtime;
    }
  }

  mouse_over_captured = false;
  gamepadUpdate();
  inEventTopOfFrame();
  ctrl_checked = false;
  if (touches[pointerlock_touch_id] && !pointerLocked()) {
    pointerLockExit();
  }
  no_active_touches = empty(touches);
}

function endFrameTickMap(ps: PadState): void {
  for (let ii = 0; ii < ps.length; ++ii) {
    let pse = ps[ii];
    if (pse.value === DOWN_EDGE) {
      pse.value = DOWN;
    } else if (pse.value === UP_EDGE) {
      pse.value = 0;
    }
  }
}
function inputEndFrame(skip_mouse?: boolean): void {
  for (let code in key_state_new) {
    let ks = key_state_new[code]!;
    if (ks.state === UP) {
      key_state_new[code] = null!;
      delete key_state_new[code];
    } else {
      ks.up_edge = 0;
      ks.down_edge = 0;
      ks.down_time = 0;
    }
  }

  for (let ii = 0; ii < gamepad_data.length; ++ii) {
    let gpd = gamepad_data[ii];
    if (gpd) {
      endFrameTickMap(gpd.pad_state);
    }
  }
  if (!skip_mouse) {
    for (let touch_id in touches) {
      let touch_data = touches[touch_id]!;
      if (touch_data.state === UP) {
        // Manually null out touches[touch_id] - some Chrome optimizer bug causes
        // callers to later get this old value (instead of the newly added on with
        // the same ID) unless we null it out (then they seem to get the new one).
        touches[touch_id] = null!;
        delete touches[touch_id];
      } else {
        touch_data.delta[0] = touch_data.delta[1] = 0;
        touch_data.dispatched = false;
        touch_data.dispatched_drag = false;
        touch_data.dispatched_drag_over = false;
        if (touch_data.drag_payload_frame === getFrameIndex() - 2) {
          // Clear this after an entire frame of not being set (usually, things
          // on the next frame will need to get the payload that was set later
          // in the previous frame)
          touch_data.drag_payload = null;
        }
        touch_data.up_edge = 0;
        touch_data.down_edge = 0;
        touch_data.down_time = 0;
      }
    }
    wheel_events.length = 0;
    input_eaten_mouse = false;
    mouse_moved = false;
    mouse_button_had_edge = false;
    mouse_button_had_up_edge = false;
  }
  input_eaten_kb = false;
  frame_keyup = null;
  frame_padup = null;
  text_input_queue = [];
}

function inputTickInactive(): void {
  inEventTopOfFrame();
  ctrl_checked = false;
  inputEndFrame();
}

export function eatAllInput(skip_mouse?: boolean): void {
  // destroy touches, remove all down and up edges
  inputEndFrame(skip_mouse);
  if (!skip_mouse) {
    mouse_over_captured = true;
    input_eaten_mouse = true;
  }
  input_eaten_kb = true;
  actionEatAll();
}

export function eatAllKeyboardInput(): void {
  eatAllInput(true);
}

// Eats all regular keyboard input, leaving special things like alt/tab/esc/F1 alone,
// but suppressing all hotkeys / in_event_cbs until the actual edit box
export function inputEatForEditBoxEarly(): void {
  for (let code_str in key_state_new) {
    let code = Number(code_str);
    if (code >= KEYS.SPACE && code <= KEYS.Z ||
      code >= KEYS.NUMPAD0 && code <= KEYS.NUMPAD_DIVIDE
    ) {
      let ks = key_state_new[code]!;
      if (ks.state === UP) {
        key_state_new[code] = null!;
        delete key_state_new[code];
      } else {
        ks.up_edge = 0;
        ks.down_edge = 0;
        ks.down_time = 0;
      }
    }
  }
  input_eaten_kb = true;
}

export function inputEatForEditBoxLate(): void {
  input_eaten_kb = false;
}

// returns position mapped to current camera view
export function mousePos(dst?: Vec2): Vec2 {
  dst = dst || vec2();
  camera2d.domToVirtual(dst, mouse_pos);
  return dst;
}

export function mouseDomPos(): Vec2 {
  return mouse_pos;
}

export function mouseMoved(): boolean {
  return mouse_moved;
}

export function mouseButtonHadEdge(): boolean {
  return mouse_button_had_edge;
}

export function mouseButtonHadUpEdge(): boolean {
  return mouse_button_had_up_edge;
}

const full_screen_pos_param: PosParamUnique = {};

type PosParam = Box & {
  button: ButtonIndex;
};
type PosParamUnique = Partial<PosParam & {
  mouse_pos_param: PosParam;
}>;
type PPosParam = Partial<PosParam> | undefined;

function mousePosParamUnique(param?: PosParamUnique): PosParam {
  param = param || full_screen_pos_param;
  let pos_param = param.mouse_pos_param;
  if (!pos_param) {
    pos_param = param.mouse_pos_param = {} as PosParam;
  }
  pos_param.x = param.x === undefined ? camera2d.x0Real() : param.x;
  pos_param.y = param.y === undefined ? camera2d.y0Real() : param.y;
  pos_param.w = param.w === undefined ? camera2d.wReal() : param.w;
  pos_param.h = param.h === undefined ? camera2d.hReal() : param.h;
  pos_param.button = param.button === undefined ? ANY : param.button;
  return pos_param;
}

let pos_param_temp: PosParam = {
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  button: 0,
};
function mousePosParam(param?: PPosParam): PosParam {
  param = param || {};
  pos_param_temp.x = param.x === undefined ? camera2d.x0Real() : param.x;
  pos_param_temp.y = param.y === undefined ? camera2d.y0Real() : param.y;
  pos_param_temp.w = param.w === undefined ? camera2d.wReal() : param.w;
  pos_param_temp.h = param.h === undefined ? camera2d.hReal() : param.h;
  pos_param_temp.button = param.button === undefined ? ANY : param.button;
  return pos_param_temp;
}

let check_pos = vec2();
function checkPos(pos: Vec2, param: PosParam): boolean {
  if (!camera2d.domToVirtual(check_pos, pos)) {
    return false;
  }
  return check_pos[0] >= param.x && (param.w === Infinity || check_pos[0] < param.x + param.w) &&
    check_pos[1] >= param.y && (param.h === Infinity || check_pos[1] < param.y + param.h);
}

function wasDoubleClick(pos_param: PosParam): boolean {
  if (engine.hrtime - last_up_edges[0].timestamp > settings.double_click_time) {
    return false;
  }
  return checkPos(last_up_edges[0].pos, pos_param);
}

export function mouseWheel(param: PPosParam): number {
  if (input_eaten_mouse || !wheel_events.length) {
    return 0;
  }
  param = param || {};
  let pos_param = mousePosParam(param);
  let ret = 0;
  for (let ii = 0; ii < wheel_events.length; ++ii) {
    let data = wheel_events[ii];
    if (data.dispatched) {
      continue;
    }
    if (checkPos(data.pos, pos_param)) {
      ret += data.delta;
      data.dispatched = true;
    }
  }
  return ret;
}

export function mouseOverCaptured(): void {
  mouse_over_captured = true;
}

export type MouseOverParam = {
  peek?: boolean; // does not consume clicks nor the mouseover event
  peek_touch?: boolean; // does not consume touch events
  peek_over?: boolean; // does not consume the mouseover event
  eat_clicks?: boolean;
  spot_debug_ignore?: boolean;
  allow_pointerlock?: boolean;
  drag_target?: boolean;
};

export function mouseOver(param?: Partial<PosParam> & MouseOverParam): boolean {
  profilerStartFunc();
  param = param || {};
  let pos_param = mousePosParamUnique(param);
  spotMouseoverHook(pos_param, param);
  if (mouse_over_captured || pointerLocked() && !param.allow_pointerlock) {
    profilerStopFunc();
    return false;
  }

  // eat mouse up/down/drag events
  if (!param.peek && !param.peek_touch) {
    for (let id in touches) {
      let touch = touches[id]!;
      if (checkPos(touch.cur_pos, pos_param)) {
        if (touch.down_edge) {
          touch.down_edge = 0;
        }
        if (touch.up_edge) {
          touch.up_edge = 0;
        }
        if (!param || !param.drag_target) {
          touch.dispatched = true;
        }
      }
    }
  }

  let ret = false;
  if (checkPos(mouse_pos, pos_param)) {
    if (!param.peek && !param.peek_over) {
      mouse_over_captured = true;
    }
    ret = true;
  }
  profilerStopFunc();
  return ret;
}

export function mouseDownAnywhere(button?: ButtonIndex): boolean {
  if (input_eaten_mouse) {
    return false;
  }
  if (button === undefined) {
    button = ANY;
  }

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (touch_data.state !== DOWN ||
      !(button === ANY || button === touch_data.button)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

export type MouseClickParam = Partial<PosParam> & {
  peek?: boolean;
  max_dist?: number;
  in_event_cb?: EventCallback | null;
  in_event_button?: ButtonIndex;
};
export function mouseDownMidClick(param?: MouseClickParam): boolean {
  if (input_eaten_mouse || no_active_touches) {
    return false;
  }
  // Same logic as inputClick()
  param = param || {};
  let pos_param = mousePosParam(param);
  let button = pos_param.button;
  let max_click_dist = param.max_dist || 50; // TODO: relative to camera distance?

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (touch_data.state !== DOWN ||
      !(button === ANY || button === touch_data.button) ||
      touch_data.total > max_click_dist
    ) {
      continue;
    }
    if (checkPos(touch_data.cur_pos, pos_param)) {
      return true;
    }
  }

  return false;
}

export function mouseDownOverBounds(param: PPosParam): boolean {
  if (input_eaten_mouse || no_active_touches) {
    return false;
  }
  param = param || {};
  let pos_param = mousePosParam(param);
  let button = pos_param.button;

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (touch_data.state !== DOWN ||
      !(button === ANY || button === touch_data.button)
    ) {
      continue;
    }
    if (checkPos(touch_data.cur_pos, pos_param)) {
      return true;
    }
  }

  return false;
}

export function mousePosIsTouch(): boolean {
  return mouse_pos_is_touch;
}

export function numTouches(): number {
  return Object.keys(touches).length;
}

let last_mod = 0;
export function keyDownLastMod(): number {
  return last_mod;
}
export type KeyCheckOpts = {
  mod?: number;
  in_event_cb?: EventCallback | null; // for clicks and key presses
  peek?: boolean;
  repeat?: boolean;
};
export function keyDown(keycode: ValidKeyValue, opts?: KeyCheckOpts | null): number {
  if (keycode === KEYS.CTRL) {
    ctrl_checked = true;
  }
  if (input_eaten_kb) {
    return 0;
  }

  if (keycode === ANY) {
    let r = 0;
    for (let keycode2 in key_state_new) {
      let ks = key_state_new[keycode2]!;
      r += ks.down_time;
    }
    return r;
  }

  let ks = key_state_new[keycode];
  if (!ks) {
    return 0;
  }
  if (opts && typeof opts.mod === 'number') {
    if ((ks.down_mod & opts.mod) !== opts.mod) {
      return 0;
    }
  }
  last_mod = ks.down_mod;
  if (ks.state === DOWN) {
    assert(ks.down_time); // Will fire if we call keyDown() before inputTick()
  }
  return ks.down_time;
}
const KEY_REPEAT_DELAY = 250;
const KEY_REPEAT_RATE = 80;
export function keyDownEdge(keycode: ValidKeyValue, opts?: KeyCheckOpts | null): number {
  if (input_eaten_kb) {
    return 0;
  }

  assert(keycode !== ANY);

  if (opts && opts.in_event_cb) {
    inEventOn('keydown', keycode, opts.in_event_cb);
  }

  let ks = key_state_new[keycode];
  if (!ks) {
    return 0;
  }
  if (opts && typeof opts.mod === 'number') {
    if ((ks.down_mod & opts.mod) !== opts.mod) {
      return 0;
    }
  }
  last_mod = ks.down_mod;
  let r = ks.down_edge;
  if (!opts || !opts.peek) {
    ks.down_edge = 0;
  }
  if (opts && opts.repeat) {
    let time = engine.hrtime - ks.down_edge_time;
    if (time > (ks.repeating ? KEY_REPEAT_RATE : KEY_REPEAT_DELAY)) {
      ks.down_edge_time = engine.hrtime;
      ks.repeating = true;
      r++;
    }
  }
  return r;
}
export function keyUpEdge(keycode: ValidKeyValue, opts?: KeyCheckOpts | null): number {
  if (input_eaten_kb) {
    return 0;
  }

  if (keycode === ANY) {
    assert(!opts || !opts.in_event_cb);
    let r = 0;
    for (let keycode2 in key_state_new) {
      let ks = key_state_new[keycode2]!;
      r += ks.up_edge;
      if (!opts || !opts.peek) {
        ks.up_edge = 0;
      }
    }
    return r;
  }

  if (opts && opts.in_event_cb) {
    inEventOn('keyup', keycode, opts.in_event_cb);
  }

  let ks = key_state_new[keycode];
  if (!ks) {
    return 0;
  }
  if (opts && typeof opts.mod === 'number') {
    if ((ks.down_mod & opts.mod) !== opts.mod) {
      return 0;
    }
  }
  let r = ks.up_edge;
  if (!opts || !opts.peek) {
    ks.up_edge = 0;
  }
  return r;
}

export function padGetAxes(out: Vec2, stickindex: number, padindex?: number): void {
  assert(stickindex >= 0 && stickindex < PAD_NUM_STICKS);
  if (padindex === undefined || padindex === ANY) {
    let sub = vec2();
    v2set(out, 0, 0);
    for (let ii = 0; ii < gamepad_data.length; ++ii) {
      padGetAxes(sub, stickindex, ii);
      v2add(out, out, sub);
    }
    return;
  }
  let sticks = getGamepadData(padindex).sticks;
  v2copy(out, sticks[stickindex]);
}

export type PadCheckOpts = {
  peek?: boolean;
  mod?: number; // bitmask of 1 << ValidPadValue
  repeat?: boolean;
};
type RealizedPadCheckOpts = WithRequired<PadCheckOpts, 'mod'>;

function padButtonDownInternal(
  gpd: GamepadData, ps: PadState, padcode: ValidPadValue, opts: RealizedPadCheckOpts
): number {
  let pse = ps[padcode];
  if (pse.value === DOWN || pse.value === DOWN_EDGE) {
    if ((pse.down_mod & opts.mod) === opts.mod) {
      return getFrameDt();
    }
  }
  return 0;
}
function padButtonDownEdgeInternal(
  gpd: GamepadData, ps: PadState, padcode: ValidPadValue, opts: RealizedPadCheckOpts
): number {
  let pse = ps[padcode];
  if (pse.value === DOWN_EDGE) {
    if ((pse.down_mod & opts.mod) === opts.mod) {
      if (!opts.peek) {
        pse.value = DOWN;
      }
      return 1;
    }
  }
  if (opts.repeat && pse.value === DOWN) {
    let time = engine.hrtime - pse.down_edge_time;
    if (time > (pse.repeating ? KEY_REPEAT_RATE : KEY_REPEAT_DELAY)) {
      pse.down_edge_time = engine.hrtime;
      pse.repeating = true;
      return 1;
    }
  }
  return 0;
}
function padButtonUpEdgeInternal(
  gpd: GamepadData, ps: PadState, padcode: ValidPadValue, opts: RealizedPadCheckOpts
): number {
  let pse = ps[padcode];
  if (pse.value === UP_EDGE) {
    if ((pse.down_mod & opts.mod) === opts.mod) {
      if (!opts.peek) {
        pse.value = 0;
      }
      return 1;
    }
  }
  return 0;
}

type PadFn = (gpd: GamepadData, ps: PadState, padcode: ValidPadValue, opts: RealizedPadCheckOpts) => number;
function padButtonShared(fn: PadFn, padcode: ValidPadValue, padindex?: number, opts?: PadCheckOpts | null): number {
  assert(padcode !== undefined);
  let r = 0;
  // Handle calling without a specific pad index
  if (padindex === undefined || padindex === ANY) {
    for (let ii = 0; ii < gamepad_data.length; ++ii) {
      r += padButtonShared(fn, padcode, ii, opts);
    }
    return r;
  }
  if (padcode === ANY) {
    for (let ii = 0; ii < PAD_TOTAL_BUTTONS; ++ii) {
      r += padButtonShared(fn, ii, padindex, opts);
    }
    return r;
  }

  if (input_eaten_mouse) {
    return 0;
  }
  let gpd = gamepad_data[padindex];
  if (!gpd) {
    return 0;
  }
  opts = opts || {};
  opts.mod = opts.mod || 0;
  let opts2 = opts as RealizedPadCheckOpts;
  let ps = gpd.pad_state;

  let am = ANALOG_MAP[padcode];
  if (am) {
    for (let ii = 0; ii < am.length; ++ii) {
      r += fn(gpd, ps, am[ii], opts2) || 0;
    }
  }
  r += fn(gpd, ps, padcode, opts2);
  return r;
}
export function padButtonDown(padcode: ValidPadValue, padindex?: number, opts?: PadCheckOpts | null): number {
  return padButtonShared(padButtonDownInternal, padcode, padindex, opts);
}
export function padButtonDownEdge(padcode: ValidPadValue, padindex?: number, opts?: PadCheckOpts | null): number {
  return padButtonShared(padButtonDownEdgeInternal, padcode, padindex, opts);
}
export function padButtonUpEdge(padcode: ValidPadValue, padindex?: number, opts?: PadCheckOpts | null): number {
  return padButtonShared(padButtonUpEdgeInternal, padcode, padindex, opts);
}

let start_pos = vec2();
let cur_pos = vec2();
let delta = vec2();

export function inputClick(param?: MouseClickParam): null | {
  button: ButtonIndex;
  pos: Vec2;
  start_time: number;
  was_double_click: boolean;
} {
  param = param || {};
  if (input_eaten_mouse || !param.in_event_cb && no_active_touches) {
    return null;
  }
  let pos_param = mousePosParam(param);
  let button = pos_param.button;
  let max_click_dist = param.max_dist || 50; // TODO: relative to camera distance?
  let click_invalid = false;

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (touch_data.total > max_click_dist) {
      // Do *not* register in_event_cb, would fire even when we would disregard this click
      click_invalid = true;
      continue;
    }
    if (touch_data.long_press_dispatched) {
      // If this touch has already triggered a long-press, do not additionally trigger a click
      // also, invalidate in_event_cb
      click_invalid = true;
      continue;
    }
    if (!touch_data.up_edge) {
      continue;
    }
    if (!(button === ANY || button === touch_data.button)) {
      continue;
    }
    if (checkPos(touch_data.cur_pos, pos_param)) {
      if (!param.peek) {
        touch_data.up_edge = 0;
      }
      return {
        button: touch_data.button,
        pos: check_pos.slice(0) as Vec2,
        start_time: touch_data.start_time,
        was_double_click: wasDoubleClick(pos_param),
      };
    }
  }

  if (param.in_event_cb && !mouse_over_captured && !click_invalid) {
    // TODO: Maybe need to also pass along earlier exclusions?  Working okay for now though.
    let param2: MouseClickParam & {
      phys?: Partial<PosParam>;
    } = param;
    if (!param2.phys) {
      param2.phys = {};
    }
    param2.phys.button = typeof param2.in_event_button === 'number' ? param2.in_event_button : button;
    camera2d.virtualToDomPosParam(param2.phys, pos_param);
    inEventOn('mouseup', param2.phys, param2.in_event_cb);
  }
  return null;
}

export type MouseDownEdgeParam = Partial<PosParam> & {
  in_event_cb?: EventCallback | null; // for clicks and key presses
  peek?: boolean;
};
export type MouseDownEdgeRet = {
  button: ButtonIndex;
  pos: Vec2;
  start_time: number;
};
export function mouseDownEdge(param?: MouseDownEdgeParam): null | MouseDownEdgeRet {
  param = param || {};
  if (input_eaten_mouse || !param.in_event_cb && no_active_touches) {
    return null;
  }
  let pos_param = mousePosParam(param);
  let button = pos_param.button;

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (!touch_data.down_edge ||
      !(button === ANY || button === touch_data.button)
    ) {
      continue;
    }
    if (checkPos(touch_data.cur_pos, pos_param)) {
      if (!param.peek) {
        touch_data.down_edge = 0;
      }
      return {
        button: touch_data.button,
        pos: check_pos.slice(0) as Vec2,
        start_time: touch_data.start_time,
      };
    }
  }

  if (param.in_event_cb && !mouse_over_captured) {
    // TODO: Maybe need to also pass along earlier exclusions?  Working okay for now though.
    let param2: MouseDownEdgeParam & {
      phys?: Partial<PosParam>;
    } = param;
    if (!param2.phys) {
      param2.phys = {};
    }
    param2.phys.button = button;
    camera2d.virtualToDomPosParam(param2.phys, pos_param);
    inEventOn('mousedown', param2.phys, param2.in_event_cb);
  }
  return null;
}

// Completely consume any clicks or drags coming from a mouse down event in this
// area - used to catch focus leaving an edit box without wanting to do what
// a click would normally do.
export function mouseConsumeClicks(param: PPosParam): void {
  // skipping when pointerLocked because when we get locked between frames, this will kill the
  // (persistent) pointer-locked "touch"'s position
  if (no_active_touches || pointerLocked()) {
    return;
  }
  param = param || {};
  let pos_param = mousePosParam(param);
  let button = pos_param.button;
  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    // Skipping those that already dispatched a drag this frame, must have been handled, do not consume it!
    if (!(button === ANY || button === touch_data.button) || touch_data.dispatched_drag) {
      continue;
    }
    if (checkPos(touch_data.start_pos, pos_param)) {
      touch_data.down_edge = 0;
      // Set start pos so that it will not pass checkPos
      touch_data.start_pos[0] = touch_data.start_pos[1] = Infinity;
      // Set .total so that inputClick will not detect it as a click
      touch_data.total = Infinity;
    }
  }
}

export type DragParam = Partial<PosParam> & {
  min_dist?: number;
  not_touch_id?: string;
  peek?: boolean;
  eat_clicks?: boolean;
  payload?: unknown;
};
type DragLongPressSharedRet = {
  cur_pos: Vec2;
  start_pos: Vec2;
  delta: Vec2; // this frame's delta
  total: number;  // total (linear) distance dragged
  button: ButtonIndex;
  touch: boolean;
  start_time: number;
  is_down_edge: boolean;
  down_time: number;
  touch_id: string;
};
export type DragRet = DragLongPressSharedRet & {
  dropped: boolean;
};
export function inputDrag(param?: DragParam): null | DragRet {
  if (input_eaten_mouse || no_active_touches) {
    return null;
  }
  param = param || {};
  let bounds_is_finite = param.w !== undefined && isFinite(param.w);
  let pos_param = mousePosParam(param);
  let button = pos_param.button;
  let min_dist = param.min_dist || 0;

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (!(button === ANY || button === touch_data.button) || touch_data.dispatched_drag ||
      touch_id === param.not_touch_id
    ) {
      continue;
    }
    if (checkPos(touch_data.start_pos, pos_param)) {
      if (pointerLocked() && bounds_is_finite) {
        // Likely just locked between frames and will get a drag on a wrong element at center of screen
        // Generally, if pointer is locked, only non-positional drags are relevant
        continue;
      }
      camera2d.domDeltaToVirtual(delta, [touch_data.total/2, touch_data.total/2]);
      let total = delta[0] + delta[1];
      if (total < min_dist) {
        continue;
      }
      if (!param.peek) {
        touch_data.dispatched_drag = true;
      }
      let is_down_edge = Boolean(touch_data.down_edge);
      if (param.eat_clicks) {
        touch_data.down_edge = touch_data.up_edge = 0;
      }
      if (param.payload) {
        touch_data.drag_payload = param.payload;
        touch_data.drag_payload_frame = getFrameIndex();
      }
      camera2d.domToVirtual(start_pos, touch_data.start_pos);
      camera2d.domToVirtual(cur_pos, touch_data.cur_pos);
      camera2d.domDeltaToVirtual(delta, touch_data.delta);
      return {
        cur_pos,
        start_pos,
        delta, // this frame's delta
        total, // total (linear) distance dragged
        button: touch_data.button,
        touch: touch_data.touch,
        start_time: touch_data.start_time,
        is_down_edge,
        down_time: touch_data.down_time,
        touch_id,
        dropped: Boolean(touch_data.up_edge),
      };
    }
  }
  return null;
}

export type LongPressRet = DragLongPressSharedRet & {
  long_press: true;
};
export type LongPressParam = Partial<PosParam> & {
  long_press_max_dist?: number;
  min_time?: number;
  button?: ButtonIndex;
  peek?: boolean;
  eat_clicks?: boolean;
};
// a lot like drag(), refactor to share more?
export function longPress(param?: LongPressParam): null | LongPressRet {
  if (input_eaten_mouse || no_active_touches) {
    return null;
  }
  param = param || {};
  let pos_param = mousePosParam(param);
  let button = pos_param.button;
  let max_dist = param.long_press_max_dist || 50;
  let min_time = param.min_time || 500;

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (!(button === ANY || button === touch_data.button) || touch_data.long_press_dispatched ||
      touch_data.button === POINTERLOCK
    ) {
      continue;
    }
    if (checkPos(touch_data.start_pos, pos_param)) {
      camera2d.domDeltaToVirtual(delta, [touch_data.total/2, touch_data.total/2]);
      let total = delta[0] + delta[1];
      if (total > max_dist) {
        continue;
      }
      let time = Date.now() - touch_data.start_time;
      if (time < min_time) {
        continue;
      }
      if (!param.peek) {
        // ? touch_data.dispatched = true;
        touch_data.long_press_dispatched = true;
      }
      let is_down_edge = Boolean(touch_data.down_edge);
      if (param.eat_clicks) {
        touch_data.down_edge = touch_data.up_edge = 0;
      }
      camera2d.domToVirtual(start_pos, touch_data.start_pos);
      camera2d.domToVirtual(cur_pos, touch_data.cur_pos);
      camera2d.domDeltaToVirtual(delta, touch_data.delta);
      return {
        long_press: true,
        cur_pos,
        start_pos,
        delta, // this frame's delta
        total, // total (linear) distance dragged
        button: touch_data.button,
        touch: touch_data.touch,
        start_time: touch_data.start_time,
        is_down_edge,
        touch_id,
        down_time: touch_data.down_time,
      };
    }
  }
  return null;
}

export type DragDropParam = Partial<PosParam> & {
  peek?: boolean;
};
export type DragDropRet = {
  drag_payload: unknown;
};
export function dragDrop(param?: DragDropParam): null | DragDropRet {
  if (input_eaten_mouse || no_active_touches) {
    return null;
  }
  param = param || {};
  let pos_param = mousePosParam(param);
  let button = pos_param.button;

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    // Maybe touch_data.dispatched_drag_over instead/as well?
    if (!(button === ANY || button === touch_data.button) || touch_data.dispatched || !touch_data.drag_payload) {
      continue;
    }
    if (!touch_data.up_edge) {
      continue;
    }
    if (checkPos(touch_data.cur_pos, pos_param)) {
      if (!param.peek) {
        // don't want the source (possibly called later this frame) to still think it's dragging
        touch_data.dispatched_drag_over = true;
        touch_data.dispatched_drag = true;
        touch_data.dispatched = true;
      }
      return { drag_payload: touch_data.drag_payload };
    }
  }
  return null;
}

export type DragOverParam = Partial<PosParam> & {
  peek?: boolean;
};
export type DragOverRet = {
  cur_pos: Vec2;
  drag_payload: unknown;
};
export function dragOver(param?: DragOverParam): null | DragOverRet {
  if (input_eaten_mouse || no_active_touches) {
    return null;
  }
  param = param || {};
  let pos_param = mousePosParam(param);
  let button = pos_param.button;

  for (let touch_id in touches) {
    let touch_data = touches[touch_id]!;
    if (!(button === ANY || button === touch_data.button) ||
      touch_data.dispatched_drag_over ||
      !touch_data.drag_payload
    ) {
      continue;
    }
    if (touch_data.state !== DOWN) {
      continue;
    }
    if (checkPos(touch_data.cur_pos, pos_param)) {
      // Separate 'dispatched' for dragOver (target) and drag (source) - they both need one dispatch per frame
      if (!param.peek) {
        touch_data.dispatched_drag_over = true;
      }
      camera2d.domToVirtual(cur_pos, touch_data.cur_pos);
      return {
        cur_pos,
        drag_payload: touch_data.drag_payload
      };
    }
  }
  return null;
}
