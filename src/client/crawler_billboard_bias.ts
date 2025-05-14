// import { getFrameIndex } from 'glov/client/engine';
// import { print } from 'glov/client/ui';
import {
  clamp,
  easeIn,
  lerp,
} from 'glov/common/util';
import {
  ROVec2,
  v2addScale,
  v2copy,
  v2dot,
  v2iNormalize,
  v2iScale,
  v2length,
  v2lengthSq,
  v2sub,
  Vec2,
  vec2,
} from 'glov/common/vmath';
import type { CrawlerState } from '../common/crawler_state';
import { DIM, renderCamPos } from './crawler_render';

const { abs, atan2, cos, sin, PI } = Math;

let view_pos = vec2();
let view_vec = vec2();
let view_angle: number;
let right_vec = vec2();
let v2temp = vec2();

export type BillboardBiasOpts = {
  biasL: [number, number];
  biasF: [number, number];
  biasR: [number, number];
  biasIn: [number, number, number]; // Not relevant for monsters, just one value will do?
};

export function billboardBias(draw_pos: Vec2, pos: ROVec2, opts: Partial<BillboardBiasOpts>): void {
  let { biasL, biasF, biasR, biasIn } = opts;

  if (!biasL || !biasF || !biasR || !biasIn) {
    return;
  }

  // Determine bias amount based on whether they are in front or adjacent to us
  let rel_angle = 0;
  v2sub(v2temp, pos, view_pos);
  let v2temp_len = v2length(v2temp);
  if (v2temp_len > 0.0001) {
    rel_angle = atan2(v2temp[1], v2temp[0]) - view_angle;
  }
  while (rel_angle < -PI) {
    rel_angle += PI * 2;
  }
  while (rel_angle > PI) {
    rel_angle -= PI * 2;
  }
  // -90deg = off to the right
  // 0deg = in front
  // 90deg = off to the left
  let bweight = rel_angle / (PI/2);
  // Now -1 .. 1 (and -2 behind)
  if (bweight > 1) {
    bweight = 2 - bweight;
  }
  if (bweight < -1) {
    bweight = -2 - bweight;
  }
  let bweight_in = 1;
  if (v2temp_len < 0.95) {
    bweight_in = v2temp_len/0.95;
    // Blend Left/front/right smoothly to front values
    // Not needed after bweight_in, it seems
    //bweight = lerp(bweight_in, 0, bweight);
  }
  let weights = [0,0,0];
  if (bweight < 0) { // to the right
    weights[2] = easeIn(-bweight, 2);
    weights[1] = 1 - weights[2];
  } else {
    weights[0] = easeIn(bweight, 2);
    weights[1] = 1 - weights[0];
  }
  let bias_phys = weights[0] * biasL[0] + weights[1] * biasF[0] + weights[2] * biasR[0];
  let bias_view = weights[0] * biasL[1] + weights[1] * biasF[1] + weights[2] * biasR[1];
  // Blend against in-same-cell weights
  bias_phys = lerp(bweight_in, biasIn[0], bias_phys);
  bias_view = lerp(bweight_in, biasIn[1], bias_view);
  let bias_in_offs = lerp(bweight_in, biasIn[2], 0);
  let bias_in_sign = lerp(abs(view_vec[0]), -1, 1);
  // Offset `bias_phys` towards player
  v2sub(v2temp, draw_pos, renderCamPos());
  // Only normalize if relatively large, otherwise "towards the player" snaps as the player passes through the cell
  v2iScale(v2temp, 2/DIM);
  if (v2lengthSq(v2temp) > 1) {
    v2iNormalize(v2temp);
  }

  v2addScale(draw_pos, draw_pos, v2temp, bias_phys * DIM);
  // Offset `bias_vew` towards view plane
  v2addScale(draw_pos, draw_pos, view_vec, bias_view * DIM);
  // If in the same cell, alternate offsetting to the right as well
  v2addScale(draw_pos, draw_pos, right_vec, bias_in_offs * bias_in_sign * DIM);

  // If very close to view plane, offset away from camera
  v2sub(v2temp, draw_pos, renderCamPos());
  v2temp_len = v2length(v2temp);
  let dist_to_view_plane = abs(v2dot(v2temp, view_vec)) / DIM;
  let dist_to_camera = v2temp_len / DIM;
  let need_blend = 1 - clamp((dist_to_camera - 0.5) / 0.25, 0, 1);
  if (dist_to_view_plane < 0.75 && need_blend > 0) {
    let final_rel_angle = 0;
    if (v2temp_len > 0.0001) {
      final_rel_angle = atan2(v2temp[1], v2temp[0]) - view_angle;
      while (final_rel_angle < -PI) {
        final_rel_angle += PI * 2;
      }
      while (final_rel_angle > PI) {
        final_rel_angle -= PI * 2;
      }
    }
    v2addScale(draw_pos, draw_pos, right_vec,
      easeIn((1 - dist_to_view_plane/0.75) * need_blend, 2) * (final_rel_angle < 0 ? 1 : -1) * DIM);
  }

  // // @ts-expect-error debug
  // if (billboardBias.debug !== getFrameIndex()) {
  //   // @ts-expect-error debug
  //   billboardBias.debug = getFrameIndex();
  //   // @ts-expect-error debug
  //   billboardBias.debug_idx = 0;
  // }
  // // @ts-expect-error debug
  // print(null, 100, 100 + (billboardBias.debug_idx++) * 16, 1000,
  //   `bw:${bweight.toFixed(3)} bwi:${bweight_in.toFixed(3)} d2vp:${dist_to_view_plane.toFixed(3)}` +
  //   ` d2c:${dist_to_camera.toFixed(3)}` +
  //   ` bis:${bias_in_sign.toFixed(1)} ${bias_phys.toFixed(5)} ${bias_view.toFixed(5)} ${pos}`);
}

export function billboardBiasPrep(game_state: CrawlerState): void {
  v2copy(view_pos, game_state.pos);
  view_angle = game_state.angle;
  view_vec[0] = cos(view_angle);
  view_vec[1] = sin(view_angle);
  right_vec[0] = view_vec[1];
  right_vec[1] = -view_vec[0];
}
