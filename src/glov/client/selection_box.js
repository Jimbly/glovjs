// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
/* eslint complexity:off */

// eslint-disable-next-line no-use-before-define
exports.create = selectionBoxCreate;

import * as assert from 'assert';
const { min, max, round, sin } = Math;
import { clamp, cloneShallow, easeIn, merge, nearSame } from 'glov/common/util.js';
import { v4copy, vec4 } from 'glov/common/vmath.js';
import * as camera2d from './camera2d.js';
import * as glov_engine from './engine.js';
import * as glov_font from './font.js';
import * as glov_input from './input.js';
import {
  KEYS,
  PAD,
  keyDownEdge,
  mouseButtonHadUpEdge,
  padButtonDown,
  padButtonDownEdge,
} from './input.js';
import { link } from './link.js';
import { scrollAreaCreate } from './scroll_area.js';
import {
  SPOT_DEFAULT_BUTTON,
  SPOT_NAV_DOWN,
  SPOT_NAV_LEFT,
  SPOT_NAV_RIGHT,
  SPOT_NAV_UP,
  SPOT_STATE_DISABLED,
  SPOT_STATE_DOWN,
  SPOT_STATE_FOCUSED,
  SPOT_STATE_REGULAR,
  spot,
  spotFocusSteal,
  spotPadMode,
  spotSubPop,
  spotSubPush,
} from './spot.js';
import { clipPause, clipResume, clipped } from './sprites.js';
import { playUISound } from './ui.js';
import * as glov_ui from './ui.js';

let glov_markup = null; // Not ported

let last_key_id = 0;

let font;

const selbox_font_style_default = glov_font.style(null, {
  color: 0xDFDFDFff,
});

const selbox_font_style_selected = glov_font.style(null, {
  color: 0xFFFFFFff,
});

const selbox_font_style_down = glov_font.style(null, {
  color: 0x000000ff,
});

const selbox_font_style_disabled = glov_font.style(null, {
  color: 0x808080ff,
});

const pad = 8;

const color_white = vec4(1, 1, 1, 1);

let color_temp_fade = vec4(1,1,1,1);
export function selboxDefaultDrawItemBackground({
  item_idx, item,
  x, y, z,
  w, h,
  image_set, color,
  image_set_extra, image_set_extra_alpha,
}) {
  glov_ui.drawHBox({ x, y, z, w, h },
    image_set, color);
  if (image_set_extra && image_set_extra_alpha) {
    v4copy(color_temp_fade, color);
    color_temp_fade[3] *= easeIn(image_set_extra_alpha, 2);
    glov_ui.drawHBox({ x, y, z: z + 0.001, w, h },
      image_set_extra, color_temp_fade);
  }
}

export function selboxDefaultDrawItemText({
  item_idx, item,
  x, y, z,
  w, h,
  display,
  font_height,
  style,
}) {
  let text_z = z + 1;
  // spriteListClipperPush(x, y + yoffs, eff_width - pad, h);
  let did_tab = false;
  if (display.tab_stop) {
    let str = item.name;
    let tab_idx = str.indexOf('\t');
    if (tab_idx !== -1) {
      did_tab = true;
      let pre = str.slice(0, tab_idx);
      let post = str.slice(tab_idx + 1);
      let x1 = x + display.xpad;
      let x2 = x + display.xpad + display.tab_stop + pad;
      let w1 = display.tab_stop;
      let w2 = w - display.tab_stop - display.xpad * 2 - pad;
      if (display.use_markup) {
        let md = {};
        md.align = glov_font.ALIGN.HFIT;
        md.x_size = md.y_size = font_height;
        md.w = w1;
        md.h = 1;
        md.style = style;
        glov_markup.print(md, x1, y, text_z, pre);
        md.w = w2;
        glov_markup.print(md, x2, y, text_z, post);
      } else {
        font.drawSizedAligned(style, x1, y, text_z, font_height,
          glov_font.ALIGN.HFIT | glov_font.ALIGN.VCENTER,
          w1, h, pre);
        font.drawSizedAligned(style, x2, y, text_z, font_height,
          glov_font.ALIGN.HFIT | glov_font.ALIGN.VCENTER,
          w2, h, post);
      }
    }
  }
  if (!did_tab) {
    let md = {};
    md.align = (item.centered || display.centered ? glov_font.ALIGN.HCENTERFIT : glov_font.ALIGN.HFIT) |
      glov_font.ALIGN.VCENTER;
    md.x_size = md.y_size = font_height;
    md.w = w - display.xpad * 2;
    md.h = h;
    md.style = style;
    let xx = x + display.xpad;
    if (display.use_markup) {
      glov_markup.print(md, xx, y, text_z, item.name);
    } else {
      font.drawSizedAligned(md.style, xx, y, text_z, md.x_size,
        md.align, md.w, md.h, item.name);
    }
  }
  // spriteListClipperPop();
  // if (display.selection_highlight && this.selected === i && show_selection) {
  //   let grow = 0.2 * (1 - bounce_amt);
  //   display.selection_highlight.DrawStretched(
  //     x - grow * w, y - grow * h, text_z + 1.5,
  //     w * (1 + 2 * grow), h * (1 + 2 * grow), 0, 0xFF);
  // }
}

export function selboxDefaultDrawItem(param) {
  selboxDefaultDrawItemBackground(param);
  selboxDefaultDrawItemText(param);
}


export const default_display = {
  style_default: selbox_font_style_default,
  style_selected: selbox_font_style_selected,
  style_disabled: selbox_font_style_disabled,
  style_down: selbox_font_style_down,
  color_default: color_white,
  color_selected: color_white,
  color_disabled: color_white,
  color_down: color_white,
  no_background: false,
  // old: no_buttons: false, instead pass `nop` to draw_cb
  draw_item_cb: selboxDefaultDrawItem,
  centered: false,
  bounce: true,
  tab_stop: 0,
  xpad: 8,
  selection_fade: Infinity, // alpha per millisecond
  // selection_highlight: null, // TODO: custom / better selection highlight for menus
  use_markup: false, // always false, Markup not ported
};


const color_gray50 = vec4(0.313, 0.313, 0.313, 1.000);
const color_gray80 = vec4(0.500, 0.500, 0.500, 1.000);
const color_grayD0 = vec4(0.816, 0.816, 0.816, 1.000);
const COLORS = {
  [SPOT_STATE_REGULAR]: color_white,
  [SPOT_STATE_DOWN]: color_grayD0,
  [SPOT_STATE_FOCUSED]: color_grayD0,
  [SPOT_STATE_DISABLED]: color_gray80,
};

const SELBOX_BOUNCE_TIME = 80;

// Used by GlovSimpleMenu and GlovSelectionBox and GlovDropDown
export class GlovMenuItem {
  constructor(params) {
    params = params || {};
    if (params instanceof GlovMenuItem) {
      for (let field in params) {
        this[field] = params[field];
      }
      return;
    }
    if (typeof params === 'string') {
      params = { name: params };
    }
    this.name = params.name || 'NO_NAME'; // name to display
    this.state = params.state || null; // state to set upon selection
    this.cb = params.cb || null; // callback to call upon selection
    // TODO - cb function on value change?
    this.value = params.value === undefined ? null : params.value; // can be number or string
    this.value_min = params.value_min || 0;
    this.value_max = params.value_max || 0;
    this.value_inc = params.value_inc || 0;
    this.href = params.href || null; // for links
    this.tag = params.tag || null; // for isSelected(tag)
    this.style = params.style || null;
    // was bitmask
    this.exit = Boolean(params.exit);
    this.prompt_int = Boolean(params.prompt_int);
    this.prompt_string = Boolean(params.prompt_string);
    this.no_sound = Boolean(params.no_sound);
    this.slider = Boolean(params.slider);
    this.no_controller_exit = Boolean(params.no_controller_exit);
    this.plus_minus = Boolean(params.plus_minus);
    this.disabled = Boolean(params.disabled);
    this.centered = Boolean(params.centered);
    this.selection_alpha = 0;
  }
}


class GlovSelectionBox {
  constructor(params) {
    assert(!params.is_dropdown, 'Use dropDownCreate() instead');
    // Options (and defaults)
    this.x = 0;
    this.y = 0;
    this.z = Z.UI;
    this.width = glov_ui.button_width;
    this.items = [];
    this.is_dropdown = false;
    this.transient_focus = false;
    this.disabled = false;
    this.display = cloneShallow(default_display);
    this.scroll_height = 0;
    this.font_height = glov_ui.font_height;
    this.entry_height = glov_ui.button_height;
    this.auto_reset = true;
    this.auto_unfocus = true;
    this.reset_selection = false;
    this.initial_selection = 0;
    this.applyParams(params);

    // Run-time state
    this.dropdown_visible = false;
    this.selected = 0;
    this.was_clicked = false;
    this.was_right_clicked = false;
    this.is_focused = false;
    this.dummy_focus_check = { selbox_dummy: 1 };
    this.mouse_mode = false;
    this.last_mousex = 0;
    this.last_mousey = 0;
    this.bounce_time = 0;
    this.expected_frame_index = 0;
    this.pre_dropdown_selection = undefined;
    if (this.is_dropdown || this.scroll_height) {
      this.sa = scrollAreaCreate({
        focusable_elem: this,
        //background_color: null,
      });
    }
  }

  applyParams(params) {
    if (!params) {
      return;
    }
    for (let f in params) {
      if (f === 'items') {
        this.items = params.items.map((item) => new GlovMenuItem(item));
      } else if (f === 'display') {
        merge(this.display, params[f]);
      } else {
        this[f] = params[f];
      }
    }
  }

  isSelected(tag_or_index) {
    if (typeof tag_or_index === 'number') {
      return this.selected === tag_or_index;
    }
    return this.items[this.selected].tag === tag_or_index;
  }

  getSelected() {
    return this.items[this.selected];
  }

  getHeight() {
    let { display, entry_height } = this;
    if (this.is_dropdown) {
      return entry_height + 2;
    }
    let list_height = this.items.length * entry_height;
    let do_scroll = this.scroll_height && this.items.length * entry_height > this.scroll_height;
    if (do_scroll) {
      list_height = this.scroll_height;
    }
    list_height += 2;
    if (!display.no_background) {
      list_height += 4;
    }
    return list_height + 3;
  }

  focus() {
    glov_ui.focusSteal(this);
    this.is_focused = true;
  }

  run(params) {
    this.applyParams(params);
    let { x, y, z, width, font_height, entry_height, auto_reset } = this;

    if (this.reset_selection || auto_reset && this.expected_frame_index !== glov_engine.getFrameIndex()) {
      this.reset_selection = false;
      // Reset
      if (this.items[this.initial_selection] && !this.items[this.initial_selection].disabled) {
        this.selected = this.initial_selection;
      } else {
        // Selection out of range or disabled, select first non-disabled entry
        for (let ii = 0; ii < this.items.length; ++ii) {
          if (!this.items[ii].disabled) {
            this.selected = ii;
            break;
          }
        }
      }
    }

    if (this.pre_dropdown_selection !== undefined && this.pre_dropdown_selection > this.items.length) {
      this.pre_dropdown_selection = undefined;
    }

    let y0 = y;
    let yret;
    let display = this.display;
    this.was_clicked = false;
    this.was_right_clicked = false;
    let pos_changed = false;

    let was_focused = this.is_focused;
    // Trick to detect if we gained focus from ahead or behind of ourselves, for transient_focus mode
    let gained_focus_forward = false;
    if (!this.disabled && !this.is_focused) {
      gained_focus_forward = glov_ui.focusCheck(this.dummy_focus_check);
      if (gained_focus_forward) {
        glov_ui.focusSteal(this);
      }
    }

    let old_sel = this.selected;
    let focused = this.is_focused = this.disabled ? false : glov_ui.focusCheck(this);
    let gained_focus = focused && !was_focused;

    if (this.dropdown_visible && (!focused ||
      focused && glov_input.keyDownEdge(KEYS.ESC)
    )) {
      if (this.pre_dropdown_selection !== undefined) {
        // Restore selection to before opening the dropdown
        this.selected = this.pre_dropdown_selection;
        this.pre_dropdown_selection = undefined;
      }
      this.dropdown_visible = false;
    }

    let num_non_disabled_selections = 0;
    let eff_sel = -1;
    for (let ii = 0; ii < this.items.length; ++ii) {
      let item = this.items[ii];
      if (!item.disabled) {
        if (eff_sel === -1 && this.selected <= ii) {
          eff_sel = num_non_disabled_selections;
        }
        num_non_disabled_selections++;
      }
    }
    // This is OK, can have an empty selection box: assert(num_non_disabled_selections);
    if (eff_sel === -1) {
      // perhaps had the end selected, and selection became smaller
      eff_sel = 0;
    }

    if (this.transient_focus && gained_focus) {
      if (gained_focus_forward) {
        eff_sel = 0;
      } else {
        eff_sel = num_non_disabled_selections - 1;
      }
      pos_changed = true;
    }

    if (!this.is_dropdown && !display.no_background) {
      let bg_height = this.getHeight();
      if (focused) {
        glov_ui.drawRect(x, y, x + width, y + bg_height - 2, z, color_white);
        y += 2;
        x += 2;
        width -= 4;
        glov_ui.drawRect(x, y, x + width, y + bg_height - 6, z+0.1, color_gray50);
        y += 2;
        x += 2;
        width -= 4;
      } else {
        glov_ui.drawRect(x, y, x + width, y + bg_height - 2, z, color_gray50);
        y += 4;
        x += 4;
        width -= 8;
      }
    }

    let scroll_height = this.scroll_height;
    if (!scroll_height && this.is_dropdown) {
      scroll_height = camera2d.y1() - (y + entry_height);
    }
    let page_size = (scroll_height - 1) / entry_height;

    if (focused) {
      let non_mouse_interact = false;
      let pad_shift = glov_input.padButtonDown(PAD.RIGHT_TRIGGER) || glov_input.padButtonDown(PAD.LEFT_TRIGGER);
      let value = glov_input.keyDownEdge(KEYS.PAGEDOWN) +
        (pad_shift ? glov_input.padButtonDownEdge(PAD.DOWN) : 0);
      if (value) {
        eff_sel += page_size * value;
        eff_sel = min(eff_sel, num_non_disabled_selections - 1);
        non_mouse_interact = true;
      }
      value = glov_input.keyDownEdge(KEYS.PAGEUP) +
        (pad_shift ? glov_input.padButtonDownEdge(PAD.UP) : 0);
      if (value) {
        eff_sel -= page_size * value;
        eff_sel = max(eff_sel, 0);
        non_mouse_interact = true;
      }
      value = glov_input.keyDownEdge(KEYS.DOWN) +
        glov_input.keyDownEdge(KEYS.S) +
        glov_input.padButtonDownEdge(PAD.DOWN);
      if (value) {
        eff_sel+=value;
        non_mouse_interact = true;
      }
      value = glov_input.keyDownEdge(KEYS.UP) +
        glov_input.keyDownEdge(KEYS.W) +
        glov_input.padButtonDownEdge(PAD.UP);
      if (value) {
        eff_sel-=value;
        non_mouse_interact = true;
      }
      if (glov_input.keyDownEdge(KEYS.HOME)) {
        eff_sel = 0;
        non_mouse_interact = true;
      }
      if (glov_input.keyDownEdge(KEYS.END)) {
        eff_sel = num_non_disabled_selections - 1;
        non_mouse_interact = true;
      }
      if (non_mouse_interact) {
        this.mouse_mode = false;
        pos_changed = true;
        if (this.is_dropdown && !this.dropdown_visible) {
          this.was_clicked = true; // trigger value change immediately
        }
      }
      if (glov_input.keyDownEdge(KEYS.SPACE) || glov_input.keyDownEdge(KEYS.ENTER)) {
        if (!this.is_dropdown || this.dropdown_visible) {
          this.was_clicked = true;
        } else {
          this.dropdown_visible = !this.dropdown_visible;
          this.pre_dropdown_selection = this.selected;
        }
      }
    }

    let sel_changed = false;
    if (eff_sel < 0) {
      if (this.transient_focus) {
        eff_sel = 0;
        sel_changed = true;
        glov_ui.focusPrev(this);
      } else {
        if (this.is_dropdown && !this.dropdown_visible) {
          eff_sel = 0;
        } else {
          eff_sel = num_non_disabled_selections - 1;
        }
      }
    }
    if (eff_sel >= num_non_disabled_selections && num_non_disabled_selections) {
      if (this.transient_focus) {
        eff_sel = num_non_disabled_selections - 1;
        sel_changed = true;
        glov_ui.focusNext(this);
      } else {
        if (this.is_dropdown && !this.dropdown_visible) {
          eff_sel = num_non_disabled_selections - 1;
        } else {
          eff_sel = 0;
        }
      }
    }

    // Convert from eff_sel back to actual selection
    for (let ii = 0; ii < this.items.length; ++ii) {
      let item = this.items[ii];
      if (!item.disabled) {
        if (!eff_sel) {
          this.selected = ii;
          break;
        }
        --eff_sel;
      }
    }

    let dropdown_x = x;
    let dropdown_y = y;
    let clip_pause = clipped() && this.is_dropdown && this.dropdown_visible;
    if (clip_pause) {
      clipPause();
    }
    let z_save = z;
    if (this.is_dropdown) {
      z += 1000; // drop-down part should be above everything except tooltips
    }

    if (!this.is_dropdown || this.dropdown_visible) {
      let do_scroll = scroll_height && this.items.length * entry_height > scroll_height;
      let extra_height = this.is_dropdown ? entry_height : 0;
      if (!do_scroll && y + this.items.length * entry_height + extra_height >= camera2d.y1()) {
        y = camera2d.y1() - this.items.length * entry_height;
      } else {
        y += extra_height;
      }
      let y_save = y;
      let x_save = x;
      let scroll_pos = 0;
      let eff_width = width;
      if (do_scroll) {
        if (pos_changed) {
          // ensure part of visible scroll area includes the current selection
          let buffer = min(1.5 * entry_height, (scroll_height - entry_height) / 2);
          this.sa.scrollIntoFocus(this.selected * entry_height - buffer,
            min(this.items.length * entry_height,
              (this.selected + 1) * entry_height + buffer),
            scroll_height);
        }
        this.sa.begin({
          x, y, z,
          w: width,
          h: scroll_height,
        });
        scroll_pos = this.sa.getScrollPos();
        y = 0;
        x = 0;
        eff_width = width - this.sa.barWidth();
      }
      let dt = glov_engine.getFrameDt();
      for (let i = 0; i < this.items.length; i++) {
        let item = this.items[i];
        let entry_disabled = item.disabled;
        let image_set = null;
        let image_set_extra = null;
        let image_set_extra_alpha = 0;
        if (item.href) {
          link({
            x, y, w: width, h: entry_height,
            url: item.href,
          });
        }
        if (!this.disabled && !entry_disabled && glov_input.click({
          x, y, w: width, h: entry_height, button: 2,
        })) {
          glov_ui.focusSteal(this);
          this.was_clicked = true;
          this.was_right_clicked = true;
          this.mouse_mode = true;
          this.selected = i;
        }
        if (!this.disabled && !entry_disabled && glov_input.click({
          x, y, w: width, h: entry_height
        })) {
          glov_ui.focusSteal(this);
          this.was_clicked = true;
          this.mouse_mode = true;
          this.selected = i;
        }
        let is_mouseover = false;
        if (!this.disabled && !entry_disabled && glov_input.mouseOver({
          x, y, w: width, h: entry_height
        })) {
          let mpos = glov_input.mousePos();
          is_mouseover = true;
          if (focused || this.transient_focus) {
            if (this.expected_frame_index === glov_engine.getFrameIndex() &&
              (mpos[0] !== this.last_mousex || !nearSame(mpos[1] - scroll_pos, this.last_mousey, 1.25))
            ) {
              this.mouse_mode = true;
              this.selected = i;
            }
            this.last_mousex = mpos[0];
            this.last_mousey = mpos[1] - scroll_pos;
          }
          // Not used anymore because in mouse_mode, rollover *is* selection, don't have two cursors!
          // if (this.mouse_mode) {
          //   text_color = 0x000000ff;
          //   image_set = &menu_rollover;
          // }
        }

        let color;
        let style;
        let show_selection = !this.disabled && (
          !(this.transient_focus && !this.is_focused) && !this.is_dropdown || // show if a non-dropdown that's focused
          is_mouseover || !this.mouse_mode);
        let bounce = false;
        if (this.selected === i && show_selection) {
          style = display.style_selected || selbox_font_style_selected;
          color = display.color_selected || default_display.color_selected;
          item.selection_alpha = clamp(item.selection_alpha + dt * display.selection_fade, 0, 1);
          if (item.selection_alpha === 1) {
            image_set = glov_ui.sprites.menu_selected;
          } else {
            image_set = glov_ui.sprites.menu_entry;
            image_set_extra = glov_ui.sprites.menu_selected;
            image_set_extra_alpha = item.selection_alpha;
          }
          if (is_mouseover && glov_input.mouseDown()) {
            if (glov_ui.sprites.menu_down) {
              image_set = glov_ui.sprites.menu_down;
              if (display.style_down) {
                style = display.style_down;
                color = display.color_down || default_display.color_down;
              }
            } else {
              style = display.style_down || selbox_font_style_down;
              color = display.color_down || default_display.color_down;
            }
          }
          if (display.bounce && !this.is_dropdown) {
            if (this.selected !== old_sel) {
              bounce = true;
              this.bounce_time = SELBOX_BOUNCE_TIME;
            } else if (dt >= this.bounce_time) {
              this.bounce_time = 0;
            } else {
              bounce = true;
              this.bounce_time -= dt;
            }
          }
        } else {
          item.selection_alpha = clamp(item.selection_alpha - dt * display.selection_fade, 0, 1);
          if (item.selection_alpha !== 1) {
            image_set_extra = glov_ui.sprites.menu_selected;
            image_set_extra_alpha = item.selection_alpha;
          }
          if (entry_disabled) {
            style = display.style_disabled || selbox_font_style_disabled;
            color = display.color_disabled || default_display.color_disabled;
            image_set = glov_ui.sprites.menu_entry;
          } else {
            style = item.style || display.style_default || selbox_font_style_default;
            color = display.color_default || default_display.color_default;
            image_set = glov_ui.sprites.menu_entry;
          }
        }
        let yoffs = 0;
        let bounce_amt = 0;
        if (bounce) {
          bounce_amt = sin(this.bounce_time * 20 / SELBOX_BOUNCE_TIME / 10);
          yoffs = -4 * bounce_amt * entry_height / 32;
        }

        display.draw_item_cb({
          item_idx: i, item,
          x, y: y + yoffs, z: z + 1,
          w: eff_width, h: entry_height,
          image_set, color,
          image_set_extra, image_set_extra_alpha,
          font_height,
          display,
          style,
        });

        if (this.was_clicked && this.selected === i && item.href) {
          window.location.href = item.href;
        }
        y += entry_height;
      }
      if (do_scroll) {
        this.sa.end(y);
        y = y_save + scroll_height;
        x = x_save;
      }

      if (this.was_clicked && this.is_dropdown) {
        this.dropdown_visible = false;
      }
    }

    if (clip_pause) {
      clipResume();
    }

    if (this.is_dropdown) {
      z = z_save;
      x = dropdown_x;
      y = dropdown_y;
      // display header
      let color0 = color_white;
      if (this.disabled) {
        color0 = color_gray80;
      }
      // let color1 = color_white;
      // let dropdown_rect = glov_ui.sprites.menu_header.uidata.rects[2];
      // let dropdown_width = (dropdown_rect[2] - dropdown_rect[0]) / (dropdown_rect[3] - dropdown_rect[1]) *
      //   entry_height;
      // let dropdown_x = x + width - dropdown_width;
      //int dropdown_w = glov_ui_menu_header.right.GetTileWidth();
      let dropdown_param = {
        x, y, z: z + 2 - 0.1,
        w: width, h: entry_height,
        disabled: this.disabled,
      };
      let clicked = false;
      if (!this.disabled && glov_input.click(dropdown_param)) {
        glov_ui.focusSteal(this);
        clicked = true;
        this.dropdown_visible = !this.dropdown_visible;
        this.pre_dropdown_selection = this.selected;
        color0 = color_grayD0;
        // color1 = color_gray80;
      } else if (!this.disabled && glov_input.mouseOver({
        x, y, w: width, h: entry_height
      })) {
        glov_ui.setMouseOver(this);
        color0 = color_grayD0;
        // color1 = color_gray80;
      }
      glov_ui.checkHooks(dropdown_param, clicked);
      glov_ui.drawHBox({
        x, y, z: z + 1,
        w: width, h: entry_height
      }, glov_ui.sprites.menu_header, color0); // TODO: only pieces 1 and 2?
      // glov_ui.draw_list.queue(glov_ui.sprites.menu_header,
      //   dropdown_x, y, z + 1.5, color1, [dropdown_width, entry_height, 1, 1],
      //   glov_ui.sprites.menu_header.uidata.rects[2]);
      let eff_selection = this.is_dropdown && this.dropdown_visible && this.pre_dropdown_selection !== undefined ?
        this.pre_dropdown_selection :
        this.selected;
      let align = (display.centered ? glov_font.ALIGN.HCENTER : glov_font.ALIGN.HLEFT) |
        glov_font.ALIGN.HFIT | glov_font.ALIGN.VCENTER;
      font.drawSizedAligned(focused ? glov_ui.font_style_focused : glov_ui.font_style_normal,
        x + display.xpad, y, z + 2,
        font_height, align,
        width - display.xpad - glov_ui.sprites.menu_header.uidata.wh[2] * entry_height, entry_height,
        this.items[eff_selection].name);
      y += entry_height;
      yret = y + 2;
    }

    if (this.selected !== old_sel || sel_changed) {
      playUISound('rollover');
    }

    if (focused && this.auto_unfocus) {
      if (glov_input.click({ peek: true })) {
        glov_ui.focusSteal('canvas');
      }
    }

    this.expected_frame_index = glov_engine.getFrameIndex() + 1;
    x = 10;
    y += 5;
    if (!this.is_dropdown) {
      yret = y;
    }
    assert.equal(yret - y0, this.getHeight());
    return yret - y0;
  }
}

class GlovDropDown {
  constructor(params) {
    assert(!params.is_dropdown, 'Old parameter: is_dropdown');
    assert(!params.auto_unfocus, 'Old parameter: auto_unfocus');
    // Options (and defaults)
    this.key = `dd${++last_key_id}`;
    this.x = 0;
    this.y = 0;
    this.z = Z.UI;
    this.width = glov_ui.button_width;
    this.items = [];
    this.disabled = false;
    this.display = cloneShallow(default_display);
    this.scroll_height = 0;
    this.font_height = glov_ui.font_height;
    this.entry_height = glov_ui.button_height;
    this.auto_reset = true;
    this.reset_selection = false;
    this.initial_selection = 0;
    this.applyParams(params);

    // Run-time state
    this.dropdown_visible = false;
    this.selected = 0;
    this.was_clicked = false;
    this.was_right_clicked = false;
    this.is_focused = false;
    this.bounce_time = 0;
    this.expected_frame_index = 0;
    this.last_selected = undefined;
    this.sa = scrollAreaCreate({
      focusable_elem: this,
      //background_color: null,
    });
  }

  applyParams(params) {
    if (!params) {
      return;
    }
    for (let f in params) {
      if (f === 'items') {
        this.items = params.items.map((item) => new GlovMenuItem(item));
      } else if (f === 'display') {
        merge(this.display, params[f]);
      } else {
        this[f] = params[f];
      }
    }
  }

  isSelected(tag_or_index) {
    if (typeof tag_or_index === 'number') {
      return this.selected === tag_or_index;
    }
    return this.items[this.selected].tag === tag_or_index;
  }

  getSelected() {
    return this.items[this.selected];
  }

  focus() {
    glov_ui.focusSteal(this);
    this.is_focused = true;
  }

  run(params) {
    this.applyParams(params);
    let { x, y, z, width, font_height, entry_height, auto_reset, disabled, key } = this;
    // let { KEYS, PAD } = glov_input;

    if (this.reset_selection || auto_reset && this.expected_frame_index !== glov_engine.getFrameIndex()) {
      this.reset_selection = false;
      // Reset
      if (this.items[this.initial_selection] && !this.items[this.initial_selection].disabled) {
        this.selected = this.initial_selection;
      } else {
        // Selection out of range or disabled, select first non-disabled entry
        for (let ii = 0; ii < this.items.length; ++ii) {
          if (!this.items[ii].disabled) {
            this.selected = ii;
            break;
          }
        }
      }
    }

    if (this.last_selected !== undefined && this.last_selected >= this.items.length) {
      this.last_selected = undefined;
    }

    let y0 = y;
    let yret;
    let display = this.display;
    this.was_clicked = false;
    this.was_right_clicked = false;
    // let pos_changed = false;

    // let old_sel = this.selected;
    let num_non_disabled_selections = 0;
    let first_non_disabled_selection = -1;
    let last_non_disabled_selection = -1;
    let eff_sel = -1;
    for (let ii = 0; ii < this.items.length; ++ii) {
      let item = this.items[ii];
      if (!item.disabled) {
        if (eff_sel === -1 && this.selected <= ii) {
          eff_sel = num_non_disabled_selections;
        }
        if (first_non_disabled_selection === -1) {
          first_non_disabled_selection = ii;
        }
        num_non_disabled_selections++;
        last_non_disabled_selection = ii;
      }
    }
    // This is OK, can have an empty selection box: assert(num_non_disabled_selections);
    if (eff_sel === -1) {
      // perhaps had the end selected, and selection became smaller
      eff_sel = 0;
    }

    // let focused = this.is_focused = disabled ? false : glov_ui.focusCheck(this);
    let root_spot_rect = {
      key,
      disabled,
      x, y,
      z: z + 2 - 0.1, // z used for checkHooks
      w: width, h: entry_height,
      def: SPOT_DEFAULT_BUTTON,
      custom_nav: {
        // left/right toggle the dropdown visibility - maybe make this customizable?
        [SPOT_NAV_RIGHT]: null,
      },
    };
    if (this.dropdown_visible) {
      root_spot_rect.custom_nav[SPOT_NAV_LEFT] = null;
    }
    let root_spot_ret = spot(root_spot_rect);

    let scroll_height = this.scroll_height;
    if (!scroll_height) {
      scroll_height = camera2d.y1() - (y + entry_height);
    }

    let need_focus_steal = false;
    if (root_spot_ret.focused || this.dropdown_visible) {
      let page_size = round((scroll_height - 1) / entry_height);
      let non_mouse_interact = false;
      let pad_shift = padButtonDown(PAD.RIGHT_TRIGGER) || padButtonDown(PAD.LEFT_TRIGGER);
      let value = keyDownEdge(KEYS.PAGEDOWN) +
        (pad_shift ? padButtonDownEdge(PAD.DOWN) : 0);
      if (value) {
        eff_sel += page_size * value;
        eff_sel = min(eff_sel, num_non_disabled_selections - 1);
        non_mouse_interact = true;
      }
      value = keyDownEdge(KEYS.PAGEUP) +
        (pad_shift ? padButtonDownEdge(PAD.UP) : 0);
      if (value) {
        eff_sel -= page_size * value;
        eff_sel = max(eff_sel, 0);
        non_mouse_interact = true;
      }
      if (keyDownEdge(KEYS.HOME)) {
        eff_sel = 0;
        non_mouse_interact = true;
      }
      if (keyDownEdge(KEYS.END)) {
        eff_sel = num_non_disabled_selections - 1;
        non_mouse_interact = true;
      }
      if (non_mouse_interact) {
        if (this.dropdown_visible) {
          need_focus_steal = true;
        } else {
          this.was_clicked = true; // trigger value change immediately
        }
      }
    }

    if (eff_sel < 0) {
      if (!this.dropdown_visible) {
        eff_sel = 0;
      } else {
        eff_sel = num_non_disabled_selections - 1;
      }
    }
    if (eff_sel >= num_non_disabled_selections) {
      if (!this.dropdown_visible && num_non_disabled_selections) {
        eff_sel = num_non_disabled_selections - 1;
      } else {
        eff_sel = 0;
      }
    }

    // Convert from eff_sel back to actual selection
    for (let ii = 0; ii < this.items.length; ++ii) {
      let item = this.items[ii];
      if (!item.disabled) {
        if (!eff_sel) {
          this.selected = ii;
          break;
        }
        --eff_sel;
      }
    }

    let eff_selection = this.dropdown_visible && this.last_selected !== undefined ?
      this.last_selected :
      this.selected;

    if (need_focus_steal) {
      spotFocusSteal({ key: `${key}_${this.selected}` });
    }

    if (this.dropdown_visible && (
      keyDownEdge(KEYS.ESC) || padButtonDownEdge(PAD.B)
    )) {
      this.selected = eff_selection;
      this.dropdown_visible = false;
      spotFocusSteal(root_spot_rect);
    }

    // display header, respond to clicks
    if (root_spot_ret.ret || root_spot_ret.nav) {
      if (root_spot_ret.nav) {
        playUISound('button_click');
      }
      if (this.dropdown_visible) {
        this.selected = eff_selection;
        this.dropdown_visible = false;
      } else {
        this.dropdown_visible = true;
        this.last_selected = this.selected;
        if (spotPadMode()) {
          spotFocusSteal({ key: `${key}_${this.selected}` });
        }
      }
    }
    glov_ui.drawHBox({
      x, y, z: z + 1,
      w: width, h: entry_height
    }, glov_ui.sprites.menu_header, COLORS[root_spot_ret.spot_state]);
    let align = (display.centered ? glov_font.ALIGN.HCENTER : glov_font.ALIGN.HLEFT) |
      glov_font.ALIGN.HFIT | glov_font.ALIGN.VCENTER;
    font.drawSizedAligned(root_spot_ret.focused ? glov_ui.font_style_focused : glov_ui.font_style_normal,
      x + display.xpad, y, z + 2,
      font_height, align,
      width - display.xpad - glov_ui.sprites.menu_header.uidata.wh[2] * entry_height, entry_height,
      this.items[eff_selection].name);
    y += entry_height;
    yret = y + 2;


    if (this.dropdown_visible) {
      z += 1000; // drop-down part should be above everything except tooltips
      let clip_pause = clipped();
      if (clip_pause) {
        clipPause();
      }
      spotSubPush();
      let do_scroll = scroll_height && this.items.length * entry_height > scroll_height;
      if (!do_scroll && y + this.items.length * entry_height >= camera2d.y1()) {
        y = camera2d.y1() - this.items.length * entry_height;
      }
      let eff_width = width;
      if (do_scroll) {
        this.sa.begin({
          x, y, z,
          w: width,
          h: scroll_height,
        });
        y = 0;
        x = 0;
        eff_width = width - this.sa.barWidth();
      }
      let dt = glov_engine.getFrameDt();
      let any_focused = false;
      for (let ii = 0; ii < this.items.length; ii++) {
        let item = this.items[ii];
        let entry_disabled = item.disabled;
        let image_set = null;
        let image_set_extra = null;
        let image_set_extra_alpha = 0;
        if (item.href) {
          link({
            x, y, w: width, h: entry_height,
            url: item.href,
          });
        }
        let entry_spot_rect = {
          def: SPOT_DEFAULT_BUTTON,
          key: `${key}_${ii}`,
          disabled: disabled || entry_disabled,
          disabled_focusable: false,
          x, y, w: width, h: entry_height,
          custom_nav: {
            [SPOT_NAV_RIGHT]: null,
            [SPOT_NAV_LEFT]: null,
          },
        };
        if (ii === first_non_disabled_selection) {
          entry_spot_rect.custom_nav[SPOT_NAV_UP] = `${key}_${last_non_disabled_selection}`;
        }
        if (ii === last_non_disabled_selection) {
          entry_spot_rect.custom_nav[SPOT_NAV_DOWN] = `${key}_${first_non_disabled_selection}`;
        }
        let entry_spot_ret = spot(entry_spot_rect);
        any_focused = any_focused || entry_spot_ret.focused;
        if (entry_spot_ret.nav === SPOT_NAV_RIGHT) {
          // select
          playUISound('button_click');
          entry_spot_ret.ret = true;
        }
        if (entry_spot_ret.ret) {
          // select
          this.was_clicked = true;
          this.was_right_clicked = entry_spot_ret.button === 2;
          this.selected = ii;
          this.dropdown_visible = false;
          spotFocusSteal(root_spot_rect);
        }

        if (entry_spot_ret.focused) {
          this.selected = ii;
        }
        if (entry_spot_ret.nav === SPOT_NAV_LEFT) {
          // cancel
          this.selected = eff_selection;
          this.dropdown_visible = false;
          spotFocusSteal(root_spot_rect);
        }

        let color;
        let style;
        let bounce = false;
        if (entry_spot_ret.spot_state === SPOT_STATE_DOWN || entry_spot_ret.spot_state === SPOT_STATE_FOCUSED) {
          style = display.style_selected || selbox_font_style_selected;
          color = display.color_selected || default_display.color_selected;
          item.selection_alpha = clamp(item.selection_alpha + dt * display.selection_fade, 0, 1);
          if (item.selection_alpha === 1) {
            image_set = glov_ui.sprites.menu_selected;
          } else {
            image_set = glov_ui.sprites.menu_entry;
            image_set_extra = glov_ui.sprites.menu_selected;
            image_set_extra_alpha = item.selection_alpha;
          }
          if (entry_spot_ret.spot_state === SPOT_STATE_DOWN) {
            if (glov_ui.sprites.menu_down) {
              image_set = glov_ui.sprites.menu_down;
              if (display.style_down) {
                style = display.style_down;
                color = display.color_down || default_display.color_down;
              }
            } else {
              style = display.style_down || selbox_font_style_down;
              color = display.color_down || default_display.color_down;
            }
          }
        } else {
          item.selection_alpha = clamp(item.selection_alpha - dt * display.selection_fade, 0, 1);
          if (item.selection_alpha !== 1) {
            image_set_extra = glov_ui.sprites.menu_selected;
            image_set_extra_alpha = item.selection_alpha;
          }
          if (entry_spot_ret.spot_state === SPOT_STATE_DISABLED) {
            style = display.style_disabled || selbox_font_style_disabled;
            color = display.color_disabled || default_display.color_disabled;
            image_set = glov_ui.sprites.menu_entry;
          } else {
            style = item.style || display.style_default || selbox_font_style_default;
            color = display.color_default || default_display.color_default;
            image_set = glov_ui.sprites.menu_entry;
          }
        }
        let yoffs = 0;
        let bounce_amt = 0;
        if (bounce) {
          bounce_amt = sin(this.bounce_time * 20 / SELBOX_BOUNCE_TIME / 10);
          yoffs = -4 * bounce_amt * entry_height / 32;
        }

        display.draw_item_cb({
          item_idx: ii, item,
          x, y: y + yoffs, z: z + 1,
          w: eff_width, h: entry_height,
          image_set, color,
          image_set_extra, image_set_extra_alpha,
          font_height,
          display,
          style,
        });

        if (entry_spot_ret.ret && item.href) {
          window.location.href = item.href;
        }
        y += entry_height;
      }
      if (do_scroll) {
        this.sa.end(y);
      }

      if (this.was_clicked) {
        this.dropdown_visible = false;
      }
      spotSubPop();
      if (clip_pause) {
        clipResume();
      }

      if (!any_focused) {
        // Nothing focused?  Don't preview any current selection.
        this.selected = eff_selection;
      }
      if (!any_focused && !root_spot_ret.focused) {
        // Not focused
        if (
          // Clicked anywhere else?
          mouseButtonHadUpEdge() ||
          // In pad mode
          spotPadMode()
        ) {
          // Cancel and close dropdown
          this.selected = eff_selection;
          this.dropdown_visible = false;
        }
      }
    }

    this.expected_frame_index = glov_engine.getFrameIndex() + 1;
    return yret - y0;
  }
}


export function selectionBoxCreate(params) {
  if (!font) {
    font = glov_ui.font;
  }
  return new GlovSelectionBox(params);
}

export function dropDownCreate(params) {
  if (!font) {
    font = glov_ui.font;
  }
  return new GlovDropDown(params);
}
