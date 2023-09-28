import { internal as ui_internal } from './ui';
const { uiApplyStyle } = ui_internal;

export type UIStyleFields = {
  // font: Font;
  // font_style: FontStyle;
  // font_style_focused: FontStyle;
  // font_style_disabled: FontStyle;
  text_height: number;
  // text_align: ALIGN;
  // button_width: number;
  // button_height: number;
  // color sets - always a full set, and style defs could do single color for convenience and button param tints color
  // button_color_set: ColorSet;
  // button_img_regular: Sprite;
  // button_img_down: Sprite;
  // button_img_focused: Sprite;
  // button_img_disabled: Sprite;
  // sound_button: string;
  // sound_rollover: string;
  // tooltip_width: number;
  // tooltip_pad: number;
  // tooltip_pixel_scale: number;
};

const default_style_params_init: UIStyleFields = {
  text_height: 24,
};


export type UIStyle = Readonly<UIStyleFields>;

let ui_style_default: UIStyle;
let ui_style_current: UIStyle;

class UIStyleImpl implements UIStyleFields {
  text_height: number;
  constructor(params: Partial<UIStyle>, parent?: UIStyle) {
    this.text_height = params.text_height ?? (parent ? parent.text_height : ui_style_default.text_height);
  }
}

export function uiStyleAlloc(param: Partial<UIStyle>, parent?: UIStyle): UIStyle {
  return new UIStyleImpl(param, parent);
}

export function uiStyleDefault(): UIStyle {
  return ui_style_default;
}

export function uiStyleCurrent(): UIStyle {
  return ui_style_current;
}

export function uiStyleSetCurrent(style: UIStyle): void {
  ui_style_current = style;
  uiApplyStyle(ui_style_current);
}

export function uiStyleSetDefault(style: UIStyle): void {
  ui_style_default = style;
  // TODO: apply inheritance to all composite styles

  uiStyleSetCurrent(style);
}

uiStyleSetDefault(uiStyleAlloc(default_style_params_init));
