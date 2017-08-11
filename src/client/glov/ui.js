/*global math_device: false */
/*global assert: false */
/*global Z: false */

window.Z = window.Z || {};
Z.UI = Z.UI || 100;
Z.MODAL = Z.MODAL || 1000;

const glov_font = require('./font.js');
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

  constructor(glov_sprite, glov_input, font, draw_list) {
    this.glov_sprite = glov_sprite;
    this.glov_input = glov_input;
    this.font = font;
    this.draw_list = draw_list;
    this.camera = glov_input.camera;

    this.color_white = math_device.v4Build(1, 1, 1, 1);
    this.color_black = math_device.v4Build(0,0,0, 1);
    this.color_rollover = math_device.v4Build(0.8, 0.8, 0.8, 1);
    this.color_click = math_device.v4Build(0.7, 0.7, 0.7, 1);
    this.color_panel = math_device.v4Build(1, 1, 1, 1);
    this.color_modal_darken = math_device.v4Build(0, 0, 0, 0.75);

    this.modal_font_style = glov_font.styleColored(null, 0x000000ff);

    let sprites = this.sprites = {};
    sprites.button = this.loadSpriteRect('button.png', [4, 5, 4], [13]);
    sprites.panel = this.loadSpriteRect('panel.png', [2, 12, 2], [2, 12, 2]);
    sprites.white = this.glov_sprite.createSprite('white', {
      width : 1,
      height : 1,
      x : 0,
      y : 0,
      rotation : 0,
      color : [1,1,1,1],
      origin: [0, 0],
      textureRectangle : math_device.v4Build(0, 0, 1, 1)
    });
    this.sounds = {};

    this.button_mouseover = false; // for callers to poll the very last button
    // For tracking global mouseover state
    this.last_frame_button_mouseover = false;
    this.frame_button_mouseover = false;

    this.modal_dialog = null;
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

  buttonShared(param, key) {
    let color = this.color_white;
    let ret = false;
    this.button_mouseover = false;
    if (this.glov_input.clickHit(param)) {
      this.setMouseOver(key);
      color = this.color_click;
      ret = true;
      this.playUISound('button_click');
    } else if (this.glov_input.isMouseOver(param)) {
      this.setMouseOver(key);
      color = this.glov_input.isMouseDown() ? this.color_click : this.color_rollover;
    } else {
      this.button_mouseover = false;
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
    this.font.drawAlignedSized(glov_font.styleColored(null, 0x000000ff), param.x, param.y, param.z + 0.1,
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

    if (modal_dialog.title) {
      y += this.font.drawSizedWrapped(this.modal_font_style, x, y, Z.MODAL, text_w, 0, this.font_height * this.modal_title_scale,
        modal_dialog.title);
      y += pad * 1.5;
    }

    if (modal_dialog.text) {
      y += this.font.drawSizedWrapped(this.modal_font_style, x, y, Z.MODAL, text_w, 0, this.font_height,
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

  tick() {
    this.last_frame_button_mouseover = this.frame_button_mouseover;
    this.frame_button_mouseover = false;


    if (this.modal_dialog) {
      this.modalDialogRun(this.modal_dialog);
    }
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
