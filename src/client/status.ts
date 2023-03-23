import assert from 'assert';
import { getFrameDt, getFrameIndex } from 'glov/client/engine';
import { Font, fontStyleColored } from 'glov/client/font';
import * as ui from 'glov/client/ui';
import { vec4 } from 'glov/common/vmath';

const { floor } = Math;

const STATUS_PAD_TOP = 2;
const STATUS_PAD_BOTTOM = 3;

class StatusMessage {
  counter = 0;
  time_fade = 4000;
  time_end = 5000;
  text: string;
  key?: string;
  constructor(text: string) {
    this.text = text;
  }
  fade(): void {
    this.counter = this.time_fade - getFrameDt();
  }
}

let font: Font;
let msgs: StatusMessage[] | undefined;
function statusReset(): void {
  msgs = [];
  ({ font } = ui);
}

export function statusPush(text: string): StatusMessage {
  let msg = new StatusMessage(text);
  if (msgs) {
    msgs.push(msg);
  }
  return msg;
}

export function statusSet(key: string, text: string): StatusMessage {
  if (msgs) {
    for (let ii = 0; ii < msgs.length; ++ii) {
      let msg = msgs[ii];
      if (msg.key === key) {
        msg.text = text;
        msg.counter = 0;
        return msg;
      }
    }
  }
  let msg = statusPush(text);
  msg.key = key;
  return msg;
}

let last_frame: number;
let temp_color = vec4(1, 1, 1, 1);

let style_status = fontStyleColored(null, 0x000000ff);

export function statusTick(x: number, y: number, z: number, w: number, h: number): void {
  let dt = getFrameDt();
  let frame = getFrameIndex();
  if (frame !== last_frame + 1) {
    statusReset();
  }
  last_frame = frame;
  assert(msgs);

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
    let size = ui.font_height;
    let dims = font.dims(style_status, w, 0, size, msg.text);
    y -= STATUS_PAD_TOP + STATUS_PAD_BOTTOM + dims.h;
    font.draw({
      style: style_status,
      size,
      x, y, w,
      align: font.ALIGN.HCENTER|font.ALIGN.HWRAP,
      text: msg.text,
      alpha,
    });
    let text_w = dims.w;
    text_w += 6;
    temp_color[3] = alpha;
    ui.panel({
      x: x + floor((w - text_w)/2),
      y: y - STATUS_PAD_TOP, z: z - 1,
      w: text_w,
      h: dims.h + STATUS_PAD_TOP + STATUS_PAD_BOTTOM,
      color: temp_color,
    });
  }
}
