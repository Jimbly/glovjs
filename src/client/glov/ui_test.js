/*global Z: false */
const assert = require('assert');
const glov_engine = require('./engine.js');
const glov_font = require('./font.js');
const glov_simple_menu = require('./simple_menu.js');
const glov_selection_box = require('./selection_box.js');

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
