import type { TSMap } from 'glov/common/types';
import { easeOut, lerp } from 'glov/common/util';
import { autoResetSkippedFrames } from './auto_reset';
import * as engine from './engine';

const { min } = Math;

let blend_data: TSMap<{
  blend_start: number;
  blend_start_value: number;
  last_value: number;
}> = {};

export function blend(key: string, value: number, time?: number): number {
  let bd = blend_data[key];
  if (!bd || autoResetSkippedFrames(key)) {
    bd = blend_data[key] = {
      blend_start: engine.frame_timestamp,
      blend_start_value: value,
      last_value: value,
    };
  }
  let dt = engine.frame_timestamp - bd.blend_start;
  let w = min(dt / (time || 500), 1);
  let v = lerp(easeOut(w, 2), bd.blend_start_value, bd.last_value);
  if (value !== bd.last_value) {
    bd.blend_start_value = v;
    bd.blend_start = engine.frame_timestamp - 16;
    bd.last_value = value;
  }
  return v;
}
