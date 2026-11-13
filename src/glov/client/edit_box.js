// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

exports.create = editBoxCreate; // eslint-disable-line @typescript-eslint/no-use-before-define

import assert from 'assert';
import {
  clamp,
  damp,
  trimEnd,
} from 'glov/common/util';
import * as verify from 'glov/common/verify';
import { v2same } from 'glov/common/vmath';
import { is_mobile } from './browser';
import * as camera2d from './camera2d';
import * as engine from './engine';
import {
  getFrameDt,
  platformAdapterGet,
} from './engine';
import {
  eatAllKeyboardInput,
  inputClick,
  inputDrag,
  inputTextInputQueue,
  inputTouchMode,
  keyDownEdge,
  KEYS,
  keyUpEdge,
  MOD_CTRL,
  MOD_SHIFT,
  mouseConsumeClicks,
  mouseDownEdge,
  mouseOver,
  pointerLocked,
  pointerLockEnter,
  pointerLockExit,
} from './input';
import { getStringIfLocalizable } from './localization';
import {
  spotFocusCheck,
  spotFocusSteal,
  spotlog,
  spotSuppressKBNav,
  spotUnfocus,
} from './spot';
import {
  spriteClipPop,
  spriteClipPush,
} from './sprites';
import {
  stb_textedit_char,
  stb_textedit_click,
  stb_textedit_cut,
  stb_textedit_drag,
  STB_TEXTEDIT_GETWIDTH_NEWLINE,
  stb_textedit_key,
  stb_textedit_key_from_input,
  stb_textedit_paste,
  texteditClearUndo,
  texteditHasSelection,
  texteditNewState,
  texteditReplaceEdits,
} from './stb_textedit';
import {
  drawBox,
  drawLine,
  drawRect,
  getUIElemData,
  sprites as ui_sprites,
  uiButtonWidth,
  uiCursorStyle,
  uiFontStyleNormal,
  uiGetDOMElem,
  uiGetDOMTabIndex,
  uiGetFont,
  uiTextHeight,
} from './ui';

const { max, min, floor, round } = Math;

let form_hook_registered = false;
let active_edit_box;
let active_edit_box_frame;

let this_frame_edit_boxes = [];
let last_frame_edit_boxes = [];

export function editBoxTick() {
  let expected_last_frame = engine.frame_index - 1;
  for (let ii = 0; ii < last_frame_edit_boxes.length; ++ii) {
    let edit_box = last_frame_edit_boxes[ii];
    if (edit_box.last_frame < expected_last_frame) {
      edit_box.unrun();
    }
  }
  last_frame_edit_boxes = this_frame_edit_boxes;
  this_frame_edit_boxes = [];
}

function setActive(edit_box) {
  active_edit_box = edit_box;
  active_edit_box_frame = engine.frame_index;
  let virt = [0,0];
  const REQ_PAD = 20;
  camera2d.domDeltaToVirtual(virt, [0, REQ_PAD]);
  let padding = camera2d.y1() - (edit_box.y + edit_box.h);
  if (padding < virt[1]) {
    engine.setEditBoxNearBottom(REQ_PAD);
  }
}

export function editBoxAnyActive() {
  return active_edit_box && active_edit_box_frame >= engine.frame_index - 1;
}

let osk_elem;
let osk_timeout;
function showOnscreenKeyboardCleanup() {
  if (osk_timeout) {
    clearTimeout(osk_timeout);
    osk_timeout = null;
    document.body.removeChild(osk_elem);
    osk_elem = null;
  }
}
function showOnscreenKeyboardInEvent() {
  // Derived from: https://stackoverflow.com/questions/71826145/show-keyboard-on-input-focus-without-user-action
  if (!osk_elem) {
    osk_elem = document.createElement('input');
    osk_elem.setAttribute('type', 'search');
    osk_elem.setAttribute('style', 'position: fixed; top: -100px; left: -100px;');
    document.body.appendChild(osk_elem);
    osk_timeout = setTimeout(showOnscreenKeyboardCleanup, 1000);
  }
  osk_elem.focus();
}

export function showOnscreenKeyboard() {
  return inputTouchMode() || true ? showOnscreenKeyboardInEvent : undefined;
}

function formHook(ev) {
  ev.preventDefault();

  if (!editBoxAnyActive()) {
    return;
  }
  active_edit_box.submitted = true;
  active_edit_box.updateText();
  if (active_edit_box.pointer_lock && !active_edit_box.text) {
    pointerLockEnter('edit_box_submit');
  }
}

let padding = {
  left: 3,
  right: 3,
  top: 2,
  bottom: 2,
};
export function editBoxSetPadding(left, right, top, bottom) {
  padding.left = left;
  padding.right = right;
  padding.top = top;
  padding.bottom = bottom;
}
export function editBoxGetPadding() {
  return padding;
}

function charIdxToXY(text, offset) {
  offset = clamp(offset, 0, text.length); // IE returns selectionStart/end out of bounds
  let lines = text.split('\n');
  let linenum = 0;
  while (linenum < lines.length) {
    let line = lines[linenum];
    if (offset <= line.length) {
      return [offset, linenum];
    }
    offset -= line.length;
    assert(offset > 0);
    offset--; // newline
    linenum++;
  }
  verify(false);
  return [0, linenum];
}

let last_key_id = 0;

class GlovUIEditBox {
  constructor(params) {
    this.key = `eb${++last_key_id}`;
    this.x = 0;
    this.y = 0;
    this.z = Z.UI; // actually in DOM, so above everything!
    this.w = uiButtonWidth();
    this.type = 'text';
    // this.h = uiButtonHeight();
    this.font_height = uiTextHeight();
    this.line_height = this.font_height;
    this.font_style = uiFontStyleNormal();
    this.last_set_text = '';
    this.text = '';
    this.placeholder = '';
    this.max_len = 0;
    this.max_visual_size = null;
    this.zindex = null;
    this.uppercase = false;
    this.resize = true; // only applies to multi-line
    this.initial_focus = false;
    this.onetime_focus = false; // only for dom_backed
    this.auto_unfocus = true;
    this.focus_steal = false;
    this.initial_select = false;
    this.spellcheck = true;
    this.esc_clears = true;
    this.esc_unfocuses = true;
    this.multiline = 0;
    this.enforce_multiline = true;
    this.suppress_up_down = false;
    this.autocomplete = false;
    this.center = false;
    this.sticky_focus = true;
    this.canvas_render = null;
    this.applyParams(params);
    this.focus_steal = this.focus_steal || this.initial_focus;
    assert.equal(typeof this.text, 'string');

    this.dom_backed = is_mobile;
    this.last_autocomplete = null;
    this.last_placeholder = null;
    this.is_focused = false;
    this.elem = null;
    this.input = null;
    this.submitted = false;
    this.pointer_lock = false;
    this.last_frame = 0;
    this.out = {}; // Used by spotFocusCheck
    this.last_valid_state = {
      sel_start: 0,
      sel_end: 0,
    };
    this.resetCSSCaching();
    this.had_overflow = false;
    this.scroll_left = 0;

    this.textedit_string = {
      text: this.text, // needs to be kept in sync
      layoutRow: this.texteditLayoutRow.bind(this),
      getWidth: this.texteditGetWidth.bind(this),
      canInsert: this.texteditCanInsert.bind(this),
    };
    this.textedit_state = texteditNewState(this.multiline <= 1);
  }
  resetCSSCaching() {
    this.last_tab_index = -1;
    this.last_font_size = '';
    this.last_clip_path = '';
  }
  applyParams(params) {
    if (!params) {
      return;
    }
    for (let f in params) {
      if (f !== 'text') {
        this[f] = params[f];
      }
    }
    if (params.text && params.text !== this.last_set_text) {
      this.setText(params.text);
    }
    this.multiline = this.multiline || 1;
    this.h = this.multiline * this.font_height + padding.top + padding.bottom;
  }

  lineWidth(line, len) {
    if (len === 0 || !line) {
      return 0;
    }
    if (len !== undefined && len !== line.length) {
      line = line.slice(0, len);
    }
    let { font_style, font_height } = this;
    let font = uiGetFont();
    return font.getStringWidth(font_style, font_height, line);
  }

  // STB_TEXTEDIT_LAYOUTROW: fill in `r` for the row starting at character #n
  texteditLayoutRow(r/*: StbTexteditRow*/, n/*: number*/)/*: void*/ {
    let { line_height, center } = this;
    let text = this.textedit_string.text;
    let line = n ? text.slice(n) : text;
    let end = line.indexOf('\n');
    end = end === -1 ? line.length : end + 1;
    let xoffs = center ? round((this.w - padding.left - padding.right - this.lineWidth(line))/2) : 0;
    r.x0 = xoffs;
    r.x1 = xoffs + this.lineWidth(line, end);
    r.baseline_y_delta = line_height;
    r.ymin = 0;
    r.ymax = line_height;
    r.num_chars = end - n;
  }
  // STB_TEXTEDIT_GETWIDTH: pixel delta from the xpos of the i'th character to
  // the xpos of the i+1'th char for the row starting at character #n
  texteditGetWidth(n/*: number*/, i/*: number*/)/*: number*/ {
    let text = this.textedit_string.text;
    return text[n + i] === '\n' ? STB_TEXTEDIT_GETWIDTH_NEWLINE :
      uiGetFont().getCharacterWidth(this.font_style, this.font_height, text.charCodeAt(n));
  }
  texteditCanInsert(where/*: number*/, chars/*: string*/)/*: boolean*/ {
    if (!this.max_len) {
      return true;
    }
    let text = this.textedit_string.text;
    return text.length + chars.length <= this.max_len;
  }
  texteditHandleInput(focused, clipped_rect) {
    this.textedit_string.text = this.text;
    if (focused) {
      let text_input = inputTextInputQueue();
      for (let ii = 0; ii < text_input.length; ++ii) {
        let event = text_input[ii];
        if (event.type === 'key') {
          let { code, mod } = event;
          let is_copy = mod === MOD_CTRL && (code === KEYS.C || code === KEYS.INS);
          let is_cut = mod === MOD_CTRL && code === KEYS.X || mod === MOD_SHIFT && code === KEYS.DEL;
          let is_paste = mod === MOD_CTRL && code === KEYS.V || mod === MOD_SHIFT && code === KEYS.INS;
          if (is_copy || is_cut) {
            if (texteditHasSelection(this.textedit_state)) {
              let { select_start, select_end } = this.textedit_state;
              platformAdapterGet().clipboardWrite(
                this.textedit_string.text.slice(min(select_start, select_end), max(select_start, select_end)));
              if (is_cut) {
                stb_textedit_cut(this.textedit_string, this.textedit_state);
              }
            }
          } else if (is_paste) {
            let paste_text = platformAdapterGet().clipboardRead();
            if (paste_text) {
              paste_text = paste_text.replace(/\r\n?/g, '\n');
              if (this.multiline <= 1) {
                paste_text = paste_text.replace(/\n/g, ' ');
              }
              stb_textedit_paste(this.textedit_string, this.textedit_state, paste_text);
            }
          } else {
            stb_textedit_key(this.textedit_string, this.textedit_state,
              stb_textedit_key_from_input(code, mod));
          }
        } else {
          stb_textedit_char(this.textedit_string, this.textedit_state, String.fromCharCode(event.code));
        }
      }
    }
    let { x, y } = this;
    let mouse_down = mouseDownEdge(clipped_rect);
    if (mouse_down) {
      stb_textedit_click(this.textedit_string, this.textedit_state, mouse_down.pos[0] - x, mouse_down.pos[1] - y);
      this.focus();
    }
    let drag = inputDrag({
      ...clipped_rect,
      eat_clicks: true,
    });
    if (drag) {
      stb_textedit_drag(this.textedit_string, this.textedit_state, drag.cur_pos[0] - x, drag.cur_pos[1] - y);
      this.focus();
    }
    if (mouse_down || drag || mouseOver(clipped_rect)) {
      uiCursorStyle('text');
    }
  }

  getSelection() {
    if (this.dom_backed) {
      return [charIdxToXY(this.text, this.input.selectionStart), charIdxToXY(this.text, this.input.selectionEnd)];
    } else {
      if (texteditHasSelection(this.textedit_state)) {
        return [
          charIdxToXY(this.text, min(this.textedit_state.select_start, this.textedit_state.select_end)),
          charIdxToXY(this.text, max(this.textedit_state.select_start, this.textedit_state.select_end))
        ];
      } else {
        return [
          charIdxToXY(this.text, this.textedit_state.cursor),
          charIdxToXY(this.text, this.textedit_state.cursor)
        ];
      }
    }
  }
  setSelectionRange(sel_start, sel_end) {
    if (this.dom_backed) {
      // if (this.type === 'number') {
      //   this.input.type = 'text';
      // }
      this.input.setSelectionRange(sel_start, sel_end);
      // if (this.type === 'number') {
      //   this.input.type = 'number';
      // }
    } else {
      this.textedit_state.select_start = sel_start;
      this.textedit_state.select_end = sel_end;
      this.textedit_state.cursor = sel_end;
    }
  }
  setTextInternal(new_text) {
    if (this.dom_backed) {
      if (this.input && this.input.value !== new_text) {
        this.input.value = new_text;
      }
    } else {
      // nothing, handled automatically
    }
  }

  updateText() {
    const { input } = this;
    let new_text;
    let sel_start;
    let sel_end;
    if (this.dom_backed) {
      if (!input) {
        return;
      }
      new_text = input.value;
      sel_start = input.selectionStart;
      sel_end = input.selectionEnd;
    } else {
      new_text = this.textedit_string.text;
      if (texteditHasSelection(this.textedit_state)) {
        sel_start = this.textedit_state.select_start;
        sel_end = this.textedit_state.select_end;
      } else {
        sel_start = sel_end = this.textedit_state.cursor;
      }
    }
    if (new_text === this.text) {
      this.last_valid_state.sel_start = sel_start;
      this.last_valid_state.sel_end = sel_end;
      return;
    }
    let saved_new_text = new_text;
    const { multiline, enforce_multiline, max_len, max_visual_size, max_visual_size_font } = this;
    // text has changed, validate
    let valid = true;

    let old_text = this.text;
    function debug(msg) {
      if (engine.defines.EDITBOX) {
        console.log(`Editbox (multiline=${multiline}, max_len=${max_len}: ${engine.frame_index}: ${msg}`);
        console.log(`  Old sel range = [${sel_start},${sel_end}]`);
        console.log(`  New sel range = [${input?.selectionStart},${input?.selectionEnd}]`);
        console.log(`  Old text         = ${JSON.stringify(old_text)}`);
        console.log(`  Desired new text = ${JSON.stringify(saved_new_text)}`);
        console.log(`  New text         = ${JSON.stringify(new_text)}`);
      }
    }

    if (enforce_multiline && multiline && new_text.split('\n').length > multiline) {
      // If trimming would help, trim the text, and update, preserving current selection
      // Otherwise, will revert to last good state
      // does trimming help?
      if (trimEnd(new_text).split('\n').length <= multiline) {
        while (new_text.split('\n').length > multiline) {
          if (new_text[new_text.length-1].match(/\s/)) {
            new_text = new_text.slice(0, -1);
          }
        }
        if (this.text === new_text) {
          // we presumably just trimmed off what they inserted, treat as error
          // Except, if the new selection point is valid, they probably inserted
          //   a blank line at the end (and a *different* one got trimmed), so
          //   let that through
          if (sel_end <= new_text.length) {
            this.setTextInternal(new_text);
            this.setSelectionRange(sel_start, sel_end);
            debug('trimming helped to keep selection');
          } else {
            valid = false;
            debug('trimmed equal orig');
          }
        } else {
          this.setTextInternal(new_text);
          this.setSelectionRange(sel_start, sel_end);
          debug('trimming helped');
        }
      } else {
        valid = false;
        debug('trimmed too long');
      }
    }

    if (max_len > 0 || max_visual_size) {
      // If just max_visual_size, use infinite max_len
      let eff_max_len = max_len || Infinity;
      let growth = new_text.length - old_text.length;
      let lines = multiline ? new_text.split('\n') : [new_text];
      for (let ii = 0; ii < lines.length; ++ii) {
        let line = lines[ii];
        let over = line.length > eff_max_len;
        let font = max_visual_size ? max_visual_size_font || uiGetFont() : null;
        if (max_visual_size && !over) {
          over = font.getStringWidth(null, max_visual_size.font_height, line) > max_visual_size.width;
        }
        let trimmed = trimEnd(line);
        let trim_over = over && trimmed.length > eff_max_len;
        if (max_visual_size && over && !trim_over) {
          trim_over = font.getStringWidth(null,
            max_visual_size.font_height, trimmed) > max_visual_size.width;
        }
        if (max_visual_size && over && trim_over &&
          // was it changed by 2 or more characters?  Probably just pasted, do a truncate instead of reject
          growth >= 2
        ) {
          while (trimmed.length && font.getStringWidth(null,
            max_visual_size.font_height, trimmed) > max_visual_size.width
          ) {
            trimmed = trimmed.slice(0, -1);
            trim_over = false;
          }
        }

        if (over) {
          if (!trim_over) {
            let old_line_end_pos = lines.slice(0, ii+1).join('\n').length;
            lines[ii] = trimmed;
            let new_line_end_pos = lines.slice(0, ii+1).join('\n').length;
            new_text = lines.join('\n');
            let shift = old_line_end_pos - new_line_end_pos;
            if (sel_start > old_line_end_pos) {
              sel_start -= shift;
            } else if (sel_start > new_line_end_pos) {
              sel_start = new_line_end_pos;
            }
            if (sel_end >= old_line_end_pos) {
              sel_end -= shift;
            } else if (sel_end > new_line_end_pos) {
              sel_end = new_line_end_pos;
            }
            this.setTextInternal(new_text);
            this.setSelectionRange(sel_start, sel_end);
            debug('over but not trim_over; updating text and sel');
          } else {
            valid = false;
            debug('invalid: over');
          }
        }
      }
    }
    if (!valid) {
      let old_was_invalid = false;
      if (max_len > 0 || max_visual_size) {
        let eff_max_len = max_len || Infinity;
        let lines = multiline ? this.text.split('\n') : [this.text];
        for (let ii = 0; ii < lines.length; ++ii) {
          let line = lines[ii];
          if (line.length > eff_max_len) {
            old_was_invalid = true;
          }
          if (max_visual_size && !old_was_invalid) {
            old_was_invalid = uiGetFont().getStringWidth(null, max_visual_size.font_height, line) >
              max_visual_size.width;
          }
        }
      }
      if (old_was_invalid) {
        // we're invalid, but it was also invalid to start!  let edit through if shorter
        if (new_text.length < this.text.length) {
          valid = true;
        }
      }
    }
    if (!valid) {
      // revert!
      this.had_overflow = true;
      this.setTextInternal(this.text);
      this.setSelectionRange(this.last_valid_state.sel_start, this.last_valid_state.sel_end);
      debug(`invalid: reset sel range to [${this.last_valid_state.sel_start}, ${this.last_valid_state.sel_end}]`);
    } else {
      this.text = new_text;
      this.last_valid_state.sel_start = sel_start;
      this.last_valid_state.sel_end = sel_end;
    }
    if (!this.dom_backed && this.text !== this.textedit_string.text) {
      // Validation modified or rejected the edits; keep the undo history consistent
      let { textedit_state } = this;
      let { cursor, select_start, select_end } = textedit_state;
      texteditReplaceEdits(this.textedit_string, textedit_state, old_text, this.text);
      textedit_state.cursor = cursor;
      textedit_state.select_start = select_start;
      textedit_state.select_end = select_end;
    }
  }
  getText() {
    return this.text;
  }
  hadOverflow() {
    let ret = this.had_overflow;
    this.had_overflow = false;
    return ret;
  }
  setText(new_text) {
    new_text = String(new_text);

    // sanitize if appropriate
    const { max_len, max_visual_size, multiline } = this;
    let font = max_visual_size ? uiGetFont() : null;
    if (max_len > 0 && max_visual_size) {
      let lines = multiline ? new_text.split('\n') : [new_text];
      for (let ii = 0; ii < lines.length; ++ii) {
        let line = lines[ii];
        if (max_len > 0) {
          if (line.length > max_len) {
            line = trimEnd(line);
          }
          if (line.length > max_len) {
            line = line.slice(0, max_len);
          }
        }
        if (max_visual_size) {
          while (line.length && font.getStringWidth(null, max_visual_size.font_height, line) > max_visual_size.width) {
            line = line.slice(0, line.length - 1);
          }
        }
        lines[ii] = line;
      }
      new_text = lines.join('\n');
    }

    let input = this.input;
    if (this.dom_backed && input && input.value !== new_text) {
      if (engine.defines.EDITBOX) {
        console.log(`Editbox (multiline=${multiline}, max_len=${max_len}: ${engine.frame_index}: setText()`);
        console.log(`  Sel range = [${input.selectionStart},${input.selectionEnd}]`);
        console.log(`  Old text         = ${JSON.stringify(input.value)}`);
        console.log(`  New text         = ${JSON.stringify(new_text)}`);
      }
    }
    this.setTextInternal(new_text);
    if (!this.dom_backed && new_text !== this.text && this.textedit_state) {
      texteditClearUndo(this.textedit_state);
    }
    this.text = new_text;
    this.last_set_text = new_text;
  }
  focus() {
    if (this.dom_backed) {
      if (this.input) {
        this.input.focus();
        showOnscreenKeyboardCleanup();
        if (this.select_on_focus) {
          this.input.select();
        }
        setActive(this);
      } else {
        this.onetime_focus = true;
      }
    } else {
      setActive(this);
    }
    spotFocusSteal(this);
    this.is_focused = true;
    if (this.pointer_lock && pointerLocked()) {
      pointerLockExit();
    }
  }
  unfocus() {
    spotUnfocus();
  }
  isFocused() { // call after .run()
    return this.is_focused;
  }

  updateFocus(is_reset) {
    let was_glov_focused = this.is_focused;
    let spot_ret = spotFocusCheck(this);
    let { focused } = spot_ret;
    if (this.dom_backed) {
      let dom_focused = this.input && document.activeElement === this.input;
      if (was_glov_focused !== focused) {
        // something external (from clicks/keys in GLOV) changed, apply it if it doesn't match
        if (focused && !dom_focused) {
          spotlog('GLOV focused, DOM not, focusing', this);
          if (this.input) {
            this.input.focus();
            showOnscreenKeyboardCleanup();
            if (this.select_on_focus) {
              this.input.select();
            }
          } else {
            this.onetime_focus = true;
          }
        }
        if (!focused && dom_focused) {
          spotlog('DOM focused, GLOV not, and changed, blurring', this);
          this.input.blur();
        }
      } else if (dom_focused && !focused) {
        spotlog('DOM focused, GLOV not, stealing', this);
        spotFocusSteal(this);
        if (this.input && this.select_on_focus) {
          this.input.select();
        }
        focused = true;
      } else if (!dom_focused && focused) {
        if (is_reset) {
          // Just appeared this frame, steal DOM focus
          this.onetime_focus = true;
          spotlog('GLOV focused, DOM not, new edit box, focusing', this);
        } else if (document.activeElement === engine.canvas || document.activeElement === this.postspan) {
          // focus explicitly on canvas or left our input element, lose focus
          spotlog('GLOV focused, DOM canvas focused, unfocusing', this);
          spotUnfocus();
        } else {
          // Leave it alone, it may be a browser pop-up such as for passwords
        }
      }
    }

    if (focused) {
      setActive(this);
      let key_opt = (this.pointer_lock && !this.text) ? { in_event_cb: pointerLockEnter } : null;
      if ((this.esc_clears || this.esc_unfocuses) && keyUpEdge(KEYS.ESC, key_opt)) {
        if (this.text && this.esc_clears) {
          this.setText('');
        } else {
          spotUnfocus();
          if (this.dom_backed && this.input) {
            this.input.blur();
          }
          focused = false;
          this.canceled = true;
        }
      }
    }
    this.is_focused = focused;
    return spot_ret;
  }

  run(params) {
    this.applyParams(params);
    const {
      canvas_render,
      font_height,
      multiline,
      enforce_multiline,
      max_len,
      font_style,
      line_height,
    } = this;
    if (this.focus_steal) {
      this.focus_steal = false;
      this.focus();
      showOnscreenKeyboardCleanup();
    }

    let is_reset = false;
    if (!verify(this.last_frame !== engine.frame_index)) {
      // two calls on one frame (asserts in dev, silently do nothing otherwise?)
      return null;
    }
    if (this.last_frame !== engine.frame_index - 1) {
      // it's been more than a frame, we must have not been running, discard async events
      this.submitted = false;
      is_reset = true;
    }
    this.last_frame = engine.frame_index;

    this.canceled = false;
    let { allow_focus, focused } = this.updateFocus(is_reset);

    if (focused) {
      spotSuppressKBNav(true, Boolean(multiline || this.suppress_up_down));
    }

    const { x, y, z, w, h } = this;
    let { text } = this;
    const { left, top, right, bottom } = padding;
    const eff_w = w - left - right;
    const eff_x = x + left;
    const eff_h = h - top - bottom;
    const eff_y = y + top;

    let clipped_rect = {
      x, y, w, h
    };
    if (allow_focus && !camera2d.clipTestRect(clipped_rect)) {
      allow_focus = false;
    }

    this_frame_edit_boxes.push(this);
    if (this.dom_backed) {
      let elem = allow_focus && uiGetDOMElem(this.elem, true);
      if (elem !== this.elem) {
        this.resetCSSCaching();
        if (elem) {
          // new DOM element, initialize
          if (!form_hook_registered) {
            form_hook_registered = true;
            let form = document.getElementById('dynform');
            if (form) {
              form.addEventListener('submit', formHook, true);
            }
          }
          elem.textContent = '';
          let input = document.createElement(multiline ? 'textarea' : 'input');
          let classes = [];
          if (canvas_render) {
            classes.push('canvas_render');
          }
          if (multiline && max_len) {
            classes.push('fixed');
          }
          if (this.center) {
            classes.push('center');
          }
          input.className = classes.join(' ');
          // Use 'tel' instead of 'number', as it supports changing the selection
          let eff_type = this.type === 'number' ? 'tel' :
            // Using 'search' gets around Android Chrome bug showing the password box all the time on regular inputs
            this.type === 'text' && !this.autocomplete ? 'search' :
            this.type;
          input.setAttribute('type', eff_type);
          if (eff_type === 'search' && this.type !== 'search') {
            input.style['-webkit-appearance'] = 'none';
          }
          let placeholder = getStringIfLocalizable(this.placeholder);
          input.setAttribute('placeholder', placeholder);
          this.last_placeholder = placeholder;
          if (max_len) {
            if (multiline) {
              input.setAttribute('cols', max_len);
            } else {
              input.setAttribute('maxLength', max_len);
            }
          }
          if (multiline) {
            if (enforce_multiline) {
              input.setAttribute('rows', multiline);
            } else {
              input.style.height = '100%';
            }
          }
          elem.appendChild(input);
          let span = document.createElement('span');
          this.postspan = span;
          elem.appendChild(span);
          input.value = this.text;
          if (this.uppercase) {
            input.style['text-transform'] = 'uppercase';
          }
          if (!this.resize) {
            input.style.resize = 'none';
          }
          this.input = input;
          if (this.initial_focus || this.onetime_focus) {
            input.focus();
            showOnscreenKeyboardCleanup();
            setActive(this);
            this.onetime_focus = false;
          }
          if (this.initial_select) {
            input.select();
          }

          if (multiline && enforce_multiline || max_len) {
            // Do update _immediately_ so the DOM doesn't draw the invalid text, if possible
            const onChange = (e) => {
              this.updateText();
              return true;
            };
            input.addEventListener('keyup', onChange);
            input.addEventListener('keydown', onChange);
            input.addEventListener('change', onChange);
          }

        } else {
          this.input = null;
        }
        this.last_autocomplete = null;
        this.last_placeholder = null;
        this.submitted = false;
        this.elem = elem;
      } else {
        if (this.input) {
          this.updateText();
          this.last_set_text = this.text;
        }
      }
      if (elem) {
        if (!this.spellcheck) {
          elem.spellcheck = false; // JE: this seems wrong, should be this.input.spellcheck? Works though...
        }

        let clip_path = '';
        if (clipped_rect.x !== x ||
          clipped_rect.y !== y ||
          clipped_rect.w !== w ||
          clipped_rect.h !== h
        ) {
          // partially clipped
          let x0 = `${(clipped_rect.x - eff_x)/eff_w*100}%`;
          let x1 = `${(clipped_rect.x + clipped_rect.w - eff_x)/eff_w*100}%`;
          let y0 = `${(clipped_rect.y - eff_y)/eff_h*100}%`;
          let y1 = `${(clipped_rect.y + clipped_rect.w - eff_y)/eff_h*100}%`;
          clip_path = `polygon(${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1})`;
        } else {
          clip_path = '';
        }
        if (clip_path !== this.last_clip_path) {
          elem.style.clipPath = this.last_clip_path = clip_path;
        }

        let new_fontsize = `${camera2d.virtualToFontSize(font_height).toFixed(8)}px`;
        // Try slightly better smooth scaling from https://medium.com/autodesk-tlv/smooth-text-scaling-in-javascript-css-a817ae8cc4c9
        const preciseFontSize = camera2d.virtualToFontSize(font_height);  // Desired font size
        const roundedSize = floor(preciseFontSize);
        const extra_scale = preciseFontSize / roundedSize; // Remaining scale
        if (new_fontsize !== this.last_font_size) {
          this.last_font_size = new_fontsize;
          // elem.style.fontSize = new_fontsize;
          elem.style.fontSize = `${roundedSize}px`;
          //const translate = `translate(${pos.x}px, ${pos.y}px)`;
          const scale = `translate(-50%, -50%)
                         scale(${extra_scale})
                         translate(50%, 50%)`;
          // this.input.style.width = `${(1/extra_scale*100).toFixed(8)}%`; - handled below, now
          elem.style.transform = scale;
        }

        let pos = camera2d.htmlPos(eff_x, eff_y);
        elem.style.left = `${pos[0]}%`;
        elem.style.top = `${pos[1]}%`;
        let size = camera2d.htmlSize(eff_w, eff_h);
        elem.style.width = `${size[0]/extra_scale}%`;
        elem.style.height = `${size[1]/extra_scale}%`;


        if (this.zindex) {
          elem.style['z-index'] = this.zindex;
        }
        if (this.last_autocomplete !== this.autocomplete) {
          this.last_autocomplete = this.autocomplete;
          this.input.setAttribute('autocomplete', this.autocomplete || `auto_off_${Math.random()}`);
        }
        let placeholder = getStringIfLocalizable(this.placeholder);
        if (this.last_placeholder !== placeholder) {
          this.input.setAttribute('placeholder', placeholder);
          this.last_placeholder = placeholder;
        }


        let tab_index1 = uiGetDOMTabIndex();
        let tab_index2 = uiGetDOMTabIndex();
        if (tab_index1 !== this.last_tab_index) {
          this.last_tab_index = tab_index1;
          this.input.setAttribute('tabindex', tab_index1);
          this.postspan.setAttribute('tabindex', tab_index2);
        }
      } else {
        this.resetCSSCaching();
      }
    } else { // non-dom-backed
      this.texteditHandleInput(focused, clipped_rect);
      this.updateText();
      text = this.text;
    }

    if (focused) {
      if (this.auto_unfocus) {
        if (inputClick({ peek: true })) {
          spotUnfocus();
        }
      }
      // For IFRAMEs with `sandbox` not including `allow-form`, catch Enter ourselves
      if (keyDownEdge(KEYS.ENTER)) {
        this.submitted = true;
      }
      // keyboard input is handled by the INPUT element, but allow mouse events to trickle
      eatAllKeyboardInput();
    }
    // Eat mouse events going to the edit box
    if (allow_focus) {
      mouseConsumeClicks(clipped_rect);
    }

    // TODO: move this global and overridable
    let edit_box_default_style = {
      color_selection: [0.5, 0.5, 0.5, 1],
      color_caret: [0, 0, 0, 0.8],
      draw_bg: true,
    };
    const {
      color_selection,
      color_caret,
      draw_bg,
    } = canvas_render || edit_box_default_style;
    if (draw_bg) {
      drawBox({
        x, y, z, w, h,
      }, ui_sprites[focused ? 'edit_border_focused' : 'edit_border']);
    }
    if (canvas_render || !this.dom_backed) {
      const { center } = this;
      let font = uiGetFont();
      let lines = text.split('\n');
      let xoffs = left;
      if (this.dom_backed) {
        // prevent scrolling if it happened for any reason (paste)
        if (this.input && this.input.scrollTop !== 0) {
          this.input.scrollTop = 0;
        }
      } else {
        // scroll if required
        let pos = charIdxToXY(this.text, this.textedit_state.cursor);
        let line = lines[pos[1]];
        let cursor_x = this.lineWidth(line, pos[0]);
        let line_w = pos[0] === line.length ? cursor_x : this.lineWidth(line);
        let lookahead = min(font_height * 4, round(eff_w / 4));
        let cursor_x_min = max(0, cursor_x - lookahead);
        let cursor_x_max = min(line_w, cursor_x + lookahead);
        let new_scroll;
        if (cursor_x_min < this.scroll_left) {
          new_scroll = cursor_x_min;
        } else if (cursor_x_max > this.scroll_left + eff_w) {
          new_scroll = cursor_x_max - eff_w;
        }
        if (new_scroll !== undefined) {
          this.scroll_left = damp(this.scroll_left, new_scroll, 100, getFrameDt());
        }
        xoffs -= this.scroll_left;
        let fade_left = this.scroll_left > 0.1;
        // TODO: multiline: need to do this if _any_ line is scrolled off the end - compute and do later?
        let fade_right = line_w > this.scroll_left + eff_w + 0.1;
        let fade_z = z + 0.9;
        if (fade_left || fade_right) {
          if (fade_left && !fade_right) {
            spriteClipPush(fade_z, x, y, w / 2, h);
          } else if (!fade_left && fade_right) {
            spriteClipPush(fade_z, x + w / 2, y, w / 2, h);
          }
          drawBox({
            x, y, z: fade_z, w, h,
          }, ui_sprites[focused ? 'edit_border_focused_fade' : 'edit_border_fade']);
          if (fade_left !== fade_right) {
            spriteClipPop();
          }
        }

      }
      // draw text
      spriteClipPush(z + 0.1, x + left, y, eff_w, h);
      let line_width = [];
      for (let ii = 0; ii < lines.length; ++ii) {
        let line = lines[ii];
        let line_w = font.draw({
          style: font_style,
          height: font_height,
          x: x + xoffs,
          y: y + top + ii * line_height, z: z + 0.8,
          w: eff_w,
          text: line,
          align: center ? font.ALIGN.HCENTER : undefined,
        });
        line_width.push(line_w);
      }
      let selection = this.getSelection();
      let has_selection = !v2same(selection[0], selection[1]);
      if (focused && has_selection) {
        // draw selection
        let first_row = selection[0][1];
        let last_row = selection[1][1];
        for (let jj = first_row; jj <= last_row; ++jj) {
          let line = lines[jj];
          let selx0 = jj === first_row ? this.lineWidth(line, selection[0][0]) : 0;
          let selx1 = line && line.length ?
            (jj === last_row ? this.lineWidth(line, selection[1][0]) : this.lineWidth(line)) : 1;
          let center_offs = center ? round((eff_w - line_width[jj])/2) : 0;
          drawRect(x + xoffs + selx0-1 + center_offs,
            y + top + jj * line_height,
            x + xoffs + selx1 + center_offs,
            y + top + (jj + 1) * line_height, z + 0.75, color_selection);
        }
      }
      spriteClipPop();
      if (focused && !has_selection) {
        // draw caret
        let jj = selection[1][1];
        let line = lines[jj];
        let caret_x = x + xoffs + this.lineWidth(line, selection[1][0]) - 0.5;
        if (center) {
          caret_x += round((eff_w - line_width[jj])/2);
        }
        if (caret_x > x + 0.5 && caret_x < x + w - 0.5) {
          drawLine(caret_x, y + top + line_height*jj + 0.5,
            caret_x, y + top + line_height*(jj + 1) - 0.5, z + 0.95, 1, 1, color_caret);
        }
      }
    }

    if (this.submitted) {
      this.submitted = false;
      return this.SUBMIT;
    }
    if (this.canceled) {
      this.canceled = false;
      return this.CANCEL;
    }
    return null;
  }
  unrun() {
    // remove from DOM or hide
    this.elem = null;
    this.input = null;
  }
}
GlovUIEditBox.prototype.SUBMIT = 'submit';
GlovUIEditBox.prototype.CANCEL = 'cancel';

export function editBoxCreate(params) {
  if (params.glov_initial_text !== undefined) {
    params.text = params.glov_initial_text;
  }
  return new GlovUIEditBox(params);
}

export function editBox(params, current) {
  params.glov_initial_text = current;
  let edit_box = getUIElemData('edit_box', params, editBoxCreate);
  if (edit_box.last_set_text !== current) {
    edit_box.setText(current);
  }
  let result = edit_box.run(params);

  return {
    result,
    text: edit_box.getText(),
    edit_box,
  };
}
