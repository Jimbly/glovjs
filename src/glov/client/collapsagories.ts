// Portions Copyright 2023 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import { ROVec4 } from 'glov/common/vmath';
import {
  ALIGN,
  FontStyle,
  Text,
  fontStyleColored,
} from './font';
import { ScrollArea } from './scroll_area';
import {
  SPOT_DEFAULT_BUTTON,
  SpotKeyable,
  SpotRet,
  spot,
  spotKey,
} from './spot';
import {
  spriteClipPop,
  spriteClipPush,
} from './sprites';
import {
  drawHBox,
  getUIElemData,
} from './ui';
import * as ui from './ui';

const { round } = Math;

export type CollapsagoriesStartParam = {
  num_headers: number;
  view_y: number;
  view_h: number;
  header_h: number;
} & SpotKeyable;

export type CollapsagoriesHeaderParam<T> = {
  x: number;
  y: number;
  z?: number;
  w: number;
  draw?: (param: CollapsagoriesHeaderDrawParam<T>) => void; // Only optional if T = CollapsagoriesDrawDefaultParam
  parent_scroll?: ScrollArea;
} & T;

export type CollapsagoriesHeaderDrawParam<T> = T & {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  ret: SpotRet;
};

export type CollapsagoriesDrawDefaultParam = {
  text: Text;
  text_height: number;
  text_pad?: number;
  bar_color?: ROVec4;
  font_style?: FontStyle;
};

const collapsagories_default_header_style = fontStyleColored(null, 0x000000ff);

export function collapsagoriesDrawDefault(param: CollapsagoriesHeaderDrawParam<CollapsagoriesDrawDefaultParam>): void {
  const { x, y, z, w, h, text, text_height, bar_color, font_style } = param;
  let { text_pad } = param;
  if (text_pad === undefined) {
    text_pad = round(text_height * 0.2);
  }
  drawHBox(param, param.ret.focused ? ui.sprites.collapsagories_rollover : ui.sprites.collapsagories, bar_color);
  ui.title_font.draw({
    style: font_style || collapsagories_default_header_style,
    x: x + text_pad, y, w, h,
    z: z + 0.1,
    align: ALIGN.HFIT|ALIGN.VCENTER,
    size: text_height,
    text,
  });
}

export type Collapsagories = CollapsagoriesImpl;
class CollapsagoriesImpl {
  // constructor() {
  // }
  headers_done!: number;
  num_headers!: number;
  header_h!: number;
  view_y0!: number;
  view_y1!: number;
  clipper_active: boolean = false;
  key!: string;
  start(param: CollapsagoriesStartParam): void {
    this.key = spotKey(param);
    this.num_headers = param.num_headers;
    this.headers_done = 0;
    this.header_h = param.header_h;
    this.view_y0 = param.view_y;
    this.view_y1 = param.view_y + param.view_h;
  }
  header<T=CollapsagoriesDrawDefaultParam>(param: CollapsagoriesHeaderParam<T>): boolean {
    if (this.clipper_active) {
      spriteClipPop();
      this.clipper_active = false;
    }
    let { x, y, w, parent_scroll } = param;
    let header_real_y = y;
    const { header_h } = this;
    let z = param.z || Z.UI;
    let draw: (param: CollapsagoriesHeaderDrawParam<T>) => void;
    draw = param.draw || collapsagoriesDrawDefault as unknown as typeof draw;
    if (y < this.view_y0) {
      y = this.view_y0;
      this.view_y0 += header_h;
    }
    if (y > this.view_y1 - this.num_headers * header_h) {
      y = this.view_y1 - this.num_headers * header_h;
    }
    --this.num_headers;

    let spot_param = {
      key: `${this.key}.${this.headers_done}`,
      def: SPOT_DEFAULT_BUTTON,
      x, y, w, h: header_h,
    };
    let spot_ret = spot(spot_param);
    if (spot_ret.ret && parent_scroll) {
      // scroll parent
      let desired_scroll_pos = header_real_y - this.headers_done * header_h;
      parent_scroll.scrollIntoFocus(desired_scroll_pos, desired_scroll_pos, 0);
    }
    // consume drag events on headers
    let p2 = param as unknown as CollapsagoriesHeaderDrawParam<T>;
    p2.y = y;
    p2.h = header_h;
    p2.ret = spot_ret;
    draw(p2);

    let ystart = y + header_h;
    let yend = this.view_y1 - this.num_headers * header_h;
    let ret;
    if (ystart >= yend) {
      spriteClipPush(z + 0.9, x, ystart, w, 0);
      ret = false;
    } else {
      spriteClipPush(z + 0.9, x, ystart, w, yend - ystart);
      ret = true;
    }
    this.clipper_active = true;
    ++this.headers_done;
    return ret;
  }
  stop(): void {
    if (this.clipper_active) {
      spriteClipPop();
      this.clipper_active = false;
    }
  }
}

export function collapsagoriesCreate(): Collapsagories {
  return new CollapsagoriesImpl();
}

let active_elem: CollapsagoriesImpl | null = null;
export function collapsagoriesStart(param: CollapsagoriesStartParam): void {
  assert(!active_elem);
  active_elem = getUIElemData('collapsagories', param, collapsagoriesCreate);
  active_elem.start(param);
}

export function collapsagoriesHeader<T=CollapsagoriesDrawDefaultParam>(param: CollapsagoriesHeaderParam<T>): boolean {
  assert(active_elem);
  return active_elem.header(param);
}

export function collapsagoriesStop(): void {
  assert(active_elem);
  active_elem.stop();
  active_elem = null;
}
