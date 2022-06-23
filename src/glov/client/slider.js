import * as assert from 'assert';
const { round, max } = Math;
import { clamp } from 'glov/common/util.js';
import { vec4 } from 'glov/common/vmath.js';
import * as input from './input.js';
import { Z_MIN_INC, drawHBox, playUISound } from './ui.js';
import * as ui from './ui.js';

let slider_default_vshrink = 1.0;
let slider_default_handle_shrink = 1.0;
export function sliderSetDefaultShrink(vshrink, handle_shrink) {
  slider_default_vshrink = vshrink;
  slider_default_handle_shrink = handle_shrink;
}
const color_slider_handle = vec4(1,1,1,1);
const color_slider_handle_grab = vec4(0.5,0.5,0.5,1);
const color_slider_handle_over = vec4(0.75,0.75,0.75,1);
// TODO: Can we combine these two into sliderIsFocused instead?
let slider_dragging = false; // for caller polling
let slider_rollover = false; // for caller polling
export function sliderIsDragging() {
  return slider_dragging;
}
export function sliderIsRollver() {
  return slider_rollover;
}
// Returns new value
export function slider(value, param) {
  // required params
  assert(typeof param.x === 'number');
  assert(typeof param.y === 'number');
  assert(param.min < param.max); // also must be numbers
  // optional params
  param.z = param.z || Z.UI;
  param.w = param.w || ui.button_width;
  param.h = param.h || ui.button_height;
  param.max_dist = param.max_dist || Infinity;
  let vshrink = param.vshrink || slider_default_vshrink;
  let handle_shrink = param.handle_shrink || slider_default_handle_shrink;
  let disabled = param.disabled || false;
  let handle_h = param.h * handle_shrink;
  let handle_w = ui.sprites.slider_handle.uidata.wh[0] * handle_h;

  slider_dragging = false;

  let shrinkdiff = handle_shrink - vshrink;
  drawHBox({
    x: param.x + param.h * shrinkdiff/2,
    y: param.y + param.h * (1 - vshrink)/2,
    z: param.z,
    w: param.w - param.h * shrinkdiff,
    h: param.h * vshrink,
  }, ui.sprites.slider, param.color);

  let xoffs = round(max(ui.sprites.slider.uidata.wh[0] * param.h * vshrink, handle_w) / 2);
  let draggable_width = param.w - xoffs * 2;

  // Draw notches - would also need to quantize the values below
  // if (!slider->no_notches) {
  //   float space_for_notches = width - xoffs * 4;
  //   int num_notches = max - 1;
  //   float notch_w = tile_scale * glov_ui_slider_notch->GetTileWidth();
  //   float notch_h = tile_scale * glov_ui_slider_notch->GetTileHeight();
  //   float max_notches = space_for_notches / (notch_w + 2);
  //   int notch_inc = 1;
  //   if (num_notches > max_notches)
  //     notch_inc = ceil(num_notches / floor(max_notches));

  //   for (int ii = 1; ii*notch_inc <= num_notches; ii++) {
  //     float notch_x_mid = x + xoffs + draggable_width * ii * notch_inc / (float)max;
  //     if (notch_x_mid - notch_w/2 < x + xoffs * 2)
  //       continue;
  //     if (notch_x_mid + notch_w/2 > x + width - xoffs * 2)
  //       continue;
  //     glov_ui_slider_notch->DrawStretchedColor(notch_x_mid - notch_w / 2, y + yoffs,
  //       z + 0.25, notch_w, notch_h, 0, color);
  //   }
  // }

  // Handle
  let drag = !disabled && input.drag(param);
  let grabbed = Boolean(drag);
  let click = input.click(param);
  if (click) {
    grabbed = false;
    // update pos
    value = (click.pos[0] - (param.x + xoffs)) / draggable_width;
    value = param.min + (param.max - param.min) * clamp(value, 0, 1);
    playUISound('button_click');
  } else if (grabbed) {
    // update pos
    value = (drag.cur_pos[0] - (param.x + xoffs)) / draggable_width;
    value = param.min + (param.max - param.min) * clamp(value, 0, 1);
    // Eat all mouseovers while dragging
    input.mouseOver();
    slider_dragging = true;
  }
  let rollover = !disabled && input.mouseOver(param);
  slider_rollover = rollover;
  let handle_center_pos = param.x + xoffs + draggable_width * (value - param.min) / (param.max - param.min);
  let handle_x = handle_center_pos - handle_w / 2;
  let handle_y = param.y + param.h / 2 - handle_h / 2;
  let handle_color = color_slider_handle;
  if (grabbed) {
    handle_color = color_slider_handle_grab;
  } else if (rollover) {
    handle_color = color_slider_handle_over;
  }

  ui.sprites.slider_handle.draw({
    x: handle_x,
    y: handle_y,
    z: param.z + Z_MIN_INC,
    w: handle_w,
    h: handle_h,
    color: handle_color,
    frame: 0,
  });

  return value;
}
