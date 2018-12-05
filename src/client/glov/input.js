/*global VMath: false */
/*global assert: false */

let VMathArrayConstructor = VMath.F32Array;

const UP_EDGE = 0;
const DOWN_EDGE = 1;
const DOWN = 2;

class GlovInput {
  constructor(input_device, draw2d, camera) {
    this.input_device = input_device;
    this.draw2d = draw2d;
    this.camera = camera;
    this.key_state = {};
    this.pad_states = []; // One map per joystick
    this.clicks = [];
    this.mouse_pos = new VMathArrayConstructor(2);
    this.mouse_pos_is_touch = false;
    this.mpos = new VMathArrayConstructor(2); // temporary, mapped to camera
    this.mouse_over_captured = false;
    this.mouse_down = [];
    this.pad_threshold = 0.25;
    this.last_touch_state = [];
    this.touch_state = [];
    this.touch_as_mouse = true;
    this.map_analog_to_dpad = true; // user overrideable

    this.input_eaten_kb = false;
    this.input_eaten_mouse = false;

    this.pad_codes = input_device.padCodes;
    this.pad_codes.ANALOG_UP = 20;
    this.pad_codes.ANALOG_LEFT = 21;
    this.pad_codes.ANALOG_DOWN = 22;
    this.pad_codes.ANALOG_RIGHT = 23;
    this.key_codes = input_device.keyCodes;
    this.key_codes.SHIFT = 1000;
    this.key_codes.CONTROL = 1001;
    this.key_codes.ALT = 1002;

    input_device.addEventListener('keydown', (keycode) => this.onKeyDown(keycode));
    input_device.addEventListener('keyup', (keycode) => this.onKeyUp(keycode));

    input_device.addEventListener('mousedown', (mousecode, x, y) => this.onMouseDown(mousecode, x, y));
    input_device.addEventListener('mouseup', (mousecode, x, y) => this.onMouseUp(mousecode, x, y));
    input_device.addEventListener('mouseover', (x,y) => this.onMouseOver(x, y));


    input_device.addEventListener('paddown', (padindex, padcode) => this.onPadDown(padindex, padcode));
    input_device.addEventListener('padup', (padindex, padcode) => this.onPadUp(padindex, padcode));
    input_device.addEventListener('padmove',
      (padindex, x, y, z, rx, ry, rz) => this.onPadMove(padindex, x, y, z, rx, ry, rz));

    input_device.addEventListener('touchstart', (evt) => this.onTouchChange(evt));
    input_device.addEventListener('touchend', (evt) => this.onTouchChange(evt));
    input_device.addEventListener('touchmove', (evt) => this.onTouchChange(evt));

  }
  tick() {
    // browser frame has occurred since the call to endFrame(),
    // we should now have .clicks and this.key_state populated with edge events
    this.mouse_over_captured = false;
    this.input_device.update();
  }
  endFrame() {
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
    tickMap(this.key_state);
    this.pad_states.forEach(tickMap);
    this.clicks = [];
    this.input_eaten_kb = false;
    this.input_eaten_mouse = false;
  }

  eatAllKeyboardInput() {
    let clicks_save = this.clicks;
    let over_save = this.mouse_over_captured;
    let eaten_mouse_save = this.input_eaten_mouse;
    this.eatAllInput();
    this.clicks = clicks_save;
    this.mouse_over_captured = over_save;
    this.input_eaten_mouse = eaten_mouse_save;
  }

  eatAllInput() {
    // destroy clicks, remove all down and up edges
    this.endFrame();
    this.mouse_over_captured = true;
    this.input_eaten_kb = true;
    this.input_eaten_mouse = true;
  }

  onMouseDown(mousecode, x, y) {
    this.onMouseOver(x, y); // update this.mouse_pos
    this.mouse_down[mousecode] = true;
  }
  onMouseUp(mousecode, x, y) {
    this.onMouseOver(x, y); // update this.mouse_pos
    this.clicks[mousecode] = this.clicks[mousecode] || [];
    this.clicks[mousecode].push({ pos: this.mouse_pos.slice(0), touch: false });
    this.mouse_down[mousecode] = false;
  }
  onMouseOver(x, y) {
    this.mouse_pos[0] = x;
    this.mouse_pos[1] = y;
    this.mouse_pos_is_touch = false;
    //this.draw2d.viewportMap(x, y, this.mouse_mapped);
  }
  isMouseOver(param) {
    assert(typeof param.x === 'number');
    assert(typeof param.y === 'number');
    assert(typeof param.w === 'number');
    assert(typeof param.h === 'number');
    if (this.mouse_over_captured) {
      return false;
    }
    this.mousePos(this.mpos);
    if (this.mpos[0] >= param.x &&
      (param.w === Infinity || this.mpos[0] < param.x + param.w) &&
      this.mpos[1] >= param.y &&
      (param.h === Infinity || this.mpos[1] < param.y + param.h)
    ) {
      this.mouse_over_captured = true;
      return true;
    }
    return false;
  }
  isMouseDown(button) {
    button = button || 0;
    return !this.input_eaten_mouse && this.mouse_down[button];
  }
  // returns position mapped to current camera view
  mousePos(dst) {
    dst = dst || new VMathArrayConstructor(2);
    this.camera.physicalToVirtual(dst, this.mouse_pos);
    return dst;
  }
  mousePosIsTouch() {
    return this.mouse_pos_is_touch;
  }
  clickHit(param) {
    assert(typeof param.x === 'number');
    assert(typeof param.y === 'number');
    assert(typeof param.w === 'number');
    assert(typeof param.h === 'number');
    let button = param.button || 0;
    if (!this.clicks[button]) {
      return false;
    }
    this.mousePos(this.mpos);
    for (let ii = 0; ii < this.clicks[button].length; ++ii) {
      let click = this.clicks[button][ii];
      let pos = click.pos;
      this.camera.physicalToVirtual(this.mpos, pos);
      if (this.mpos[0] >= param.x &&
        (param.w === Infinity || this.mpos[0] < param.x + param.w) &&
        this.mpos[1] >= param.y &&
        (param.h === Infinity || this.mpos[1] < param.y + param.h)
      ) {
        this.clicks[button].splice(ii, 1);
        return this.mpos.slice(0);
      }
    }
    return false;
  }

  onTouchChange(param) {
    this.last_touch_state = this.touch_state;
    this.touch_state = param.touches || [];
    if (this.touch_as_mouse) {
      if (this.last_touch_state.length === 1 && this.touch_state.length === 0) {
        // click!
        this.mouse_down[0] = false;
        // update this.mouse_pos
        this.onMouseOver(this.last_touch_state[0].positionX, this.last_touch_state[0].positionY);
        this.mouse_pos_is_touch = true;
        this.clicks[0] = this.clicks[0] || [];
        this.clicks[0].push({ pos: this.mouse_pos.slice(0), touch: true });
      } else if (this.touch_state.length === 1) {
        this.mouse_down[0] = true;
        this.onMouseOver(this.touch_state[0].positionX, this.touch_state[0].positionY);
        this.mouse_pos_is_touch = true;
      } else if (this.touch_state.length > 1) {
        this.mouse_down[0] = false;
        // no click
      }
    }
    //throw JSON.stringify(param, undefined, 2);
  }
  isTouchDown(param) {
    if (param) {
      assert(typeof param.x === 'number');
      assert(typeof param.y === 'number');
      assert(typeof param.w === 'number');
      assert(typeof param.h === 'number');
    }
    if (this.input_eaten_mouse) {
      return false;
    }
    for (let ii = 0; ii < this.touch_state.length; ++ii) {
      this.camera.physicalToVirtual(this.mpos, [this.touch_state[ii].positionX, this.touch_state[ii].positionY]);
      let pos = this.mpos;
      if (!param ||
        pos[0] >= param.x && pos[0] < param.x + param.w &&
        pos[1] >= param.y && pos[1] < param.y + param.h
      ) {
        return pos;
      }
    }
    return false;
  }
  isTouchDownSprite(sprite) {
    const w = sprite.getWidth();
    const h = sprite.getHeight();
    return this.isTouchDown({
      x: sprite.x - w/2,
      y: sprite.y - h/2,
      w,
      h,
    });
  }

  onKeyUp(keycode) {
    this.key_state[keycode] = UP_EDGE;
  }
  onKeyDown(keycode) {
    this.key_state[keycode] = DOWN_EDGE;
  }

  doConvenienceKeys(fn, keycode) {
    switch (keycode) {
      case this.key_codes.SHIFT:
        return this[fn](this.key_codes.LEFT_SHIFT) || this[fn](this.key_codes.RIGHT_SHIFT);
      case this.key_codes.CONTROL:
        return this[fn](this.key_codes.LEFT_CONTROL) || this[fn](this.key_codes.RIGHT_CONTROL);
      case this.key_codes.ALT:
        return this[fn](this.key_codes.LEFT_ALT) || this[fn](this.key_codes.RIGHT_ALT);
      default:
        assert(!'invalid keycode');
    }
    return false;
  }

  isKeyDown(keycode) {
    if (this.input_eaten_kb) {
      return false;
    }
    if (keycode >= 1000) {
      return this.doConvenienceKeys('isKeyDown', keycode);
    }
    return Boolean(this.key_state[keycode]);
  }
  keyDownHit(keycode) {
    if (keycode >= 1000) {
      return this.doConvenienceKeys('keyDownHit', keycode);
    }
    if (this.key_state[keycode] === DOWN_EDGE) {
      this.key_state[keycode] = DOWN;
      return true;
    }
    return false;
  }
  keyUpHit(keycode) {
    if (keycode >= 1000) {
      return this.doConvenienceKeys('keyUpHit', keycode);
    }
    if (this.key_state[keycode] === UP_EDGE) {
      delete this.key_state[keycode];
      return true;
    }
    return false;
  }

  onPadUp(padindex, padcode) {
    this.pad_states[padindex] = this.pad_states[padindex] || { axes: {} };
    this.pad_states[padindex][padcode] = UP_EDGE;
  }
  onPadDown(padindex, padcode) {
    this.pad_states[padindex] = this.pad_states[padindex] || { axes: {} };
    this.pad_states[padindex][padcode] = DOWN_EDGE;
  }
  onPadMove(padindex, x, y, z, rx, ry, rz) {
    let ps = this.pad_states[padindex] = this.pad_states[padindex] || { axes: {} };
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
    check(x < -this.pad_threshold, this.pad_codes.ANALOG_LEFT);
    check(x > this.pad_threshold, this.pad_codes.ANALOG_RIGHT);
    check(y < -this.pad_threshold, this.pad_codes.ANALOG_DOWN);
    check(y > this.pad_threshold, this.pad_codes.ANALOG_UP);
  }
  isPadButtonDown(padindex, padcode) {
    // Handle calling without a specific pad index
    if (padcode === undefined) {
      for (let ii = 0; ii < this.pad_states.length; ++ii) {
        if (this.isPadButtonDown(ii, padindex)) {
          return true;
        }
      }
      return false;
    }

    if (this.input_eaten_mouse) {
      return false;
    }
    if (!this.pad_states[padindex]) {
      return false;
    }
    if (this.map_analog_to_dpad) {
      if (padcode === this.pad_codes.LEFT && this.isPadButtonDown(padindex, this.pad_codes.ANALOG_LEFT)) {
        return true;
      }
      if (padcode === this.pad_codes.RIGHT && this.isPadButtonDown(padindex, this.pad_codes.ANALOG_RIGHT)) {
        return true;
      }
      if (padcode === this.pad_codes.UP && this.isPadButtonDown(padindex, this.pad_codes.ANALOG_UP)) {
        return true;
      }
      if (padcode === this.pad_codes.DOWN && this.isPadButtonDown(padindex, this.pad_codes.ANALOG_DOWN)) {
        return true;
      }
    }
    return Boolean(this.pad_states[padindex][padcode]);
  }
  padGetAxes(padindex) {
    if (padindex === undefined) {
      let ret = { x: 0, y: 0 };
      for (let ii = 0; ii < this.pad_states.length; ++ii) {
        let sub = this.padGetAxes(ii);
        ret.x += sub.x;
        ret.y += sub.y;
      }
      return ret;
    }
    let ps = this.pad_states[padindex] = this.pad_states[padindex] || { axes: {} };
    let axes = ps.axes;
    return { x: axes.x || 0, y: axes.y || 0 };
  }
  padDownHit(padindex, padcode) {
    // Handle calling without a specific pad index
    if (padcode === undefined) {
      for (let ii = 0; ii < this.pad_states.length; ++ii) {
        if (this.padDownHit(ii, padindex)) {
          return true;
        }
      }
      return false;
    }

    if (!this.pad_states[padindex]) {
      return false;
    }
    if (padcode === this.pad_codes.LEFT && this.padDownHit(padindex, this.pad_codes.ANALOG_LEFT)) {
      return true;
    }
    if (padcode === this.pad_codes.RIGHT && this.padDownHit(padindex, this.pad_codes.ANALOG_RIGHT)) {
      return true;
    }
    if (padcode === this.pad_codes.UP && this.padDownHit(padindex, this.pad_codes.ANALOG_UP)) {
      return true;
    }
    if (padcode === this.pad_codes.DOWN && this.padDownHit(padindex, this.pad_codes.ANALOG_DOWN)) {
      return true;
    }
    if (this.pad_states[padindex][padcode] === DOWN_EDGE) {
      this.pad_states[padindex][padcode] = DOWN;
      return true;
    }
    return false;
  }
  padUpHit(padindex, padcode) {
    // Handle calling without a specific pad index
    if (padcode === undefined) {
      for (let ii = 0; ii < this.pad_states.length; ++ii) {
        if (this.padUpHit(ii, padindex)) {
          return true;
        }
      }
      return false;
    }

    if (!this.pad_states[padindex]) {
      return false;
    }
    if (padcode === this.pad_codes.LEFT && this.padUpHit(padindex, this.pad_codes.ANALOG_LEFT)) {
      return true;
    }
    if (padcode === this.pad_codes.RIGHT && this.padUpHit(padindex, this.pad_codes.ANALOG_RIGHT)) {
      return true;
    }
    if (padcode === this.pad_codes.UP && this.padUpHit(padindex, this.pad_codes.ANALOG_UP)) {
      return true;
    }
    if (padcode === this.pad_codes.DOWN && this.padUpHit(padindex, this.pad_codes.ANALOG_DOWN)) {
      return true;
    }
    if (this.pad_states[padindex][padcode] === UP_EDGE) {
      delete this.pad_states[padindex][padcode];
      return true;
    }
    return false;
  }

}

export function create(...args) {
  return new GlovInput(...args);
}
