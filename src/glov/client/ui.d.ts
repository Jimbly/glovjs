// eslint-disable-next-line @typescript-eslint/no-redeclare
/* globals HTMLElement, Event */

import { Sprite, UnimplementedData } from 'glov/common/types';
import { Vec4 } from 'glov/common/vmath';
import { EditBoxOptsAll } from './edit_box';
import { ALIGN, Font, FontStyle, Text } from './font';
import { SoundID } from './sound';

export type ColorSet = { _opaque: 'ColorSet' };
export const Z: Partial<Record<string, number>>;
export const Z_MIN_INC: number;
export const LINE_ALIGN: number;
export const LINE_CAP_SQUARE: number;
export const LINE_CAP_ROUND: number;
export function makeColorSet(color: Vec4): ColorSet;
export interface UIBox {
  x: number;
  y: number;
  z?: number;
  w: number;
  h: number;
}
export interface UIBoxColored extends UIBox {
  color?: Vec4;
}
export type UIHookFn = (param: UIBox) => void;
export function addHook(draw: UIHookFn, click: UIHookFn): void;
// TODO: how to say that P must also be `{ key: string } | { x: number, y: number }`?
export function getUIElemData<T, P>(type: string, param: P, allocator: (param: P)=>T) : T;
export const font: Font;
export const title_font: Font;
export interface UISprites {
  button: Sprite;
  button_rollover: null | Sprite;
  button_down: Sprite;
  button_disabled: Sprite;
  panel: Sprite;
  menu_entry: Sprite;
  menu_selected: Sprite;
  menu_down: Sprite;
  menu_header: Sprite;
  slider: Sprite;
  slider_handle: Sprite;

  scrollbar_bottom: Sprite;
  scrollbar_trough: Sprite;
  scrollbar_top: Sprite;
  scrollbar_handle_grabber: Sprite;
  scrollbar_handle: Sprite;
  progress_bar: Sprite;
  progress_bar_trough: Sprite;
}
export const sprites: UISprites;
export const font_height: number;
export const button_width: number;
export const button_height: number;
export const panel_pixel_scale: number;
export function colorSetSetShades(rollover: number, down: number, disabled: number): void;
export function loadUISprite(name: string, ws: number[], hs: number[]): void;
type UISpriteDef = {
  name?: string;
  url?: string;
  ws?: number[];
  hs?: number[];
  wrap_t?: number; // gl.REPEAT | gl.CLAMP_TO_EDGE
  layers?: number;
};
export function loadUISprite2(name: string, param: UISpriteDef): void;
type BaseButtonLabels = Record<'ok' | 'cancel' | 'yes' | 'no', Text>;
type ExtraButtonLabels = Partial<Record<string, Text>>;
type ButtonLabels = BaseButtonLabels & ExtraButtonLabels;
export function setButtonsDefaultLabels(buttons_labels: ButtonLabels): void;
export function setProvideUserStringDefaultMessages(success_msg: Text, failure_msg: Text): void;
export function suppressNewDOMElemWarnings(): void;
export function uiGetDOMElem(last_elem: HTMLElement, allow_modal: boolean): null | HTMLElement;
export function bindSounds(sounds: Partial<Record<string, SoundID | SoundID[]>>): void;
export interface DrawHBoxParam extends UIBox {
  no_min_width?: boolean;
}
export function drawHBox(coords: DrawHBoxParam, s: Sprite, color?: Vec4): void;
export function drawVBox(coords: UIBox, s: Sprite, color?: Vec4): void;
export function drawBox(coords: UIBox, s: Sprite, pixel_scale: number, color?: Vec4): void;
export function drawMultiPartBox(
  coords: UIBox,
  scaleable_data: {
    widths: number[];
    heights: number[];
  }, sprite: Sprite,
  pixel_scale: number,
  color?: Vec4,
): void;
export function playUISound(name: string, volume?: number): void;
export function focusCanvas(): void;
export function uiHandlingNav(): boolean;

export interface PanelParam extends UIBoxColored {
  eat_clicks?: boolean;
  pixel_scale?: number;
  sprite?: Sprite;
}
export function panel(param: PanelParam): void;

export type TooltipValue = Text | ((param:unknown) => (Text | null));
export interface TooltipParam {
  x: number;
  y: number;
  z?: number;
  tooltip_width?: number;
  tooltip_pad?: number;
  tooltip_above?: boolean;
  tooltip_auto_above_offset?: number;
  pixel_scale?: number;
  tooltip: TooltipValue;
}
export function drawTooltip(param: TooltipParam): void;
export interface TooltipBoxParam {
  x: number;
  y: number;
  h: number;
  tooltip_width?: number;
  tooltip_above?: boolean;
  tooltip: Text | ((param:unknown) => (Text | null));
}
export function drawTooltipBox(param: TooltipBoxParam): void;

export interface ProgressBarParam extends UIBoxColored {
  progress: number; // 0..1
  color_trough?: Vec4;
  centered?: boolean;
  tooltip?: Text;
}
export function progressBar(param: ProgressBarParam): void;

// TODO: implement/move to spot.js
export type SpotParam = UnimplementedData;
// TODO: implement/move to spot.js
declare enum SpotState {
  SPOT_STATE_REGULAR = 1,
  SPOT_STATE_DOWN = 2,
  SPOT_STATE_FOCUSED = 3,
  SPOT_STATE_DISABLED = 4,
}
export type EventCallback = (event: Event) => void;
export type HookList = string | string[];
export type ButtonStateString = 'regular' | 'down' | 'rollover' | 'disabled';
export type ButtonRet = {
  // from SpotRet:
  ret: number;
  focused: boolean;
  // ui.button-specific
  state: ButtonStateString;
};
export interface ButtonParam extends Partial<TooltipParam> {
  x: number;
  y: number;
  z?: number;
  w?: number;
  h?: number;
  key?: string;
  draw_only?: boolean;
  draw_only_mouseover?: boolean;
  def?: SpotParam;
  disabled?: boolean;
  disabled_focusable?: boolean;
  sound?: string;
  z_bias?: Partial<Record<ButtonStateString, number>>;
  in_event_cb?: EventCallback | null;
  hook?: HookList;
  // Also: everything in SpotParam
}
export interface ButtonTextParam extends ButtonParam {
  text: Text;
  font_height?: number;
  align?: ALIGN;
}
export interface ButtonImageParamBase extends ButtonParam {
  shrink?: number;
  frame?: number;
  img_rect?: Vec4;
  left_align?: boolean;
  img_color?: Vec4;
  color1?: Vec4;
  rotation?: number;
  flip?: boolean;
}
export interface ButtonImageParam1 extends ButtonImageParamBase {
  imgs: Sprite[];
}
export interface ButtonImageParam2 extends ButtonImageParamBase {
  img: Sprite;
}
export type ButtonImageParam = ButtonImageParam1 | ButtonImageParam2;
export function buttonShared(param: ButtonParam): ButtonRet;
export function buttonBackgroundDraw(param: ButtonParam, state: ButtonStateString): void;
export function buttonSpotBackgroundDraw(param: ButtonParam, spot_state: SpotState): void;
export function buttonTextDraw(param: ButtonTextParam, state: ButtonStateString, focused: boolean): void;
export function buttonText(param: ButtonTextParam): ButtonRet;
export function buttonImage(param: ButtonImageParam): ButtonRet;
export function button(param: ButtonTextParam | ButtonImageParam): ButtonRet;

export function print(style: FontStyle | null, x: number, y: number, z: number, text: Text): number;

export interface LabelParam extends UIBox {
  style?: FontStyle;
  style_focused?: FontStyle;
  font?: Font;
  size?: number;
  align?: ALIGN;
  text?: Text;
  tooltip?: Text;
}
export function label(param: LabelParam): void;

export function modalDialogClear(): void;

export interface ModalDialogButtonEx<CB> extends Partial<ButtonTextParam> {
  cb?: CB | null;
  in_event_cb?: EventCallback | null;
  label?: Text;
}
export type ModalDialogButton<CB> = null | CB | ModalDialogButtonEx<CB>;
export type ModalDialogTickCallback = (param: {
  readonly x: number;
  y: number;
  readonly modal_width: number;
  readonly avail_width: number;
  readonly font_height: number;
  readonly fullscreen_mode: boolean;
}) => string | void;
export interface ModalDialogParamBase<CB> {
  title?: Text;
  text?: Text;
  font_height?: number;
  click_anywhere?: boolean;
  width?: number;
  button_width?: number;
  y0?: number;
  tick?: ModalDialogTickCallback;
  buttons?: Partial<Record<string, ModalDialogButton<CB>>>;
}

export type ModalDialogParam = ModalDialogParamBase<() => void>;
export function modalDialog(param: ModalDialogParam): void;

export interface ModalTextEntryParam extends ModalDialogParamBase<(text: string) => void> {
  edit_text?: EditBoxOptsAll['text'];
  max_len?: number;
}
export function modalTextEntry(param: ModalTextEntryParam): void;

export function isMenuUp(): boolean;

export interface MenuFadeParams {
  blur?: [number, number];
  saturation?: [number, number];
  brightness?: [number, number];
  fallback_darken?: Vec4;
  z?: number;
}
export function menuUp(param?: MenuFadeParams): void;
export function provideUserString(title: Text, str: string): void;
export function drawRect(x0: number, y0: number, x1: number, y1: number, z?: number, color?: Vec4): void;
export function drawRect2(param: UIBoxColored): void;
export function drawRect4Color(
  x0: number, y0: number,
  x1: number, y1: number,
  z: number,
  color_ul: Vec4,
  color_ur: Vec4,
  color_ll: Vec4,
  color_lr: Vec4,
): void;
// TODO: import from sprites.js's types after conversion
type BlendMode = 0 | 1 | 2; // BlendMode
export function drawElipse(
  x0: number, y0: number,
  x1: number, y1: number,
  z: number,
  spread: number,
  color?: Vec4,
  blend?: BlendMode,
): void;
export function drawCircle(
  x: number, y: number, z: number,
  r: number,
  spread: number,
  color?: Vec4,
  blend?: BlendMode,
): void;
export function drawHollowCircle(
  x: number, y: number, z: number,
  r: number,
  spread: number,
  color?: Vec4,
  blend?: BlendMode,
): void;
export type LineMode = number; // TODO: convert to enum type?
export function drawLine(
  x0: number, y0: number,
  x1: number, y1: number,
  z: number,
  w: number,
  precise: number,
  color?: Vec4,
  mode?: LineMode,
): void;
export function drawHollowRect(
  x0: number, y0: number,
  x1: number, y1: number,
  z: number,
  w: number,
  precise: number,
  color?: Vec4,
  mode?: LineMode,
): void;
export interface DrawHollowRectParam extends UIBoxColored {
  line_width?: number;
  precise?: number;
  mode?: LineMode;
}
export function drawHollowRect2(param: DrawHollowRectParam): void;
export function drawCone(
  x0: number, y0: number,
  x1: number, y1: number,
  z: number,
  w0: number, w1: number,
  spread: number,
  color?: Vec4,
): void;
export function setFontHeight(new_font_height: number): void;
export function scaleSizes(scale: number): void;
export function setPanelPixelScale(scale: number): void;
export function setModalSizes(
  modal_button_width: number,
  width: number,
  y0: number,
  title_scale: number,
  pad: number,
): void;
export function setTooltipWidth(tooltip_width: number, tooltip_panel_pixel_scale: number): void;

type UISpriteSet = {
  color_set_shades?: [number, number, number];

  button?: UISpriteDef;
  button_rollover?: UISpriteDef;
  button_down?: UISpriteDef;
  button_disabled?: UISpriteDef;
  panel?: UISpriteDef;
  menu_entry?: UISpriteDef;
  menu_selected?: UISpriteDef;
  menu_down?: UISpriteDef;
  menu_header?: UISpriteDef;
  slider?: UISpriteDef;
  slider_notch?: UISpriteDef;
  slider_handle?: UISpriteDef;

  scrollbar_bottom?: UISpriteDef;
  scrollbar_trough?: UISpriteDef;
  scrollbar_top?: UISpriteDef;
  scrollbar_handle_grabber?: UISpriteDef;
  scrollbar_handle?: UISpriteDef;
  progress_bar?: UISpriteDef;
  progress_bar_trough?: UISpriteDef;
};
export const internal : {
  checkHooks(param: { hook?: string }, click: boolean): void;
  cleanupDOMElems(): void;
  uiEndFrame(): void;
  uiSetFonts(new_font: Font, new_title_font?: Font): void;
  uiStartup(param: {
    font: Font;
    title_font?: Font;
    ui_sprites: UISpriteSet;
    line_mode?: LineMode;
  }): void;
  uiTick(dt: number): void;
};
