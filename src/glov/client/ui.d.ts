import { Sprite, UnimplementedData, UnimplementedFunction } from 'glov/common/types';
import { Vec4 } from 'glov/common/vmath';
import { EditBoxOptsAll } from './edit_box';
import { ALIGN, Font, FontStyle, Text } from './font';

export type ColorSet = { _opaque: 'ColorSet' };
export const Z: Partial<Record<string, number>>;
export const Z_MIN_INC: number;
export const LINE_ALIGN: number;
export const LINE_CAP_SQUARE: number;
export const LINE_CAP_ROUND: number;
export function makeColorSet(color: Vec4): ColorSet;
export interface UIBox {
  x: number, y: number, z?: number,
  w: number, h: number,
}
export type UIHookFn = (param: UIBox) => void;
export function addHook(draw: UIHookFn, click: UIHookFn): void;
// TODO: how to say that P must also be `{ key: string } | { x: number, y: number }`?
export function getUIElemData<T, P>(type: string, param: P, allocator: (param: P)=>T) : T;
export let font: Font;
export let title_font: Font;
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
export let sprites: UISprites;
export let font_height: number;
export let button_width: number;
export let button_height: number;
export function colorSetSetShades(rollover: number, down: number, disabled: number): void;
export function loadUISprite(name: string, ws: number[], hs: number[]): void;
//export function loadUISprite2(name, param)
export function setFonts(new_font: Font, new_title_font?: Font): void
//export function setButtonsDefaultLabels(buttons_labels)
//export function setProvideUserStringDefaultMessages(success_msg, failure_msg)
//export function suppressNewDOMElemWarnings()
//export function uiGetDOMElem(last_elem, allow_modal)
//export function bindSounds(_sounds)
export function drawHBox(coords: UIBox, s: Sprite, color?: Vec4): void;
export function drawVBox(coords: UIBox, s: Sprite, color?: Vec4): void;
export function drawBox(coords: UIBox, s: Sprite, pixel_scale: number, color?: Vec4): void;
//export function drawMultiPartBox(coords, scaleable_data, s, pixel_scale, color)
export function playUISound(name: string, volume?: number): void;
export function focusCanvas(): void;
export function uiHandlingNav(): boolean;

interface PanelParam extends UIBox {
  eat_clicks?: boolean;
  color?: Vec4;
  pixel_scale?: number;
  sprite?: Sprite;
}
export function panel(param: PanelParam): void;

interface TooltipParam {
  x: number;
  y: number;
  z?: number;
  tooltip_width?: number;
  tooltip_pad?: number;
  tooltip_above?: boolean;
  tooltip_auto_above_offset?: number;
  pixel_scale?: number;
  tooltip: Text;
}
export function drawTooltip(param: TooltipParam): void;
//export function checkHooks(param, click)
//export function drawTooltipBox(param)

interface ProgressBarParam extends UIBox {
  progress: number; // 0..1
  color_trough?: Vec4;
  color?: Vec4;
  centered?: boolean;
  tooltip?: Text;
}
export function progressBar(param: ProgressBarParam): void;

// TODO: implement/move to spot.js
type SpotParam = UnimplementedData;
// TODO: implement/move to spot.js
declare enum SpotState {
  SPOT_STATE_REGULAR = 1,
  SPOT_STATE_DOWN = 2,
  SPOT_STATE_FOCUSED = 3,
  SPOT_STATE_DISABLED = 4,
}
type ButtonStateString = 'regular' | 'down' | 'rollover' | 'disabled';
type ButtonRet = {
  // from SpotRet:
  ret: number;
  focused: boolean;
  // ui.button-specific
  state: ButtonStateString;
};
interface ButtonParam extends Partial<TooltipParam> {
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
  // Also: everything in SpotParam
}
interface ButtonTextParam extends ButtonParam {
  text: Text;
}
interface ButtonImageParamBase extends ButtonParam {
  shrink?: number;
}
interface ButtonImageParam1 extends ButtonImageParamBase {
  imgs: Sprite[];
}
interface ButtonImageParam2 extends ButtonImageParamBase {
  img: Sprite;
}
type ButtonImageParam = ButtonImageParam1 | ButtonImageParam2;
export function buttonShared(param: ButtonParam): ButtonRet;
export function buttonBackgroundDraw(param: ButtonParam, state: ButtonStateString): void;
export function buttonSpotBackgroundDraw(param: ButtonParam, spot_state: SpotState): void;
export function buttonTextDraw(param: ButtonTextParam, state: ButtonStateString, focused: boolean): void;
export function buttonText(param: ButtonTextParam): ButtonRet;
export function buttonImage(param: ButtonImageParam): ButtonRet;
export function button(param: ButtonTextParam | ButtonImageParam): ButtonRet;

export function print(style: FontStyle | null, x: number, y: number, z: number, text: Text): number;

interface LabelParam extends UIBox {
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

interface ModalDialogButtonEx<CB> extends ButtonTextParam {
  cb?: CB | null;
  in_event_cb?: UnimplementedFunction;
  label?: Text;
}
type ModalDialogButton<CB> = null | CB | ModalDialogButtonEx<CB>;
type ModalDialogTickCallback = (param: {
  readonly x: number,
  y: number,
  readonly modal_width: number,
  readonly avail_width: number,
  readonly font_height: number,
  readonly fullscreen_mode: boolean,
}) => string | void;
interface ModalDialogParamBase<CB> {
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

type ModalDialogParam = ModalDialogParamBase<() => void>;
export function modalDialog(param: ModalDialogParam): void;

interface ModalTextEntryParam extends ModalDialogParamBase<(text: string) => void> {
  edit_text?: EditBoxOptsAll['text'];
  max_len?: number;
}
export function modalTextEntry(param: ModalTextEntryParam): void;

export function isMenuUp(): boolean;

interface MenuFadeParams {
  blur?: [number, number],
  saturation?: [number, number],
  brightness?: [number, number],
  fallback_darken?: Vec4,
  z?: number,
}
export function menuUp(param?: MenuFadeParams): void;
//export function provideUserString(title, str, success_msg, failure_msg)
export function drawRect(x0: number, y0: number, x1: number, y1: number, z: number, color: Vec4): void;
//export function drawRect2(param)
//export function drawRect4Color(x0, y0, x1, y1, z, color_ul, color_ur, color_ll, color_lr)
//export function drawElipse(x0, y0, x1, y1, z, spread, color, blend)
//export function drawCircle(x, y, z, r, spread, color, blend)
//export function drawHollowCircle(x, y, z, r, spread, color, blend)
//export function drawLine(x0, y0, x1, y1, z, w, precise, color, mode)
//export function drawHollowRect(x0, y0, x1, y1, z, w, precise, color, mode)
//export function drawHollowRect2(param)
//export function drawCone(x0, y0, x1, y1, z, w0, w1, spread, color)
//export function setFontHeight(_font_height)
//export function scaleSizes(scale)
//export function setPanelPixelScale(scale)
//export function setModalSizes(_modal_button_width, width, y0, title_scale, pad)
//export function setTooltipWidth(_tooltip_width, _tooltip_panel_pixel_scale)

// Internal, do not export, or export in another fashion?
// export function startup(param)
// export function tickUI(dt: number): void;
// export function endFrame(): void;
// export function cleanupDOMElems(): void;
