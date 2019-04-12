// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

/* global TurbulenzEngine:true */

const assert = require('assert');
const camera2d = require('./camera2d.js');
const glov_engine = require('./engine.js');
const { vec2, v2abs, v2add, v2copy, v2set, v2sub } = require('./vmath.js');

const UP_EDGE = 0;
const DOWN_EDGE = 1;
const DOWN = 2;

const MAX_CLICK_DIST = 50;

const DO_LOCK = false;
const TOUCH_AS_MOUSE = true;

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

let canvas;
let input_device;
let key_state = {};
let pad_states = []; // One map per joystick
let clicks = [];
let dragging = [];
let mouse_pos = vec2();
let mouse_pos_is_touch = false;
let mpos = vec2(); // temporary, mapped to camera
let mouse_over_captured = false;
let mouse_down = [];
let pad_threshold = 0.25;
let map_analog_to_dpad = true; // user overrideable

let input_eaten_kb = false;
let input_eaten_mouse = false;

let touch_drag_delta = vec2();
let touches = {};

export let pad_codes;

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

  input_device = TurbulenzEngine.createInputDevice({});

  pad_codes = input_device.padCodes;
  pad_codes.ANALOG_UP = 20;
  pad_codes.ANALOG_LEFT = 21;
  pad_codes.ANALOG_DOWN = 22;
  pad_codes.ANALOG_RIGHT = 23;

  window.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('keyup', onKeyUp, false);

  window.addEventListener('click', ignored, false);
  window.addEventListener('contextmenu', ignored, false);
  window.addEventListener('mousemove', onMouseMove, false);
  window.addEventListener('mousedown', onMouseDown, false);
  window.addEventListener('mouseup', onMouseUp, false);
  window.addEventListener('DOMMouseScroll', onWheel, false);
  window.addEventListener('mousewheel', onWheel, false);

  input_device.addEventListener('paddown', (padindex, padcode) => onPadDown(padindex, padcode));
  input_device.addEventListener('padup', (padindex, padcode) => onPadUp(padindex, padcode));
  input_device.addEventListener('padmove',
    (padindex, x, y, z, rx, ry, rz) => onPadMove(padindex, x, y, z, rx, ry, rz));

  window.addEventListener('touchstart', onTouchChange, passive_param);
  window.addEventListener('touchmove', onTouchChange, passive_param);
  window.addEventListener('touchend', onTouchChange, passive_param);
  window.addEventListener('touchcancel', onTouchChange, passive_param);
}

export function tick() {
  // browser frame has occurred since the call to endFrame(),
  // we should now have `clicks` and `key_state` populated with edge events
  mouse_over_captured = false;
  input_device.update();
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

export function clickHit(param) {
  assert(typeof param.x === 'number');
  assert(typeof param.y === 'number');
  assert(typeof param.w === 'number');
  assert(typeof param.h === 'number');
  let button = param.button || 0;
  mousePos(mpos);
  for (let ii = 0; ii < clicks.length; ++ii) {
    let click = clicks[ii];
    if (click.button !== button) {
      continue;
    }
    let pos = click.pos;
    camera2d.physicalToVirtual(mpos, pos);
    if (mpos[0] >= param.x &&
      (param.w === Infinity || mpos[0] < param.x + param.w) &&
      mpos[1] >= param.y &&
      (param.h === Infinity || mpos[1] < param.y + param.h)
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

function onPadUp(padindex, padcode) {
  pad_states[padindex] = pad_states[padindex] || { axes: {} };
  pad_states[padindex][padcode] = UP_EDGE;
}
function onPadDown(padindex, padcode) {
  pad_states[padindex] = pad_states[padindex] || { axes: {} };
  pad_states[padindex][padcode] = DOWN_EDGE;
}
function onPadMove(padindex, x, y, z, rx, ry, rz) {
  let ps = pad_states[padindex] = pad_states[padindex] || { axes: {} };
  ps.axes.x = x;
  ps.axes.y = y;
  ps.axes.z = z;
  ps.axes.rx = rx;
  ps.axes.ry = ry;
  ps.axes.rz = rz;
  // Calculate virtual directional buttons
  function check(b, c) {
    if (b) {
      if (ps[c] !== DOWN) {
        ps[c] = DOWN_EDGE;
      }
    } else if (ps[c]) {
      ps[c] = UP_EDGE;
    }
  }
  check(x < -pad_threshold, pad_codes.ANALOG_LEFT);
  check(x > pad_threshold, pad_codes.ANALOG_RIGHT);
  check(y < -pad_threshold, pad_codes.ANALOG_DOWN);
  check(y > pad_threshold, pad_codes.ANALOG_UP);
}
export function isPadButtonDown(padindex, padcode) {
  // Handle calling without a specific pad index
  if (padcode === undefined) {
    for (let ii = 0; ii < pad_states.length; ++ii) {
      if (isPadButtonDown(ii, padindex)) {
        return true;
      }
    }
    return false;
  }

  if (input_eaten_mouse) {
    return false;
  }
  if (!pad_states[padindex]) {
    return false;
  }
  if (map_analog_to_dpad) {
    if (padcode === pad_codes.LEFT && isPadButtonDown(padindex, pad_codes.ANALOG_LEFT)) {
      return true;
    }
    if (padcode === pad_codes.RIGHT && isPadButtonDown(padindex, pad_codes.ANALOG_RIGHT)) {
      return true;
    }
    if (padcode === pad_codes.UP && isPadButtonDown(padindex, pad_codes.ANALOG_UP)) {
      return true;
    }
    if (padcode === pad_codes.DOWN && isPadButtonDown(padindex, pad_codes.ANALOG_DOWN)) {
      return true;
    }
  }
  return Boolean(pad_states[padindex][padcode]);
}
export function padGetAxes(padindex) {
  if (padindex === undefined) {
    let ret = { x: 0, y: 0 };
    for (let ii = 0; ii < pad_states.length; ++ii) {
      let sub = padGetAxes(ii);
      ret.x += sub.x;
      ret.y += sub.y;
    }
    return ret;
  }
  let ps = pad_states[padindex] = pad_states[padindex] || { axes: {} };
  let axes = ps.axes;
  return { x: axes.x || 0, y: axes.y || 0 };
}
export function padDownHit(padindex, padcode) {
  // Handle calling without a specific pad index
  if (padcode === undefined) {
    for (let ii = 0; ii < pad_states.length; ++ii) {
      if (padDownHit(ii, padindex)) {
        return true;
      }
    }
    return false;
  }

  if (!pad_states[padindex]) {
    return false;
  }
  if (padcode === pad_codes.LEFT && padDownHit(padindex, pad_codes.ANALOG_LEFT)) {
    return true;
  }
  if (padcode === pad_codes.RIGHT && padDownHit(padindex, pad_codes.ANALOG_RIGHT)) {
    return true;
  }
  if (padcode === pad_codes.UP && padDownHit(padindex, pad_codes.ANALOG_UP)) {
    return true;
  }
  if (padcode === pad_codes.DOWN && padDownHit(padindex, pad_codes.ANALOG_DOWN)) {
    return true;
  }
  if (pad_states[padindex][padcode] === DOWN_EDGE) {
    pad_states[padindex][padcode] = DOWN;
    return true;
  }
  return false;
}
export function padUpHit(padindex, padcode) {
  // Handle calling without a specific pad index
  if (padcode === undefined) {
    for (let ii = 0; ii < pad_states.length; ++ii) {
      if (padUpHit(ii, padindex)) {
        return true;
      }
    }
    return false;
  }

  if (!pad_states[padindex]) {
    return false;
  }
  if (padcode === pad_codes.LEFT && padUpHit(padindex, pad_codes.ANALOG_LEFT)) {
    return true;
  }
  if (padcode === pad_codes.RIGHT && padUpHit(padindex, pad_codes.ANALOG_RIGHT)) {
    return true;
  }
  if (padcode === pad_codes.UP && padUpHit(padindex, pad_codes.ANALOG_UP)) {
    return true;
  }
  if (padcode === pad_codes.DOWN && padUpHit(padindex, pad_codes.ANALOG_DOWN)) {
    return true;
  }
  if (pad_states[padindex][padcode] === UP_EDGE) {
    delete pad_states[padindex][padcode];
    return true;
  }
  return false;
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
