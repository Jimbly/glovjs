// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import { ROVec4, vec4 } from 'glov/common/vmath';
import { collapsagoriesHeader, collapsagoriesStart, collapsagoriesStop } from './collapsagories';
import { colorPicker } from './color_picker';
import { EditBox, editBoxCreate } from './edit_box';
import * as engine from './engine';
import { ALIGN, Font, FontStyle, fontStyle, fontStyleAlpha } from './font';
import { fscreenActive, fscreenEnter, fscreenExit } from './fscreen';
import * as input from './input';
import {
  mouseOver,
} from './input';
import { linkText } from './link';
import {
  localStorageGet,
  localStorageSet,
} from './local_storage';
import {
  markdownAuto,
  MDDrawBlock,
  MDDrawParam,
  MDLayoutBlock,
  MDLayoutCalcParam,
} from './markdown';
import { RenderableContent } from './markdown_parse';
import { markdownImageRegister, markdownLayoutFit } from './markdown_renderables';
import { ScrollArea, scrollAreaCreate } from './scroll_area';
import {
  dropDownCreate,
  SelectionBox,
  selectionBoxCreate,
} from './selection_box';
import { SimpleMenu, simpleMenuCreate } from './simple_menu';
import { slider } from './slider';
import { Sprite, spriteCreate } from './sprites';
import { TEXTURE_FORMAT } from './textures';
import * as ui from './ui';
import {
  uiButtonHeight,
  uiButtonWidth,
  uiTextHeight,
} from './ui';
import {
  uiStyleAlloc,
  uiStylePop,
  uiStylePush,
} from './uistyle';
import { getURLBase } from './urlhash';

const { abs, ceil, max, random, round, sin } = Math;

let demo_menu: SimpleMenu;
let demo_menu_up = false;
let demo_result: string | undefined;
let font_style: FontStyle;

let inited: string | undefined;
let edit_box1: EditBox;
let edit_box2: EditBox;
let test_select1: SelectionBox;
let test_dropdown: SelectionBox;
let test_dropdown_large: SelectionBox;
let test_scroll_area: ScrollArea;
let slider_value = 0.75;
let check_value = false;
let test_lines = 10;
let test_color = vec4(1,0,1,1);
let test_markdown_sprite: Sprite;

function init(x: number, y: number, column_width: number): void {
  edit_box1 = editBoxCreate({
    x: x + column_width,
    y: y,
    w: column_width - 8,
    text: localStorageGet('uitest.editbox1') || '',
  });
  edit_box2 = editBoxCreate({
    x: x + column_width + column_width,
    y: y,
    w: column_width - 8,
  });
  demo_menu = simpleMenuCreate({
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
  font_style = fontStyle(null, {
    outline_width: 1.0,
    outline_color: 0x800000ff,
    glow_xoffs: 3.25,
    glow_yoffs: 3.25,
    glow_inner: -2.5,
    glow_outer: 5,
    glow_color: 0x000000ff,
  });

  test_select1 = selectionBoxCreate({
    display: { use_markdown: true },
    items: ['Apples', 'Ba*nan*as', 'Chameleon'],
    z: Z.UI,
    width: column_width - 8,
  });
  test_dropdown = dropDownCreate({
    display: { use_markdown: true },
    items: ['Apples', 'Ba*nan*as', 'Chameleon', { name: 'Disabled', disabled: true }],
    z: Z.UI,
    width: column_width - 8,
  });

  let items = [];
  for (let ii = 0; ii < 100; ++ii) {
    items.push(`item${ii}`);
  }
  test_dropdown_large = dropDownCreate({
    items,
    z: Z.UI,
    width: column_width - 8,
  });

  test_scroll_area = scrollAreaCreate();

  // Create test texture for markdown use
  {
    const TEX_W = 32;
    let data = new Uint8Array(TEX_W * TEX_W);
    for (let yy = 0, idx=0; yy < TEX_W; ++yy) {
      let fy = 1 - abs((yy - TEX_W/2) / (TEX_W/2));
      for (let xx = 0; xx < TEX_W; ++xx, ++idx) {
        let fx = 1 - abs((xx - TEX_W/2) / (TEX_W/2));
        data[idx] = Math.max(fx, fy) * 255;
      }
    }
    test_markdown_sprite = spriteCreate({
      url: 'ui_test_tex',
      width: TEX_W,
      height: TEX_W,
      format: TEXTURE_FORMAT.R8,
      data,
      filter_min: gl.LINEAR,
      filter_mag: gl.LINEAR,
      wrap_s: gl.CLAMP_TO_EDGE,
      wrap_t: gl.CLAMP_TO_EDGE,
    });

    markdownImageRegister('test', {
      sprite: test_markdown_sprite,
    });
  }
}

const style_half_height = uiStyleAlloc({ text_height: '50%' });

let markdown_text: string;
let markdown_cache = {};
let md_text_height: number = 8;
let md_line_height: number = 8;
let last_md_text_height: number = 8;
let last_md_line_height: number = 8;

export function run(x: number, y: number, z: number): void {
  const font: Font = ui.font;
  z = z || Z.UI;
  const text_height = uiTextHeight();
  const button_height = uiButtonHeight();
  const button_width = uiButtonWidth();
  let line_height = button_height + 2;
  let column_width = button_width + 8;
  if (inited !== `${x}_${y}_${column_width}`) {
    init(x, y, column_width);
    inited = `${x}_${y}_${column_width}`;
  }

  if (demo_menu_up) {
    demo_result = '';
    demo_menu.run({ x: x + button_width, y: y + line_height, z: Z.MODAL });
    if (demo_menu.isSelected()) {
      if (demo_menu.isSelected('opt2')) {
        demo_result = 'Selected the second option';
      }
      if (!demo_result) {
        demo_result = `Menu selected: ${demo_menu.getSelectedItem().name}`;
      }
      demo_menu_up = false;
    }
    ui.menuUp();
    input.eatAllInput();
  }

  let pad = 4;

  if (ui.buttonText({ x, y, z, text: 'Modal Dialog', tooltip: 'Shows a modal dialog' })) {
    demo_result = '';
    ui.modalDialog({
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

  if (edit_box1.run() === edit_box1.SUBMIT) {
    ui.modalDialog({
      title: 'Modal Dialog',
      text: `Edit box submitted with text ${edit_box1.getText()}`,
      buttons: {
        'OK': null,
      },
    });
  }
  localStorageSet('uitest.editbox1', edit_box1.getText());
  if (edit_box2.run() === edit_box2.SUBMIT) {
    edit_box2.setText('');
  }

  if (ui.buttonText({ x: edit_box2.x + edit_box2.w + pad, y, z, text: '...', w: button_height })) {
    ui.modalTextEntry({
      title: 'Type something',
      edit_text: edit_box2.getText(),
      buttons: {
        ok: function (text: string) {
          edit_box2.setText(text);
        },
        cancel: null,
      }
    });
  }

  y += line_height;

  if (ui.buttonText({ x, y, z, text: 'Menu', tooltip: 'Shows a menu' })) {
    demo_menu_up = true;
  }

  colorPicker({
    x: x + column_width, y, z,
    color: test_color,
  });

  let scroll_area_h = text_height * 16 + pad;
  let scroll_area_w = 100;
  test_scroll_area.begin({
    x: x + column_width + 4 + line_height,
    y: y - 2,
    z,
    w: scroll_area_w,
    h: scroll_area_h,
  });
  let internal_y = 0;
  scroll_area_w -= test_scroll_area.barWidth();

  let header_h = 13;
  collapsagoriesStart({
    key: 'ui_test_cats',
    x: 0, z, w: scroll_area_w,
    num_headers: 4 + (engine.defines.MD ? -1 : 0),
    view_y: test_scroll_area.getScrollPos(),
    view_h: scroll_area_h,
    header_h,
    parent_scroll: test_scroll_area,
  });

  if (!engine.defines.MD) {
    collapsagoriesHeader({
      y: internal_y,
      text: 'Values',
      text_height,
    });
    internal_y += header_h + pad;

    internal_y += font.drawSizedAligned(font_style, 2, internal_y, z + 1,
      text_height, ALIGN.HWRAP|ALIGN.HFIT, scroll_area_w - 2, 0,
      `Edit Box Text: ${edit_box1.getText()}+${edit_box2.getText()}`) + pad;
    ui.print(font_style, 2, internal_y, z + 1, `Result: ${demo_result}`);
    internal_y += text_height + pad;
    markdownAuto({
      font_style, x: 2, y: internal_y, z: z + 1,
      text: `Dropdown: ${test_dropdown.getSelected().name}`
    });
    internal_y += text_height + pad;

    ui.progressBar({
      x: 2,
      y: internal_y, z,
      w: 60, h: button_height,
      progress: slider_value,
    });
    internal_y += button_height + pad;
  }

  collapsagoriesHeader({
    y: internal_y,
    text: 'Markdown',
    text_height,
  });
  internal_y += header_h;

  font.draw({
    x: 16,
    y: internal_y + 2,
    z: Z.UI + 20,
    text: 'text_height',
    color: 0x00000080,
  });
  font.draw({
    x: button_width + 1,
    y: internal_y + 2,
    text: `${md_text_height}`,
  });
  md_text_height = round(slider(md_text_height, {
    x: 0,
    y: internal_y,
    min: 1,
    max: 16,
    step: 1,
  }));
  if (md_text_height !== last_md_text_height) {
    last_md_text_height = md_text_height;
    md_line_height = max(md_line_height, md_text_height);
    markdown_cache = {};
  }
  internal_y += button_height;

  font.draw({
    x: 16,
    y: internal_y + 2,
    z: Z.UI + 20,
    text: 'line_height',
    color: 0x00000080,
  });
  font.draw({
    x: button_width + 1,
    y: internal_y + 2,
    text: `${md_line_height}`,
  });
  md_line_height = round(slider(md_line_height, {
    x: 0,
    y: internal_y,
    min: 1,
    max: 16,
    step: 1,
  }));
  if (md_line_height !== last_md_line_height) {
    last_md_line_height = md_line_height;
    markdown_cache = {};
  }
  internal_y += button_height;
  internal_y += pad;

  internal_y += markdownAuto({
    font_style,
    x: 2,
    y: internal_y,
    z: z + 1,
    w: scroll_area_w - 2,
    text_height: md_text_height,
    line_height: md_line_height,
    align: ALIGN.HWRAP|ALIGN.HFIT,
    text: `Edit Box MD: ${edit_box1.getText()}+${edit_box2.getText()}`,
  }).h + pad;

  internal_y += markdownAuto({
    font_style,
    x: 2,
    y: internal_y,
    z: z + 1,
    w: scroll_area_w - 2,
    text_height: md_text_height,
    line_height: md_line_height,
    align: ALIGN.HWRAP|ALIGN.HFIT,
    text: 'A[foo=bar text="Foo Bar"]B',
    cache: markdown_cache,
    custom: {
      foo: {
        type: 'blinker',
        data: true
      },
    },
    renderables: {
      // Not super efficient example: optimally first two functions should
      //   return an instance of a class, but this is heavily cached, so doesn't
      //   matter much except for type clarity.
      blinker: (content: RenderableContent, data: unknown): MDLayoutBlock | null => {
        if (!data) {
          // this is not a valid generic renderable, only allowed via the custom tab with associated data
          return null;
        }
        let text = String(content.param?.text || content.key);
        return {
          layout: (layout_param: MDLayoutCalcParam): MDDrawBlock[] => {
            let w = font.getStringWidth(null, layout_param.text_height, text) +
              layout_param.text_height * 0.25;
            let dims = {
              w,
              h: layout_param.line_height,
            };
            assert(markdownLayoutFit(layout_param, dims));
            return [{
              dims,
              draw: (draw_param: MDDrawParam): void => {
                let rect = {
                  x: draw_param.x + dims.x,
                  y: draw_param.y + dims.y,
                  w: dims.w,
                  h: dims.h,
                };
                let color: ROVec4;
                let v = sin(engine.getFrameTimestamp() * 0.01) * 0.5 + 0.5;
                if (mouseOver(rect)) {
                  color = [0.5 + v * 0.5, v*0.7, 0, draw_param.alpha];
                } else {
                  color = [v* 0.5, 0, v, draw_param.alpha];
                }
                test_markdown_sprite.draw({
                  ...rect,
                  z: draw_param.z,
                  color,
                });
                font.draw({
                  alpha: draw_param.alpha,
                  ...rect,
                  z: draw_param.z + 0.1,
                  align: ALIGN.HVCENTERFIT,
                  size: layout_param.text_height,
                  text: text,
                });
              },
            }];
          },
        };
      },
    },
  }).h + pad;

  if (!markdown_text) {
    // For perf testing: set to 300000
    markdown_text = new Array(3).join(`# Lorem Markdownum

## Qua [img=test] *promissa*

Lorem mark[img=test]downum vestrae geminique asque comas; **muu siq**,
inconsumpta? Quod siquid ferroque labores Cererisque praevia exacta patitur arge
nec arborei timentem, ut crimina vidit.
`);
  }
  internal_y += markdownAuto({
    font_style,
    x: 2,
    y: internal_y,
    z: z + 1,
    w: scroll_area_w - 2,
    text_height: md_text_height,
    line_height: md_line_height,
    align: ALIGN.HWRAP|ALIGN.HFIT,
    text: markdown_text,
  }).h + pad;

  internal_y += markdownAuto({
    font_style,
    x: 2,
    y: internal_y,
    z: z + 1,
    w: scroll_area_w - 2,
    text_height: md_text_height,
    line_height: md_line_height,
    align: ALIGN.HWRAP|ALIGN.HFIT|ALIGN.HCENTER,
    text: markdown_text,
  }).h + pad;

  collapsagoriesHeader({
    y: internal_y,
    text: 'Widgets',
    text_height,
  });
  internal_y += header_h + pad;

  linkText({ x: 2, y: internal_y, text: 'Ext URL', url: 'https://github.com/jimbly/glovjs' });
  if (linkText({ x: column_width/2, y: internal_y, text: 'Int URL',
    internal: true,
    url: engine.defines.SPOT_DEBUG ? getURLBase() : `${getURLBase()}?D=SPOT_DEBUG` })
  ) {
    engine.defines.SPOT_DEBUG = !engine.defines.SPOT_DEBUG;
  }
  internal_y += text_height + pad;
  internal_y += test_dropdown_large.run({ x: 2, y: internal_y, z: z + 1 }) + pad;
  if (ui.buttonText({ x: 2, y: internal_y, z, text: 'Disabled', tooltip: 'A disabled button', disabled: true })) {
    assert(false);
  }
  internal_y += button_height + pad;

  check_value = ui.checkbox(check_value, {
    x: 2, y: internal_y, z, text: 'A _checkbox_',
    markdown: true,
    tooltip: `This checkbox is *${check_value ? '' : 'un'}checked*`,
    tooltip_markdown: true,
  });
  internal_y += button_height + pad;

  collapsagoriesHeader({
    y: internal_y, w: 8, x: 7, z: 7,
    text: 'Misc',
    text_height,
  });
  internal_y += header_h + pad;

  ui.label({ x: 2, y: internal_y, size: text_height * 0.5, text: 'Small text param size' });
  internal_y += text_height * 0.5;
  ui.label({ x: 2, y: internal_y, style: style_half_height, text: 'Small text param style' });
  internal_y += style_half_height.text_height;
  uiStylePush(style_half_height);
  ui.label({ x: 2, y: internal_y, style: style_half_height, text: 'Small text push style' });
  internal_y += uiTextHeight();
  uiStylePop();

  for (let ii = 0; ii < test_lines; ++ii) {
    ui.print(font_style, 2, internal_y, z + 1, `Line #${ii}`);
    internal_y += text_height + pad;
  }
  if (ui.buttonText({ x: 2, y: internal_y, z: z + 1, text: 'Add Line', key: 'add_line' })) {
    ++test_lines;
  }
  internal_y += button_height + pad;
  if (ui.buttonText({ x: 2, y: internal_y, z: z + 1, text: 'Remove Line', key: 'remove_line' })) {
    --test_lines;
  }
  internal_y += button_height + pad;
  ui.buttonText({ x: 2, y: internal_y, z: z + 1, text: 'Fullscreen',
    in_event_cb: fscreenActive() ? fscreenExit : fscreenEnter });
  internal_y += button_height + pad;

  let long_msg = 'Lots of long text that needs to be wrapped on this button label that really' +
      ' needs to be wrapped or otherwise dealt with in a reasonable way.';
  ui.buttonText({ x: 2, y: internal_y, z: z + 1,
    align: ALIGN.HVCENTERFIT,
    text: `HVCENTERFIT: ${long_msg}` });
  internal_y += button_height + pad;
  ui.buttonText({ x: 2, y: internal_y, z: z + 1,
    align: ALIGN.HWRAP | ALIGN.HVCENTERFIT,
    text: `HWRAP|HVCENTERFIT: ${long_msg}` });
  internal_y += button_height + pad;
  ui.buttonText({ x: 2, y: internal_y, z: z + 1,
    align: ALIGN.HWRAP | ALIGN.HVCENTERFIT,
    text: 'HWRAP|HVCENTERFIT\nWith\nCarriage\nReturns' });
  internal_y += button_height + pad;
  ui.buttonText({ x: 2, y: internal_y, z: z + 1,
    align: ALIGN.HWRAP | ALIGN.HVCENTERFIT,
    text: 'HWRAP|HVCENTERFIT and also very long text eh what ya gonna do? lorem ipsum omgwtfbarbq\nWith\nCR' });
  internal_y += button_height + pad;

  collapsagoriesStop();
  test_scroll_area.end(internal_y);
  ui.panel({ x: test_scroll_area.x - pad, y: test_scroll_area.y - pad, z: z - 1,
    w: test_scroll_area.w + pad * 2, h: test_scroll_area.h + pad * 2 });

  y += line_height;

  y += test_select1.run({ x, y, z });
  y += test_dropdown.run({ x, y, z });

  //y = max(y, test_scroll_area.y + test_scroll_area.h + pad);
  slider_value = slider(slider_value, {
    x, y, z,
    min: 0,
    max: 2,
  });
  ui.print(null, x + button_width + pad, y, z, `${slider_value.toFixed(2)}`);
  y += button_height;
}

export function runFontTest(x: number, y: number): void {
  const COLOR_RED = 0xFF0000ff;
  const COLOR_GREEN = 0x00FF00ff;
  const COLOR_WHITE = 0xFFFFFFff;
  const COLOR_INVISIBLE = 0x00000000;
  let z = Z.UI;
  const font: Font = ui.font;
  const text_height = uiTextHeight();

  let font_size = text_height * 2;
  font.drawSized(null, x, y, z, font_size, `Default ${font_size} ${random().toFixed(7)}`);
  y += font_size;
  font.drawSized(null, x, y, z, font_size / 2, `Default ${font_size / 2} Lorem ipsum dolor sit amet <[A|B]>`);
  y += ceil(font_size / 2);
  font.drawSized(null, x, y, z, font_size / 4,
    `Default ${font_size / 4} The quick brown fox jumped over the lazy dog rutabaga Alfalfa`);
  y += ceil(font_size / 4);

  const font_style_outline = fontStyle(null, {
    outline_width: 1, outline_color: COLOR_RED,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_INVISIBLE,
    color: COLOR_WHITE
  });
  const font_style_outline_dim = fontStyle(null, {
    outline_width: 1, outline_color: 0x0000007f,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_INVISIBLE,
    color: COLOR_WHITE
  });
  const font_style_outline_dim2 = fontStyle(null, {
    outline_width: 1, outline_color: 0xFF00007f,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_INVISIBLE,
    color: COLOR_WHITE
  });
  let xx = x;
  xx += font.drawSized(font_style_outline, xx, y, z, font_size, 'Outline ');
  xx += font.drawSized(font_style_outline_dim, xx, y, z, font_size, 'Dim ');
  xx += font.drawSized(font_style_outline_dim2, xx, y, z, font_size, 'Out');
  xx += font.drawSized(fontStyleAlpha(font_style_outline_dim2, 0.5), xx, y, z, font_size, 'line');
  y += font_size;

  const font_style_glow = fontStyle(null, {
    outline_width: 0, outline_color: COLOR_INVISIBLE,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: -1, glow_outer: 4, glow_color: COLOR_GREEN,
    color: COLOR_WHITE
  });
  const font_style_glow_dim = fontStyle(null, {
    outline_width: 0, outline_color: COLOR_INVISIBLE,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: -1, glow_outer: 4, glow_color: 0x00FF0020,
    color: COLOR_WHITE
  });
  const font_style_glow_dim_on_dim = fontStyle(null, {
    outline_width: 0, outline_color: COLOR_INVISIBLE,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: -1, glow_outer: 4, glow_color: 0x00FF0020,
    color: 0xFFFFFF80,
  });
  xx = x;
  xx += font.drawSized(font_style_glow, xx, y, z, font_size, 'Glow ');
  xx += font.drawSized(font_style_glow_dim, xx, y, z, font_size, 'Dim ');
  font.drawSized(font_style_glow_dim_on_dim, xx, y, z, font_size, 'Glow ');
  y += font_size;

  const font_style_shadow = fontStyle(null, {
    outline_width: 0, outline_color: COLOR_INVISIBLE,
    glow_xoffs: 4, glow_yoffs: 4, glow_inner: -2.5, glow_outer: 5, glow_color: COLOR_GREEN,
    color: COLOR_WHITE
  });
  xx = x;
  xx += font.drawSized(font_style_shadow, xx, y, z, font_size, 'Glow (Shadow) O0O1Il');
  font.drawSized(null, xx, y, z, font_size, 'Aligned');
  y += font_size;

  const font_style_both = fontStyle(null, {
    outline_width: 1, outline_color: COLOR_RED,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 6, glow_color: COLOR_GREEN,
    color: COLOR_WHITE
  });
  const font_style_both_soft_on_hard = fontStyle(null, {
    outline_width: 1, outline_color: 0xFF00007f,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 6, glow_color: COLOR_GREEN,
    color: COLOR_WHITE
  });
  const font_style_both_hard_on_soft = fontStyle(null, {
    outline_width: 1, outline_color: COLOR_RED,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 6, glow_color: 0x00FF0040,
    color: COLOR_WHITE
  });
  const font_style_both_soft_on_soft = fontStyle(null, {
    outline_width: 1, outline_color: 0xFF00007f,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 6, glow_color: 0x00FF0040,
    color: COLOR_WHITE
  });
  xx = x;
  xx += font.drawSized(font_style_both, xx, y, z, font_size, 'B');
  xx += font.drawSized(fontStyleAlpha(font_style_both, 0.75), xx, y, z, font_size, 'o');
  xx += font.drawSized(fontStyleAlpha(font_style_both, 0.5), xx, y, z, font_size, 't');
  xx += font.drawSized(fontStyleAlpha(font_style_both, 0.25), xx, y, z, font_size, 'h ');
  xx += font.drawSized(font_style_both_soft_on_hard, xx, y, z, font_size, 'SoH ');
  xx += font.drawSized(font_style_both_hard_on_soft, xx, y, z, font_size, 'HoH ');
  xx += font.drawSized(font_style_both_soft_on_soft, xx, y, z, font_size, 'SoS 0O0 ');
  font.drawSized(null, xx, y, z, font_size, 'A');
  y += font_size;

  let font_size2 = 32;
  const font_style_both2 = fontStyle(null, {
    outline_width: 1.75,outline_color: COLOR_RED,
    glow_xoffs: 0.25, glow_yoffs: 0.25, glow_inner: 0, glow_outer: 5, glow_color: 0x7F7F7Fff,
    color: COLOR_WHITE
  });
  font.drawSizedAligned(font_style_both2, x, y, z, font_size2, ALIGN.HFIT, uiButtonWidth() * 2, 0,
    'ALIGN.HFIT The quick brown fox jumps over the lazy dog');
  y += font_size2;

  let test = 'glow';

  if (test === 'outline') {
    const font_style_outline2 = fontStyle(null, {
      outline_width: 1, outline_color: COLOR_RED,
      glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_INVISIBLE,
      color: COLOR_WHITE
    });
    for (let ii = 1; ii <= 4; ii++) {
      font.drawSizedAligned(
        fontStyle(font_style_outline2, {
          outline_width: ii * 2,
        }), x, y, z, font_size2, ALIGN.HLEFT, 400, 0,
        `Outline thickness ${ii * 2}`);
      y += font_size2;
    }

    // Not allowing non-uniform scaling here, simulate with camera?
    // font.drawSizedAligned(font_style_outline2, x, y, z, font_size2 * 2, font_size2, ALIGN.HLEFT, 400, 0,
    //   'Wide thick outline');
    // y += font_size2;
    // font.drawSizedAligned(font_style_outline2, x, y, z, font_size2, font_size2 * 2, ALIGN.HLEFT, 400, 0,
    //   'Tall thick outline');
    // y += font_size2 * 2;
  } else if (test === 'glow') {
    const font_style_glow2 = fontStyle(null, {
      outline_width: 0, outline_color: COLOR_INVISIBLE,
      glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 8, glow_color: COLOR_RED,
      color: COLOR_WHITE
    });
    for (let ii = 1; ii <= 4; ii++) {
      xx = x;
      xx += font.drawSizedAligned(
        fontStyle(font_style_glow2, {
          // glow_inner: ii * 2 - 1,
          glow_outer: ii * 2,
        }), x, y, z, font_size2, ALIGN.HLEFT, 400, 0,
        `Glow outer ${ii * 2}`);
      font.drawSized(null, xx, y, z, font_size2, 'A');
      y += font_size2;
    }

    // Not allowing non-uniform scaling here, simulate with camera?
    // font.drawSizedAligned(font_style_glow2, x, y, z, font_size2 * 2, font_size2, ALIGN.HLEFT, 400, 0,
    //   'Wide thick glow \x01\x02\xe5\xae\xb4\xe8\xaf\xb7');
    // y += font_size2;
    // font.drawSizedAligned(font_style_glow2, x, y, z, font_size2, font_size2 * 2, ALIGN.HLEFT, 400, 0,
    //   'Tall thick glow');
    // y += font_size2 * 2;
  } else if (test === 'wrap') {
    y += font.drawSizedWrapped(null, x, y, z, 400, 24, font_size2,
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor' +
      ' incididunt utlaboreetdoloremagnaaliqua.');
  }


  // Gradient not supported
  // y = y0;
  // x += font_size * 8;
  // const font_style_gradient = fontStyle(null, {
  //   outline_width: 1, outline_color: 0x777777ff,
  //   glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: COLOR_BLUE,
  //   gradient: [COLOR_WHITE, COLOR_WHITE, COLOR_BLACK, COLOR_BLACK],
  // });
  // font.drawSized(font_style_gradient, x, y + Math.sin(engine.getFrameTimestamp() * 0.005) * 20, z,
  //   font_size*2, 'Gradient');
  // y += font_size*2;
}
