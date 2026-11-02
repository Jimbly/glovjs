import assert from 'assert';
import { getFrameDt, getFrameIndex } from 'glov/client/engine';
import { FontStyle } from 'glov/client/font';
import { markdownAuto, MarkdownCache, MarkdownDims } from 'glov/client/markdown';
import * as ui from 'glov/client/ui';
import {
  UIBox,
  uiGetFont,
  uiTextHeight,
} from 'glov/client/ui';
import { vec4 } from 'glov/common/vmath';
import { dialogTextStyle } from './dialog_system';

const { floor, ceil } = Math;

class StatusMessage {
  counter = 0;
  time_fade = 4000;
  time_end = 4500;
  text: string;
  key?: string;
  style: FontStyle;
  mdcache?: MarkdownCache;
  mddims?: MarkdownDims;
  constructor(text: string, style: FontStyle) {
    this.text = text;
    this.style = style;
  }
  fade(after_ms?: number): void {
    this.counter = this.time_fade - getFrameDt() - (after_ms || 0);
  }
}

let msgs: StatusMessage[] | undefined;
function statusReset(): void {
  msgs = [];
}

export function statusPush(text: string, style?: FontStyle): StatusMessage {
  let msg = new StatusMessage(text, style || dialogTextStyle());
  if (msgs) {
    msgs.push(msg);
  }
  return msg;
}

export function statusSet(key: string, text: string, style?: FontStyle): StatusMessage {
  if (msgs) {
    for (let ii = 0; ii < msgs.length; ++ii) {
      let msg = msgs[ii];
      if (msg.key === key) {
        msg.text = text;
        msg.counter = 0;
        msg.mdcache = undefined;
        return msg;
      }
    }
  }
  let msg = statusPush(text, style);
  msg.key = key;
  return msg;
}

let last_frame: number;
let temp_color = vec4(1, 1, 1, 1);

export function statusTick(viewport: UIBox & {
  pad_top: number;
  pad_bottom: number;
  pad_lr: number;
}): void {
  let { x, y, w, h, z, pad_top, pad_bottom, pad_lr } = viewport;
  z = z || Z.STATUS;
  let dt = getFrameDt();
  let frame = getFrameIndex();
  if (frame !== last_frame + 1) {
    statusReset();
  }
  last_frame = frame;
  assert(msgs);
  const HPAD = pad_lr; // default 4

  y += h;
  for (let ii = msgs.length - 1; ii >= 0; --ii) {
    let msg = msgs[ii];
    msg.counter += dt;
    if (msg.counter >= msg.time_end) {
      msgs.splice(ii, 1);
      continue;
    }
    let alpha = 1;
    if (msg.counter > msg.time_fade) {
      alpha = 1 - (msg.counter - msg.time_fade) / (msg.time_end - msg.time_fade);
    }
    let size = uiTextHeight();
    let font = uiGetFont();
    if (!msg.mdcache) {
      msg.mdcache = {};
      msg.mddims = markdownAuto({
        cache: msg.mdcache,
        no_draw: true,
        font_style: msg.style,
        text_height: size,
        w,
        align: font.ALIGN.HCENTER|font.ALIGN.HWRAP,
        text: msg.text,
      });
    }
    // let dims = font.dims(msg.style, w, 0, size, msg.text);
    y -= pad_bottom + msg.mddims!.h;
    markdownAuto({
      font_style: msg.style,
      text_height: size,
      x, y, z, w,
      align: font.ALIGN.HCENTER|font.ALIGN.HWRAP,
      text: msg.text,
      alpha,
    });
    let text_w = msg.mddims!.w;
    text_w += HPAD * 2;
    temp_color[3] = alpha;
    let x0 = x + floor((w - text_w)/2);
    let x1 = x + ceil((w + text_w)/2);
    ui.panel({
      x: x0,
      y: y - pad_top, z: z - 1,
      w: x1 - x0,
      h: msg.mddims!.h + pad_top + pad_bottom,
      color: temp_color,
    });
    y -= pad_top;
  }
  viewport.h = y - viewport.y;
}
