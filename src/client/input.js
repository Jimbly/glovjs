
const UP_EDGE = 0;
const DOWN_EDGE = 1;
const DOWN = 2;

class GlovInput {
  constructor(input_device, draw2d) {
    this.input_device = input_device;
    this.draw2d = draw2d;
    this.key_state = {};
    this.mouse_x = 0;
    this.mouse_y = 0;
    this.mouse_mapped = [0,0];
    this.mouse_over_captured = false;

    input_device.addEventListener('keydown', keycode => this.onKeyDown(keycode));
    input_device.addEventListener('keyup', keycode => this.onKeyUp(keycode));

    input_device.addEventListener('mousedown', (mousecode, x, y) => this.onMouseDown(mousecode, x, y));
    input_device.addEventListener('mouseup', (mousecode, x, y) => this.onMouseUp(mousecode, x, y));
    input_device.addEventListener('mouseover', (x,y) => this.onMouseOver(x, y));
  }
  tick() {
    this.mouse_over_captured = false;
    // TODO: click logic: click got set during the last frame,
    // need to leave it there and clear it if it was not reset on the next frame
    this.click = null;
    Object.keys(this.key_state).forEach(keycode => {
      switch(this.key_state[keycode]) {
        case DOWN_EDGE:
          this.key_state[keycode] = DOWN;
          break;
        case UP_EDGE:
          delete this.key_state[keycode];
          break;
      }
    });
  }
  onKeyUp(keycode) {
    this.key_state[keycode] = UP_EDGE;
  }
  onKeyDown(keycode) {
    this.key_state[keycode] = DOWN_EDGE;
  }
  onMouseDown(mousecode, x, y) {
    this.onMouseOver(x, y); // update this.mouse_mapped
  }
  onMouseUp(mousecode, x, y) {
    this.onMouseOver(x, y); // update this.mouse_mapped
  }
  onMouseOver(x, y) {
    this.mouse_x = x;
    this.mouse_y = y;
    this.draw2d.viewportMap(x, y, this.mouse_mapped);
  }

  isMouseOver(x, y, w, h) {
    if (this.mouse_over_captured) {
      return false;
    }
    if (this.mouse_mapped[0] >= x && this.mouse_mapped[0] < x + w &&
      this.mouse_mapped[1] >= y && this.mouse_mapped[1] < y + h
    ) {
      this.mouse_over_captured = true;
      return true;
    }
    return false;
  }
  isMouseOverSprite(sprite) {
    const w = sprite.getWidth();
    const h = sprite.getHeight();
    return this.isMouseOver(sprite.x - w/2, sprite.y - h/2, w, h);
  }
  clickHit(x, y, w, h) {
  }
  clickHitSprite(sprite) {
    const w = sprite.getWidth();
    const h = sprite.getHeight();
    return this.clickHit(sprite.x - w/2, sprite.y - h/2, w, h);
  }

  isKeyDown(keycode) {
    return !!this.key_state[keycode];
  }
  keyDownHit(keycode) {
    if (this.key_state[keycode] === DOWN_EDGE) {
      this.key_state[keycode] = DOWN;
    }
  }
  keyUpHit(keycode) {
    if (this.key_state[keycode] === UP_EDGE) {
      delete this.key_state[keycode];
    }
  }
}

export function create(input_device, draw2d) {
  return new GlovInput(input_device, draw2d);
}
