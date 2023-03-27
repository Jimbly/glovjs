import assert from 'assert';
import { alphaDraw, opaqueDraw } from 'glov/client/draw_list';
import { BUCKET_ALPHA, FACE_XY } from 'glov/client/dyn_geom';
import {
  getFrameDt,
  getFrameIndex,
  getFrameTimestamp,
} from 'glov/client/engine';
import { PerEntData } from 'glov/client/entity_position_manager';
import {
  ALIGN,
  Font,
  fontStyle,
  fontStyleAlpha,
} from 'glov/client/font';
import {
  qRotateZ,
  quat,
  unit_quat,
} from 'glov/client/quat';
import * as ui from 'glov/client/ui';
import { EntityID } from 'glov/common/types';
import {
  easeIn,
  easeOut,
  lerp,
  ridx,
} from 'glov/common/util';
import {
  ROVec2,
  ROVec3,
  ROVec4,
  Vec2,
  v2addScale,
  v2distSq,
  v2iNormalize,
  v2lengthSq,
  v2scale,
  v2sub,
  v3set,
  v4set,
  vec2,
  vec3,
  vec4,
} from 'glov/common/vmath';
import { buildModeActive } from './crawler_build_mode';
import {
  EntityCrawlerClient,
  EntityDraw2DOpts,
  EntityDrawOpts,
  crawlerEntityManager,
  crawlerGetSpawnDescs,
  entityPosManager,
  myEntID,
} from './crawler_entity_client';
import { crawlerController, crawlerGameState, getScaledFrameDt } from './crawler_play';
import {
  DIM,
  HDIM,
  SPLIT_NEAR,
  ShaderType,
  SplitSet,
  crawlerRenderGameViewAngle,
  crawlerRenderGetShader,
  crawlerRenderViewportGet,
  passesSplitCheck,
  renderCamPos,
} from './crawler_render';

import type { JSVec4 } from '../common/crawler_state';
import type { spineCreate } from 'glov/client/spine';
import type { SpriteAnimation, SpriteAnimationParam } from 'glov/client/sprite_animation';
import type { Sprite, SpriteParamBase, TextureOptions } from 'glov/client/sprites';

const { ceil, floor } = Math;

let font: Font;

const style_text = fontStyle(null, {
  color: 0xFFFFFFff,
  outline_width: 4,
  outline_color: 0x000000ff,
});

export type EntityDrawSubOpts = {
  dt: number;
  use_near: boolean;
  shader_params: Partial<Record<string, ROVec2|ROVec3|ROVec4|number[]>>;
  draw_pos: ROVec3;
  color: ROVec4;
};

export type DrawableOpts = {
  lod_bias: [number, number];
  biasL: [number, number];
  biasF: [number, number];
  biasR: [number, number];
  biasIn: [number, number, number]; // Not relevant for monsters, just one value will do?
};

export type TextureOptionsAsStrings = {
  filter_min?: string;
  filter_mag?: string;
  wrap_s?: string;
  wrap_t?: string;
};

export type DrawableSpriteOpts = {
  anim_data: SpriteAnimationParam;
  sprite_data: (TextureOptions | TextureOptionsAsStrings) & SpriteParamBase & { name: string };
  sprite: Sprite; // assigned at load time
  sprite_near_data?: (TextureOptions | TextureOptionsAsStrings) & SpriteParamBase & { name: string };
  sprite_near?: Sprite; // assigned at load time
  scale: number;
  tint_colors?: [JSVec4, JSVec4, JSVec4][];
};

export type DrawableSpriteState = {
  anim: SpriteAnimation;
  anim_update_frame: number;
};

export type DrawableSpineOpts = {
  spine_data: {
    skel: string;
    atlas: string;
    mix: Partial<Record<string, Partial<Record<string, number>>>>;
    anim: string;
  };
  scale: number;
  offs: [number, number];
};

type Spine = ReturnType<typeof spineCreate>;
export type DrawableSpineState = {
  spine: Spine;
  anim_update_frame: number;
};

type Entity = EntityCrawlerClient;

export type EntityDrawable = Entity & {
  drawable_opts: DrawableOpts;
  drawSub: (param: EntityDrawSubOpts) => void;
};

export type EntityDrawableSprite = Entity & {
  drawable_sprite_opts: DrawableSpriteOpts;
  drawable_sprite_state: DrawableSpriteState;
};
export type EntityDrawableSpine = Entity & {
  drawable_spine_opts: DrawableSpineOpts;
  drawable_spine_state: DrawableSpineState;
};


const { abs, atan2, min, cos, sin, sqrt, PI } = Math;

export function drawableSpriteDraw2D(this: EntityDrawableSprite, param: EntityDraw2DOpts): void {
  let ent = this;
  let { anim } = ent.drawable_sprite_state;
  if (ent.drawable_sprite_state.anim_update_frame !== getFrameIndex()) {
    anim.update(getFrameDt());
    ent.drawable_sprite_state.anim_update_frame = getFrameIndex();
  }
  let { sprite } = ent.drawable_sprite_opts;
  let use_near = true; // slightly better for 2D
  if (use_near && ent.drawable_sprite_opts.sprite_near) {
    sprite = ent.drawable_sprite_opts.sprite_near;
  }
  sprite.draw({
    ...param,
    x: param.x + param.w * 0.5,
    y: param.y + param.h,
    frame: anim.getFrame(),
  });
}

export function drawableSpriteDrawSub(this: EntityDrawableSprite, param: EntityDrawSubOpts): void {
  let ent = this;
  let {
    dt,
    use_near,
    shader_params,
    draw_pos,
    color,
  } = param;
  let { anim } = ent.drawable_sprite_state;
  if (ent.drawable_sprite_state.anim_update_frame !== getFrameIndex()) {
    anim.update(dt);
    ent.drawable_sprite_state.anim_update_frame = getFrameIndex();
  }
  let { scale, sprite } = ent.drawable_sprite_opts;
  if (use_near && ent.drawable_sprite_opts.sprite_near) {
    sprite = ent.drawable_sprite_opts.sprite_near;
  }
  let tint_colors = ent.drawable_sprite_opts.tint_colors;
  let tinted;
  if ((tinted = sprite.texs.length > 1 && tint_colors && tint_colors.length)) {
    let costume = min(ent.data.costume || 0, tint_colors.length);
    shader_params.tint0 = tint_colors[costume][0];
    shader_params.tint1 = tint_colors[costume][1];
    shader_params.tint2 = tint_colors[costume][2];
  }
  let shader = crawlerRenderGetShader(tinted ? ShaderType.TintedSpriteFragment : ShaderType.SpriteFragment);
  sprite.draw3D({
    pos: draw_pos,
    frame: anim ? anim.getFrame() : 0,
    color,
    size: [scale * DIM, scale * DIM],
    bucket: BUCKET_ALPHA,
    facing: FACE_XY,
    vshader: crawlerRenderGetShader(ShaderType.SpriteVertex),
    shader,
    shader_params,
  });
}

export function drawableSpineDraw2D(this: EntityDrawableSpine, param: EntityDraw2DOpts): void {
  let ent = this;
  let { spine } = ent.drawable_spine_state;
  if (ent.drawable_spine_state.anim_update_frame !== getFrameIndex()) {
    spine.update(getFrameDt());
    ent.drawable_spine_state.anim_update_frame = getFrameIndex();
  }
  let { scale: spine_scale, offs } = ent.drawable_spine_opts;
  assert(spine_scale);
  assert(offs);
  spine.draw({
    x: param.x + param.w/2,
    y: param.y + param.h * 0.95,
    z: param.z,
    scale: spine_scale * 25,
  });
}

let offs_temp = vec2();
export function drawableSpineDrawSub(this: EntityDrawableSpine, param: EntityDrawSubOpts): void {
  let ent = this;
  let { spine } = ent.drawable_spine_state;
  let {
    dt,
    shader_params,
    draw_pos,
    color,
  } = param;
  if (ent.drawable_spine_state.anim_update_frame !== getFrameIndex()) {
    spine.update(dt);
    ent.drawable_spine_state.anim_update_frame = getFrameIndex();
  }
  // TODO: multi-color tinting for spine as well?  Need a pipeline to make the mask!
  let { scale: spine_scale, offs } = ent.drawable_spine_opts;
  assert(spine_scale);
  assert(offs);
  spine.draw3D({
    pos: draw_pos,
    color,
    scale: spine_scale * DIM,
    bucket: BUCKET_ALPHA,
    facing: FACE_XY,
    offs: v2scale(offs_temp, offs, DIM),
    vshader: crawlerRenderGetShader(ShaderType.SpriteVertex),
    shader: crawlerRenderGetShader(ShaderType.SpriteFragment),
    shader_params,
  });

}

let billboard_quat = quat();
let v2temp = vec2();
let view_vec = vec2();
let right_vec = vec2();
let draw_pos = vec3();
let vhdim = vec3(HDIM, HDIM, HDIM);
export function drawableDraw(this: EntityDrawable, param: EntityDrawOpts): void {
  let {
    dt,
    game_state,
    pos,
    zoffs,
    angle, // angle entity is facing
    color,
    use_near,
  } = param;
  let ent = this;

  let { biasL, biasF, biasR, biasIn, lod_bias } = ent.drawable_opts;

  // Ignore entity facing and just face camera
  // let dx = game_state.pos[0] - pos[0];
  // let dy = game_state.pos[1] - pos[1];
  // if (abs(dx) + abs(dy) < 0.1) {
  //   angle = game_state.angle + PI;
  // } else {
  //   angle = atan2(dy, dx);
  // }

  // Face view direction - looks better at a 45 degree angle
  angle = crawlerRenderGameViewAngle();

  qRotateZ(billboard_quat, unit_quat, angle);
  v2addScale(draw_pos, vhdim, pos, DIM);
  draw_pos[2] = zoffs * DIM;

  // Determine bias amount based on whether they are in front or adjacent to us
  view_vec[0] = cos(game_state.angle);
  view_vec[1] = sin(game_state.angle);
  right_vec[0] = view_vec[1];
  right_vec[1] = -view_vec[0];
  let rel_angle = 0;
  v2sub(v2temp, pos, game_state.pos);
  let v2temp_len = sqrt(v2lengthSq(v2temp));
  if (v2temp_len > 0.0001) {
    rel_angle = atan2(v2temp[1], v2temp[0]) - game_state.angle;
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
  // if (drawableDraw.debug !== frame_index) {
  //   drawableDraw.debug = frame_index;
  //   drawableDraw.debug_idx = 0;
  // }
  // ui.print(null, 100, 100 + (drawableDraw.debug_idx++) * 16, 1000,
  //   `${bweight.toFixed(5)} ${bias_phys.toFixed(5)} ${bias_view.toFixed(5)}`);

  // Offset `bias_phys` towards player
  v2sub(v2temp, draw_pos, renderCamPos());
  v2iNormalize(v2temp);
  v2addScale(draw_pos, draw_pos, v2temp, bias_phys * DIM);
  // Offset `bias_vew` towards view plane
  v2addScale(draw_pos, draw_pos, view_vec, bias_view * DIM);
  // If in the same cell, alternate offsetting to the right as well
  v2addScale(draw_pos, draw_pos, right_vec, bias_in_offs * bias_in_sign * DIM);

  let shader_params: Partial<Record<string, ROVec2|ROVec3|ROVec4|number[]>> = {
    lod_bias,
  };
  ent.drawSub({
    dt,
    use_near,
    shader_params,
    draw_pos,
    color,
  });
}

type PerEntDataPair = [PerEntData, EntityCrawlerClient];

function cmpPeds(peda: PerEntDataPair, pedb: PerEntDataPair): number {
  let enta = peda[1];
  let entb = pedb[1];
  if (enta.fade !== null) {
    if (entb.fade !== null) {
      return entb.fade - enta.fade;
    } else {
      return 1;
    }
  } else if (entb.fade !== null) {
    return -1;
  }
  return enta.id - entb.id;
}

let ent_in_front: EntityID | null = null;
let ped_list: PerEntDataPair[];
let build_mode_peds: PerEntData[] = [];

export function crawlerEntInFront(): EntityID | null {
  return ent_in_front;
}

export function crawlerRenderEntitiesPrep(): void {
  ped_list = [];
  ent_in_front = null;
  let game_state = crawlerGameState();
  let level = game_state.level;
  if (!level) {
    return; // still loading
  }

  let controller = crawlerController();
  ent_in_front = controller.getEntInFront();

  let build_mode = buildModeActive();

  // Gather and update entities
  let entities = crawlerEntityManager().entities;
  let dt = getScaledFrameDt();
  let my_ent_id = myEntID();
  let entity_pos_manager = entityPosManager();
  for (let ent_id_str in entities) {
    let ent_id = Number(ent_id_str);
    // let other_ent = entities[ent_id];
    if (ent_id === my_ent_id) {
      continue;
    }
    let ent = entities[ent_id]!;
    if (ent.data.floor !== game_state.floor_id) {
      continue;
    }
    let ped = entity_pos_manager.updateOtherEntity(ent_id, dt);
    if (!ped) {
      continue;
    }
    if (build_mode && !ent.is_player) {
      continue;
    }
    ped_list.push([ped, ent]);
  }

  if (build_mode) {
    let { initial_entities } = level;
    if (initial_entities) {
      let spawn_descs = crawlerGetSpawnDescs();
      for (let ii = 0; ii < initial_entities.length; ++ii) {
        let ent_ser = initial_entities[ii];
        let desc = spawn_descs[ent_ser.type as string];
        if (!desc) {
          continue;
        }
        let ped = build_mode_peds[ii];
        if (!ped) {
          ped = new PerEntData(entity_pos_manager);
          build_mode_peds.push(ped);
        }
        entity_pos_manager.vcopy(ped.pos, ent_ser.pos as number[]);
        ped_list.push([ped, desc.example_ent]);
      }
    }
  }

  ped_list.sort(cmpPeds);
}

let color_temp = vec4(1, 1, 1, 1);
export function crawlerRenderEntities(ent_set: SplitSet): void {
  profilerStartFunc();
  // Draw other entities
  let controller = crawlerController();
  let ignore_vis = controller.ignoreVisibility();
  let dt = getScaledFrameDt();
  let game_state = crawlerGameState();
  let level = game_state.level!;
  let frame_index = getFrameIndex();

  for (let ped_idx = 0; ped_idx < ped_list.length; ++ped_idx) {
    let [ped, ent] = ped_list[ped_idx];
    let pos = ped.pos as unknown as Vec2;
    if (!ent.draw) {
      continue;
    }

    if (!passesSplitCheck(ent_set, ent.do_split, v2distSq(pos, game_state.pos))) {
      continue;
    }

    v4set(color_temp, 1, 1, 1, ent.fade !== null ? ent.fade : 1);
    let cell = level.getCell(floor(pos[0]), floor(pos[1]));
    let is_vis = false;
    if (cell && cell.visible_frame === frame_index) {
      is_vis = true;
    }
    cell = level.getCell(ceil(pos[0]), ceil(pos[1]));
    if (cell && cell.visible_frame === frame_index) {
      is_vis = true;
    }
    if (!is_vis) {
      if (ignore_vis) {
        color_temp[1] = 0;
      } else {
        continue;
      }
    }
    let zoffs = 0;
    if (ent.fade !== null) {
      if (ent.delete_reason === 'pit') {
        zoffs = easeOut(ent.fade, 2) - 1;
      }
    }

    ent.draw({
      dt,
      game_state,
      pos,
      zoffs,
      angle: pos[2],
      color: color_temp,
      use_near: ent_set === SPLIT_NEAR,
    });

    if (ent.floaters) {
      // TODO: do floaters in 3D for all entities
      let is_in_front = ent.id === ent_in_front;
      let blink = 1;
      for (let ii = ent.floaters.length - 1; ii >= 0; --ii) {
        let floater = ent.floaters[ii];
        let elapsed = getFrameTimestamp() - floater.start;
        const FLOATER_TIME = 750; // not including fade
        const FLOATER_FADE = 250;
        const BLINK_TIME = 250;
        let alpha = 1;
        if (elapsed > FLOATER_TIME) {
          alpha = 1 - (elapsed - FLOATER_TIME) / FLOATER_FADE;
          if (alpha <= 0) {
            ridx(ent.floaters, ii);
            continue;
          }
        }
        if (elapsed < BLINK_TIME) {
          blink = min(blink, elapsed / BLINK_TIME);
        }
        if (is_in_front) {
          let { x, y, w, h } = crawlerRenderViewportGet();
          let float = easeOut(elapsed / (FLOATER_TIME + FLOATER_FADE), 2) * 20;
          font.drawSizedAligned(fontStyleAlpha(style_text, alpha),
            x,
            y + h/2 - float, Z.FLOATERS,
            ui.font_height, ALIGN.HCENTER|ALIGN.VBOTTOM,
            w, 0, floater.msg);
        }
      }
      if (blink < 1) {
        blink = easeOut(blink, 2);
        v3set(color_temp, blink, blink, blink);
      }
    }
  }

  opaqueDraw();
  alphaDraw();
  profilerStopFunc();
}

export function crawlerRenderEntitiesStartup(font_in: Font): void {
  font = font_in;
}
