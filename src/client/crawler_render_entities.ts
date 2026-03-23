import assert from 'assert';
import { alphaDraw, opaqueDraw } from 'glov/client/draw_list';
import { BUCKET_ALPHA, BUCKET_OPAQUE, FACE_CUSTOM, FACE_XY } from 'glov/client/dyn_geom';
import {
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
import * as settings from 'glov/client/settings';
import type { spineCreate } from 'glov/client/spine';
import type { SpriteAnimation, SpriteAnimationParam } from 'glov/client/sprite_animation';
import type { Sprite, SpriteParamBase, TextureOptions } from 'glov/client/sprites';
import { uiTextHeight } from 'glov/client/ui';
import { dataErrorEx } from 'glov/common/data_error';
import { EntityID } from 'glov/common/types';
import {
  clamp,
  easeIn,
  easeInOut,
  easeOut,
  lerp,
  ridx,
  sign,
} from 'glov/common/util';
import {
  JSVec2,
  JSVec4,
  ROVec2,
  ROVec3,
  ROVec4,
  v2addScale,
  v2dist,
  v2distSq,
  v2scale,
  v2set,
  v3copy,
  v3set,
  v4copy,
  v4set,
  Vec2,
  vec2,
  vec3,
  vec4,
  xaxis,
  yaxis,
} from 'glov/common/vmath';
import {
  billboardBias,
  BillboardBiasOpts,
} from './crawler_billboard_bias';
import { buildModeActive } from './crawler_build_mode';
import {
  crawlerEntityManager,
  crawlerGetSpawnDescs,
  EntityCrawlerClient,
  EntityDraw2DOpts,
  EntityDrawOpts,
  entityPosManager,
  myEntID,
} from './crawler_entity_client';
import { crawlerController, crawlerGameState, getScaledFrameDt } from './crawler_play';
import {
  crawlerRenderGameViewAngle,
  crawlerRenderGetShader,
  crawlerRenderViewportGet,
  DIM,
  HDIM,
  passesSplitCheck,
  renderCamPos,
  ShaderType,
  ShaderTypeEnum,
  SPLIT_NEAR,
  SplitSet,
} from './crawler_render';

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
} & BillboardBiasOpts;

export type TextureOptionsAsStrings = {
  filter_min?: string;
  filter_mag?: string;
  wrap_s?: string;
  wrap_t?: string;
};

export type DrawableSpriteOpts = {
  anim_data: SpriteAnimationParam;
  anim_directional?: boolean;
  hybrid: boolean;
  sprite_data: (TextureOptions | TextureOptionsAsStrings) & SpriteParamBase & { name: string };
  sprite: Sprite; // assigned at load time
  sprite_near?: Sprite; // assigned at load time
  sprite_hybrid?: Sprite; // assigned at load time
  scale: number;
  do_alpha?: boolean;
  tint_colors?: [JSVec4, JSVec4, JSVec4][];
  simple_anim?: {
    scale?: JSVec2;
    offs?: [JSVec2, JSVec2];
    period: number;
    easing?: number;
  }[];
  shadow?: {
    atlas: string;
    name: string;
    scale?: number;
  };
  sprite_shadow?: Sprite; // assigned at load time
};

export type DrawableSpriteState = {
  anim: SpriteAnimation;
  anim_update_frame: number;
  grow_at?: number;
  grow_time?: number;
  anim_offs: number; // random offset assigned at creation
  sprite: Sprite;
  sprite_near?: Sprite;
  sprite_hybrid?: Sprite;
  sprite_shadow?: Sprite;
  autoatlas_last_frame?: string;
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
  updateAnim: (dt: number) => number;
};
export type EntityDrawableSpine = Entity & {
  drawable_spine_opts: DrawableSpineOpts;
  drawable_spine_state: DrawableSpineState;
};

export function isEntityDrawableSprite(ent: Entity): ent is EntityDrawableSprite {
  return Boolean((ent as EntityDrawableSprite).drawable_sprite_state);
}


const { abs, min } = Math;

export function drawableSpriteDraw2D(this: EntityDrawableSprite, param: EntityDraw2DOpts): void {
  let ent = this;
  let frame = ent.updateAnim(getScaledFrameDt());
  let { sprite, sprite_near } = ent.drawable_sprite_state;
  let use_near = true; // slightly better for 2D
  if (sprite_near && (use_near ||
    !settings.entity_split && settings.entity_nosplit_use_near)
  ) {
    sprite = sprite_near;
  }
  let aspect = sprite.uidata && sprite.uidata.aspect ? sprite.uidata.aspect[frame] : 1;
  let { w, h } = param;
  if (aspect < 1) {
    w = h * aspect * sign(w);
  } else {
    h = abs(w / aspect);
  }
  sprite.draw({
    ...param,
    w, h,
    x: param.x + param.w * 0.5,
    y: param.y + param.h,
    frame,
  });
}

let offs_temp = vec2();
let color_temp2 = vec4();
let draw_pos_temp2 = vec3();
export function drawableSpriteDrawSub(this: EntityDrawableSprite, param: EntityDrawSubOpts): void {
  let ent = this;
  let frame = ent.updateAnim(param.dt);
  let {
    use_near,
    shader_params,
    draw_pos,
    color,
  } = param;
  let { grow_at, grow_time, sprite, sprite_near, sprite_hybrid, anim_offs, sprite_shadow } = ent.drawable_sprite_state;
  let { scale, simple_anim } = ent.drawable_sprite_opts;
  if (grow_at) {
    assert(typeof grow_time === 'number');
    let t = getFrameTimestamp() - grow_at;
    if (t < grow_time) {
      t /= grow_time;
      scale *= 1 + easeIn(1 - t, 2) * 0.5;
    }
  }
  if (ent.fade_out_at) {
    v4copy(color_temp2, color);
    color_temp2[3] *= Math.max(0, 1 - (getFrameTimestamp() - ent.fade_out_at)/400);
    color = color_temp2;
  }
  let vscale = scale;
  let hscale = scale;
  v2set(offs_temp, 0, 0);
  if (simple_anim && Array.isArray(simple_anim)) {
    for (let ii = 0; ii < simple_anim.length; ++ii) {
      let anim = simple_anim[ii];
      let t = (getFrameTimestamp() + anim_offs) / anim.period % 1;
      t = 2 * (t > 0.5 ? 1 - t : t);
      let easing = anim.easing || 2.25;
      let p = easeInOut(t, easing);
      if (anim.scale) {
        if (Array.isArray(anim.scale) && anim.scale.length === 2) {
          hscale *= 1 + p * (anim.scale[0] - 1);
          vscale *= 1 + p * (anim.scale[1] - 1);
        } else {
          dataErrorEx({
            msg: `${ent.type_id}: simple_anim[n].scale must be an array of 2 numbers`,
            per_frame: true,
          });
        }
      }
      let { offs } = anim;
      if (offs) {
        if (Array.isArray(offs) && offs.length === 2) {
          let offs0 = offs[0];
          let offs1 = offs[1];
          if (Array.isArray(offs0) && offs0.length === 2 && Array.isArray(offs1) && offs1.length === 2) {
            offs_temp[0] += lerp(p, offs0[0], offs1[0]);
            offs_temp[1] += lerp(p, offs0[1], offs1[1]);
          } else {
            dataErrorEx({
              msg: `${ent.type_id}: simple_anim[n].offs[n] must be an array of 2 numbers`,
              per_frame: true,
            });
          }
        } else {
          dataErrorEx({
            msg: `${ent.type_id}: simple_anim[n].offs must be an array of 2 arrays`,
            per_frame: true,
          });
        }
      }
    }
  }
  if (sprite_near && (use_near ||
    !settings.entity_split && settings.entity_nosplit_use_near)
  ) {
    sprite = sprite_near;
  }
  let tint_colors = ent.drawable_sprite_opts.tint_colors;
  let shader_type: ShaderTypeEnum = ShaderType.SpriteFragment;
  if ((sprite.texs.length > 1 && tint_colors && tint_colors.length)) {
    shader_type = ShaderType.TintedSpriteFragment;
    let costume = min(ent.data.costume || 0, tint_colors.length);
    shader_params.tint0 = tint_colors[costume][0];
    shader_params.tint1 = tint_colors[costume][1];
    shader_params.tint2 = tint_colors[costume][2];
  }
  if (sprite_hybrid && settings.hybrid) {
    let dist = v2dist(draw_pos, renderCamPos()) / DIM; // 0...N grid cells
    // Desired mapping:
    // Dist 0 = 0.5 (half blend between nearest and linear)
    // Dist 2 = 0.25
    // Dist 4 = 0 (fully linear mipmapped)
    shader_params.lod_bias = vec2(
      (shader_params.lod_bias as Vec2)[0],
      clamp(settings.hybrid_base - dist * settings.hybrid_scalar, 0, 1)
    );
    shader_type = ShaderType.SpriteHybridFragment;
    sprite = sprite_hybrid;
  }
  let shader = crawlerRenderGetShader(shader_type);
  let aspect = sprite.uidata && sprite.uidata.aspect ? sprite.uidata.aspect[frame] : 1;
  sprite.draw3D({
    pos: draw_pos,
    offs: v2scale(offs_temp, offs_temp, DIM),
    frame,
    color,
    size: [hscale * DIM * aspect, vscale * DIM],
    bucket: ent.drawable_sprite_opts.do_alpha === false ? BUCKET_OPAQUE : BUCKET_ALPHA,
    facing: FACE_XY,
    vshader: crawlerRenderGetShader(ShaderType.SpriteVertex),
    shader,
    shader_params,
  });

  if (sprite_shadow) {
    shader = crawlerRenderGetShader(ShaderType.SpriteFragment);
    aspect = sprite_shadow.uidata && sprite_shadow.uidata.aspect ? sprite_shadow.uidata.aspect[frame] : 1;
    v3copy(draw_pos_temp2, draw_pos);
    draw_pos_temp2[2] += 0.05;
    let shadow_scale = ent.drawable_sprite_opts.shadow!.scale || scale;
    sprite_shadow.draw3D({
      pos: draw_pos_temp2,
      //offs: v2scale(offs_temp, offs_temp, DIM),
      frame,
      color,
      size: [DIM * aspect * shadow_scale, DIM * shadow_scale],
      bucket: BUCKET_OPAQUE,
      facing: FACE_CUSTOM,
      face_right: yaxis,
      face_down: xaxis,
      vshader: crawlerRenderGetShader(ShaderType.SpriteVertex),
      shader,
      shader_params,
    });
  }
}

export function drawableSpineDraw2D(this: EntityDrawableSpine, param: EntityDraw2DOpts): void {
  let ent = this;
  let { spine } = ent.drawable_spine_state;
  if (ent.drawable_spine_state.anim_update_frame !== getFrameIndex()) {
    spine.update(getScaledFrameDt());
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
let draw_pos = vec3();
let vhdim = vec3(HDIM, HDIM, HDIM);
export function drawableDraw(this: EntityDrawable, param: EntityDrawOpts): void {
  let {
    dt,
    pos,
    zoffs,
    angle, // angle entity is facing
    color,
    use_near,
  } = param;
  let ent = this;

  let { lod_bias } = ent.drawable_opts;

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
  draw_pos[2] = pos[2] * DIM + zoffs * DIM;

  billboardBias(draw_pos, pos, ent.drawable_opts);

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
  ent_in_front = controller.getEntInFront(); // Note: only gets those that block players

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
let draw_pos_temp = vec3();
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
    draw_pos_temp[0] = pos[0];
    draw_pos_temp[1] = pos[1];
    draw_pos_temp[2] = level.getInterpolatedHeight(pos[0], pos[1]);

    ent.draw({
      dt,
      game_state,
      pos: draw_pos_temp,
      zoffs,
      angle: pos[2],
      color: color_temp,
      use_near: ent_set === SPLIT_NEAR,
    });

    if (ent.floaters && !crawlerRenderViewportGet().rot) {
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
        if (is_in_front && !crawlerController().controllerIsAnimating()) {
          let { x, y, w, h } = crawlerRenderViewportGet();
          let float = easeOut(elapsed / (FLOATER_TIME + FLOATER_FADE), 2) * 20;
          font.drawSizedAligned(fontStyleAlpha(style_text, alpha),
            x,
            y + h/2 - float, Z.FLOATERS,
            uiTextHeight(), ALIGN.HCENTER|ALIGN.VBOTTOM,
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
