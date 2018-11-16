/* eslint-env jquery */
/*global Z: false */

const glov_engine = require('./engine.js');

const { focuslog } = require('./ui.js');

let glov_input;
let glov_ui;

class GlovUIEditBox {
  constructor(params) {
    this.x = 0;
    this.y = 0;
    this.z = Z.UI; // actually in DOM, so above everything!
    this.w = glov_ui.button_width;
    this.type = 'text';
    // this.h = glov_ui.button_height;
    // this.font_height = glov_ui.font_height;
    this.text = '';
    this.placeholder = '';
    this.initial_focus = false;
    this.applyParams(params);

    this.got_focus_in = false;
    this.got_focus_out = false;
    this.elem = null;
    this.input = null;
    this.submitted = false;
  }
  applyParams(params) {
    if (!params) {
      return;
    }
    for (let f in params) {
      this[f] = params[f];
    }
  }
  getText() {
    return this.text;
  }
  setText(new_text) {
    if (this.input) {
      this.input.val(new_text);
    }
    this.text = new_text;
  }
  focus() {
    glov_ui.focusSteal(this);
  }

  updateFocus() {
    if (this.got_focus_out) {
      if (glov_ui.isFocusedPeek(this)) {
        glov_input.keyDownHit(glov_input.key_codes.TAB); // eat the TAB
        if (glov_input.isKeyDown(glov_input.key_codes.SHIFT)) {
          glov_ui.focusPrev(this);
        } else {
          glov_ui.focusNext(this);
        }
      }
      this.got_focus_out = false;
    }
    if (this.got_focus_in) {
      glov_input.keyDownHit(glov_input.key_codes.TAB); // eat the TAB
      glov_ui.focusSteal(this);
      this.got_focus_in = false;
    }
    let focused = glov_ui.focusCheck(this);
    if (focused && this.input && document.activeElement !== this.input[0]) {
      this.input.focus();
    }
    if (!focused && this.input && document.activeElement === this.input[0]) {
      this.input.blur();
    }

    if (focused && glov_input.keyDownHit(glov_input.key_codes.ESCAPE)) {
      if (this.text) {
        this.setText('');
      } else {
        glov_ui.focusCanvas();
      }
    }
    return focused;
  }

  run(params) {
    this.applyParams(params);
    let focused = this.updateFocus();

    glov_ui.this_frame_edit_boxes.push(this);
    let elem = glov_ui.getElem();
    if (elem !== this.elem) {
      if (elem) {
        // new DOM element, initialize
        elem.html('');
        let form = $('<form></form>');
        let input = $(`<input type="${this.type}" placeholder="${this.placeholder}" tabindex="2">`);
        input.focusin(() => {
          focuslog('EditBox:focusin', this);
          this.got_focus_in = true;
        });
        input.focusout((ev) => {
          focuslog('EditBox:focusout', this);
          this.got_focus_out = true;
        });
        form.submit((ev) => {
          ev.preventDefault();
          this.submitted = true;
        });
        form.append(input);
        form.append($('<span tabindex="3"></span>'));
        elem.append(form);
        input.val(this.text);
        this.input = input;
        if (this.initial_focus) {
          input.focus();
        }
      } else {
        this.input = null;
      }
      this.submitted = false;
      this.elem = elem;
    } else {
      if (this.input) {
        this.text = this.input.val();
      }
    }
    if (elem) {
      let pos = glov_ui.htmlPos(this.x, this.y);
      elem[0].style.left = `${pos[0]}%`;
      elem[0].style.top = `${pos[1]}%`;
      let size = glov_ui.htmlSize(this.w, this.h);
      elem[0].style.width = `${size[0]}%`;
    }

    if (focused) {
      // keyboard input is handled by the INPUT element, but allow mouse events to trickle
      glov_input.eatAllKeyboardInput();
    }

    if (this.submitted) {
      this.submitted = false;
      return this.SUBMIT;
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

export function create(params) {
  if (!glov_ui) {
    glov_ui = glov_engine.glov_ui;
    glov_input = glov_engine.glov_input;
  }
  return new GlovUIEditBox(params);
}
