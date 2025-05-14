export enum OnlineMode {
  OFFLINE = 0,
  ONLINE_BUILD,
  ONLINE_ONLY,
}

import assert from 'assert';
import { autoAtlas } from 'glov/client/autoatlas';
import { cmd_parse } from 'glov/client/cmds';
import { getFrameIndex } from 'glov/client/engine';
import type { EntityBaseClient } from 'glov/client/entity_base_client';
import {
  clientEntityManagerCreate,
  ClientEntityManagerInterface,
} from 'glov/client/entity_manager_client';
import { offlineEntityManagerCreate } from 'glov/client/entity_manager_offline';
import {
  EntityPositionManager,
  entityPositionManagerCreate,
} from 'glov/client/entity_position_manager';
import { netSubs } from 'glov/client/net';
import { spineCreate } from 'glov/client/spine';
import { spriteAnimationCreate } from 'glov/client/sprite_animation';
import {
  Sprite,
  spriteCreate,
  SpriteParamBase,
  TextureOptions,
} from 'glov/client/sprites';
import type { UIBoxColored } from 'glov/client/ui';
import * as ui from 'glov/client/ui';
import { webFSAPI } from 'glov/client/webfs';
import { CmdRespFunc } from 'glov/common/cmd_parse';
import { dataError } from 'glov/common/data_error';
import {
  ActionMessageParam,
} from 'glov/common/entity_base_common';
import { TraitFactory, traitFactoryCreate } from 'glov/common/trait_factory';
import {
  DataObject,
  EntityID,
  NetErrorCallback,
} from 'glov/common/types';
import { plural } from 'glov/common/util';
import {
  ROVec2,
  ROVec3,
  ROVec4,
} from 'glov/common/vmath';
import {
  EntityCrawlerDataCommon,
  entSamePos,
} from '../common/crawler_entity_common';
import { crawlerEntityTraitsCommonStartup } from '../common/crawler_entity_traits_common';
import type { CrawlerState } from '../common/crawler_state';
import { atlasAlias } from './crawler_render';
import {
  drawableDraw,
  DrawableOpts,
  drawableSpineDraw2D,
  drawableSpineDrawSub,
  DrawableSpineOpts,
  DrawableSpineState,
  drawableSpriteDraw2D,
  drawableSpriteDrawSub,
  DrawableSpriteOpts,
  DrawableSpriteState,
  EntityDrawableSpine,
  EntityDrawableSprite,
  TextureOptionsAsStrings,
} from './crawler_render_entities';
import { statusPush } from './status';

const { random } = Math;

let online_mode: OnlineMode;

export type EntityDraw2DOpts = UIBoxColored;

export type EntityDrawOpts = {
  dt: number;
  game_state: CrawlerState;
  pos: ROVec3;
  zoffs: number;
  angle: number;
  color: ROVec4;
  use_near: boolean;
};

export type EntityOnDeleteSubParam = {
  reason: string;
  countdown_max: number; // inout
};

export type Floater = {
  start: number;
  msg: string;
};


export interface EntityCrawlerClient extends EntityBaseClient {
  data: EntityCrawlerDataCommon;
  type_id: string; // will be constant on the prototype

  delete_reason?: string;
  floaters?: Floater[];

  fade_out_at?: number;

  isEnemy(): boolean;
  draw2D(param: EntityDraw2DOpts): void;
  draw?: (param: EntityDrawOpts) => void;
  onDelete(reason: string): number;
  onDeleteSub?: (param: EntityOnDeleteSubParam) => void;
  triggerAnimation?: (anim: string) => void;

  // On prototype properties:
  do_split: boolean;
  is_player: boolean;
  is_enemy: boolean;
  blocks_player: boolean;
  build_hide?: boolean;
  map_icon?: string;
}

type Entity = EntityCrawlerClient;

let my_ent_id: EntityID;
let entity_manager_online: ClientEntityManagerInterface<Entity>;
let entity_manager_offline: ClientEntityManagerInterface<Entity>;
let entity_manager: ClientEntityManagerInterface<Entity>;
let entity_pos_manager_online: EntityPositionManager;
let entity_pos_manager_offline: EntityPositionManager;
let entity_pos_manager: EntityPositionManager;


export function crawlerEntClientDefaultDraw2D(this: EntityCrawlerClient, param: EntityDraw2DOpts): void {
  ui.font.draw({
    x: param.x, y: param.y, z: param.z,
    w: param.w, h: param.h,
    size: Math.min(param.w, param.h),
    align: ui.font.ALIGN.HCENTER,
    text: '?',
  });
}

export function crawlerEntClientDefaultOnDelete(this: EntityCrawlerClient, reason: string): number {
  let countdown_max = 250;
  this.delete_reason = reason;
  if (reason === 'killed') {
    this.data.stats.hp = 0;
  }
  if (reason === 'respawn') {
    countdown_max = 0;
  }

  if (this.onDeleteSub) {
    let param: EntityOnDeleteSubParam = {
      reason,
      countdown_max,
    };
    this.onDeleteSub(param);
    countdown_max = param.countdown_max;
  }

  return countdown_max;
}

export function crawlerEntityManager(): ClientEntityManagerInterface<Entity> {
  return entity_manager;
}

export function crawlerEntityManagerOffline(): ClientEntityManagerInterface<Entity> {
  return entity_manager_offline;
}

export function crawlerEntityManagerOnline(): ClientEntityManagerInterface<Entity> {
  return entity_manager_online;
}

export function entityPosManager(): EntityPositionManager {
  return entity_pos_manager;
}

// Always online (data saved online), or currently online due to build mode (data saved locally)
export function isOnline(): OnlineMode {
  return online_mode;
}

// Always online (data saved online)
export function isOnlineOnly(): boolean {
  return online_mode === OnlineMode.ONLINE_ONLY;
}

// Data saved locally (but, may currently be in online-mode if in build mode)
export function isLocal(): boolean {
  return !isOnlineOnly();
}

export function onlineMode(): OnlineMode {
  return online_mode;
}

export function myEntID(): EntityID {
  return my_ent_id;
}

export function crawlerMyEnt(): Entity {
  let ent = entity_manager.entities[my_ent_id];
  assert(ent);
  return ent;
}

export function crawlerMyEntOptional(): Entity | undefined {
  return entity_manager.entities[my_ent_id];
}

export function crawlerMyActionSend<T>(param: ActionMessageParam, resp_func?: NetErrorCallback<T>): void {
  crawlerMyEnt().actionSend(param, resp_func);
}

export function crawlerEntitiesAt(cem: ClientEntityManagerInterface<Entity>,
  pos: [number, number] | ROVec2,
  floor_id: number,
  skip_fading_out: boolean
): Entity[] {
  return cem.entitiesFind((ent) => entSamePos(ent, pos) && ent.data.floor === floor_id, skip_fading_out);
}

function onlyPlayerBlockers(ent: Entity): boolean {
  return ent.blocks_player;
}
export function entityBlocks(floor_id: number, pos: ROVec2, skip_fading_out: boolean): null | EntityID {
  // if (engine.DEBUG && keyDown(KEYS.ALT)) {
  //   return null;
  // }
  let ent_list = crawlerEntitiesAt(entity_manager, pos, floor_id, skip_fading_out);
  ent_list = ent_list.filter(onlyPlayerBlockers);
  if (!ent_list.length) {
    return null;
  }
  return ent_list[0].id;
}


export function crawlerEntitiesOnEntStart(): void {
  my_ent_id = entity_manager.getMyEntID();
  assert.equal(typeof my_ent_id, 'number');
}

function lookupGLDefine(id: string | number | undefined): number | undefined {
  if (id === undefined) {
    return undefined;
  }
  assert(typeof id === 'string');
  let ret = (gl as unknown as DataObject)[id];
  if (typeof ret !== 'number') {
    dataError(`Unknown OpenGL define "${id}"`);
    return undefined;
  }
  return ret;
}

type SpriteSpecSprite = SpriteParamBase & { name: string };
type SpriteSpecAutoAtlas = {
  origin: ROVec2;
  atlas: string;
};
type SpriteSpec = SpriteSpecSprite | SpriteSpecAutoAtlas;

function isAutoAtlasSpec(
  sprite_data: TextureOptions & SpriteSpec
): sprite_data is TextureOptions & SpriteSpecAutoAtlas {
  return Boolean((sprite_data as SpriteSpecAutoAtlas).atlas);
}

let load_near_sprites = true;
export function drawableSpriteLoadNear(load_near: boolean): void {
  load_near_sprites = load_near;
}

function drawableSpriteUpdateAnim(this: EntityDrawableSprite, dt: number): number {
  let ent = this;
  let { anim } = ent.drawable_sprite_state;
  let do_update = ent.drawable_sprite_state.anim_update_frame !== getFrameIndex();
  if (do_update) {
    let last_frame = anim.getFrame();
    anim.update(dt);
    if (last_frame === anim.getFrame()) {
      do_update = false;
    }
    ent.drawable_sprite_state.anim_update_frame = getFrameIndex();
  }
  let frame = anim.getFrame();

  let opts = ent.drawable_sprite_opts;
  let sprite_data = opts.sprite_data as TextureOptions & SpriteSpec;
  if (isAutoAtlasSpec(sprite_data)) {
    assert(typeof frame === 'string');
    if (do_update || !ent.drawable_sprite_state.sprite) {
      let atlas_name = atlasAlias(sprite_data.atlas);
      let base_sprite = autoAtlas(atlas_name, frame).withOrigin(sprite_data.origin!);

      let sprite = load_near_sprites ? base_sprite.withSamplerState(sprite_data) : base_sprite; // DCJAM: maybe hack?
      ent.drawable_sprite_state.sprite = sprite;

      let sprite_near: Sprite | undefined;
      if (sprite_data.filter_min !== gl.NEAREST && load_near_sprites) {
        sprite_near = sprite.withSamplerState({
          ...sprite_data,
          filter_min: gl.NEAREST,
          filter_mag: gl.NEAREST,
        });
        ent.drawable_sprite_state.sprite_near = sprite_near;
      }
      if (opts.hybrid) {
        assert(sprite_near);
        let sprite_hybrid = spriteCreate({
          ...opts.sprite_data,
          texs: [],
        });
        let doInit = (): void => {
          sprite_hybrid.texs = [sprite.texs[0], sprite_near.texs[0]];
          sprite_hybrid.uvs = sprite.uvs;
          sprite_hybrid.uidata = sprite.uidata;
          sprite_hybrid.doReInit(); // Allow chaining
        };
        sprite.onReInit(doInit);
        sprite_near.onReInit(doInit);
        doInit();

        ent.drawable_sprite_state.sprite_hybrid = sprite_hybrid;
      }

    }
    frame = 0;
  }

  assert(typeof frame === 'number');
  return frame;
}


function lookupGLDefines(
  sprite_data: (TextureOptions | TextureOptionsAsStrings) & SpriteSpec
): asserts sprite_data is TextureOptions & SpriteSpec {
  sprite_data.filter_min = lookupGLDefine(sprite_data.filter_min);
  sprite_data.filter_mag = lookupGLDefine(sprite_data.filter_mag);
  sprite_data.wrap_s = lookupGLDefine(sprite_data.wrap_s);
  sprite_data.wrap_t = lookupGLDefine(sprite_data.wrap_t);
}

function crawlerTraitsInit(ent_factory: TraitFactory<Entity, DataObject>): void {
  crawlerEntityTraitsCommonStartup(ent_factory);
  ent_factory.registerTrait<DrawableOpts>('drawable', {
    methods: {
      draw: drawableDraw,
    },
    default_opts: {
      lod_bias: [-4, 0],
      biasL: [-0.2, 0.25],
      biasF: [-0.25, 0],
      biasR: [-0.3, 0.4],
      biasIn: [0, 0.3, 0.25],
    },
  });

  ent_factory.registerTrait<DrawableSpriteOpts, DrawableSpriteState>('drawable_sprite', {
    methods: {
      updateAnim: drawableSpriteUpdateAnim,
      draw2D: drawableSpriteDraw2D,
      drawSub: drawableSpriteDrawSub,
      onDeleteSub: function (this: EntityDrawableSprite, param: EntityOnDeleteSubParam): void {
        let anim = this.drawable_sprite_state.anim;
        let { reason } = param;
        if (reason === 'killed') {
          anim.setState('death');
          param.countdown_max = 1000;
        } else if (reason === 'pit') {
          anim.setState('pit');
        } else if (reason === 'pickup') {
          anim.setState('pickup');
        }
      },
      triggerAnimation: function (this: EntityDrawableSprite, anim: string): void {
        this.drawable_sprite_state.anim.setState(anim);
      },
    },
    default_opts: {
      anim_data: {
        idle: {
          frames: [0],
          times: 1000,
        },
      },
      hybrid: false,
      sprite_data: {
        name: 'required',
        ws: [1],
        hs: [1],
        filter_min: 'LINEAR_MIPMAP_LINEAR',
        filter_mag: 'LINEAR',
        origin: [0.5, 1],
      },
      scale: 0.75,
      sprite: null!,
    },
    init_prototype: function (opts: DrawableSpriteOpts) {
      lookupGLDefines(opts.sprite_data);

      if (isAutoAtlasSpec(opts.sprite_data)) {
        // filled in in drawableSpriteUpdateAnim
      } else {
        opts.sprite = spriteCreate(opts.sprite_data);
        if (opts.sprite_data.filter_min !== gl.NEAREST) {
          opts.sprite_near = spriteCreate({
            ...opts.sprite_data,
            filter_min: gl.NEAREST,
            filter_mag: gl.NEAREST,
          });
        }
        if (opts.hybrid) {
          assert(opts.sprite_near);
          opts.sprite_hybrid = spriteCreate({
            ...opts.sprite_data,
            texs: [opts.sprite.texs[0], opts.sprite_near.texs[0]],
          });
        }
      }
    },
    alloc_state: function (opts: DrawableSpriteOpts, ent: Entity) {
      let anim = spriteAnimationCreate(opts.anim_data);
      anim.setState(ent.data.state || 'idle');
      let ret: DrawableSpriteState = {
        anim,
        anim_update_frame: 0,
        sprite: opts.sprite,
        sprite_near: opts.sprite_near,
        sprite_hybrid: opts.sprite_hybrid,
        anim_offs: random() * 120000,
      };
      return ret;
    },
  });

  ent_factory.registerTrait<DrawableSpineOpts, DrawableSpineState>('drawable_spine', {
    methods: {
      draw2D: drawableSpineDraw2D,
      drawSub: drawableSpineDrawSub,
      onDeleteSub: function (this: EntityDrawableSpine, param: EntityOnDeleteSubParam): void {
        let { reason } = param;
        if (reason === 'killed') {
          this.drawable_spine_state.spine.setAnimation(0, 'death');
          param.countdown_max = 1000;
        } else if (reason === 'pit') {
          // not implemented: this.spine.setAnimation(0, 'pit');
        } else if (reason === 'pickup') {
          // not implemented: this.spine.setAnimation(0, 'pickup');
        }
      },
      triggerAnimation: function (this: EntityDrawableSpine, anim: string): void {
        this.drawable_spine_state.spine.setAnimation(1, anim);
      },
    },
    default_opts: {
      spine_data: {
        skel: 'required',
        atlas: 'required',
        mix: {},
        anim: 'idle',
      },
      scale: 0.0015,
      offs: [0, 0],
    },
    alloc_state: function (opts: DrawableSpineOpts, ent: Entity) {
      let spine = spineCreate(opts.spine_data);
      spine.setAnimation(0, ent.data.state || 'idle');
      let ret: DrawableSpineState = {
        spine,
        anim_update_frame: 0,
      };
      return ret;
    },
  });
}

export type SpawnDesc = {
  id: string;
  example_ent: EntityCrawlerClient;
};
export type SpawnDescs = Partial<Record<string, SpawnDesc>>;
let spawn_descs: SpawnDescs;
export function crawlerGetSpawnDescs(): SpawnDescs {
  return spawn_descs;
}

let ent_factory: TraitFactory<Entity, DataObject>;

export function crawlerEntFactory<T extends Entity=Entity>(): TraitFactory<T, DataObject> {
  return ent_factory as TraitFactory<T, DataObject>;
}

const example_ent_data = { pos: [0, 0, 0] };

function onEntDefReload(type_id: string): void {
  let reloaded = entity_manager ? entity_manager.entitiesReload((ent: Entity) => {
    return ent.type_id === type_id;
  }) : [];
  spawn_descs[type_id] = {
    id: type_id,
    example_ent: ent_factory.allocate(type_id, example_ent_data),
  };
  if (reloaded.length) {
    statusPush(`Reloaded ${reloaded.length} "${type_id}" ${plural(reloaded.length, 'ent')}`);
  }
}

function entCreate(data: DataObject): Entity {
  let type_id = data.type;
  assert(typeof type_id === 'string');
  return ent_factory.allocate(type_id, data);
}

export function crawlerEntitiesInit(mode: OnlineMode): void {
  online_mode = mode;
  if (mode) {
    entity_manager = entity_manager_online;
    entity_pos_manager = entity_pos_manager_online;
  } else {
    entity_manager = entity_manager_offline;
    entity_pos_manager = entity_pos_manager_offline;
  }
  my_ent_id = entity_manager.getMyEntID();
}

cmd_parse.register({
  cmd: 'entset',
  help: '(Debug) Set entity field on self',
  func: function (param: string, resp_func: CmdRespFunc) {
    let ent = crawlerMyEnt();
    if (!ent) {
      return resp_func('Missing entity');
    }
    let idx = param.indexOf(' ');
    if (idx === -1) {
      return resp_func('Expected syntax: /entset field JsonValue');
    }
    let field = param.slice(0, idx);
    let value_str = param.slice(idx + 1);
    let value;
    try {
      if (value_str === 'undefined') {
        value = null;
      } else {
        value = JSON.parse(value_str);
      }
    } catch (e) {
      return resp_func('Expected syntax: /entset field JsonValue');
    }

    let data_assignments: DataObject = {};
    data_assignments[field] = value;

    ent.actionSend({
      action_id: 'set_debug',
      data_assignments,
    }, resp_func);
  }
});
cmd_parse.register({
  cmd: 'entget',
  help: '(Debug) Get entity field from self',
  func: function (param: string, resp_func: CmdRespFunc) {
    let ent = crawlerMyEnt();
    if (!ent) {
      return resp_func('Missing entity');
    }
    let field = param;
    resp_func(null, `"${field}" = ${JSON.stringify(field ? ent.getData(field) : ent.data)}`);
  }
});

export function crawlerEntityClientStartupEarly(): void {
  ent_factory = traitFactoryCreate<Entity, DataObject>();
  crawlerTraitsInit(ent_factory);
}


export function crawlerEntityTraitsClientStartup<TBaseClass extends EntityCrawlerClient>(param: {
  name?: string;
  Ctor: Constructor<TBaseClass>;
  channel_type?: string;
}): void {
  assert(ent_factory);

  ent_factory.initialize({
    name: param.name || 'EntityCrawlerClient',
    fs: webFSAPI(),
    directory: 'entities',
    ext: '.entdef',
    Ctor: param.Ctor,
    reload_cb: onEntDefReload,
  });

  spawn_descs = {};
  ent_factory.getTypes().forEach((type_id) => {
    spawn_descs[type_id] = {
      id: type_id,
      example_ent: ent_factory.allocate(type_id, example_ent_data),
    };
  });

  if (netSubs()) {
    entity_manager_online = clientEntityManagerCreate({
      channel_type: param.channel_type || 'crawl',
      create_func: entCreate,
    });
    entity_pos_manager_online = entityPositionManagerCreate({
      entity_manager: entity_manager_online,
      dim_pos: 2, dim_rot: 1,
      // speed: 1/WALK_TIME,
    });
  }
  entity_manager_offline = offlineEntityManagerCreate({
    create_func: entCreate,
  });
  entity_pos_manager_offline = entityPositionManagerCreate({
    entity_manager: entity_manager_offline,
    dim_pos: 2, dim_rot: 1,
    // speed: 1/WALK_TIME,
  });
}
