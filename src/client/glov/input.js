// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
// Some code from Turbulenz: Copyright (c) 2012-2013 Turbulenz Limited
// Released under MIT License: https://opensource.org/licenses/MIT
/* global navigator */

const assert = require('assert');
const camera2d = require('./camera2d.js');
const glov_engine = require('./engine.js');
const { min, sqrt } = Math;
const { vec2, v2abs, v2add, v2copy, v2lengthSq, v2set, v2scale, v2sub } = require('./vmath.js');

const UP_EDGE = 0;
const DOWN_EDGE = 1;
const DOWN = 2;

const MAX_CLICK_DIST = 50;

// per-app overrideable options
const DO_LOCK = false;
const TOUCH_AS_MOUSE = true;
const MAP_ANALOG_TO_DPAD = true;

export const ANY = -1;

export const KEYS = {
  BACKSPACE: 8,
  TAB: 9,
  ENTER: 13,
  RETURN: 13,
  SHIFT: 16,
  CTRL: 17,
  ALT: 18,
  ESC: 27,
  SPACE: 32,
  PAGEUP: 33,
  PAGEDOWN: 34,
  END: 35,
  HOME: 36,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  INS: 45,
  DEL: 46,
};
(function () {
  for (let ii = 1; ii <= 12; ++ii) {
    KEYS[`F${ii}`] = 111 + ii;
  }
  for (let ii = 48; ii <= 90; ++ii) { // 0-9;A-Z
    KEYS[String.fromCharCode(ii)] = ii;
  }
}());
export const pad_codes = {
  A: 0,
  SELECT: 0, // GLOV name
  B: 1,
  CANCEL: 1, // GLOV name
  X: 2,
  Y: 3,
  LB: 4,
  LEFT_BUMPER: 4,
  RB: 5,
  RIGHT_BUMPER: 5,
  LT: 6,
  LEFT_TRIGGER: 6,
  RT: 7,
  RIGHT_TRIGGER: 7,
  BACK: 8,
  START: 9,
  LEFT_STICK: 10,
  RIGHT_STICK: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  ANALOG_UP: 20,
  ANALOG_LEFT: 21,
  ANALOG_DOWN: 22,
  ANALOG_RIGHT: 23,
};

let canvas;
let key_state = {};
let pad_states = []; // One map per gamepad to pad button states
let gamepad_data = []; // Other tracking data per gamepad
let clicks = [];
let dragging = [];
let mouse_pos = vec2();
let mouse_pos_is_touch = false;
let mpos = vec2(); // temporary, mapped to camera
let mouse_over_captured = false;
let mouse_down = [];

let input_eaten_kb = false;
let input_eaten_mouse = false;

let touch_drag_delta = vec2();
let touches = {};

export let touch_mode = false;

function isPointerLocked() {
  return document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement;
}

function ignored(event) {
  event.preventDefault();
  event.stopPropagation();
}

function onKeyUp(event) {
  let code = event.keyCode;
  if (event.target.tagName !== 'INPUT') {
    event.stopPropagation();
    event.preventDefault();
  }

  if (DO_LOCK && code === KEYS.ESC && isPointerLocked()) {
    document.exitPointerLock();
  }
  key_state[code] = UP_EDGE;

}

function onKeyDown(event) {
  let code = event.keyCode;
  if (code !== KEYS.F12 && code !== KEYS.F5 && code !== KEYS.F6 && event.target.tagName !== 'INPUT') {
    event.stopPropagation();
    event.preventDefault();
  }
  // console.log(`${event.code} ${event.keyCode}`);
  key_state[code] = DOWN_EDGE;
}

let temp_delta = vec2();
function onMouseMove(event) {
  if (event.target.tagName !== 'INPUT') {
    event.preventDefault();
    event.stopPropagation();
  }
  if (event.offsetX !== undefined) {
    mouse_pos[0] = event.offsetX;
    mouse_pos[1] = event.offsetY;
  } else {
    mouse_pos[0] = event.layerX;
    mouse_pos[1] = event.layerY;
  }

  if (isPointerLocked()) {
    if (event.movementX || event.movementY) {
      for (let bid in dragging) {
        let button = Number(bid);
        if (mouse_down[button]) {
          let drag_data = dragging[bid];
          v2set(temp_delta, event.movementX, event.movementY);
          v2add(drag_data.delta, drag_data.delta, temp_delta);
          v2abs(temp_delta, temp_delta);
          v2add(drag_data.total, drag_data.total, temp_delta);
        }
      }
    }
  } else {
    for (let bid in dragging) {
      let button = Number(bid);
      if (mouse_down[button]) {
        let drag_data = dragging[bid];
        v2sub(temp_delta, mouse_pos, drag_data.start_pos);
        v2add(drag_data.delta, drag_data.delta, temp_delta);
        v2abs(temp_delta, temp_delta);
        v2add(drag_data.total, drag_data.total, temp_delta);
        v2copy(drag_data.start_pos, mouse_pos);
      }
    }
  }
  mouse_pos_is_touch = false;
}

function anyMouseButtonsDown() {
  for (let ii = 0; ii < mouse_down.length; ++ii) {
    if (mouse_down[ii]) {
      return true;
    }
  }
  return false;
}

function onMouseDown(event) {
  onMouseMove(event); // update mouse_pos
  glov_engine.sound_manager.resume();

  if (DO_LOCK && canvas.requestPointerLock && !anyMouseButtonsDown()) {
    canvas.requestPointerLock();
  }

  let button = event.button;
  mouse_down[button] = mouse_pos.slice(0);
  if (dragging[button]) {
    v2copy(dragging[button].start_pos, mouse_pos);
  } else {
    dragging[button] = {
      delta: vec2(),
      total: vec2(),
      start_pos: mouse_pos.slice(0),
    };
  }
}

function onMouseUp(event) {
  onMouseMove(event); // update mouse_pos
  let no_click = event.target.tagName === 'INPUT';
  let button = event.button;
  if (mouse_down[button]) {
    let drag_data = dragging[button];
    if (drag_data) {
      v2sub(temp_delta, mouse_pos, drag_data.start_pos);
      v2add(drag_data.delta, drag_data.delta, temp_delta);
      v2abs(temp_delta, temp_delta);
      v2add(drag_data.total, drag_data.total, temp_delta);
      let dist = drag_data.total[0] + drag_data.total[1];
      if (!no_click && dist < MAX_CLICK_DIST) {
        clicks.push({ button, pos: mouse_pos.slice(0), touch: false });
      }
    }
    delete mouse_down[button];
  }
  if (DO_LOCK && isPointerLocked() && !anyMouseButtonsDown()) {
    document.exitPointerLock();
  }
}

function onWheel(event) {
  onMouseMove(event);
}

function onTouchChange(event) {
  touch_mode = true;
  if (event.cancelable !== false) {
    event.preventDefault();
  }
  let ct = event.touches;
  let seen = {};

  let old_count = Object.keys(touches).length;
  let new_count = ct.length;
  // Look for press and movement
  for (let ii = 0; ii < new_count; ++ii) {
    let touch = ct[ii];
    let last_touch = touches[touch.identifier];
    if (!last_touch) {
      last_touch = touches[touch.identifier] = {
        pos: vec2(),
        total_drag: vec2(),
      };
    } else {
      v2set(temp_delta, touch.clientX, touch.clientY);
      v2sub(temp_delta, temp_delta, last_touch.pos);
      // touch drags inverted relative to mouse drags
      v2sub(touch_drag_delta, touch_drag_delta, temp_delta);
      v2abs(temp_delta, temp_delta);
      v2add(last_touch.total_drag, last_touch.total_drag, temp_delta);
    }
    v2set(last_touch.pos, touch.clientX, touch.clientY);
    seen[touch.identifier] = true;
    if (TOUCH_AS_MOUSE && new_count === 1) {
      // Single touch, treat as mouse movement
      v2set(mouse_pos, touch.clientX, touch.clientY);
      mouse_pos_is_touch = true;
    }
  }
  // Look for release, if releasing exactly one final touch
  let released_touch;
  for (let id in touches) {
    if (!seen[id]) {
      released_touch = touches[id];
      delete touches[id];
    }
  }
  if (TOUCH_AS_MOUSE) {
    if (old_count === 1 && new_count === 0) {
      assert(released_touch);
      delete mouse_down[0];
      v2copy(mouse_pos, released_touch.pos);
      mouse_pos_is_touch = true;
      let dist = released_touch.total_drag[0] + released_touch.total_drag[1];
      if (dist < MAX_CLICK_DIST) {
        clicks.push({ button: 0, pos: released_touch.pos, touch: true });
      }
    } else if (new_count === 1) {
      let touch = ct[0];
      if (!old_count) {
        mouse_down[0] = vec2(touch.clientX, touch.clientY);
      }
      v2set(mouse_pos, touch.clientX, touch.clientY);
      mouse_pos_is_touch = true;
    } else if (new_count > 1) {
      // multiple touches, release mouse_down without emitting click
      delete mouse_down[0];
    }
  }
}

export function startup(_canvas) {
  canvas = _canvas;

  let passive_param = false;
  try {
    let opts = Object.defineProperty({}, 'passive', {
      get: function () {
        passive_param = { passive: false };
        return false;
      }
    });
    window.addEventListener('test', null, opts);
    window.removeEventListener('test', null, opts);
  } catch (e) {
    passive_param = false;
  }

  canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock ||
    canvas.webkitRequestPointerLock;
  document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock ||
    document.webkitExitPointerLock || function () { /* nop */ };

  window.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('keyup', onKeyUp, false);

  window.addEventListener('click', ignored, false);
  window.addEventListener('contextmenu', ignored, false);
  window.addEventListener('mousemove', onMouseMove, false);
  window.addEventListener('mousedown', onMouseDown, false);
  window.addEventListener('mouseup', onMouseUp, false);
  window.addEventListener('DOMMouseScroll', onWheel, false);
  window.addEventListener('mousewheel', onWheel, false);

  window.addEventListener('touchstart', onTouchChange, passive_param);
  window.addEventListener('touchmove', onTouchChange, passive_param);
  window.addEventListener('touchend', onTouchChange, passive_param);
  window.addEventListener('touchcancel', onTouchChange, passive_param);
}


const DEADZONE = 0.26;
const DEADZONE_SQ = DEADZONE * DEADZONE;
const NUM_STICKS = 2;
const PAD_THRESHOLD = 0.25; // for turning analog motion into digital events

function getGamepadData(idx) {
  let gpd = gamepad_data[idx];
  if (!gpd) {
    gpd = gamepad_data[idx] = {
      timestamp: 0,
      sticks: new Array(NUM_STICKS),
    };
    for (let ii = 0; ii < NUM_STICKS; ++ii) {
      gpd.sticks[ii] = vec2();
    }
    pad_states[idx] = {};
  }
  return gpd;
}

function updatePadState(ps, b, c) {
  if (b && !ps[c]) {
    ps[c] = DOWN_EDGE;
  } else if (!b && ps[c]) {
    ps[c] = UP_EDGE;
  }
}

function gamepadUpdate() {
  let gamepads = (navigator.gamepads ||
    navigator.webkitGamepads ||
    (navigator.getGamepads && navigator.getGamepads()) ||
    (navigator.webkitGetGamepads && navigator.webkitGetGamepads()));

  if (gamepads) {
    let numGamePads = gamepads.length;
    for (let ii = 0; ii < numGamePads; ii++) {
      let gamepad = gamepads[ii];
      if (!gamepad) {
        continue;
      }
      let gpd = getGamepadData(ii);
      let ps = pad_states[ii];
      // Update button states
      if (gpd.timestamp < gamepad.timestamp) {
        let buttons = gamepad.buttons;
        gpd.timestamp = gamepad.timestamp;

        let numButtons = buttons.length;
        for (let n = 0; n < numButtons; n++) {
          let value = buttons[n];
          if (typeof value === 'object') {
            value = value.value;
          }
          value = value > 0.5;
          updatePadState(ps, value, n);
        }
      }

      // Update axes states
      let axes = gamepad.axes;
      if (axes.length >= NUM_STICKS * 2) {
        for (let n = 0; n < NUM_STICKS; ++n) {
          let pair = gpd.sticks[n];
          v2set(pair, axes[n*2], -axes[n*2 + 1]);
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
        }

        // Calculate virtual directional buttons
        updatePadState(ps, gpd.sticks[0][0] < -PAD_THRESHOLD, pad_codes.ANALOG_LEFT);
        updatePadState(ps, gpd.sticks[0][0] > PAD_THRESHOLD, pad_codes.ANALOG_RIGHT);
        updatePadState(ps, gpd.sticks[0][1] < -PAD_THRESHOLD, pad_codes.ANALOG_DOWN);
        updatePadState(ps, gpd.sticks[0][1] > PAD_THRESHOLD, pad_codes.ANALOG_UP);
      }
    }
  }
}

export function tick() {
  // browser frame has occurred since the call to endFrame(),
  // we should now have `clicks` and `key_state` populated with edge events
  mouse_over_captured = false;
  gamepadUpdate();
}

export function endFrame() {
  function tickMap(map) {
    Object.keys(map).forEach((keycode) => {
      switch (map[keycode]) {
        case DOWN_EDGE:
          map[keycode] = DOWN;
          break;
        case UP_EDGE:
          delete map[keycode];
          break;
        default:
      }
    });
  }
  tickMap(key_state);
  pad_states.forEach(tickMap);
  clicks = [];
  for (let bid in dragging) {
    let button = Number(bid);
    if (mouse_down[button]) {
      let drag_data = dragging[button];
      drag_data.start_pos = mouse_pos.slice(0);
      drag_data.delta[0] = drag_data.delta[1] = 0;
    } else {
      delete dragging[bid];
    }
  }
  touch_drag_delta[0] = touch_drag_delta[1] = 0;
  input_eaten_kb = false;
  input_eaten_mouse = false;
}

export function eatAllInput() {
  // destroy clicks, remove all down and up edges
  endFrame();
  mouse_over_captured = true;
  input_eaten_kb = true;
  input_eaten_mouse = true;
}

export function eatAllKeyboardInput() {
  let clicks_save = clicks;
  let over_save = mouse_over_captured;
  let eaten_mouse_save = input_eaten_mouse;
  eatAllInput();
  clicks = clicks_save;
  mouse_over_captured = over_save;
  input_eaten_mouse = eaten_mouse_save;
}

// returns position mapped to current camera view
export function mousePos(dst) {
  dst = dst || vec2();
  camera2d.physicalToVirtual(dst, mouse_pos);
  return dst;
}

export function isMouseOver(param) {
  assert(typeof param.x === 'number');
  assert(typeof param.y === 'number');
  assert(typeof param.w === 'number');
  assert(typeof param.h === 'number');
  if (mouse_over_captured) {
    return false;
  }
  mousePos(mpos);
  if (mpos[0] >= param.x &&
    (param.w === Infinity || mpos[0] < param.x + param.w) &&
    mpos[1] >= param.y &&
    (param.h === Infinity || mpos[1] < param.y + param.h)
  ) {
    mouse_over_captured = true;
    return true;
  }
  return false;
}

export function isMouseDown(button) {
  button = button || 0;
  return !input_eaten_mouse && mouse_down[button];
}

export function mousePosIsTouch() {
  return mouse_pos_is_touch;
}

export function click(param) {
  let x = param.x === undefined ? camera2d.x0() : param.x;
  let y = param.y === undefined ? camera2d.y0() : param.y;
  let w = param.w === undefined ? camera2d.w() : param.w;
  let h = param.h === undefined ? camera2d.h() : param.h;
  let button = param.button || 0;
  mousePos(mpos);
  for (let ii = 0; ii < clicks.length; ++ii) {
    let clk = clicks[ii];
    if (clk.button !== button) {
      continue;
    }
    camera2d.physicalToVirtual(mpos, clk.pos);
    if (mpos[0] >= x && (w === Infinity || mpos[0] < x + w) &&
      mpos[1] >= y && (h === Infinity || mpos[1] < y + h)
    ) {
      clicks.splice(ii, 1);
      return mpos.slice(0);
    }
  }
  return false;
}

export function isTouchDown(param) {
  if (param) {
    assert(typeof param.x === 'number');
    assert(typeof param.y === 'number');
    assert(typeof param.w === 'number');
    assert(typeof param.h === 'number');
  }
  if (input_eaten_mouse) {
    return false;
  }
  for (let id in touches) {
    let touch = touches[id];
    camera2d.physicalToVirtual(mpos, touch.pos);
    let pos = mpos;
    if (!param ||
      pos[0] >= param.x && pos[0] < param.x + param.w &&
      pos[1] >= param.y && pos[1] < param.y + param.h
    ) {
      return pos;
    }
  }
  return false;
}

export function numTouches() {
  return Object.keys(touches).length;
}

export function keyDown(keycode) {
  if (input_eaten_kb) {
    return false;
  }
  return Boolean(key_state[keycode]);
}
export function keyDownEdge(keycode) {
  if (key_state[keycode] === DOWN_EDGE) {
    key_state[keycode] = DOWN;
    return true;
  }
  return false;
}
export function keyUpEdge(keycode) {
  if (key_state[keycode] === UP_EDGE) {
    delete key_state[keycode];
    return true;
  }
  return false;
}

export function padGetAxes(out, stickindex, padindex) {
  assert(stickindex >= 0 && stickindex < NUM_STICKS);
  if (padindex === undefined) {
    let sub = vec2();
    v2set(out, 0, 0);
    for (let ii = 0; ii < gamepad_data.length; ++ii) {
      padGetAxes(sub, stickindex, ii);
      v2add(out, sub);
    }
    return;
  }
  let sticks = getGamepadData(padindex).sticks;
  v2copy(out, sticks[stickindex]);
}

function padButtonDownInternal(ps, padcode) {
  return Boolean(ps[padcode]);
}
function padButtonDownEdgeInternal(ps, padcode) {
  if (ps[padcode] === DOWN_EDGE) {
    ps[padcode] = DOWN;
    return true;
  }
  return false;
}
function padButtonUpEdgeInternal(ps, padcode) {
  if (ps[padcode] === UP_EDGE) {
    delete ps[padcode];
    return true;
  }
  return false;
}

const ANALOG_MAP = (function () {
  if (!MAP_ANALOG_TO_DPAD) {
    return {};
  }
  let r = {};
  r[pad_codes.LEFT] = pad_codes.ANALOG_LEFT;
  r[pad_codes.RIGHT] = pad_codes.ANALOG_RIGHT;
  r[pad_codes.UP] = pad_codes.ANALOG_UP;
  r[pad_codes.DOWN] = pad_codes.ANALOG_DOWN;
  return r;
}());
function padButtonShared(fn, padcode, padindex) {
  assert(padcode !== undefined);
  // Handle calling without a specific pad index
  if (padindex === undefined) {
    for (let ii = 0; ii < pad_states.length; ++ii) {
      if (padButtonShared(fn, padcode, ii)) {
        return true;
      }
    }
    return false;
  }

  if (input_eaten_mouse) {
    return false;
  }
  let ps = pad_states[padindex];
  if (!ps) {
    return false;
  }

  if (ANALOG_MAP[padcode] && fn(ps, ANALOG_MAP[padcode])) {
    return true;
  }
  return fn(ps, padcode);
}
export function padButtonDown(padcode, padindex) {
  return padButtonShared(padButtonDownInternal, padcode, padindex);
}
export function padButtonDownEdge(padcode, padindex) {
  return padButtonShared(padButtonDownEdgeInternal, padcode, padindex);
}
export function padButtonUpEdge(padcode, padindex) {
  return padButtonShared(padButtonUpEdgeInternal, padcode, padindex);
}

export function drag(params) {
  params = params || {};
  let button = params.button || 0;
  if (button === ANY) {
    let lmb = drag({ button: 0 });
    let rmb = drag({ button: 2 });
    return [lmb[0] + rmb[0], lmb[1] + rmb[1]];
  }

  let drag_data = dragging[button];
  let ret = [0,0];
  if (drag_data) {
    if (mouse_down[button]) {
      ret[0] += drag_data.delta[0] + mouse_pos[0] - drag_data.start_pos[0];
      ret[1] += drag_data.delta[1] + mouse_pos[1] - drag_data.start_pos[1];
    } else {
      v2add(ret, ret, drag_data.delta);
    }
  }
  if (button === 0) {
    v2add(ret, ret, touch_drag_delta);
  }
  return ret;
}
