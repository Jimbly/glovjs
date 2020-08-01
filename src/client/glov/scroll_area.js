// Portions Copyright 2020 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

// This is ported pretty directly from libGLOV, could really use a fresh
//   implementation that is more focus aware and gamepad friendly, and should
//   use ui.buttonShared logic.

const assert = require('assert');
const camera2d = require('./camera2d.js');
const engine = require('./engine.js');
const input = require('./input.js');
const { max, min } = Math;
const ui = require('./ui.js');
const { clamp } = require('../../common/util.js');
const { vec2, vec4 } = require('./vmath.js');

const MAX_OVERSCROLL = 50;

function darken(color, factor) {
  return vec4(color[0] * factor, color[1] * factor, color[2] * factor, color[3]);
}

function ScrollArea(params) {
  // configuration options
  this.x = 0;
  this.y = 0;
  this.z = Z.UI; // actually in DOM, so above everything!
  this.w = 10;
  this.h = 10; // height of visible area, not scrolled area
  this.rate_scroll_click = ui.font_height;
  this.pixel_scale = 1;
  this.top_pad = true; // set to false it the top/bottom "buttons" don't look like buttons
  this.color = vec4(1,1,1,1);
  this.background_color = vec4(0.8, 0.8, 0.8, 1); // can be null
  this.applyParams(params);

  // Calculated (only once) if not set
  this.rate_scroll_wheel = this.rate_scroll_wheel || this.rate_scroll_click * 2;
  this.rollover_color = this.rollover_color || darken(this.color, 0.5);
  this.rollover_color_light = this.rollover_color_light || darken(this.color, 0.75);
  this.disabled_color = this.disabled_color || this.rollover_color;

  // run-time state
  this.scroll_pos = 0;
  this.overscroll = 0; // overscroll beyond beginning or end
  this.grabbed_pos = 0;
  this.grabbed = false;
  this.began = false;
}

ScrollArea.prototype.applyParams = function (params) {
  if (!params) {
    return;
  }
  for (let f in params) {
    this[f] = params[f];
  }
};

ScrollArea.prototype.begin = function (params) {
  this.applyParams(params);
  let { x, y } = this;
  assert(!this.began); // Checking mismatched begin/end
  this.began = true;
  // Set up camera and clippers
  let camera_orig_x0 = camera2d.x0();
  let camera_orig_x1 = camera2d.x1();
  let camera_orig_y0 = camera2d.y0();
  let camera_orig_y1 = camera2d.y1();
  // map (0,0) onto (x,y) in the current camera space, keeping w/h scale the same
  let camera_new_x0 = -(x - camera_orig_x0);
  let camera_new_y0 = -(y - camera_orig_y0) + this.scroll_pos;
  let camera_new_x1 = camera_new_x0 + camera_orig_x1 - camera_orig_x0;
  let camera_new_y1 = camera_new_y0 + camera_orig_y1 - camera_orig_y0;
  // shift by overscroll
  camera_new_y0 += this.overscroll;
  camera_new_y1 += this.overscroll;
  camera2d.push();
  camera2d.set(camera_new_x0, camera_new_y0, camera_new_x1, camera_new_y1);
  // TODO spriteListClipperPush(0, this.scroll_pos + (int)this.overscroll, w - scrollbar_top->GetTileWidth() * pixel_scale, h);
};

let temp_pos = vec2();
// h is height all members in the scroll area (can be more or less than visible height)
ScrollArea.prototype.end = function (h) {
  //ScrollAreaDisplay *display = OR(this.display, &scroll_area_display_default);
  assert(h >= 0);
  h = max(h, 1); // prevent math from going awry on height of 0
  assert(this.began); // Checking mismatched begin/end
  this.began = false;
  // restore camera and clippers
  camera2d.pop();
  // TODO spriteListClipperPop();

  if (this.scroll_pos > h - this.h) {
    // internal height must have shrunk
    this.scroll_pos = max(0, h - this.h+1);
  }
  if (this.overscroll) {
    this.overscroll = this.overscroll * max(1 - 8*engine.getFrameDt() * 0.001, 0);
  }

  let {
    pixel_scale,
    rollover_color,
    rollover_color_light,
  } = this;

  let {
    scrollbar_top, scrollbar_bottom, scrollbar_trough, scrollbar_handle, scrollbar_handle_grabber
  } = ui.sprites;

  let bar_w = scrollbar_top.uidata.total_w * pixel_scale;
  let button_h = min(scrollbar_top.uidata.total_h * pixel_scale, this.h / 3);
  let button_h_nopad = this.top_pad ? button_h : 0;
  let bar_x0 = this.x + this.w - bar_w;
  let handle_h = this.h / h; // How much of the area is visible
  handle_h = clamp(handle_h, 0, 1);
  let handle_pos = (this.h > h) ? 0 : (this.scroll_pos / (h - this.h));
  handle_pos = clamp(handle_pos, 0, 1);
  let handle_pixel_h = handle_h * (this.h - button_h_nopad * 2);
  let handle_pixel_min_h = scrollbar_handle.uidata.total_h * pixel_scale;
  handle_pixel_h = max(handle_pixel_h, min(handle_pixel_min_h, button_h / 2));
  let handle_screenpos = this.y + button_h_nopad + handle_pos * (this.h - button_h_nopad * 2 - handle_pixel_h);
  let top_color = this.color;
  let bottom_color = this.color;
  let handle_color = this.color;
  let trough_color = this.color;
  let disabled = false;
  if (handle_h === 1) {
    disabled = true;
  }

  // Handle UI interactions
  if (disabled) {
    trough_color = top_color = bottom_color = handle_color = this.disabled_color;
  } else {
    // handle scroll wheel
    // TODO: positional mouseWheel events!
    let wheel_delta = input.mouseWheel({
      x: this.x,
      y: this.y,
      w: this.w,
      h: this.h
    });
    this.scroll_pos -= this.rate_scroll_wheel * wheel_delta;

    // handle drag of handle
    // before end buttons, as those might be effectively hidden in some UIs
    let down = input.mouseDownEdge({
      x: bar_x0,
      y: handle_screenpos,
      w: bar_w,
      h: handle_pixel_h,
      button: 0
    });
    if (down) {
      this.grabbed_pos = (down.pos[1] - handle_screenpos);
      this.grabbed = true;
      handle_color = rollover_color_light;
    }
    let up = this.grabbed && input.mouseUpEdge({ button: 0 });
    if (up) {
      this.grabbed = false;
      // update pos
      let delta = up.pos[1] - (this.y + button_h_nopad) - this.grabbed_pos;
      this.scroll_pos = (h - this.h) * delta / (this.h - button_h_nopad * 2 - handle_pixel_h);
      handle_color = rollover_color_light;
    }
    if (this.grabbed && !input.mouseDown(0)) { // released but someone else ate it, release anyway!
      this.grabbed = false;
    }
    if (this.grabbed) {
      // update pos
      input.mousePos(temp_pos);
      let delta = temp_pos[1] - (this.y + button_h_nopad) - this.grabbed_pos;
      this.scroll_pos = (h - this.h) * delta / (this.h - button_h_nopad * 2 - handle_pixel_h);
      handle_color = rollover_color_light;
    }
    if (input.mouseOver({
      x: bar_x0,
      y: handle_screenpos,
      w: bar_w,
      h: handle_pixel_h
    })) {
      if (handle_color !== rollover_color_light) {
        handle_color = rollover_color;
      }
    }

    // handle clicking on end buttons
    let button_param = {
      x: bar_x0,
      y: this.y,
      w: bar_w,
      h: button_h,
      button: 0
    };
    while (input.mouseUpEdge(button_param)) {
      top_color = rollover_color;
      this.scroll_pos -= this.rate_scroll_click;
    }
    if (input.mouseOver(button_param)) {
      top_color = rollover_color;
    }
    button_param.y = this.y + this.h - button_h;
    while (input.mouseUpEdge(button_param)) {
      bottom_color = rollover_color;
      this.scroll_pos += this.rate_scroll_click;
    }
    if (input.mouseOver(button_param)) {
      bottom_color = rollover_color;
    }

    // handle clicking trough if not caught by anything above +/-
    let click;
    while ((click = input.mouseUpEdge({
      x: bar_x0,
      y: this.y,
      w: bar_w,
      h: this.h,
      button: 0
    }))) {
      if (click.pos[1] > handle_screenpos + handle_pixel_h/2) {
        this.scroll_pos += this.h;
      } else {
        this.scroll_pos -= this.h;
      }
    }
  }

  let maxvalue = max(h - this.h+1, 0);
  let clamped_pos = clamp(this.scroll_pos, 0, maxvalue);
  if (this.scroll_pos < 0) {
    this.overscroll = max(this.scroll_pos, -MAX_OVERSCROLL);
  } else if (this.scroll_pos > maxvalue) {
    this.overscroll = min(this.scroll_pos - maxvalue, MAX_OVERSCROLL);
  }
  this.scroll_pos = clamped_pos;

  if (this.background_color) {
    ui.drawRect(this.x, this.y, this.x + this.w, this.y + this.h, this.z, this.background_color);
  }

  scrollbar_top.draw({
    x: bar_x0, y: this.y, z: this.z + 0.2,
    w: bar_w, h: button_h,
    color: top_color,
  });
  scrollbar_bottom.draw({
    x: bar_x0, y: this.y + this.h - button_h, z: this.z + 0.2,
    w: bar_w, h: button_h,
    color: bottom_color,
  });
  scrollbar_trough.draw({
    x: bar_x0, y: this.y + button_h / 2, z: this.z+0.1,
    w: bar_w, h: this.h - button_h,
    color: trough_color,
  });

  ui.drawVBox({
    x: bar_x0, y: handle_screenpos, z: this.z + 0.3,
    w: bar_w, h: handle_pixel_h,
  }, scrollbar_handle, handle_color);
  let grabber_h = scrollbar_handle_grabber.uidata.total_h * pixel_scale;
  scrollbar_handle_grabber.draw({
    x: bar_x0, y: handle_screenpos + (handle_pixel_h - grabber_h) / 2, z: this.z + 0.4,
    w: bar_w, h: grabber_h,
    color: handle_color,
  });
};

// h is height of visible area
ScrollArea.prototype.scrollIntoFocus = function (miny, maxy, h) {
  let old_scroll_pos = this.scroll_pos;
  let changed = false;
  miny = max(miny, 0);
  if (miny < this.scroll_pos) {
    this.scroll_pos = miny;
    changed = true;
  }
  maxy -= h;
  if (maxy > this.scroll_pos) {
    this.scroll_pos = maxy;
    changed = true;
  }
  if (changed) {
    // Make it smooth/bouncy a bit
    this.overscroll = old_scroll_pos - this.scroll_pos;
  }
};

export function scrollAreaCreate(params) {
  return new ScrollArea(params);
}
