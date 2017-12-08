/* jshint jquery:true */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

window.Z = window.Z || {};
Z.UI = Z.UI || 100;
Z.MODAL = Z.MODAL || 1000;
Z.TOOLTIP = Z.TOOLTIP || 2000;

const glov_font = require('./font.js');

class GlovUIEditBox {
  constructor(glov_ui, params) {
    this.glov_ui = glov_ui;
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
    if (this.input) {
      this.input.focus();
    }
  }
  unfocus() {
    if (this.input) {
      this.input.blur();
    }
  }
  run(params) {
    this.applyParams(params);
    this.glov_ui.this_frame_edit_boxes.push(this);
    let elem = this.glov_ui.getElem();
    if (elem !== this.elem) {
      if (elem) {
        // new DOM element, initialize
        elem.html('');
        let form = $('<form></form>');
        let input = $(`<input type="${this.type}" placeholder="${this.placeholder}">`);
        form.submit((ev) => {
          ev.preventDefault();
          this.submitted = true;
        });
        form.append(input);
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
      let pos = this.glov_ui.htmlPos(this.x, this.y);
      elem[0].style.left = pos[0] + '%';
      elem[0].style.top = pos[1] + '%';
      let size = this.glov_ui.htmlSize(this.w, this.h);
      elem[0].style.width = size[0] + '%';
    }

    if (this.submitted) {
      this.submitted = false;
      return this.SUBMIT;
    }
  }
  unrun() {
    // remove from DOM or hide
    this.elem = null;
    this.input = null;
  }
}
GlovUIEditBox.prototype.SUBMIT = 'submit';

class GlovUI {
  buildRects(ws, hs) {
    let rects = [];
    let total_w = 0;
    for (let ii = 0; ii < ws.length; ++ii) {
      total_w += ws[ii];
    }
    let percents_w = [];
    for (let ii = 0; ii < ws.length; ++ii) {
      percents_w.push(ws[ii] / total_w);
    }
    let total_h = 0;
    for (let ii = 0; ii < hs.length; ++ii) {
      total_h += hs[ii];
    }
    let percents_h = [];
    for (let ii = 0; ii < hs.length; ++ii) {
      percents_h.push(hs[ii] / total_h);
    }
    let y = 0;
    for (let jj = 0; jj < hs.length; ++jj) {
      let x = 0;
      for (let ii = 0; ii < ws.length; ++ii) {
        let r = math_device.v4Build(x, y, x + ws[ii], y + hs[jj]);
        rects.push(r);
        x += ws[ii];
      }
      y += hs[jj];
    }
    return {
      rects,
      percents_w,
      percents_h,
      total_w,
      total_h,
    };
  }

  loadSpriteRect(filename, widths, heights) {
    let uidata = this.buildRects(widths, heights);
    let sprite = this.glov_sprite.createSprite(filename, {
      width : 1,
      height : 1,
      rotation : 0,
      textureRectangle : math_device.v4Build(0, 0, uidata.total_w, uidata.total_h),
      origin: [0,0],
    });
    sprite.uidata = uidata;
    return sprite;
  }

  makeColorSet(color) {
    let ret = {
      regular: math_device.v4ScalarMul(color, 1),
      rollover: math_device.v4ScalarMul(color, 0.8),
      click: math_device.v4ScalarMul(color, 0.7),
      disabled: math_device.v4ScalarMul(color, 0.4),
    };
    for (let field in ret) {
      ret[field][3] = color[3];
    }
    return ret;
  }

  constructor(glov_sprite, glov_input, font, draw_list) {
    this.glov_sprite = glov_sprite;
    this.glov_input = glov_input;
    this.font = font;
    this.draw_list = draw_list;
    this.camera = glov_input.camera;

    this.color_button = this.makeColorSet([1,1,1,1]);
    this.color_panel = math_device.v4Build(1, 1, 0.75, 1);
    this.color_modal_darken = math_device.v4Build(0, 0, 0, 0.75);

    this.modal_font_style = glov_font.styleColored(null, 0x000000ff);

    let sprites = this.sprites = {};
    sprites.button = this.loadSpriteRect('button.png', [4, 5, 4], [13]);
    sprites.panel = this.loadSpriteRect('panel.png', [2, 12, 2], [2, 12, 2]);
    sprites.white = this.glov_sprite.createSprite('white', {
      width : 1,
      height : 1,
      origin: [0, 0],
      textureRectangle : math_device.v4Build(0, 0, 1, 1)
    });
    ['circle', 'cone', 'hollow_circle', 'line'].forEach((key) => {
      let size = (key === 'hollow_circle') ? 128 : 32;
      sprites[key] = glov_sprite.createSprite(`glov/util_${key}.png`, {
        width : 1,
        height : 1,
        textureRectangle : math_device.v4Build(0, 0, size, size)
      });
    });

    this.sounds = {};

    this.button_mouseover = false; // for callers to poll the very last button
    // For tracking global mouseover state
    this.last_frame_button_mouseover = false;
    this.frame_button_mouseover = false;

    this.modal_dialog = null;

    this.this_frame_edit_boxes = [];
    this.last_frame_edit_boxes = [];
    this.dom_elems = [];
    this.dom_elems_issued = 0;
  }

  getElem() {
    if (this.modal_dialog) {
      return null;
    }
    if (this.dom_elems_issued >= this.dom_elems.length) {
      let elem = $('<div class="glovui_dynamic"></div>');
      $('#dynamic_text').append(elem);
      this.dom_elems.push(elem);
    }
    let elem = this.dom_elems[this.dom_elems_issued];
    this.dom_elems_issued++;
    return elem;
  }

  bindSounds(sound_manager, sounds) {
    this.sound_manager = sound_manager;
    this.sounds = sounds;
    for (let key in sounds) {
      sound_manager.loadSound(sounds[key]);
    }
  }

  drawHBox(coords, s, color) {
    let uidata = s.uidata;
    let scale = coords.h;
    let ws = [uidata.percents_w[0] * scale, 0, uidata.percents_w[2] * scale];
    let x = coords.x;
    ws[1] = Math.max(0, coords.w - ws[0] - ws[2]);
    for (let ii = 0; ii < ws.length; ++ii) {
      let my_w = ws[ii];
      this.draw_list.queue(s, x, coords.y, coords.z, color, [my_w, scale, 1, 1], uidata.rects[ii]);
      x += my_w;
    }
  }

  drawBox(coords, s, pixel_scale, color) {
    let uidata = s.uidata;
    let scale = pixel_scale;
    let ws = [uidata.percents_w[0] * scale, 0, uidata.percents_w[2] * scale];
    ws[1] = Math.max(0, coords.w - ws[0] - ws[2]);
    let hs = [uidata.percents_h[0] * scale, 0, uidata.percents_h[2] * scale];
    hs[1] = Math.max(0, coords.h - hs[0] - hs[2]);
    let x = coords.x;
    for (let ii = 0; ii < ws.length; ++ii) {
      let my_w = ws[ii];
      if (my_w) {
        let y = coords.y;
        for (let jj = 0; jj < hs.length; ++jj) {
          let my_h = hs[jj];
          if (my_h) {
            this.draw_list.queue(s, x, y, coords.z, color, [my_w, my_h, 1, 1], uidata.rects[jj * 3 + ii]);
            y += my_h;
          }
        }
        x += my_w;
      }
    }
  }

  playUISound(name) {
    if (this.sounds[name]) {
      this.sound_manager.play(this.sounds[name]);
    }
  }

  setMouseOver(key) {
    if (this.last_frame_button_mouseover !== key && this.frame_button_mouseover !== key) {
      this.playUISound('rollover');
    }
    this.frame_button_mouseover = key;
    this.button_mouseover = true;
  }

  drawTooltip(param) {
    assert(typeof param.x === 'number');
    assert(typeof param.y === 'number');
    assert(typeof param.tooltip === 'string');

    let tooltip_w = 400;
    let tooltip_y0 = param.y;
    let tooltip_pad = 8;
    let y = tooltip_y0 + tooltip_pad;
    y += this.font.drawSizedWrapped(this.modal_font_style,
      param.x + tooltip_pad, y, Z.TOOLTIP+1, tooltip_w - tooltip_pad * 2, 0, this.font_height,
      param.tooltip);
    y += tooltip_pad;

    this.panel({
      x: param.x,
      y: tooltip_y0,
      z: Z.TOOLTIP,
      w: tooltip_w,
      h: y - tooltip_y0,
    });
  }

  buttonShared(param, key) {
    let colors = param.colors || this.color_button;
    let color = colors.regular;
    let ret = false;
    this.button_mouseover = false;
    if (param.disabled) {
      color = colors.disabled;
    } else if (this.glov_input.clickHit(param)) {
      this.setMouseOver(key);
      color = colors.click;
      ret = true;
      this.playUISound('button_click');
    } else if (this.glov_input.isMouseOver(param)) {
      this.setMouseOver(key);
      color = this.glov_input.isMouseDown() ? colors.click : colors.rollover;
    } else {
      this.button_mouseover = false;
    }
    if (this.button_mouseover && param.tooltip) {
      this.drawTooltip({
        x: param.x,
        y: param.y + param.h + 2,
        tooltip: param.tooltip,
      });
    }
    return [ ret, color ];
  }

  buttonText(param) {
    // required params
    assert(typeof param.x === 'number');
    assert(typeof param.y === 'number');
    assert(typeof param.text === 'string');
    // optional params
    param.z = param.z || Z.UI;
    param.w = param.w || this.button_width;
    param.h = param.h || this.button_height;
    param.font_height = param.font_height || this.font_height;

    let [ret, color] = this.buttonShared(param, param.text);

    this.drawHBox(param, this.sprites.button, color);
    /*jshint bitwise:false*/
    this.font.drawSizedAligned(glov_font.styleColored(null, 0x000000ff), param.x, param.y, param.z + 0.1,
      param.font_height, glov_font.ALIGN.HCENTER | glov_font.ALIGN.VCENTER, param.w, param.h, param.text);
    return ret;
  }

  buttonImage(param) {
    // required params
    assert(typeof param.x === 'number');
    assert(typeof param.y === 'number');
    assert(param.img && param.img.getWidth); // should be a sprite
    // optional params
    param.z = param.z || Z.UI;
    param.w = param.w || this.button_img_size;
    param.h = param.h || param.w || this.button_img_size;
    //param.img_rect; null -> full image

    let [ret, color] = this.buttonShared(param, param.img);

    this.drawHBox(param, this.sprites.button, color);
    let img_w = param.img.getWidth();
    let img_h = param.img.getHeight();
    let img_origin = param.img.getOrigin();
    let img_scale = 1;
    img_scale = Math.min(img_scale, (param.w * 0.75) / img_w);
    img_scale = Math.min(img_scale, (param.h * 0.75) / img_h);
    img_w *= img_scale;
    img_h *= img_scale;
    this.draw_list.queue(param.img, param.x + (param.w - img_w) / 2 + img_origin[0] * img_scale, param.y + (param.h - img_h) / 2 + img_origin[1] * img_scale, param.z + 0.1, color, [img_scale, img_scale, 1, 1], param.img_rect);
    return ret;
  }

  print(style, x, y, z, text) {
    this.font.drawSized(style, x, y, z, this.font_height, text);
  }

  panel(param) {
    assert(typeof param.x === 'number');
    assert(typeof param.y === 'number');
    assert(typeof param.w === 'number');
    assert(typeof param.h === 'number');
    param.z = param.z || (Z.UI - 1);
    this.drawBox(param, this.sprites.panel, this.panel_pixel_scale, this.color_panel);
    this.glov_input.clickHit(param);
    this.glov_input.isMouseOver(param);
  }

  // Note: modal dialogs not really compatible with HTML overlay on top of the canvas!
  modalDialog(params) {
    assert(!params.title || typeof params.title === 'string');
    assert(!params.text || typeof params.text === 'string');
    assert(typeof params.buttons === 'object');
    assert(Object.keys(params.buttons).length);

    this.modal_dialog = params;
  }

  modalDialogRun(modal_dialog) {
    const button_width = this.button_width / 2;
    const game_width = this.camera.x1() - this.camera.x0();
    const pad = this.pad;
    const text_w = this.modal_width - pad * 2;
    const x0 = this.camera.x0() + (game_width - this.modal_width) / 2;
    let x = x0 + pad;
    const y0 = this.modal_y0;
    let y = y0 + pad;
    let font_height = modal_dialog.font_height || this.font_height;

    if (modal_dialog.title) {
      y += this.font.drawSizedWrapped(this.modal_font_style, x, y, Z.MODAL, text_w, 0, font_height * this.modal_title_scale,
        modal_dialog.title);
      y += pad * 1.5;
    }

    if (modal_dialog.text) {
      y += this.font.drawSizedWrapped(this.modal_font_style, x, y, Z.MODAL, text_w, 0, font_height,
        modal_dialog.text);
      y += pad;
    }

    let keys = Object.keys(modal_dialog.buttons);
    x = x0 + this.modal_width - pad - button_width;
    for (let ii = keys.length - 1; ii >= 0; --ii) {
      let key = keys[ii];
      if (this.buttonText({
        x: x,
        y,
        z: Z.MODAL,
        w: button_width,
        h: this.button_height,
        text: key})
      ) {
        if (modal_dialog.buttons[key]) {
          modal_dialog.buttons[key]();
        }
        this.modal_dialog = null;
      }
      x -= pad + button_width;
    }
    y += this.button_height;
    y += pad * 2;
    this.panel({
      x: x0,
      y: y0,
      z: Z.MODAL - 1,
      w: this.modal_width,
      h: y - y0,
    });

    this.draw_list.queue(this.sprites.white, this.camera.x0(), this.camera.y0(), Z.MODAL - 2,
      this.color_modal_darken,
      [game_width, this.camera.y1() - this.camera.y0(), 1, 1]);

    this.glov_input.eatAllInput();
  }

  htmlPos(x, y) {
    const ymin = this.camera.y0();
    const ymax = this.camera.y1();
    const xmin = this.camera.x0();
    const xmax = this.camera.x1();
    return [100 * (x - xmin) / (xmax - xmin), 100 * (y - ymin) / (ymax - ymin)];
  }
  htmlSize(w, h) {
    const ymin = this.camera.y0();
    const ymax = this.camera.y1();
    const xmin = this.camera.x0();
    const xmax = this.camera.x1();
    return [100 * w / (xmax - xmin), 100 * h / (ymax - ymin)];
  }

  createEditBox(params) {
    return new GlovUIEditBox(this, params);
  }

  tick() {
    this.last_frame_button_mouseover = this.frame_button_mouseover;
    this.frame_button_mouseover = false;


    if (this.modal_dialog) {
      this.modalDialogRun(this.modal_dialog);
    }

    for (let ii = 0; ii < this.last_frame_edit_boxes.length; ++ii) {
      let edit_box = this.last_frame_edit_boxes[ii];
      let idx = this.this_frame_edit_boxes.indexOf(edit_box);
      if (idx === -1) {
        edit_box.unrun();
      }
    }
    this.last_frame_edit_boxes = this.this_frame_edit_boxes;
    this.this_frame_edit_boxes = [];

    while (this.dom_elems_issued < this.dom_elems.length) {
      let elem = this.dom_elems.pop();
      elem.remove();
    }
    this.dom_elems_issued = 0;
  }

  drawRect(x0, y0, x1, y1, z, color) {
    let mx = Math.min(x0, x1);
    let my = Math.min(y0, y1);
    let Mx = Math.max(x0, x1);
    let My = Math.max(y0, y1);
    this.draw_list.queue(this.sprites.white, mx, my, z, color, math_device.v2Build(Mx - mx, My - my));
  }

  _spreadTechParams(spread) {
    // spread=0 -> 1
    // spread=0.5 -> 2
    // spread=0.75 -> 4
    // spread=1 -> large enough to AA
    spread = Math.min(Math.max(spread, 0), 0.99);

    let d2dtp = this.draw_list.draw_2d.techniqueParameters;
    let tech_params = {
        clipSpace: d2dtp.clipSpace,
        param0: math_device.v4Build(0,0,0,0),
        texture: null
    };

    tech_params.param0[0] = 1 / (1 - spread);
    tech_params.param0[1] = -0.5 * tech_params.param0[0] + 0.5;
    return tech_params;
  }

  _drawCircleInternal(sprite, x, y, z, r, spread, tu1, tv1, tu2, tv2, color)
  {
    let x0 = x - r * 2 + r * 4 * tu1;
    let x1 = x - r * 2 + r * 4 * tu2;
    let y0 = y - r * 2 + r * 4 * tv1;
    let y1 = y - r * 2 + r * 4 * tv2;
    let elem = this.draw_list.queueraw(sprite._texture,
      x0, y0, z, x1 - x0, y1 - y0,
      tu1, tv1, tu2, tv2,
      color, 0, 'aa');
    elem.tech_params = this._spreadTechParams(spread);
  }

  drawCircle(x, y, z, r, spread, color)
  {
    this._drawCircleInternal(this.sprites.circle, x, y, z, r, spread, 0, 0, 1, 1, color);
  }

  drawHollowCircle(x, y, z, r, spread, color)
  {
    this._drawCircleInternal(this.sprites.hollow_circle, x, y, z, r, spread, 0, 0, 1, 1, color);
  }

  drawLine(x0, y0, x1, y1, z, w, spread, color)
  {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length = Math.sqrt(dx*dx + dy*dy);
    dx /= length;
    dy /= length;
    let tangx = -dy * w;
    let tangy = dx * w;

    this.draw_list.queueraw4(this.sprites.line._texture,
      x0 + tangx, y0 + tangy,
      x0 - tangx, y0 - tangy,
      x1 - tangx, y1 - tangy,
      x1 + tangx, y1 + tangy,
      z,
      0, 0, 1, 1,
      color, 'aa', this._spreadTechParams(spread));
  }

  drawCone(x0, y0, x1, y1, z, w0, w1, spread, color)
  {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length = Math.sqrt(dx*dx + dy*dy);
    dx /= length;
    dy /= length;
    let tangx = -dy;
    let tangy = dx;
    this.draw_list.queueraw4(this.sprites.cone._texture,
      x0 - tangx*w0, y0 - tangy*w0,
      x1 - tangx*w1, y1 - tangy*w1,
      x1 + tangx*w1, y1 + tangy*w1,
      x0 + tangx*w0, y0 + tangy*w0,
      z,
      0, 0, 1, 1,
      color, 'aa', this._spreadTechParams(spread));
  }

}


// overrideable default parameters
GlovUI.prototype.font_height = 24;
GlovUI.prototype.button_height = 32;
GlovUI.prototype.button_width = 200;
GlovUI.prototype.button_img_size = GlovUI.prototype.button_height;
GlovUI.prototype.modal_width = 600;
GlovUI.prototype.modal_y0 = 200;
GlovUI.prototype.modal_title_scale = 1.2;
GlovUI.prototype.pad = 16;
GlovUI.prototype.panel_pixel_scale = 40;


export function create() {
  let args = Array.prototype.slice.call(arguments, 0);
  args.splice(0,0, null);
  return new (Function.prototype.bind.apply(GlovUI, args))();
}
