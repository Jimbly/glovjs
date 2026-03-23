import { autoResetSkippedFrames } from 'glov/client/auto_reset';
import * as engine from 'glov/client/engine';
import type { TSMap } from 'glov/common/types';
import { easeOut, lerp } from 'glov/common/util';

const { min } = Math;

let blend_data: TSMap<{
  blend_start: number;
  blend_start_value: number;
  last_value: number;
}> = {};

export function blend(key: string, value: number): number {
  let bd = blend_data[key];
  if (!bd || autoResetSkippedFrames(key)) {
    bd = blend_data[key] = {
      blend_start: engine.frame_timestamp,
      blend_start_value: value,
      last_value: value,
    };
  }
  let dt = engine.frame_timestamp - bd.blend_start;
  let w = min(dt / 500, 1);
  let v = lerp(easeOut(w, 2), bd.blend_start_value, bd.last_value);
  if (value !== bd.last_value) {
    bd.blend_start_value = v;
    bd.blend_start = engine.frame_timestamp - 16;
    bd.last_value = value;
  }
  return v;
}
