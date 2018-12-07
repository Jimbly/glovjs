/*global Z: false */
const assert = require('assert');
const glov_engine = require('./engine.js');
const glov_font = require('./font.js');
const glov_simple_menu = require('./simple_menu.js');
const glov_selection_box = require('./selection_box.js');

const { random } = Math;

let glov_ui;
let glov_input;

let demo_menu;
let demo_menu_up = false;
let demo_result;
let font_style;

let inited;
let edit_box1;
let edit_box2;
let test_select1;
let test_select2;
function init(x, y) {
  glov_ui = glov_engine.glov_ui;
  glov_input = glov_engine.glov_input;

  edit_box1 = glov_ui.createEditBox({
    x: x + 210,
    y: y,
    w: 200,
  });
  edit_box2 = glov_ui.createEditBox({
    x: x + 210 + 210,
    y: y,
    w: 200,
  });
  demo_menu = glov_simple_menu.create({
    items: [
      'Option 1',
      {
        name: 'Option 2',
        tag: 'opt2',
      }, {
        name: 'Option C',
        cb: () => {
          demo_result = 'Callback the third';
        },
      },
    ]
  });
  font_style = glov_font.style(null, {
    outline_width: 1.0,
    outline_color: 0x800000ff,
    glow_xoffs: 3.25,
    glow_yoffs: 3.25,
    glow_inner: -2.5,
    glow_outer: 5,
    glow_color: 0x000000ff,
  });

  test_select1 = glov_selection_box.create({
    items: ['Apples', 'Bananas', 'Chameleon'],
    z: Z.UI,
    width: 200,
  });
  test_select2 = glov_selection_box.create({
    items: ['Apples', 'Bananas', 'Chameleon'],
    is_dropdown: true,
    z: Z.UI,
    width: 200,
  });
}

export function run(x, y) {
  let z = Z.UI;
  if (inited !== `${x}_${y}`) {
    init(x, y);
    inited = `${x}_${y}`;
  }

  if (demo_menu_up) {
    demo_result = '';
    demo_menu.run({ x: 120, y: 180, z: Z.MODAL });
    if (demo_menu.isSelected()) {
      if (demo_menu.isSelected('opt2')) {
        demo_result = 'Selected the second option';
      }
      if (!demo_result) {
        demo_result = `Menu selected: ${demo_menu.getSelectedItem().name}`;
      }
      demo_menu_up = false;
    }
    glov_ui.menuUp();
    glov_input.eatAllInput();
  }

  let pad = 8;
  let w = glov_ui.print(font_style, x + 210, y + 40, z, `Edit Box Text: ${edit_box1.text}+${edit_box2.text}`);
  w = Math.max(w, glov_ui.print(font_style, x + 210, y + 40 + glov_ui.font_height + pad, z,
    `Result: ${demo_result}`));
  glov_ui.panel({ x: x + 210 - pad, y: y + 40 - pad, z: z - 1, w: w + pad * 2, h: glov_ui.font_height * 2 + pad * 3 });

  if (glov_ui.buttonText({ x, y, text: 'Modal Dialog', tooltip: 'Shows a modal dialog' })) {
    demo_result = '';
    glov_ui.modalDialog({
      title: 'Modal Dialog',
      text: 'This is a modal dialog!',
      buttons: {
        'OK': function () {
          demo_result = 'OK pushed!';
        },
        'Cancel': null, // no callback
      },
    });
  }
  y += 35;

  if (edit_box1.run() === edit_box1.SUBMIT) {
    glov_ui.modalDialog({
      title: 'Modal Dialog',
      text: `Edit box submitted with text ${edit_box1.text}`,
      buttons: {
        'OK': null,
      },
    });
  }
  if (edit_box2.run() === edit_box2.SUBMIT) {
    edit_box2.setText('');
  }

  if (glov_ui.buttonText({ x, y, text: 'Menu', tooltip: 'Shows a menu' })) {
    demo_menu_up = true;
  }
  y += 35;

  if (glov_ui.buttonText({ x, y, text: 'Disabled', tooltip: 'A disabled button', disabled: true })) {
    assert(false);
  }
  y += 35;

  y += test_select1.run({ x, y });
  y += test_select2.run({ x, y });
}

export function runFontTest(x, y) {
  const COLOR_RED = 0xFF0000ff;
  const COLOR_GREEN = 0x00FF00ff;
  const COLOR_WHITE = 0xFFFFFFff;
  const COLOR_INVISIBLE = 0x00000000;
  let z = Z.UI;
  let font = glov_engine.font;

  let font_size = 60;
  font.drawSized(null, x, y, z, font_size, `Default ${font_size} ${random().toFixed(7)}`);
  y += font_size;
  font.drawSized(null, x, y, z, font_size / 2, `Default ${font_size / 2} Lorem ipsum dolor sit amet`);
  y += font_size / 2;
  font.drawSized(null, x, y, z, font_size / 4,
    `Default ${font_size / 4} The quick brown fox jumped over the lazy dog rutabaga Alfalfa`);
  y += font_size / 4;

  const font_style_outline = {
    outline_width: 1, outline_color: COLOR_RED,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_INVISIBLE,
    color: COLOR_WHITE
  };
  font.drawSized(font_style_outline, x, y, z, font_size, 'Outline');
  y += font_size;

  const font_style_glow = {
    outline_width: 0, outline_color: COLOR_INVISIBLE,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: -1, glow_outer: 4, glow_color: COLOR_GREEN,
    color: COLOR_WHITE
  };
  font.drawSized(font_style_glow, x, y, z, font_size, 'Glow');
  y += font_size;

  const font_style_shadow = {
    outline_width: 0, outline_color: COLOR_INVISIBLE,
    glow_xoffs: 3.25, glow_yoffs: 3.25, glow_inner: -2.5, glow_outer: 5, glow_color: COLOR_GREEN,
    color: COLOR_WHITE
  };
  font.drawSized(font_style_shadow, x, y, z, font_size, 'Glow (Shadow) O0O');
  y += font_size;

  const font_style_both = {
    outline_width: 1, outline_color: COLOR_RED,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 6, glow_color: COLOR_GREEN,
    color: COLOR_WHITE
  };
  font.drawSized(font_style_both, x, y, z, font_size, 'Both 0O0');
  y += font_size;

  let font_size2 = 32;
  const font_style_both2 = {
    outline_width: 1.75,outline_color: COLOR_RED,
    glow_xoffs: 0.25, glow_yoffs: 0.25, glow_inner: 0, glow_outer: 5, glow_color: 0x7F7F7Fff,
    color: COLOR_WHITE
  };
  font.drawSizedAligned(font_style_both2, x, y, z, font_size2, glov_font.ALIGN.HFIT, 400, 0,
    'ALIGN.HFIT The quick brown fox jumps over the lazy dog');
  y += font_size2;
  font.drawSizedAligned(font_style_both2, x, y, z, font_size2, glov_font.ALIGN.HFIT, 140, 0,
    '0 Players (+1 Easy Bots)');
  y += font_size2;

  let test = 'glow';

  if (test === 'outline') {
    const font_style_outline2 = {
      outline_width: 1, outline_color: COLOR_RED,
      glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_INVISIBLE,
      color: COLOR_WHITE
    };
    for (let ii = 1; ii <= 4; ii++) {
      font_style_outline2.outline_width = ii * 2;
      font.drawSizedAligned(font_style_outline2, x, y, z, font_size2, glov_font.ALIGN.HLEFT, 400, 0,
        `Outline thickness ${ii * 2}`);
      y += font_size2;
    }

    // Not allowing non-uniform scaling here, simulate with camera?
    // font.drawSizedAligned(font_style_outline2, x, y, z, font_size2 * 2, font_size2, glov_font.ALIGN.HLEFT, 400, 0,
    //   'Wide thick outline');
    // y += font_size2;
    // font.drawSizedAligned(font_style_outline2, x, y, z, font_size2, font_size2 * 2, glov_font.ALIGN.HLEFT, 400, 0,
    //   'Tall thick outline');
    // y += font_size2 * 2;
  } else if (test === 'glow') {
    const font_style_glow2 = {
      outline_width: 0, outline_color: COLOR_INVISIBLE,
      glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 8, glow_color: COLOR_RED,
      color: COLOR_WHITE
    };
    for (let ii = 1; ii <= 4; ii++) {
      //font_style_glow2.glow_inner = ii * 2 - 1;
      font_style_glow2.glow_outer = ii * 2;
      font.drawSizedAligned(font_style_glow2, x, y, z, font_size2, glov_font.ALIGN.HLEFT, 400, 0,
        `Glow outer ${ii * 2}`);
      y += font_size2;
    }

    // Not allowing non-uniform scaling here, simulate with camera?
    // font.drawSizedAligned(font_style_glow2, x, y, z, font_size2 * 2, font_size2, glov_font.ALIGN.HLEFT, 400, 0,
    //   'Wide thick glow \x01\x02\xe5\xae\xb4\xe8\xaf\xb7');
    // y += font_size2;
    // font.drawSizedAligned(font_style_glow2, x, y, z, font_size2, font_size2 * 2, glov_font.ALIGN.HLEFT, 400, 0,
    //   'Tall thick glow');
    // y += font_size2 * 2;
  } else if (test === 'wrap') {
    y += font.drawSizedWrapped(null, x, y, z, 400, 24, font_size2, 0xFFFFFFff,
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor' +
      ' incididunt utlaboreetdoloremagnaaliqua.');
  }


  // Gradient not supported
  // y = y0;
  // x += font_size * 8;
  // const font_style_gradient = {
  //   outline_width: 1, outline_color: 0x777777ff,
  //   glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_BLUE,
  //   gradient: [COLOR_WHITE, COLOR_WHITE, COLOR_BLACK, COLOR_BLACK],
  // };
  // font.drawSized(font_style_gradient, x, y + Math.sin(glov_engine.getFrameTimestamp() * 0.005) * 20, z,
  //   font_size*2, 'Gradient');
  // y += font_size*2;
}
