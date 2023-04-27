export enum OnlineMode {
  OFFLINE = 0,
  ONLINE_BUILD,
  ONLINE_ONLY,
}

import assert from 'assert';
import { cmd_parse } from 'glov/client/cmds';
import {
  ClientEntityManagerInterface,
  clientEntityManagerCreate,
} from 'glov/client/entity_manager_client';
import { offlineEntityManagerCreate } from 'glov/client/entity_manager_offline';
import {
  EntityPositionManager,
  entityPositionManagerCreate,
} from 'glov/client/entity_position_manager';
import { netSubs } from 'glov/client/net';
import { spineCreate } from 'glov/client/spine';
import { spriteAnimationCreate } from 'glov/client/sprite_animation';
import { spriteCreate } from 'glov/client/sprites';
import * as ui from 'glov/client/ui';
import { webFSAPI } from 'glov/client/webfs';
import { dataError } from 'glov/common/data_error';
import {
  ActionMessageParam,
} from 'glov/common/entity_base_common';
import { TraitFactory, traitFactoryCreate } from 'glov/common/trait_factory';
import {
  CmdRespFunc,
  DataObject,
  EntityID,
  NetErrorCallback,
} from 'glov/common/types';
import { plural } from 'glov/common/util';
import {
  ROVec2,
  ROVec4,
} from 'glov/common/vmath';
import {
  EntityCrawlerDataCommon,
  entSamePos,
} from '../common/crawler_entity_common';
import { crawlerEntityTraitsCommonStartup } from '../common/crawler_entity_traits_common';
import {
  DrawableOpts,
  DrawableSpineOpts,
  DrawableSpineState,
  DrawableSpriteOpts,
  DrawableSpriteState,
  EntityDrawableSpine,
  EntityDrawableSprite,
  drawableDraw,
  drawableSpineDraw2D,
  drawableSpineDrawSub,
  drawableSpriteDraw2D,
  drawableSpriteDrawSub,
} from './crawler_render_entities';
import { statusPush } from './status';

import type { CrawlerState } from '../common/crawler_state';
import type { EntityBaseClient } from 'glov/client/entity_base_client';
import type { UIBoxColored } from 'glov/client/ui';

let online_mode: OnlineMode;

export type EntityDraw2DOpts = UIBoxColored;

export type EntityDrawOpts = {
  dt: number;
  game_state: CrawlerState;
  pos: ROVec2;
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
  skip_fading_out:boolean
): Entity[] {
  return cem.entitiesFind((ent) => entSamePos(ent, pos) && ent.data.floor === floor_id, skip_fading_out);
}

function onlyEnemies(ent: Entity): boolean {
  // TODO: Property assigned by trait "blocks_player"
  return ent.isEnemy();
}
export function entityBlocks(floor_id: number, pos: ROVec2, skip_fading_out: boolean): null | EntityID {
  // if (engine.DEBUG && keyDown(KEYS.ALT)) {
  //   return null;
  // }
  let ent_list = crawlerEntitiesAt(entity_manager, pos, floor_id, skip_fading_out);
  ent_list = ent_list.filter(onlyEnemies);
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
      opts.sprite_data.filter_min = lookupGLDefine(opts.sprite_data.filter_min);
      opts.sprite_data.filter_mag = lookupGLDefine(opts.sprite_data.filter_mag);
      opts.sprite_data.wrap_s = lookupGLDefine(opts.sprite_data.wrap_s);
      opts.sprite_data.wrap_t = lookupGLDefine(opts.sprite_data.wrap_t);
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
    },
    alloc_state: function (opts: DrawableSpriteOpts, ent: Entity) {
      let anim = spriteAnimationCreate(opts.anim_data);
      anim.setState(ent.data.state || 'idle');
      let ret: DrawableSpriteState = {
        anim,
        anim_update_frame: 0,
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
