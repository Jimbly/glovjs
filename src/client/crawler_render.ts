const { abs, atan2, floor, max, min, cos, round, sin, PI } = Math;
export const FOV = 68 * PI / 180;
export const DIM = 200;
export const HDIM = DIM/2;

export const SPLIT_ALL = 0;
export const SPLIT_NEAR = 1;
export const SPLIT_FAR = 2;
export type SplitSet = typeof SPLIT_ALL | typeof SPLIT_NEAR | typeof SPLIT_FAR;

export const ShaderType = {
  ModelVertex: 'vmodel',
  ModelFragment: 'fmodel',
  SpriteVertex: 'vsprite',
  SpriteFragment: 'fsprite',
  SpriteBlendFragment: 'fsprite_blend',
  SpriteHybridFragment: 'fsprite_hybrid',
  TintedSpriteFragment: 'fspritetinted',
  TintedModelFragment: 'fmodeltinted',
} as const;
export type ShaderTypeEnum = typeof ShaderType[keyof typeof ShaderType];

import assert from 'assert';
import { virtualToCanvas } from 'glov/client/camera2d';
import { cmd_parse } from 'glov/client/cmds';
import { alphaDraw, opaqueDraw } from 'glov/client/draw_list';
import {
  BUCKET_ALPHA,
  BUCKET_OPAQUE,
  FACE_CAMERA,
  FACE_CUSTOM,
  FACE_FRUSTUM,
  FACE_XY,
  dynGeomLookAt,
} from 'glov/client/dyn_geom';
import * as engine from 'glov/client/engine';
import { geomCreateQuads } from 'glov/client/geom';
import mat4ScaleRotateTranslate from 'glov/client/mat4ScaleRotateTranslate';
import { modelLoad } from 'glov/client/models';
import {
  qRotateZ,
  qTransformVec3,
  quat,
  unit_quat,
} from 'glov/client/quat';
import {
  SEMANTIC,
  shaderCreate,
  shadersAddGlobal,
  shadersBind,
} from 'glov/client/shaders';
import {
  textureBindArray,
} from 'glov/client/textures';
import * as ui from 'glov/client/ui';
import { dataErrorEx } from 'glov/common/data_error';
import { isInteger, lerp, ridx } from 'glov/common/util';
import {
  ROVec2,
  ROVec3,
  ROVec4,
  Vec2,
  Vec3,
  Vec4,
  mat4,
  unit_vec,
  v2addScale,
  v2copy,
  v2distSq,
  v2iRound,
  v2set,
  v2sub,
  v3add,
  v3addScale,
  v3copy,
  v3dist,
  v3iAdd,
  v3iAddScale,
  v3scale,
  v3set,
  v4copy,
  v4mul,
  v4set,
  vec2,
  vec3,
  vec4,
  zaxis,
} from 'glov/common/vmath';
import { getEffCell, getEffWall } from '../common/crawler_script';
import {
  CellDesc,
  CrawlerCell,
  CrawlerState,
  DirType,
  VIS_SEEN,
  VisualOpts,
  VstyleDesc,
  WallDesc,
} from '../common/crawler_state';

import type { CrawlerScriptAPIClient } from './crawler_script_api_client';
import type { Box } from 'glov/client/geom_types';
import type { BucketType, Sprite, SpriteUIData } from 'glov/client/sprites';

type Geom = ReturnType<typeof geomCreateQuads>;
type Shader = ReturnType<typeof shaderCreate>;

const DX = [1,0,-1,0];
const DY = [0,1,0,-1];

const DEBUG_VIS = false;
const VIS_RADIUS = 3;

let wall_rots = [
  qRotateZ(quat(), unit_quat, 0),
  qRotateZ(quat(), unit_quat, PI/2),
  qRotateZ(quat(), unit_quat, PI),
  qRotateZ(quat(), unit_quat, 3*PI/2),
];


let split_dist_sq: number;

let mat_obj = mat4();

let frame_idx = 0;

let crawler_viewport: Box;
export function crawlerRenderViewportSet(val: Box): void {
  crawler_viewport = val;
}

export function crawlerRenderViewportGet(): Box {
  return crawler_viewport;
}

let upper_left = vec2();
let lower_right = vec2();
let view_size = vec2();
let temp_viewport = vec4();
export function crawlerCalc3DViewport(): Vec4 {
  virtualToCanvas(upper_left, [crawler_viewport.x, crawler_viewport.y]);
  v2iRound(upper_left);
  virtualToCanvas(lower_right, [crawler_viewport.x+crawler_viewport.w, crawler_viewport.y+crawler_viewport.h]);
  v2sub(view_size, lower_right, upper_left);
  view_size[0] = round(view_size[0]);
  view_size[1] = round(view_size[1]);
  upper_left[1] = engine.height - (upper_left[1] + view_size[1]);
  v4set(temp_viewport,
    upper_left[0], upper_left[1],
    view_size[0], view_size[1]);
  return temp_viewport;
}

let render_shaders: Record<ShaderTypeEnum, Shader>;
export function crawlerRenderGetShader(type: ShaderTypeEnum): Shader {
  return render_shaders[type];
}

export function crawlerRenderDoSplit(): boolean {
  return split_dist_sq > 0;
}

let angle_offs = 0;
cmd_parse.registerValue('angle_offs', {
  label: 'Angle Offset',
  type: cmd_parse.TYPE_FLOAT,
  get: () => angle_offs,
  set: (v: number) => {
    angle_offs = v;
  },
  store: false,
});

let game_view_angle: number;
export function crawlerRenderGameViewAngle(): number {
  return game_view_angle;
}


let player_pos = vec3();

let global_lod_bias = vec2(-1,0);
let color_hidden = vec4(1,0,1,1);

export type CrawlerDrawableOpts2 = {
  debug_visible: boolean;
  split_set: SplitSet;
  draw_dist_sq: number;
  no_blend: boolean;
};
export type CrawlerDrawable = (
  rot: ROVec4, pos: ROVec3,
  visual: VisualOpts | undefined,
  opts: CrawlerDrawableOpts2,
  debug_id: string,
) => void;
export type CrawlerThumbnailPair = [
  Sprite,
  {
    frame?: number;
    uvs?: number[];
    color?: ROVec4;
  }
];
export type CrawlerGetThumbnail = (
  visual: VisualOpts | undefined,
  desc: WallDesc | CellDesc,
) => CrawlerThumbnailPair | null;
let drawables: Partial<Record<string, CrawlerDrawable>> = {};
let thumbnailgetters: Partial<Record<string, CrawlerGetThumbnail>> = {};

function defaultGetThumbnail(): null {
  return null;
}

export function crawlerRenderRegisterDrawable(
  type: string,
  drawable: CrawlerDrawable,
  thumbnail?: CrawlerGetThumbnail
): void {
  drawables[type] = drawable;
  thumbnailgetters[type] = thumbnail || defaultGetThumbnail;
}

export function passesSplitCheck(split_set: SplitSet, do_split: boolean, draw_dist_sq: number): boolean {
  if (split_set === SPLIT_ALL) {
    return true;
  }
  if (!do_split) {
    if (split_set === SPLIT_NEAR) {
      return false;
    }
  } else {
    let dstart = split_set === SPLIT_FAR ? split_dist_sq : 0;
    let dend = split_set === SPLIT_NEAR ? split_dist_sq : Infinity;

    if (draw_dist_sq < dstart || draw_dist_sq >= dend) {
      return false;
    }
  }
  return true;
}

function hasVisualsVisited(desc: CellDesc | WallDesc): desc is CellDesc {
  return Boolean((desc as CellDesc).visuals_visited);
}

function hasAdvertisedWall(desc: CellDesc | WallDesc): desc is CellDesc & { advertised_wall_desc: WallDesc } {
  return Boolean((desc as CellDesc).advertised_wall_desc);
}

export function crawlerRenderGetThumbnail(desc: CellDesc | WallDesc): CrawlerThumbnailPair[] {
  desc = desc.swapped;
  if (hasAdvertisedWall(desc)) {
    desc = desc.advertised_wall_desc.swapped;
  }
  let ret: CrawlerThumbnailPair[] = [];
  for (let pass in desc.visuals_runtime) {
    let visuals = desc.visuals_runtime[pass];
    if (hasVisualsVisited(desc) && desc.visuals_visited_runtime[pass]) {
      visuals = desc.visuals_visited_runtime[pass];
    }
    if (visuals) {
      for (let jj = 0; jj < visuals.length; ++jj) {
        let visual = visuals[jj];
        let thumbnailgetter = thumbnailgetters[visual.type];
        assert(thumbnailgetter);
        let pair = thumbnailgetter(visual.opts, desc);
        if (pair) {
          ret.push(pair);
        }
      }
    }
  }
  return ret;
}

const param_occluded = {
  debug_color: color_hidden,
};
const param_visible = {};

type GeomFormatElem = [number, number, number, boolean];
export function simpleFormat(): GeomFormatElem[] {
  return [
    [SEMANTIC.POSITION, gl.FLOAT, 4, false], // x,y,z, unused
    [SEMANTIC.TEXCOORD, gl.FLOAT, 2, false], // ux, uy, vy, vz
  ];
}

let fog_params = vec4(0.003, 0.001, 800.0, 0.0);
let fog_color = vec4(0, 0, 0, 0);

export function crawlerSetFogColor(v: Vec3): void {
  v3copy(fog_color, v);
}

export function crawlerSetFogParams(v: Vec3): void {
  v3copy(fog_params, v);
}

export function crawlerRenderStartup(): void {
  shadersAddGlobal('player_pos', player_pos);
  shadersAddGlobal('lod_bias', global_lod_bias);
  shadersAddGlobal('debug_color', unit_vec); // default color if not provided per-drawcall
  shadersAddGlobal('fog_params', fog_params);
  shadersAddGlobal('fog_color', fog_color);

  render_shaders = {
    fsprite: shaderCreate('shaders/crawler_sprite3d.fp'),
    fsprite_blend: shaderCreate('shaders/crawler_sprite3d_blend.fp'),
    fsprite_hybrid: shaderCreate('shaders/crawler_sprite3d_hybrid.fp'),
    fspritetinted: shaderCreate('shaders/crawler_sprite3d_tinted.fp'),
    vsprite: shaderCreate('shaders/crawler_sprite3d.vp'),
    fmodel: shaderCreate('shaders/crawler_model.fp'),
    fmodeltinted: shaderCreate('shaders/crawler_model_tinted.fp'),
    vmodel: shaderCreate('shaders/crawler_model.vp'),
  };
}

export type SpriteSheet = {
  sprite: Sprite;
  sprite_centered: Sprite;
  sprite_centered_x: Sprite;
  tiles: Partial<Record<string, number>>;
};
export type SpriteSheetSet = Partial<Record<string, SpriteSheet>> & { default: SpriteSheet };
let spritesheets: SpriteSheetSet;

type SimpleVisualOpts = {
  spritesheet?: string;
  tile: string | string[];
  times?: number | number[];
  total_time?: number; // set at runtime
  color?: ROVec4;
  do_split?: boolean;
  do_blend?: number;
  do_alpha?: boolean;
};

function frameFromAnim(frames: string[], times: number[], total_time: number): string {
  assert.equal(frames.length, times.length);
  let t = engine.frame_timestamp % total_time;
  let idx = 0;
  while (t > times[idx]) {
    t -= times[idx++];
  }
  return frames[idx];
}

function frameFromAnim2(
  out: Vec4,
  uidata: SpriteUIData, base_frame: number,
  spritesheet: SpriteSheet,
  frames: string[], times: number[], total_time: number, blend_time: number
): void {
  assert.equal(frames.length, times.length);
  let t = engine.frame_timestamp % total_time;
  let idx = 0;
  while (t > times[idx]) {
    t -= times[idx++];
  }
  if (t < blend_time) {
    idx = (idx + frames.length - 1) % frames.length;
    let baseuv = uidata.rects[base_frame];
    let frame = spritesheet.tiles[frames[idx]];
    if (frame === undefined) {
      return;
    }
    let ouruv = uidata.rects[frame];
    v2sub(out, ouruv, baseuv);
    out[2] = 1 - t / blend_time;
  } else {
    v4set(out, 0, 0, 0, 0);
  }
}

let temp_color = vec4();
type SpriteParamPair = [
  Sprite,
  {
    frame?: number;
    bucket: BucketType;
    shader: Shader;
    vshader: Shader;
    facing: number;
    color: ROVec4;
  }
];
const null_null = [null, null] as const;
function simpleGetSpriteParam(
  visual: VisualOpts | undefined,
  opts: CrawlerDrawableOpts2,
  debug_id: string,
  sprite_key: 'sprite' | 'sprite_centered' | 'sprite_centered_x',
): SpriteParamPair | readonly [null, null] {
  let sprite;
  let frame;
  let color = opts.debug_visible ? color_hidden : unit_vec;
  let shader;
  let bucket: typeof BUCKET_OPAQUE | typeof BUCKET_ALPHA = BUCKET_OPAQUE;
  if (!visual) {
    if (!passesSplitCheck(opts.split_set, false, opts.draw_dist_sq)) {
      return null_null;
    }
    sprite = ui.sprites.white;
  } else {
    let visual_opts = visual as unknown as SimpleVisualOpts;
    if (!passesSplitCheck(opts.split_set, visual_opts.do_split || false, opts.draw_dist_sq)) {
      return null_null;
    }
    if (visual_opts.do_alpha) {
      bucket = BUCKET_ALPHA;
    }
    let spritesheet_name = visual_opts.spritesheet || 'default';
    let spritesheet = spritesheets[spritesheet_name];
    assert(spritesheet, spritesheet_name);
    let { tile, do_blend } = visual_opts;
    assert(tile);
    if (Array.isArray(tile)) {
      let times = visual_opts.times || 250;
      if (!Array.isArray(times)) {
        let arr: number[] = [];
        for (let ii = 0; ii < tile.length; ++ii) {
          arr.push(times);
        }
        times = visual_opts.times = arr;
      }
      let { total_time } = visual_opts;
      if (!total_time) {
        total_time = 0;
        for (let ii = 0; ii < times.length; ++ii) {
          total_time += times[ii];
        }
        visual_opts.total_time = total_time;
      }
      tile = frameFromAnim(tile, times, total_time);
    }
    frame = spritesheet.tiles[tile];
    if (frame === undefined) {
      dataErrorEx({
        msg: `Unknown frame ${spritesheet_name}: "${tile}" referenced in "${debug_id}"`,
        per_frame: true,
      });
      frame = 0;
    }
    sprite = spritesheet[sprite_key];
    if (visual_opts.color) {
      color = v4mul(temp_color, color, visual_opts.color);
    }
    if (do_blend && !opts.no_blend) {
      let times = visual_opts.times || 250;
      if (!Array.isArray(times)) {
        let arr: number[] = [];
        for (let ii = 0; ii < tile.length; ++ii) {
          arr.push(times);
        }
        times = visual_opts.times = arr;
      }
      assert(Array.isArray(visual_opts.tile));
      v4copy(temp_color, color);
      color = temp_color;
      frameFromAnim2(
        temp_color,
        sprite.uidata!, frame,
        spritesheet,
        visual_opts.tile as string[], visual_opts.times as number[], visual_opts.total_time as number,
        do_blend);
      shader = crawlerRenderGetShader(ShaderType.SpriteBlendFragment);
    }
  }

  return [sprite, {
    frame,
    bucket,
    shader: shader || crawlerRenderGetShader(ShaderType.SpriteFragment),
    vshader: crawlerRenderGetShader(ShaderType.SpriteVertex),
    facing: FACE_CUSTOM,
    color,
  }];
}

const dummy_opts: CrawlerDrawableOpts2 = {
  debug_visible: false,
  split_set: SPLIT_ALL,
  draw_dist_sq: 0,
  no_blend: true,
};
function simpleGetThumbnail(visual: VisualOpts | undefined, desc: WallDesc | CellDesc): CrawlerThumbnailPair {
  let [sprite, param] = simpleGetSpriteParam(visual, dummy_opts, desc.id, 'sprite');
  assert(sprite && param);
  return [sprite, {
    frame: param.frame,
    color: param.color,
    // not shader/vshader: these are 3D shaders, not 2D shaders
  }];
}

type SimpleDetailRenderOpts = {
  scale?: number;
  height?: number;
  offs?: [number, number];
  detail_layer?: number;
  force_rot?: number;
} & SimpleVisualOpts;

const FLOOR_DETAIL_Z = 0.025;

const wall_face_right = vec3(0, -1, 0);
const wall_face_down = vec3(0, 0, -1);
const wall_detail_offs = vec3(FLOOR_DETAIL_Z, 0, 0);
let temp_pos = vec3();
let temp_right = vec3();
let temp_down = vec3();
let temp_size = vec2();
function drawSimpleWall(
  rot: ROVec4, pos: ROVec3, visual: VisualOpts | undefined, opts: CrawlerDrawableOpts2,
  debug_id: string
): void {
  let [sprite, param] = simpleGetSpriteParam(visual, opts, debug_id, 'sprite');
  if (!sprite) {
    return;
  }

  let vopts = visual as unknown as SimpleDetailRenderOpts;
  let scale = vopts.scale || 1;
  let offs = vopts.offs || [0,0];
  let height = vopts.height || 1;
  let detail_layer = vopts.detail_layer || 0;

  v3set(temp_pos, HDIM, HDIM, DIM);
  if (detail_layer) {
    v3iAddScale(temp_pos, wall_detail_offs, -detail_layer);
  }
  temp_pos[1] -= offs[0] * DIM + (1 - scale) * HDIM;
  temp_pos[2] -= offs[1] * DIM + (1 - scale) * HDIM + (1 - height) * DIM;
  v2set(temp_size, DIM*scale, DIM*scale*height);

  if (vopts.force_rot !== undefined) {
    rot = wall_rots[vopts.force_rot];
  }

  qTransformVec3(temp_pos, temp_pos, rot);
  qTransformVec3(temp_right, wall_face_right, rot);
  v3iAdd(temp_pos, pos);

  sprite.draw3D({
    ...param,
    pos: temp_pos,
    size: temp_size,
    face_right: temp_right,
    face_down: wall_face_down,
  });
}

type SimpleBillboardRenderOpts = {
  height?: number;
  width?: number;
  offs?: Vec3;
  face_camera?: boolean;
} & SimpleVisualOpts;
function drawSimpleBillboard(
  rot: ROVec4, pos: ROVec3, visual: VisualOpts | undefined, opts: CrawlerDrawableOpts2,
  debug_id: string,
): void {
  let [sprite, param] = simpleGetSpriteParam(visual, opts, debug_id, 'sprite_centered_x');
  if (!sprite) {
    return;
  }
  let vopts = visual as unknown as SimpleBillboardRenderOpts;
  let {
    height,
    width,
    offs,
    face_camera,
  } = vopts;
  v2set(temp_size, DIM * (width || 1), DIM * (height || 1));
  if (offs) {
    v3scale(temp_pos, offs, DIM);
    qTransformVec3(temp_pos, temp_pos, rot);
    v3iAdd(temp_pos, pos);
  } else {
    v3copy(temp_pos, pos);
  }
  v3iAdd(temp_pos, [0, 0, temp_size[1]]);

  sprite.draw3D({
    ...param,
    pos: temp_pos,
    size: temp_size,
    facing: FACE_XY | (face_camera ? FACE_CAMERA : FACE_FRUSTUM),
  });
}

const floor_detail_offs = vec3(0, 0, FLOOR_DETAIL_Z);
const floor_face_right = vec3(1, 0, 0);
const floor_face_down = vec3(0, -1, 0);
function drawSimpleFloor(
  rot: ROVec4, pos: ROVec3, visual: VisualOpts | undefined, opts: CrawlerDrawableOpts2,
  debug_id: string
): void {
  let [sprite, param] = simpleGetSpriteParam(visual, opts, debug_id, 'sprite');
  if (!sprite) {
    return;
  }

  let vopts = visual as unknown as SimpleDetailRenderOpts;
  let scale = vopts.scale || 1;
  let offs = vopts.offs || [0,0];
  let detail_layer = vopts.detail_layer || 0;

  v3add(temp_pos, pos, [-HDIM, HDIM, 0]);
  if (detail_layer) {
    v3iAddScale(temp_pos, floor_detail_offs, detail_layer);
  }
  temp_pos[0] += offs[0] * DIM + (1 - scale) * HDIM;
  temp_pos[1] -= offs[1] * DIM + (1 - scale) * HDIM;
  v2set(temp_size, DIM*scale, DIM*scale);

  sprite.draw3D({
    ...param,
    pos: temp_pos,
    size: temp_size,
    face_right: floor_face_right,
    face_down: floor_face_down,
  });
}

const ceiling_face_right = vec3(1, 0, 0);
const ceiling_face_down = vec3(0, 1, 0);
function drawSimpleCeiling(
  rot: ROVec4, pos: ROVec3, visual: VisualOpts | undefined, opts: CrawlerDrawableOpts2,
  debug_id: string,
): void {
  let [sprite, param] = simpleGetSpriteParam(visual, opts, debug_id, 'sprite');
  if (!sprite) {
    return;
  }

  let vopts = visual as unknown as SimpleDetailRenderOpts;
  let scale = vopts.scale || 1;
  let height = vopts.height || 1;
  let offs = vopts.offs || [0,0];
  let detail_layer = vopts.detail_layer || 0;

  v3add(temp_pos, pos, [-HDIM, -HDIM, DIM * height]);
  if (detail_layer) {
    v3iAddScale(temp_pos, floor_detail_offs, -detail_layer);
  }
  temp_pos[0] += offs[0] * DIM + (1 - scale) * HDIM;
  temp_pos[1] += offs[1] * DIM + (1 - scale) * HDIM;
  v2set(temp_size, DIM*scale, DIM*scale);

  sprite.draw3D({
    ...param,
    pos: temp_pos,
    size: temp_size,
    face_right: ceiling_face_right,
    face_down: ceiling_face_down,
  });
}

type SimpleCornerFloorRenderOpts = {
  quadrants?: number;
  scale?: number;
} & SimpleVisualOpts;

const temp_uvs = vec4();
function drawSimpleCornerFloor(
  rot: ROVec4, pos: ROVec3, visual: VisualOpts | undefined, opts: CrawlerDrawableOpts2,
  debug_id: string
): void {
  let [sprite, param] = simpleGetSpriteParam(visual, opts, debug_id, 'sprite');
  if (!sprite) {
    return;
  }
  assert(param);
  let vopts = visual as unknown as SimpleCornerFloorRenderOpts;
  let quadrants = vopts.quadrants || 4;
  let scale = vopts.scale || 1;

  v3set(temp_pos, HDIM - scale * HDIM, HDIM + scale * HDIM, 0);
  qTransformVec3(temp_pos, temp_pos, rot);
  qTransformVec3(temp_right, floor_face_right, rot);
  qTransformVec3(temp_down, floor_face_down, rot);
  v3iAdd(temp_pos, pos);
  v3iAdd(temp_pos, floor_detail_offs);
  v2set(temp_size, DIM*scale, DIM*scale);

  let uvs = sprite.uidata!.rects[param.frame!];
  if (quadrants === 4) {
    sprite.draw3D({
      ...param,
      pos: temp_pos,
      size: temp_size,
      face_right: temp_right,
      face_down: temp_down,
    });
  } else if (quadrants === 2) {
    temp_size[0] *= 0.5;
    v4copy(temp_uvs, uvs);
    temp_uvs[2] = uvs[0] + (uvs[2] - uvs[0]) * 0.5;
    delete param.frame;
    sprite.draw3D({
      ...param,
      uvs: temp_uvs,
      pos: temp_pos,
      size: temp_size,
      face_right: temp_right,
      face_down: temp_down,
    });
  } else if (quadrants === 1) {
    temp_size[0] *= 0.5;
    temp_size[1] *= 0.5;
    v3addScale(temp_pos, temp_pos, temp_down, HDIM*scale);
    v4copy(temp_uvs, uvs);
    temp_uvs[2] = uvs[0] + (uvs[2] - uvs[0]) * 0.5;
    temp_uvs[1] = uvs[3] + (uvs[1] - uvs[3]) * 0.5;
    delete param.frame;
    sprite.draw3D({
      ...param,
      uvs: temp_uvs,
      pos: temp_pos,
      size: temp_size,
      face_right: temp_right,
      face_down: temp_down,
    });
  } else if (quadrants === 3) {
    temp_size[0] *= 0.5;
    v4copy(temp_uvs, uvs);
    temp_uvs[2] = uvs[0] + (uvs[2] - uvs[0]) * 0.5;
    delete param.frame;
    sprite.draw3D({
      ...param,
      uvs: temp_uvs,
      pos: temp_pos,
      size: temp_size,
      face_right: temp_right,
      face_down: temp_down,
    });

    temp_size[1] *= 0.5;
    v3addScale(temp_pos, temp_pos, temp_right, HDIM*scale);
    v4copy(temp_uvs, uvs);
    temp_uvs[0] = uvs[2] + (uvs[0] - uvs[2]) * 0.5;
    temp_uvs[3] = uvs[1] + (uvs[3] - uvs[1]) * 0.5;
    delete param.frame;
    sprite.draw3D({
      ...param,
      uvs: temp_uvs,
      pos: temp_pos,
      size: temp_size,
      face_right: temp_right,
      face_down: temp_down,
    });
  }
}

type SimplePillarRenderOpts = {
  quadrants?: number;
  segments?: number;
  roundness?: number;
  radius?: number;
  height?: number;
};

type SimplePillarOpts = SimpleVisualOpts & SimplePillarRenderOpts & {
  key?: string; // dynamically cached
};

function createPillar(opts: SimplePillarRenderOpts, rect: ROVec4): Geom {
  const quadrants = opts.quadrants || 4;
  const pillar_segments = opts.segments || 16;
  const roundness = opts.roundness === undefined ? 1 : opts.roundness;
  const height = (opts.height || 1) * DIM;
  const q = quadrants/4;
  const pillar_radius = DIM * (opts.radius || 0.1);
  let num_quads = pillar_segments * q;
  assert(isInteger(num_quads)); // Must be divisible by 4
  let pillar = new Float32Array(num_quads * 6*4);
  let idx = 0;
  // pillar itself
  function pushvert2(x: number, y: number, z: number, uu: number, vv: number): void {
    pillar[idx++] = x + HDIM;
    pillar[idx++] = y + HDIM;
    pillar[idx++] = z;
    pillar[idx++] = 1;
    pillar[idx++] = uu;
    pillar[idx++] = vv;
  }
  function pushvert(x: number, y: number, z: number, uu: number, vv: number): void {
    pushvert2(x, y, z, rect[0] + uu*(rect[2] - rect[0]), rect[1] + vv*(rect[3] - rect[1]));
  }
  let a0 = 3 * PI / 2 - quadrants * PI/2;
  for (let ii = 0; ii < num_quads; ++ii) {
    let astart = ii / pillar_segments * PI * 2 + a0;
    let aend = (ii + 1) / pillar_segments * PI * 2 + a0;
    let x0 = cos(astart) * pillar_radius;
    let x1 = cos(aend) * pillar_radius;
    let y0 = sin(astart) * pillar_radius;
    let y1 = sin(aend) * pillar_radius;
    if (roundness !== 1) {
      let mag = max(abs(x0), abs(y0))/pillar_radius;
      let scale = (1 - roundness) / mag + roundness;
      x0 *= scale;
      y0 *= scale;
      mag = max(abs(x1), abs(y1))/pillar_radius;
      scale = (1 - roundness) / mag + roundness;
      x1 *= scale;
      y1 *= scale;
    }
    pushvert(x0, y0, height, ii/pillar_segments, 0);
    pushvert(x0, y0, 0, ii/pillar_segments, 1);
    pushvert(x1, y1, 0, (ii+1)/pillar_segments, 1);
    pushvert(x1, y1, height, (ii+1)/pillar_segments, 0);
  }

  return geomCreateQuads(simpleFormat(), pillar, true);
}
let pillar_geoms: Partial<Record<string, Geom>> = {};
function drawSimplePillar(
  rot: ROVec4, pos: ROVec3, visual: VisualOpts | undefined, opts: CrawlerDrawableOpts2,
  debug_id: string
): void {
  assert(visual); // At least need quadrants
  let [sprite, param] = simpleGetSpriteParam(visual, opts, debug_id, 'sprite');
  if (!sprite) {
    return;
  }
  assert(param);
  assert(typeof param.frame === 'number');
  let vopts = visual as unknown as SimplePillarOpts;
  let key = vopts.key;
  if (!key) {
    key = vopts.key = `${vopts.quadrants},${vopts.segments},${vopts.roundness},` +
      `${vopts.radius},${vopts.height||1},${param.frame}`;
  }
  let geom = pillar_geoms[key];
  if (!geom) {
    let uvs = sprite.uidata!.rects[param.frame];
    geom = pillar_geoms[key] = createPillar(vopts, uvs);
  }

  let params = opts.debug_visible ? param_occluded : param_visible;
  textureBindArray(sprite.texs);
  mat4ScaleRotateTranslate(mat_obj, 1, rot, pos);
  engine.updateMatrices(mat_obj);
  shadersBind(crawlerRenderGetShader(ShaderType.ModelVertex), crawlerRenderGetShader(ShaderType.ModelFragment), params);
  geom.draw();
}

type SimpleModelOpts = {
  model: string;
};

type Model = ReturnType<typeof modelLoad>;
let model_cache: Partial<Record<string, Model>> = {};
function drawModel(rot: ROVec4, pos: ROVec3, visual: VisualOpts | undefined, opts: CrawlerDrawableOpts2): void {
  if (opts.split_set === SPLIT_NEAR) { // Not doing any splitting for models, probably wouldn't make sense
    return;
  }
  let vopts = visual as unknown as SimpleModelOpts;
  let model = model_cache[vopts.model];
  if (!model) {
    model = model_cache[vopts.model] = modelLoad(vopts.model);
  }
  mat4ScaleRotateTranslate(mat_obj, 1, rot, pos);
  model.draw({
    mat: mat_obj,
    vshader: crawlerRenderGetShader(ShaderType.ModelVertex),
    fshader: crawlerRenderGetShader(ShaderType.ModelFragment),
  });
}

crawlerRenderRegisterDrawable('simple_wall', drawSimpleWall, simpleGetThumbnail);
crawlerRenderRegisterDrawable('simple_floor', drawSimpleFloor, simpleGetThumbnail);
crawlerRenderRegisterDrawable('simple_ceiling', drawSimpleCeiling, defaultGetThumbnail); // do *not* provide a sprite
crawlerRenderRegisterDrawable('simple_pillar', drawSimplePillar, defaultGetThumbnail);
crawlerRenderRegisterDrawable('simple_corner_floor', drawSimpleCornerFloor, defaultGetThumbnail);
crawlerRenderRegisterDrawable('model', drawModel, defaultGetThumbnail);
crawlerRenderRegisterDrawable('simple_billboard', drawSimpleBillboard, simpleGetThumbnail);

let pos_offs = vec2();
cmd_parse.registerValue('pos_offs_x', {
  label: 'Camera Pos Offset X',
  type: cmd_parse.TYPE_FLOAT,
  get: () => pos_offs[0],
  set: (v: number) => {
    pos_offs[0] = v;
  },
  store: false,
});
cmd_parse.registerValue('pos_offs_y', {
  label: 'Camera Pos Offset Y',
  type: cmd_parse.TYPE_FLOAT,
  get: () => pos_offs[1],
  set: (v: number) => {
    pos_offs[1] = v;
  },
  store: false,
});
export function crawlerRenderGetPosOffs(): ROVec2 {
  return pos_offs;
}

export type RenderPass = {
  name: string;
  neighbor_draw?: boolean;
  need_split_near?: boolean;
};
let render_passes: RenderPass[];
export function crawlerRenderInit(param: {
  passes: RenderPass[];
  spritesheets?: SpriteSheetSet;
  split_dist: number;
  angle_offs?: number;
  pos_offs?: Vec2;
}): void {
  let { passes } = param;
  render_passes = passes;
  if (param.spritesheets) {
    spritesheets = param.spritesheets;
  }
  split_dist_sq = param.split_dist * param.split_dist;
  angle_offs = (param.angle_offs || 0) * PI/180;
  v2copy(pos_offs, param.pos_offs || [0,-0.95]);
}

let draw_pos = vec3(0,0,0);
let vhdim = vec3(HDIM, HDIM, HDIM);

const opts_visible: CrawlerDrawableOpts2 = {
  debug_visible: false,
  split_set: SPLIT_ALL,
  draw_dist_sq: 0,
  no_blend: false,
};
const opts_occluded: CrawlerDrawableOpts2 = {
  debug_visible: true,
  split_set: SPLIT_ALL,
  draw_dist_sq: 0,
  no_blend: false,
};
function drawCell(
  game_state: CrawlerState,
  cell: CrawlerCell,
  pos: Vec2,
  pass: RenderPass,
  ignore_vis: boolean,
  vstyle: VstyleDesc,
  script_api: CrawlerScriptAPIClient,
  split_set: SplitSet,
): void {
  let opts = opts_visible;
  let cell_desc = getEffCell(script_api, cell).swapped;
  if (!cell_desc.open_vis) {
    return; // should only get here with debug view
  }
  if (cell.visible_frame !== frame_idx) {
    // Not visible this frame
    if (pass.neighbor_draw && cell.visible_adjacent_frame === frame_idx) {
      // but, a neighbor is, so we should draw our details that extend in
    } else {
      if (DEBUG_VIS || ignore_vis) {
        opts = opts_occluded;
      } else {
        return;
      }
    }
  }
  v2addScale(draw_pos, vhdim, pos, DIM);
  draw_pos[2] = 0;
  opts.split_set = split_set;
  opts.draw_dist_sq = v2distSq(pos, game_state.pos);

  {
    let visuals = cell_desc.visuals_runtime[pass.name];
    if (cell_desc.visuals_visited_runtime[pass.name] && cell.isVisited()) {
      visuals = cell_desc.visuals_visited_runtime[pass.name];
    }
    if (visuals) {
      for (let jj = 0; jj < visuals.length; ++jj) {
        let visual = visuals[jj];
        let drawable = drawables[visual.type];
        assert(drawable);
        drawable(unit_quat, draw_pos, visual.opts, opts, cell_desc.id);
      }
    }
  }

  for (let ii = 0 as DirType; ii < 4; ++ii) {
    let wall_desc = getEffWall(script_api, cell, ii).swapped;
    //let wall_desc = cell.walls[ii].swapped;
    let visuals = wall_desc.visuals_runtime[pass.name];
    if (visuals) {
      for (let jj = 0; jj < visuals.length; ++jj) {
        let visual = visuals[jj];
        let drawable = drawables[visual.type];
        assert(drawable);
        drawable(wall_rots[ii], draw_pos, visual.opts, opts, wall_desc.id);
      }
    }
  }

  let corners = cell_desc.corners_runtime[pass.name];
  if (corners) {
    for (let ii = 0; ii < 4; ++ii) {
      let style = cell.corner_details![ii];
      if (style) {
        let visuals = corners[style];
        for (let jj = 0; jj < visuals.length; ++jj) {
          let visual = visuals[jj];
          let drawable = drawables[visual.type];
          assert(drawable);
          drawable(wall_rots[ii], draw_pos, visual.opts, opts, cell_desc.id);
        }
      }
    }
  }
}

function normAngle(a: number): number {
  while (a < -PI) {
    a += PI * 2;
  }
  while (a >= PI) {
    a -= PI * 2;
  }
  return a;
}

const EPSILON = 0.0001;
function lessOrSame(a1: number, a2: number): boolean {
  return a1 < a2 + EPSILON;
}
function greaterOrSame(a1: number, a2: number): boolean {
  return a1 > a2 - EPSILON;
}
function lessStrict(a1: number, a2: number): boolean {
  return a1 < a2 - EPSILON;
}
function greaterStrict(a1: number, a2: number): boolean {
  return a1 > a2 + EPSILON;
}

function viewString(views: [number,number][]): string {
  let line = [];
  for (let ii = 0; ii < views.length; ++ii) {
    let v = views[ii];
    line.push(`${(v[0]*180/PI).toFixed(0)}:${(v[1]*180/PI).toFixed(0)}`);
  }
  return line.join(' ');
}

let temp: Vec3 = vec3();
let todo: number[] = [];
let corner_angles = new Array(4);
function calcVisibility(
  game_state: CrawlerState,
  pos: Vec2,
  angle: number,
  map_update_this_frame: boolean,
  script_api: CrawlerScriptAPIClient
): void {
  let { level } = game_state;
  assert(level);
  let { w, h, cells } = level;

  if (pos[0] < 0 || pos[1] < 0 || pos[0] >= w || pos[1] >= h) {
    return;
  }

  let log: string[] | undefined;
  if (DEBUG_VIS) {
    log = [];
  }

  // Debug: flag all
  // for (let xx = 0; xx < w; ++xx) {
  //   for (let yy = 0; yy < h; ++yy) {
  //     cells[yy * w + xx].visible_frame = frame_idx;
  //   }
  // }

  let views: [number,number][] = [];
  // Maybe: angles should be stored as numerator / denominator for perfect precision? Except our position is floating?
  // Do everything relative to `angle`, so we have no wrapping around issues
  views.push([-engine.fov_x/2, engine.fov_x/2]);
  // algorithm:
  //   traverse cells, from nearest to farthest (BFS starting in our cell)
  //   for each cell
  //     if visible:
  //       check each wall, and clip each view against it
  //         reference: http://www.roguebasin.com/index.php?title=Precise_Permissive_Field_of_View
  //       add neighbors to BFS
  let pos_idx = floor(pos[0]) + floor(pos[1]) * w;
  todo.length = 0;
  todo.push(pos_idx);
  let done: Partial<Record<number, true>> = {};
  done[pos_idx] = true;

  let todo_idx = 0;
  while (todo_idx < todo.length && views.length) {
    let idx = todo[todo_idx++];
    if (DEBUG_VIS) {
      log!.push(`pre ${idx} ${viewString(views)}`);
    }
    let cell = cells[idx];
    //let cell_desc = getEffCell(script_api, cell);
    let amin = Infinity;
    let amax = -Infinity;
    for (let ii = 0; ii < 4; ++ii) {
      let p1 = cell.corner_pos[ii];
      v2sub(temp, p1, pos);
      let a = normAngle(atan2(temp[1], temp[0]) - angle);
      corner_angles[ii] = a;
      amin = min(amin, a);
      amax = max(amax, a);
    }

    let any_visible = false;
    if (DEBUG_VIS) {
      log!.push(`  corner_angles ${corner_angles.map((a) => (a*180/PI).toFixed(0)).join(' ')}`);
    }

    // Gather angles
    let last_blocked = false;
    let angles = [];
    for (let ii = 0 as DirType; ii < 4; ++ii) {
      let wall_desc = getEffWall(script_api, cell, ii).swapped; // needed?
      //let wall_desc = cell.walls[ii].swapped;
      let a1 = corner_angles[ii];
      let a2 = corner_angles[(ii+1)%4];
      // blocking from a1 to a2
      if (a2 <= a1 || a2 - a1 > PI || a2 < -FOV || a1 > FOV) {
        // Either behind us or looking at the back of this wall, ignore;
        //   can we know this without calculating the atan2()s?
        last_blocked = false;
        if (DEBUG_VIS) {
          log!.push(`  ${wall_desc.open_vis ? 'face' : 'wall'}` +
            ` ${(a1*180/PI).toFixed(0)}:${(a2*180/PI).toFixed(0)} ignore`);
        }
        continue;
      }
      let face_visible = false;
      for (let jj = 0; jj < views.length; ++jj) {
        let view = views[jj];
        if (lessStrict(a1, view[1]) && greaterStrict(a2, view[0])) {
          face_visible = true;
          break;
        }
      }
      if (!face_visible) {
        last_blocked = false;
        if (DEBUG_VIS) {
          log!.push(`  ${wall_desc.open_vis ? 'face' : 'wall'}` +
            ` ${(a1*180/PI).toFixed(0)}:${(a2*180/PI).toFixed(0)} no vis`);
        }
        continue;
      }
      any_visible = true;
      if (!wall_desc.open_vis) {
        if (DEBUG_VIS) {
          log!.push(`  wall ${(a1*180/PI).toFixed(0)}:${(a2*180/PI).toFixed(0)}`);
        }
        if (last_blocked) {
          // just add the angle
          angles[angles.length - 1][1] = a2;
        } else {
          last_blocked = true;
          angles.push([a1, a2]);
        }
      } else {
        last_blocked = false;
      }
    }
    if (!any_visible) {
      if (DEBUG_VIS) {
        log!.push('  not visible');
      }
      continue;
    }
    if (DEBUG_VIS && angles.length) {
      log!.push(`  angles ${angles.map((p) => p.map((a) => (a*180/PI).toFixed(0)).join(':')).join(' ')}`);
    }
    // Clip views
    for (let ii = views.length - 1; ii >= 0; --ii) {
      let view = views[ii];
      for (let jj = 0; jj < angles.length; ++jj) {
        let [a1, a2] = angles[jj];
        if (a2 < view[0]) {
          // below
        } else if (a1 > view[1]) {
          // above
        } else {
          // some overlap
          if (lessOrSame(a1, view[0])) {
            // at least shallow bump
            if (greaterOrSame(a2, view[1])) {
              // complete clipping
              ridx(views, ii);
            } else {
              // shallow bump
              view[0] = a2;
            }
          } else if (greaterOrSame(a2, view[1])) {
            // steep bump
            view[1] = a1;
          } else {
            // between
            views.push([a2, view[1]]);
            view[1] = a1;
          }
        }
      }
    }

    // mark visible and add neighbors
    cell.visible_frame = frame_idx;
    let x = idx % w;
    let y = (idx - x) / w;
    if (map_update_this_frame && !cell.visible_bits && v2distSq(pos, [x+0.5, y+0.5]) < VIS_RADIUS * VIS_RADIUS) {
      cell.visible_bits |= VIS_SEEN;
      level.seen_cells++;
    }
    for (let ii = 0 as DirType; ii < 4; ++ii) {
      let wall_desc = getEffWall(script_api, cell, ii).swapped; // needed?
      // let wall_desc = cell.walls[ii].swapped;
      if (!wall_desc.open_vis) {
        continue;
      }
      let xx = x + DX[ii];
      let yy = y + DY[ii];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) {
        continue;
      }
      let idx2 = yy * w + xx;
      if (!done[idx2]) {
        done[idx2] = true;
        cells[idx2].visible_adjacent_frame = frame_idx;
        todo.push(idx2);
      }
    }

    if (DEBUG_VIS) {
      log!.push(`post ${idx} ${viewString(views)}`);
    }
  }
  if (DEBUG_VIS) {
    ui.font.drawSizedWrapped(null, 0, 0, 1, 256, 0, ui.font_height, log!.join('\n'));
  }
}

let cam_pos = vec3();
let target_pos = vec3(0, 0, HDIM);
let game_view_pos = vec2();
let last_pos = vec3();
export function renderCamPos(): ROVec3 {
  return cam_pos;
}

let ignore_vis: boolean;
export type RenderPrepParam = {
  game_state: CrawlerState;
  cam_pos: Vec3;
  angle: number;
  pitch: number;
  ignore_vis: boolean;
  map_update_this_frame: boolean;
  script_api: CrawlerScriptAPIClient;
};
export function renderPrep(param: RenderPrepParam): void {
  const {
    game_state,
    cam_pos: cam_pos_in,
    angle,
    pitch,
    ignore_vis: ignore_vis_in,
    map_update_this_frame,
    script_api,
  } = param;
  let { level } = game_state;
  if (!level) {
    // still loading
    return;
  }
  ignore_vis = ignore_vis_in;

  // Fade LOD bias from -1 while moving to -4 while standing still
  let frame_dist = v3dist(last_pos, cam_pos_in);
  v3copy(last_pos, cam_pos_in);
  let frame_speed = frame_dist / engine.frame_dt;
  global_lod_bias[0] = lerp(min(frame_speed / 0.002 , 1), -4, -1);

  v3scale(cam_pos, cam_pos_in, DIM);
  v3copy(player_pos, cam_pos);

  let ca = cos(angle);
  let sa = sin(angle);
  cam_pos[0] += pos_offs[1] * HDIM * ca + pos_offs[0] * HDIM * sa;
  cam_pos[1] += pos_offs[1] * HDIM * sa - pos_offs[0] * HDIM * ca;
  let angle2 = angle + angle_offs;
  ca = cos(angle2);
  sa = sin(angle2);
  let cp = cos(pitch);
  let sp = sin(pitch);
  v3set(target_pos, cam_pos[0] + ca * cp, cam_pos[1] + sa * cp, cam_pos[2] + sp);
  dynGeomLookAt(cam_pos, target_pos, zaxis);

  frame_idx = engine.frame_index;
  // same positional transformation logic, applied in game space, from player, not camera (if different (freeCam))
  game_view_angle = game_state.angle;
  ca = cos(game_view_angle);
  sa = sin(game_view_angle);
  game_view_pos[0] = game_state.pos[0] + 0.5 + pos_offs[1] * 0.5 * ca + pos_offs[0] * 0.5 * sa;
  game_view_pos[1] = game_state.pos[1] + 0.5 + pos_offs[1] * 0.5 * sa - pos_offs[0] * 0.5 * ca;
  game_view_angle += angle_offs;

  calcVisibility(game_state, game_view_pos, game_view_angle, map_update_this_frame, script_api);
}

let cell_pos = vec2();
export function render(
  game_state: CrawlerState,
  script_api: CrawlerScriptAPIClient,
  split_set: SplitSet,
): void {
  let { level } = game_state;
  if (!level) {
    // still loading
    return;
  }

  let { w, h, cells, vstyle } = level;
  // for (let yy = -1; yy < 2; ++yy) {
  //   for (let xx = -1; xx < 2; ++xx) {
  //     v2set(cell_pos, floor(pos[0]) + xx, floor(pos[1]) + yy);
  //     drawCell(cells[cell_pos[1]*w + cell_pos[0]], cell_pos);
  //   }
  // }
  // gl.disable(gl.DEPTH_TEST);
  // gl.depthMask(false);
  for (let pass = 0; pass < render_passes.length; ++pass) {
    let pass_data = render_passes[pass];
    if (split_set === SPLIT_NEAR && !pass_data.need_split_near) {
      continue;
    }
    // if (pass === 2) {
    //   gl.enable(gl.DEPTH_TEST);
    //   gl.depthMask(true);
    // }
    for (let yy = 0; yy < h; ++yy) {
      for (let xx = 0; xx < w; ++xx) {
        v2set(cell_pos, xx, yy);
        drawCell(game_state, cells[cell_pos[1]*w + cell_pos[0]],
          cell_pos, pass_data, ignore_vis, vstyle, script_api, split_set);
      }
    }
    opaqueDraw();
    alphaDraw();
  }
}
