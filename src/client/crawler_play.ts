/* eslint comma-spacing:error */

import assert from 'assert';
import * as camera2d from 'glov/client/camera2d';
import { ChatUIRunParam } from 'glov/client/chat_ui';
import { cmd_parse } from 'glov/client/cmds';
import { dynGeomForward, dynGeomUp } from 'glov/client/dyn_geom';
import {
  applyCopy,
  applyPixelyExpand,
  effectsIsFinal,
  effectsPassAdd,
  effectsPassConsume,
  registerShader,
} from 'glov/client/effects';
import {
  getFrameIndex,
} from 'glov/client/engine';
import * as engine from 'glov/client/engine';
import { ClientEntityManagerInterface } from 'glov/client/entity_manager_client';
import { fetch } from 'glov/client/fetch';
import { framebufferEnd, framebufferStart } from 'glov/client/framebuffer';
import { glDepthTest, glScissorTest } from 'glov/client/glstate';
import {
  localStorageGetJSON,
  localStorageSet,
  localStorageSetJSON,
} from 'glov/client/local_storage';
import { ClientChannelWorker } from 'glov/client/net';
import { profilerSupressPad } from 'glov/client/profiler_ui';
import * as settings from 'glov/client/settings';
import {
  settingsRegister,
  settingsSet,
} from 'glov/client/settings';
import { sound3DListener } from 'glov/client/sound';
import { spotSuppressPad } from 'glov/client/spot';
import {
  Sprite,
  spriteCreate,
} from 'glov/client/sprites';
import {
  textureLoad,
  textureSupportsDepth,
  textureWhite,
} from 'glov/client/textures';
import * as ui from 'glov/client/ui';
import { isMenuUp } from 'glov/client/ui';
import * as urlhash from 'glov/client/urlhash';
import { getURLBase } from 'glov/client/urlhash';
import type { CmdRespFunc } from 'glov/common/cmd_parse';
import type { EntityManagerEvent } from 'glov/common/entity_base_common';
import {
  DataObject,
  ErrorCallback,
  Rec,
  TSMap,
  VoidFunc,
} from 'glov/common/types';
import {
  callEach,
  clone,
  mod,
} from 'glov/common/util';
import {
  ROVec2,
  v3copy,
  v3lerp,
  v4copy,
  Vec2,
  Vec4,
  vec4,
  zero_vec,
} from 'glov/common/vmath';
import { CRAWLER_IS_ONLINE } from '../common/crawler_config';
import { EntityCrawlerDataCommon } from '../common/crawler_entity_common';
import '../common/crawler_events'; // side effects: register events
import {
  CrawlerLevel,
  CrawlerLevelSerialized,
  CrawlerState,
  crawlerVstyle,
  createCrawlerState,
  DX,
  DY,
  JSVec3,
} from '../common/crawler_state';
import { LevelGenerator, levelGeneratorCreate } from '../common/level_generator';
import { entitiesAdjacentTo } from './ai';
import { billboardBiasPrep } from './crawler_billboard_bias';
import {
  buildModeActive,
  buildModeOverlayActive,
  buildModeSetActive,
} from './crawler_build_mode';
import {
  crawlerCommReturnToTitle,
  crawlerCommStart,
  crawlerCommStartBuildComm,
  crawlerCommWant,
  getChatUI,
} from './crawler_comm';
import {
  CrawlerController,
  crawlerControllerCreate,
  crawlerControllerStartup,
} from './crawler_controller';
import {
  crawlerEntitiesInit,
  crawlerEntitiesOnEntStart,
  crawlerEntityManager,
  crawlerEntityManagerOffline,
  crawlerEntityManagerOnline,
  crawlerMyActionSend,
  crawlerMyEnt,
  EntityCrawlerClient,
  entityPosManager,
  INDEX_FLOOR,
  isLocal,
  isOnline,
  isOnlineOnly,
  OnlineMode,
  onlineMode,
} from './crawler_entity_client';
import { mapViewActive } from './crawler_map_view';
import {
  crawlerCalc3DViewport,
  crawlerRenderDoSplit,
  crawlerRenderIgnoreVis,
  crawlerRenderViewportGet,
  crawlerSetFogColor,
  crawlerSetFogParams,
  FOV,
  render,
  renderPrep,
  RenderPrepParam,
  SPLIT_ALL,
  SPLIT_FAR,
  SPLIT_NEAR,
} from './crawler_render';
import {
  crawlerRenderEntities,
  crawlerRenderEntitiesPrep,
} from './crawler_render_entities';
import {
  CrawlerScriptAPIClient,
  crawlerScriptAPIClientCreate,
} from './crawler_script_api_client';
import { dialogReset } from './dialog_system';

const { PI, max, floor, round } = Math;

type Entity = EntityCrawlerClient;

declare module 'glov/client/settings' {
  export let filter: 0 | 1 | 2;
  export let pixely: 0 | 1 | 2 | 3;
  export let entity_split: 0 | 1;
  export let entity_nosplit_use_near: 0 | 1;
  export let hybrid: 0 | 1;
  export let hybrid_base: number;
  export let hybrid_scalar: number;
  export let time_scale: number;
  export let use_fbos: 0 | 1;
}

export type TurnBasedStepReason = 'move' | 'attack' | 'wait' | 'realtime'; // app could define/want others...

let supports_frag_depth = false;
let viewport_sprite: Sprite;

let script_api: CrawlerScriptAPIClient;
export function crawlerScriptAPI(): CrawlerScriptAPIClient {
  return script_api;
}

let game_state: CrawlerState;
export function crawlerGameState(): CrawlerState {
  return game_state;
}

let crawl_room: ClientChannelWorker | null = null;
export function crawlerRoom(): ClientChannelWorker {
  assert(crawl_room);
  return crawl_room;
}
export function crawlerRoomID(): string {
  assert(crawl_room);
  return crawl_room.getChannelID();
}

let controller: CrawlerController;
export function crawlerController(): CrawlerController {
  return controller;
}

export type EngineState = (dt: number) => void;
let play_state: EngineState;
let on_broadcast: ((data: EntityManagerEvent) => void) | undefined;
let play_init_online: ((room: ClientChannelWorker) => void) | undefined;
let play_init_offline: (() => void) | undefined;

let setting_pixely: 0 | 1 | 2 | 3;

let on_pixely_change: ((pixely: number) => void)[] = [];
export function crawlerOnPixelyChange(fn: (pixely: number) => void): void {
  on_pixely_change.push(fn);
}
let on_filter_change: ((filter: number) => void)[] = [];
export function crawlerOnFilterChange(fn: (filter: number) => void): void {
  on_filter_change.push(fn);
}
let past_startup = false;
settingsRegister({
  filter: {
    default_value: 0, // 1 for spire, 0 for demo
    type: cmd_parse.TYPE_INT,
    // mag/min
    // 0 = nearest/nearest (nomip)
    // 1 = linear/mipmaplinear (and aniso)
    // 2 = nearest/mipmaplinear (doesn't get aniso) - not great, prefer moraff method?
    range: [0, 2],
    on_change: function () {
      if (!past_startup) {
        return;
      }
      callEach(on_filter_change, null, settings.filter);
    },
  },
  pixely: {
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0, 3],
    on_change: function () {
      if (!past_startup) {
        return;
      }
      setTimeout(() => {
        setting_pixely = settings.pixely;
        engine.setPixelyStrict(setting_pixely === 2);
        engine.setViewportPostprocess(setting_pixely >= 2);
        callEach(on_pixely_change, null, setting_pixely);
      }, 1);
    },
  },
  entity_split: { // only with pixely=1
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0, 1],
  },
  entity_nosplit_use_near: { // always should be 1, just remove?
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0, 1],
  },
  hybrid: {
    default_value: 0,
    type: cmd_parse.TYPE_INT,
    range: [0, 1],
  },
  hybrid_base: {
    default_value: 0.75,
    type: cmd_parse.TYPE_FLOAT,
    range: [-1, 2],
  },
  hybrid_scalar: {
    default_value: 0.125,
    type: cmd_parse.TYPE_FLOAT,
    range: [0, 1],
  },
  time_scale: {
    default_value: 1,
    type: cmd_parse.TYPE_FLOAT,
    range: [0.001, 100],
  },
});

let last_scaled_frame = -1;
let last_scaled_time: number;
let scaled_remainder = 0;
export function getScaledFrameDt(): number {
  if (settings.time_scale === 1 || engine.frame_timestamp < 2500) {
    return engine.frame_dt;
  }
  if (last_scaled_frame === engine.frame_index) {
    return last_scaled_time;
  }
  let dt = engine.frame_dt + scaled_remainder;
  let dt_scaled = floor(dt * settings.time_scale);
  scaled_remainder = dt - dt_scaled / settings.time_scale;
  last_scaled_frame = engine.frame_index;
  last_scaled_time = dt_scaled;
  return last_scaled_time;
}

type PackInfo = {
  fields: string[];
};

export type SavedGameData = {
  entities?: DataObject[]; // deprecated, old format
  ents_by_floor?: Rec<number, (DataObject | unknown[])[]>;
  pack_info?: PackInfo;
  floors_inited?: Partial<Record<number, true>>;
  vis_data?: Partial<Record<number, string>>;
  script_data?: DataObject;
  time_played?: number;
  timestamp: number;
};
let play_time_since_save = 0;
let local_game_data: SavedGameData = { timestamp: Date.now() };

function unpackSavedEnt(floor_id: number, pack_info: PackInfo | undefined, ent: DataObject | unknown[]): DataObject {
  let ret = ent as DataObject;
  if (Array.isArray(ent)) {
    assert(pack_info);
    // unpack
    let stats: DataObject = {};
    ret = {
      stats,
    };
    for (let ii = 0; ii < ent.length; ++ii) {
      let v = ent[ii];
      if (v !== null) {
        let key = pack_info.fields[ii];
        if (key.startsWith('s:')) {
          stats[key.slice(2)] = v;
        } else {
          ret[key] = v;
        }
      }
    }
  }
  ret.floor = floor_id;
  if ((ret.pos as number[]).length < 3) {
    (ret.pos as number[]).push(0);
  }
  return ret;
}

function packEntForSaving(
  pack_info: PackInfo | undefined,
  packed_fields: TSMap<true>,
  ent_raw: DataObject,
  ent_fields: string[] | null
): DataObject | unknown[] {
  let can_pack = ent_fields !== null;
  if (ent_fields) {
    for (let ii = 0; ii < ent_fields.length; ++ii) {
      if (!packed_fields[ent_fields[ii]]) {
        can_pack = false;
        break;
      }
    }
  }
  let data2 = ent_raw as unknown as EntityCrawlerDataCommon;
  if (!data2.pos[2]) {
    ent_raw.pos = [
      data2.pos[0],
      data2.pos[1],
    ] as unknown as JSVec3;
  }
  delete ent_raw.floor;
  if (!can_pack) {
    return ent_raw;
  }
  assert(pack_info);
  let ret: unknown[] = [];
  let stats = ent_raw.stats as DataObject;
  for (let ii = 0; ii < pack_info.fields.length; ++ii) {
    let field = pack_info.fields[ii];
    let v = ent_raw[field];
    if (field.startsWith('s:')) {
      v = stats[field.slice(2)];
    }
    if (v !== undefined) {
      while (ret.length < ii) {
        ret.push(null);
      }
      ret[ii] = v;
    }
  }
  return ret;
}

export function myEntFromSavedData(data: SavedGameData): DataObject | null {
  if (data.entities) {
    for (let ii = 0; ii < data.entities.length; ++ii) {
      let ent = data.entities[ii];
      if (ent.type === 'player') {
        return ent;
      }
    }
  }
  if (data.ents_by_floor) {
    for (let floor_id_str in data.ents_by_floor) {
      let floor_id = Number(floor_id_str);
      let arr = data.ents_by_floor[floor_id]!;
      for (let jj = 0; jj < arr.length; ++jj) {
        let ent = arr[jj];
        if (!Array.isArray(ent) && ent.type === 'player') {
          return unpackSavedEnt(floor_id, data.pack_info, ent);
        }
      }
    }
  }
  return null;
}

export function crawlerCurSavePlayTime(): number {
  return (local_game_data.time_played || 0) + play_time_since_save;
}

export function crawlerSavePlayTime(mode: 'manual' | 'auto'): void {
  let slot = urlhash.get('slot') || '1';
  let save_data = localStorageGetJSON<SavedGameData>(`savedgame_${slot}.${mode}`, { timestamp: 0 });
  if (save_data.timestamp) {
    let local_time = crawlerCurSavePlayTime();
    if (!save_data.time_played || local_time > save_data.time_played) {
      save_data.time_played = local_time;
      localStorageSetJSON<SavedGameData>(`savedgame_${slot}.${mode}`, save_data);
    }
  }
}


let last_saved_vis_string: Partial<Record<number, string>>;
let vis_string_save_in_progress = 0;
let vis_string_last_save_time = 0;
let vis_string_loading = 0;
const VIS_SAVE_TIME = 10000;
function crawlerFlushVisData(force: boolean): void {
  if (vis_string_loading) {
    return;
  }
  if ((vis_string_save_in_progress || engine.frame_timestamp - vis_string_last_save_time < VIS_SAVE_TIME) && !force) {
    return;
  }
  assert(game_state.level);
  let str = game_state.level.getVisString();


  if (str !== last_saved_vis_string[game_state.floor_id]) {
    last_saved_vis_string[game_state.floor_id] = str;
    if (isLocal()) {
      local_game_data.vis_data = local_game_data.vis_data || {};
      local_game_data.vis_data[game_state.floor_id] = str;
      return;
    }
    ++vis_string_save_in_progress;
    vis_string_last_save_time = engine.frame_timestamp;
    crawlerMyActionSend({
      action_id: 'set_vis_data',
      payload: {
        floor: game_state.floor_id,
        data: str,
      },
    }, function () {
      localStorageSet('last_vis_data', undefined);
      --vis_string_save_in_progress;
    });
  }
}

urlhash.register({
  key: 'slot',
  push: true,
});

function entToFields(data: DataObject, field_counts: TSMap<number>): string[] {
  let ret: string[] = [];
  function push(key: string): void {
    if (key === 'floor') {
      return;
    }
    ret.push(key);
    field_counts[key] = (field_counts[key] || 0) + 1;
  }
  for (let key in data) {
    let v = data[key];
    if (v !== undefined) {
      if (key === 'stats') {
        let stats = v as DataObject;
        for (let statskey in stats) {
          let sv = stats[statskey];
          if (sv !== undefined) {
            push(`s:${statskey}`);
          }
        }
      } else {
        push(key);
      }
    }
  }
  return ret;
}

export function crawlerSaveGameGetData(): SavedGameData {
  crawlerFlushVisData(true);
  let { entities } = crawlerEntityManager();
  let ents_by_floor: Rec<number, (DataObject | unknown[])[]> = {};
  let ent_list: {
    fields: string[] | null;
    ent: DataObject;
  }[] = [];
  let field_counts: TSMap<number> = {};
  for (let ent_id_str in entities) {
    let ent = entities[ent_id_str]!;
    if (!ent.fading_out) {
      let data = ent.serialize(); // must make a copy of at least the root fields, we delete/modify this
      ent_list.push({
        fields: data.type === 'player' ? null : entToFields(data, field_counts),
        ent: data,
      });
    }
  }

  let packed_fields: TSMap<true> = {};
  let pack_info: PackInfo | undefined;
  if (ent_list.length > 10) {
    // pack all fields used by 80% of ents
    let threshold = ent_list.length * 0.8;
    for (let key in field_counts) {
      if (field_counts[key]! >= threshold) {
        packed_fields[key] = true;
      }
    }
    pack_info = {
      fields: Object.keys(packed_fields),
    };
    pack_info.fields.sort(function (a, b) {
      return field_counts[b]! - field_counts[a]!;
    });
  }

  for (let ii = 0; ii < ent_list.length; ++ii) {
    let rec = ent_list[ii];
    let data2 = rec.ent as unknown as EntityCrawlerDataCommon;
    let floor_id = data2.floor;
    let packed = packEntForSaving(pack_info, packed_fields, rec.ent, rec.fields);
    let arr = ents_by_floor[floor_id];
    if (!arr) {
      arr = ents_by_floor[floor_id] = [];
    }
    arr.push(packed);
  }
  delete local_game_data.entities; // prune old format
  local_game_data.ents_by_floor = ents_by_floor;
  local_game_data.script_data = script_api.localDataGet();
  local_game_data.pack_info = pack_info;
  let now = Date.now();
  if (local_game_data.timestamp) {
    local_game_data.time_played = crawlerCurSavePlayTime();
  }
  play_time_since_save = 0;
  local_game_data.timestamp = now;
  return local_game_data;
}

export function crawlerSaveGame(mode: 'auto' | 'manual'): void {
  let slot = urlhash.get('slot') || '1';
  let data = crawlerSaveGameGetData();
  localStorageSetJSON<SavedGameData>(`savedgame_${slot}.${mode}`, data);
}

export function crawlerLevelHasBeenReset(floor_id: number): void {
  delete last_saved_vis_string[floor_id];
}

type LocalVisData = {
  floor: number;
  room: string;
  data: string;
};
export function crawlerInitVisData(floor_id: number): void {
  let level = game_state.levels[floor_id];
  assert(level);

  if (last_saved_vis_string[floor_id]) {
    // already have it, we're good
    // Assume it's already applied to the level too?
    return;
  }
  if (isLocal()) {
    let data = local_game_data.vis_data?.[floor_id];
    if (data) {
      last_saved_vis_string[floor_id] = data;
      level.applyVisString(data, script_api);
    } else {
      last_saved_vis_string[floor_id] = '';
    }
    return;
  }
  ++vis_string_loading;
  crawlerMyActionSend({
    action_id: 'get_vis_data',
    payload: { floor: floor_id },
  }, function (err: string | null, data: string | undefined) {
    --vis_string_loading;
    if (!err || data) {
      assert(typeof data === 'string');
      last_saved_vis_string[floor_id] = data;
      level.applyVisString(data, script_api);
    }
    let prev = localStorageGetJSON<LocalVisData>('last_vis_data');
    if (prev && prev.floor === floor_id && prev.room === crawlerRoomID()) {
      level.applyVisString(prev.data, script_api);
    }
  });
}

cmd_parse.register({
  cmd: 'floor',
  access_show: CRAWLER_IS_ONLINE ? ['sysadmin'] : undefined,
  help: 'Display or change floor',
  func: function (str: string, resp_func: CmdRespFunc) {
    let floor_id = Number(str);
    if (!str || floor_id === game_state.floor_id || !isFinite(floor_id)) {
      resp_func(null, `Floor = ${game_state.floor_id}`);
    } else {
      if (controller.transitioning_floor) {
        return resp_func('Already mid-transit');
      }
      controller.goToFloor(floor_id, floor_id < game_state.floor_id! ? 'stairs_out' : 'stairs_in');
      resp_func(null, `Going to floor ${floor_id}`);
    }
  },
});

cmd_parse.register({
  cmd: 'reset_vis_data',
  help: 'Reset visibility data for the current floor',
  func: function (str: string, resp_func: CmdRespFunc) {
    let { level } = game_state;
    assert(level);
    let { cells } = level;
    for (let ii = 0; ii < cells.length; ++ii) {
      cells[ii].visible_bits = str ? 0x7 : 0;
    }
    resp_func();
  },
});

function beforeUnload(): void {
  if (game_state?.level && isOnlineOnly()) {
    let str = game_state.level.getVisString();
    if (str !== last_saved_vis_string[game_state.floor_id]) {
      localStorageSetJSON<LocalVisData>('last_vis_data', {
        floor: game_state.floor_id,
        data: str,
        room: crawlerRoomID(),
      });
    }
  }
}

export function populateLevelFromInitialEntities(
  entity_manager: ClientEntityManagerInterface,
  floor_id: number, level: CrawlerLevel
): number {
  let ret = 0;
  if (level.initial_entities) {
    let initial_entities = clone(level.initial_entities);
    assert(!entity_manager.isOnline());
    for (let ii = 0; ii < initial_entities.length; ++ii) {
      initial_entities[ii].floor = floor_id;
      entity_manager.addEntityFromSerialized(initial_entities[ii]);
      ++ret;
    }
  }
  return ret;
}


export type InitLevelFunc = ((entity_manager: ClientEntityManagerInterface,
  floor_id: number, level: CrawlerLevel) => void);
let on_init_level_offline: InitLevelFunc | null = null;
let on_init_level_online: InitLevelFunc | null = null;

let need_turn_based_step = false;
let turn_based_step_reason: TurnBasedStepReason | null = null;

function crawlerOnInitHaveLevel(floor_id: number): void {
  need_turn_based_step = false;
  turn_based_step_reason = null;
  crawlerInitVisData(floor_id);
  let level = game_state.level;
  assert(level);
  if (isLocal()) {
    if (!local_game_data.floors_inited || !local_game_data.floors_inited[floor_id]) {
      assert(game_state.floor_id === floor_id);
      local_game_data.floors_inited = local_game_data.floors_inited || {};
      local_game_data.floors_inited[floor_id] = true;
      populateLevelFromInitialEntities(crawlerEntityManagerOffline(), floor_id, level);
    }
    on_init_level_offline?.(crawlerEntityManagerOffline(), floor_id, level);
  } else {
    on_init_level_online?.(crawlerEntityManagerOnline(), floor_id, level);
  }
}

cmd_parse.register({
  cmd: 'floor_reset',
  access_show: CRAWLER_IS_ONLINE ? ['sysadmin'] : undefined,
  help: 'Resets floor',
  func: function (str: string, resp_func: CmdRespFunc): void {
    if (isOnlineOnly()) {
      return crawlerRoom().cmdParse(`floor_reset_worker ${str}`, resp_func);
    }
    let floor_id = game_state.floor_id;
    let level = game_state.level;
    assert(level);
    level.resetState();
    let entity_manager = crawlerEntityManagerOffline();
    let floor_ents = entity_manager.indexedGet(INDEX_FLOOR, floor_id);
    let ents = (Object.values(floor_ents) as Entity[]).filter((ent) => !ent.fading_out);
    let count = 0;
    for (let ii = 0; ii < ents.length; ++ii) {
      let ent = ents[ii];
      if (!ent.is_player) {
        ++count;
        entity_manager.deleteEntity(ent.id, 'reset');
      }
    }
    let added = populateLevelFromInitialEntities(entity_manager, floor_id, level);
    let old_count = Object.keys(entity_manager.indexedGet(INDEX_FLOOR, floor_id)).length;
    // Probably want this callback at least for app logic that spawns monsters outside of level generation
    on_init_level_offline?.(entity_manager, floor_id, level);
    let new_count = Object.keys(entity_manager.indexedGet(INDEX_FLOOR, floor_id)).length;
    added += new_count - old_count;
    resp_func(null, `${count} entities deleted, ${added} entities spawned`);
  },
});
cmd_parse.register({
  cmd: 'spawn',
  access_show: CRAWLER_IS_ONLINE ? ['sysadmin'] : undefined,
  help: 'Spawns an entity of the specified type',
  prefix_usage_with_help: true,
  usage: '/spawn [type_id]',
  func: function (str: string, resp_func: CmdRespFunc) {
    if (isOnlineOnly()) {
      return crawlerRoom().cmdParse(`spawn_worker ${str}`, resp_func);
    }
    let ent = crawlerMyEnt();
    let my_pos = ent.getData<JSVec3>('pos')!;
    let ent_data = {
      type: str || 'enemy0',
      floor: ent.data.floor,
      pos: [my_pos[0] + DX[my_pos[2]], my_pos[1] + DY[my_pos[2]], 0],
    };
    let entity_manager = crawlerEntityManager();
    entity_manager.addEntityFromSerialized(ent_data);

    resp_func();
  }
});

let want_new_game = false;
export function crawlerPlayWantNewGame(): void {
  want_new_game = true;
}

let load_mode: 'auto' | 'manual' | 'recent' = 'recent';
export function crawlerPlayWantMode(mode: 'auto' | 'manual' | 'recent'): void {
  load_mode = mode;
}

export type CrawlerOfflineData<AppEntity extends Entity> = {
  new_player_data: DataObject;
  loading_state: EngineState;
  validate_player?: (me: AppEntity) => boolean;
};
let offline_data: CrawlerOfflineData<Entity> | undefined;

function crawlerLoadGame(data: SavedGameData): boolean {
  assert(offline_data);
  const { new_player_data } = offline_data;
  local_game_data = data;
  local_game_data.timestamp = Date.now();
  play_time_since_save = 0;
  let entity_manager = crawlerEntityManager();
  if (want_new_game) {
    want_new_game = false;
    local_game_data = { timestamp: Date.now() };
  }
  script_api.localDataSet(local_game_data.script_data || {});

  // Initialize entities
  let player_ent: Entity | null = null;
  if (local_game_data.entities) {
    for (let ii = 0; ii < local_game_data.entities.length; ++ii) {
      let ent = entity_manager.addEntityFromSerialized(local_game_data.entities[ii]);
      if (ent.is_player) {
        player_ent = ent;
      }
    }
  }
  if (local_game_data.ents_by_floor) {
    for (let floor_id_str in data.ents_by_floor) {
      let floor_id = Number(floor_id_str);
      let arr = data.ents_by_floor[floor_id]!;
      for (let jj = 0; jj < arr.length; ++jj) {
        let ent_data = unpackSavedEnt(floor_id, local_game_data.pack_info, arr[jj]);
        let ent = entity_manager.addEntityFromSerialized(ent_data);
        if (ent.is_player) {
          player_ent = ent;
        }
      }
    }
  }

  let need_init_pos = false;
  if (!player_ent) {
    need_init_pos = true;
    player_ent = entity_manager.addEntityFromSerialized(clone(new_player_data));
  }
  entity_manager.setMyEntID(player_ent.id);
  crawlerEntitiesOnEntStart();

  return need_init_pos;
}

function getLevelForFloorFromServer(floor_id: number, cb: (level: CrawlerLevelSerialized) => void): void {
  assert(crawl_room);
  let pak = crawl_room.pak('get_level');
  pak.writeInt(floor_id);
  pak.send(function (err: string | null, data?: CrawlerLevelSerialized) {
    if (err) {
      throw err;
    }
    assert(data);
    cb(data);
  });
}

function fetchLevel(filename: string, cb: (err?: string, data?: CrawlerLevelSerialized) => void): void {
  let url = `${getURLBase()}levels/${filename}.json`;
  fetch({
    url,
    response_type: 'json',
  }, (err?: string, data?: unknown) => {
    cb(err, data as CrawlerLevelSerialized);
  });
}

function levelFallbackProviderDefault(
  floor_id: number,
  cb: ErrorCallback<CrawlerLevelSerialized, string>,
): void {
  fetchLevel('empty', cb);
}

export type LevelProvider = (
  floor_id: number,
  cb: ErrorCallback<CrawlerLevelSerialized, string>,
) => void;

let level_fallback_provider: LevelProvider;

let level_is_generated_test: ((floor_id: number) => boolean) | undefined;

function getLevelForFloorFromWebFS(floor_id: number, cb: (level: CrawlerLevelSerialized) => void): void {
  let label = `level ${floor_id}`;
  function finish(err: string | undefined | null, data2?: CrawlerLevelSerialized | null): void {
    if (err) {
      throw new Error(`Error loading "${label}": ${err}`);
    }
    assert(data2);
    cb(data2);
  }
  if (level_is_generated_test?.(floor_id)) {
    return level_fallback_provider(floor_id, finish);
  }
  let url = `${getURLBase()}levels/level${floor_id}.json`;
  label = url;
  fetchLevel(`level${floor_id}`, (err?: string, data?: CrawlerLevelSerialized) => {
    if (err) {
      return level_fallback_provider(floor_id, finish);
    }
    cb(data!);
  });
}

export function crawlerPlayInitHybridBuild(room: ClientChannelWorker): void {
  assert(!crawl_room);
  crawl_room = room;
  crawlerEntityManager().reinit({
    channel: room,
    on_broadcast: on_broadcast,
  });
  game_state.resetAllLevels();
  last_saved_vis_string = {};
  controller.reloadLevel();
}

let was_pixely_2 = false;
export function crawlerBuildModeActivate(build_mode: boolean): void {
  buildModeSetActive(build_mode);
  if (build_mode) {
    if (settings.pixely === 2) {
      was_pixely_2 = true;
      settingsSet('pixely', 3);
    }
    if (game_state.level_provider === getLevelForFloorFromWebFS) {
      // One-time switch to server-provided levels and connect to the room
      assert(!crawl_room);
      crawlerCommStartBuildComm();
      game_state.level_provider = getLevelForFloorFromServer;
    }
    if (onlineMode() === OnlineMode.OFFLINE) {
      crawlerEntitiesInit(OnlineMode.ONLINE_BUILD);
      controller.buildModeSwitch({
        entity_manager: crawlerEntityManager(),
      });
    } else {
      assert.equal(onlineMode(), OnlineMode.ONLINE_ONLY);
    }
  } else {
    if (was_pixely_2) {
      settingsSet('pixely', 2);
      was_pixely_2 = false;
    }
    if (onlineMode() === OnlineMode.ONLINE_BUILD) {
      crawlerEntitiesInit(OnlineMode.OFFLINE);
      controller.buildModeSwitch({
        entity_manager: crawlerEntityManager(),
      });
      crawlerSaveGame('auto');
    }
  }
}

let on_pre_move: VoidFunc | undefined;

let turn_based_step: ((reason: TurnBasedStepReason) => void) | undefined;
let turn_based_step_threshold = 0.4;
let turn_based_step_countdown = 0;
let turn_based_allowed: (() => boolean) | undefined;
let turn_based_step_idx = 0;
let turn_based_step_skip = 0;

export function crawlerTurnBasedStepIndex(): number {
  return turn_based_step_idx;
}

export function crawlerTurnBasedNeedsStep(): boolean {
  return need_turn_based_step;
}

export function crawlerTurnBasedSkipStep(): void {
  turn_based_step_skip = 1;
}

function executeStep(): void {
  if (need_turn_based_step) {
    assert(turn_based_step_reason);
    profilerStartFunc();
    if (turn_based_step_skip) {
      --turn_based_step_skip;
    } else {
      turn_based_step?.(turn_based_step_reason);
      turn_based_step_idx++;
    }
    need_turn_based_step = false;
    turn_based_step_reason = null;
    profilerStopFunc();
  }
}

export function crawlerTurnBasedQueued(): boolean {
  return need_turn_based_step;
}

export function crawlerTurnBasedClearQueue(): void {
  need_turn_based_step = false;
}

export function crawlerTurnBasedTick(): void {
  if (engine.defines.AUTOSTEP && !need_turn_based_step) {
    need_turn_based_step = true;
    turn_based_step_countdown = 500;
    turn_based_step_reason = 'move';
  }
  if (need_turn_based_step) {
    if (turn_based_allowed?.() === false) {
      return;
    }
    if (turn_based_step_countdown) {
      turn_based_step_countdown -= getScaledFrameDt();
      if (turn_based_step_countdown <= 0) {
        turn_based_step_countdown = 0;
        executeStep();
      }
    } else if (!controller.controllerIsAnimating(turn_based_step_threshold)) {
      executeStep();
    }
  }
}

export function crawlerTurnBasedScheduleStep(delay: number, reason: TurnBasedStepReason): void {
  if (turn_based_allowed?.() !== false) {
    executeStep();
  }
  need_turn_based_step = true;
  turn_based_step_reason = reason;
  turn_based_step_countdown = delay;
}

export function crawlerTurnBasedMovePreStart(/*old_pos, new_pos, move_dir*/): void {
  on_pre_move?.();
  if (turn_based_allowed?.() !== false) {
    executeStep();
  }
}

function crawlerTurnBasedMoveStart(pos: Vec2): void {
  on_pre_move?.();
  if (turn_based_allowed?.() !== false) {
    executeStep();
  }
  let target_cell = crawlerGameState().level!.getCell(pos[0], pos[1]);
  if (target_cell?.props?.noai) {
    // moving onto a noai cell (e.g. stairs, teleporter), it might need to eject us, don't step!
    return;
  }
  need_turn_based_step = true;
  turn_based_step_reason = 'move';
  turn_based_step_countdown = 0; // fire as soon as we're done animating
  crawlerTurnBasedTick();
}

export function crawlerTurnBasedMoveFinish(pos: Vec2): void {
  // Finished a queued move, possibly because interrupted and starting a new one
  if (turn_based_allowed?.() !== false) {
    executeStep();
  }
}

let engaged_pos: string | null = null;
function crawlerRepeatHasher(pos: ROVec2): string | null {
  let ents = entitiesAdjacentTo(game_state, game_state.floor_id, pos, crawlerScriptAPI());
  ents = ents.filter(function (ent) {
    return ent.isEnemy() && ent.isAlive();
  });
  let ent_ids = ents.map(function (ent) {
    return ent.id;
  });
  let pos_key = `${pos[0]},${pos[1]}`;
  if (!ent_ids.length) {
    if (engaged_pos) {
      if (engaged_pos === pos_key) {
        // we were engaged with an enemy here, presumably we just killed it, don't
        // let key repeat cause us to walk away
        return 'engaged';
      }
      engaged_pos = null;
    }
    return null;
  }
  engaged_pos = pos_key;
  ent_ids.sort();
  return ent_ids.join();
}

let do_repeat_hasher = false;
function crawlerPlayInitShared(): void {
  entityPosManager().reinit();

  script_api = crawlerScriptAPIClientCreate(onlineMode());
  script_api.setCrawlerState(game_state);

  controller = crawlerControllerCreate({
    game_state,
    entity_manager: crawlerEntityManager(),
    script_api,
    on_pre_move: crawlerTurnBasedMovePreStart,
    on_player_move: crawlerTurnBasedMovePreStart,
    on_init_level: crawlerOnInitHaveLevel,
    on_move_start: crawlerTurnBasedMoveStart,
    on_enter_cell: crawlerTurnBasedMoveFinish,
    flush_vis_data: crawlerFlushVisData,
    repeat_hasher: do_repeat_hasher ? crawlerRepeatHasher : undefined,
    controller_type: 'queued2', // working well
    // controller_type: 'queued', // old stand-by; maybe useful for real-time
    // controller_type: 'instant', // too hard
    // controller_type: 'instantblend', // goes through corners
  });

  last_saved_vis_string = {};

  dialogReset();
}

function crawlerPlayInitOfflineEarly(): void {
  crawl_room = null;
  crawlerEntitiesInit(OnlineMode.OFFLINE);

  game_state = createCrawlerState({
    level_provider: getLevelForFloorFromWebFS,
  });

  crawlerEntityManager().reinit({
    on_broadcast: on_broadcast,
  });
}

export function crawlerPlayInitOnlineEarly(room: ClientChannelWorker): void {
  crawlerEntitiesInit(OnlineMode.ONLINE_ONLY);
  crawl_room = room;
  game_state = createCrawlerState({
    level_provider: getLevelForFloorFromServer,
  });
  crawlerEntityManager().reinit({
    channel: room,
    on_broadcast: on_broadcast,
  });
  crawlerPlayInitShared();
  play_init_online?.(room);
}

export function crawlerPlayInitOnlineLate(online_only_for_build: boolean): void {
  engine.setState(play_state);
  if (!online_only_for_build) {
    controller.initFromMyEnt();
  }
}

function crawlerPlayInitOfflineLate(data: SavedGameData): void {
  assert(offline_data);
  const { loading_state } = offline_data;

  // Load or init game
  let need_init_pos = crawlerLoadGame(data);

  if (offline_data.validate_player?.(crawlerEntityManager().getMyEnt()) === false) {
    // Needs an app-defined character/new game creation flow first
    crawlerCommReturnToTitle();
    return;
  }

  // Load and init current floor
  engine.setState(loading_state);
  let floor_id = crawlerMyEnt().data.floor;
  game_state.getLevelForFloorAsync(floor_id, (level: CrawlerLevel) => {
    if (need_init_pos) {
      let me = crawlerMyEnt();
      v3copy(me.data.pos, level.special_pos.stairs_in);
      me.indexUpdate();
    }
    engine.setState(play_state);
    controller.initFromMyEnt();

    if (buildModeActive()) {
      crawlerBuildModeActivate(true);
    }
  });
}

export function crawlerLoadOfflineGame(data: SavedGameData): void {
  crawlerPlayInitOfflineEarly();
  crawlerPlayInitShared();
  play_init_offline?.();
  crawlerPlayInitOfflineLate(data);
}

// for demos/intros/etc
export function crawlerEmptyOfflineGame(): void {
  crawlerPlayInitOfflineEarly();
  script_api = crawlerScriptAPIClientCreate(OnlineMode.OFFLINE);
  script_api.setCrawlerState(game_state);
}

export function crawlerPlayInitOffline(): void {
  let slot = urlhash.get('slot') || '1';
  let data_manual = localStorageGetJSON<SavedGameData>(`savedgame_${slot}.manual`, { timestamp: 0 });
  let data_auto = localStorageGetJSON<SavedGameData>(`savedgame_${slot}.auto`, { timestamp: 0 });
  let data;
  if (load_mode === 'manual') {
    data = data_manual;
  } else if (load_mode === 'auto') {
    data = data_auto;
  } else {
    if (data_manual.timestamp) {
      if (data_auto.timestamp && data_auto.timestamp > data_manual.timestamp) {
        data = data_auto;
      } else {
        data = data_manual;
      }
    } else {
      data = data_auto;
    }
  }
  crawlerLoadOfflineGame(data);
}

let level_generator_test: LevelGenerator;
let default_vstyle: string;
export function crawlerInitBuildModeLevelGenerator(): LevelGenerator {
  if (!level_generator_test) {
    assert(crawl_room);
    let room_public_data = crawl_room.getChannelData('public') as { seed: string };
    level_generator_test = levelGeneratorCreate({
      seed: room_public_data.seed,
      default_vstyle,
    });
  }
  game_state.level_provider = level_generator_test.provider;
  return level_generator_test;
}

let test_seed = 0;
export function crawlerLevelGenCycle(backward: boolean): void {
  if (backward) {
    --test_seed;
  } else {
    ++test_seed;
  }
  level_generator_test.setSeed(`test${test_seed}`);
  level_generator_test.resetAllLevels();
  game_state.resetAllLevels();
  game_state.getLevelForFloorAsync(game_state.floor_id, () => {
    game_state.setLevelActive(game_state.floor_id);
    controller.initPosFromLevelDebug();
  });
}

export function crawlerSetLevelGenMode(new_value: boolean): void {
  if (new_value === Boolean(engine.defines.LEVEL_GEN)) {
    return;
  }
  engine.defines.LEVEL_GEN = new_value;
  if (engine.defines.LEVEL_GEN) {
    crawlerInitBuildModeLevelGenerator();
  } else {
    // TODO: position gets out of sync with server, causes error
    game_state.level_provider = isOnline() ? getLevelForFloorFromServer : getLevelForFloorFromWebFS;
    game_state.getLevelForFloorAsync(game_state.floor_id, () => {
      game_state.setLevelActive(game_state.floor_id);
      controller.initPosFromLevelDebug();
    });
  }
}

let ui_clear_color = vec4();
export function crawlerRenderSetUIClearColor(v: Vec4): void {
  v4copy(ui_clear_color, v);
}
let ui_clear_cb: VoidFunc | null = null;
export function crawlerRenderSetUIClearCallback(cb: VoidFunc): void {
  ui_clear_cb = cb;
}
let viewport_save = vec4();
function uiClear(): void {
  // Note: this is probably overkill/unneeded for any games which do full-backbuffer viewport rendering
  v4copy(viewport_save, engine.viewport);
  engine.setViewport([0, 0, engine.width, engine.height]);
  let is_scissor = glScissorTest();
  if (is_scissor) {
    glScissorTest(false);
  }
  gl.clearColor(ui_clear_color[0], ui_clear_color[1], ui_clear_color[2], ui_clear_color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
  ui_clear_cb?.();
  engine.setViewport(viewport_save);
  if (is_scissor) {
    glScissorTest(true);
  }
}

type RenderFramePrepParam = {
  is_first_viewport: boolean;
  is_last_viewport: boolean;
  is_main_viewport: boolean;
  fov_override?: number;
  no_map_update?: boolean;
  override_render_prep_param?: RenderPrepParam;
  override_ignore_vis?: boolean;
  no_controller?: boolean;
  render_aspect?: number;
};

let entity_split: boolean;
export function crawlerRenderFramePrep(param: RenderFramePrepParam): void {
  const {
    is_first_viewport,
    is_last_viewport,
    is_main_viewport,
    fov_override,
    no_map_update,
    override_render_prep_param,
    override_ignore_vis,
    no_controller,
    render_aspect,
  } = param;
  let cv = crawlerRenderViewportGet();
  let do_postprocess = false;
  let ppw = cv.w;
  let pph = cv.h;
  if (setting_pixely) {
    do_postprocess = true;
  } else if (cv.flip_h) {
    do_postprocess = true;
    let ul = [0, 0];
    let lr = [0, 0];
    camera2d.virtualToCanvas(ul, [cv.x, cv.y]);
    camera2d.virtualToCanvas(lr, [cv.x + cv.w, cv.y + cv.h]);
    ppw = round(lr[0]) - round(ul[0]);
    pph = round(lr[1]) - round(ul[1]);
  }
  let opts_3d: {
    fov: number;
    clear: boolean;
    clear_all: boolean;
    clear_color?: Vec4;
    clear_all_color?: Vec4;
    width?: number;
    height?: number;
    viewport?: Vec4;
    need_depth?: string;
    just_viewport?: boolean;
    render_aspect?: number;
  } = {
    fov: fov_override || FOV,
    clear: false,
    clear_all: false,
    just_viewport: !is_first_viewport && !do_postprocess,
    render_aspect,
  };
  entity_split = setting_pixely === 1 &&
    settings.entity_split && crawlerRenderDoSplit() &&
    textureSupportsDepth() && supports_frag_depth && settings.use_fbos;
  if (do_postprocess) {
    opts_3d.width = ppw;
    opts_3d.height = pph;
    effectsPassAdd();
  } else {
    let viewport = crawlerCalc3DViewport();
    opts_3d.width = viewport[2];
    opts_3d.height = viewport[3];
    opts_3d.viewport = viewport;
  }
  if (entity_split) {
    // need depth buffer attachment
    opts_3d.need_depth = 'texture';
  }
  let vstyle = crawlerVstyle();
  let clear = vstyle.background_color;
  let fog = vstyle.fog_color;
  let fog_params = vstyle.fog_params;
  crawlerSetFogColor(fog);
  crawlerSetFogParams(fog_params);
  engine.start3DRendering(opts_3d);
  if (is_first_viewport && !do_postprocess) {
    // clear the whole screen with the UI color and/or custom logic
    uiClear();
  }
  // clear the 3D viewport (with depth)
  gl.clearColor(clear[0], clear[1], clear[2], 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (vstyle.background_img) {
    let hsize = vstyle.background_size || 1;
    let tex = textureLoad({
      url: `img/${vstyle.background_img}.png`,
      wrap_s: gl.CLAMP_TO_EDGE,
      wrap_t: gl.CLAMP_TO_EDGE,
      // filter_mag: gl.NEAREST,
      // filter_min: gl.NEAREST,
      // force_mipmaps: false,
    });
    if (tex.loaded) {
      glDepthTest(false);
      gl.depthMask(false);
      let voffs = mod(-game_state.angle / PI * 2 / hsize, 1);
      applyCopy({ source: tex, no_framebuffer: true, params: {
        copy_uv_scale: [tex.src_width / tex.width / hsize, -tex.src_height / tex.height,
                        voffs, tex.src_height / tex.height],
      } });
      if (voffs) {
        v4copy(viewport_save, engine.viewport);
        if (do_postprocess) {
          engine.setViewport([cv.w * (1 - voffs) * hsize, 0, cv.w * voffs * hsize, cv.h]);
        } else {
          let viewport = crawlerCalc3DViewport();
          engine.setViewport([
            viewport[0] + viewport[2] * (1 - voffs) * hsize, viewport[1],
            viewport[2] * voffs * hsize, viewport[3]
          ]);
        }
        applyCopy({ source: tex, no_framebuffer: true, params: {
          copy_uv_scale: [
            tex.src_width / tex.width * voffs, -tex.src_height / tex.height,
            0, tex.src_height / tex.height
          ],
        } });
        engine.setViewport(viewport_save);
      }
      glDepthTest(true);
      gl.depthMask(true);
    }
  }

  billboardBiasPrep(game_state);

  let render_prep_param = override_render_prep_param || controller.getRenderPrepParam();
  if (override_ignore_vis !== undefined) {
    render_prep_param = {
      ...render_prep_param,
      ignore_vis: override_ignore_vis,
    };
  }
  let map_update_this_frame = render_prep_param.map_update_this_frame && !no_map_update;
  renderPrep({
    ...render_prep_param,
    map_update_this_frame,
  });

  if (is_main_viewport) {
    sound3DListener({
      pos: render_prep_param.cam_pos,
      forward: dynGeomForward(),
      up: dynGeomUp(),
    });
  }

  crawlerRenderEntitiesPrep(no_controller);

  if (map_update_this_frame && is_last_viewport) {
    controller.flushMapUpdate();
  }
}

let fade_color = vec4();
let last_frame_did_fade = false;
const flip_h_params = {
  copy_uv_scale: vec4(-1, 1, 1, 0),
};

export function crawlerRenderFrame(is_first_viewport: boolean, no_controller?: boolean): void {
  let ignore_vis = crawlerRenderIgnoreVis();
  let cv = crawlerRenderViewportGet();
  if (setting_pixely) {
    effectsPassConsume();
    if (setting_pixely === 3) {
      profilerStopStart('renderAll');
      render(game_state, script_api, SPLIT_ALL);
      profilerStopStart('drawEntitiesAll');
      crawlerRenderEntities(SPLIT_ALL, ignore_vis);
      profilerStopStart('bottom');
      let viewport = crawlerCalc3DViewport();
      applyPixelyExpand({
        final: effectsIsFinal(), clear: true, clear_all: true,
        viewport,
      });
      if (engine.render_width) {
        engine.setViewport([0, 0, engine.render_width, engine.render_height]);
      } else {
        glScissorTest(false); // who's leaving this on? effect into a viewport
        engine.setViewport([0, 0, engine.width, engine.height]);
      }
    } else if (entity_split) { // && pixely=1
      profilerStopStart('renderFar');
      render(game_state, script_api, SPLIT_FAR);
      profilerStopStart('drawEntitiesFar');
      crawlerRenderEntities(SPLIT_FAR, ignore_vis);
      // copy from low res to destination, filling depth buffer
      let viewport = crawlerCalc3DViewport();
      applyCopy({
        final: effectsIsFinal(), // true
        clear: true, clear_all: true,
        shader: 'copy_depth',
        need_depth: 'texture',
        need_depth_begin: true,
        viewport,
      });
      profilerStopStart('renderNear');
      render(game_state, script_api, SPLIT_NEAR);
      profilerStopStart('drawEntitiesNear');
      // engine.setViewport(viewport);
      crawlerRenderEntities(SPLIT_NEAR, ignore_vis);
      profilerStopStart('bottom');
      glScissorTest(false); // who's leaving this on? effect into a viewport
      engine.setViewport([0, 0, engine.width, engine.height]);
    } else {
      profilerStopStart('renderAll');
      render(game_state, script_api, SPLIT_ALL);
      profilerStopStart('drawEntitiesAll');
      crawlerRenderEntities(SPLIT_ALL, ignore_vis);
      profilerStopStart('bottom');
      engine.clearHad3DThisFrame();
      let tex = framebufferEnd();
      viewport_sprite.texs[0] = tex;
      viewport_sprite.draw({
        x: cv.x, y: cv.y + cv.h,
        w: cv.w, h: -cv.h,
        z: 1,
      });
    }
  } else {
    profilerStopStart('renderAll');
    render(game_state, script_api, SPLIT_ALL);
    profilerStopStart('drawEntitiesAll');
    crawlerRenderEntities(SPLIT_ALL, ignore_vis);
    profilerStopStart('bottom');
    if (cv.flip_h) {
      effectsPassConsume();
      let viewport = crawlerCalc3DViewport();
      let source = framebufferEnd();
      framebufferStart({
        clear: false,
        clear_all: false,
        viewport,
        final: effectsIsFinal(),
        need_depth: true,
      });
      glScissorTest(false); // who's leaving this on? effect into a viewport

      if (is_first_viewport) {
        uiClear();
      }
      engine.setViewport(viewport);
      applyCopy({
        source,
        params: flip_h_params,
        no_framebuffer: true,
        clear: false,
        clear_all: false,
        viewport,
      });
    }
    glScissorTest(false);
    engine.setViewport([0, 0, engine.width, engine.height]);
  }

  let fade_alpha = no_controller ? 0 : controller.getFadeAlpha();
  if (fade_alpha) {
    // TODO: maybe grab a different fade color for doors than stairs? Spire needs something like that
    // let fade_v = controller.getFadeColor();
    let vstyle = crawlerVstyle();
    let desired_fade_color = vstyle.background_color || zero_vec;
    if (!last_frame_did_fade) {
      v3copy(fade_color, desired_fade_color);
      last_frame_did_fade = true;
    } else {
      v3lerp(fade_color, getScaledFrameDt() * 0.001, fade_color, desired_fade_color);
    }
    fade_color[3] = fade_alpha;

    if (settings.pixely) {
      ui.drawRect(cv.x, cv.y, cv.x + cv.w + 0.07, cv.y + cv.h + 0.07, Z.CONTROLLER_FADE, fade_color);
    } else {
      // Expand by half a pixel to deal with antialiasing, rounding, something?
      const expand = max(camera2d.wReal()/engine.width, camera2d.hReal()/engine.height) / 2;
      ui.drawRect(cv.x - expand, cv.y - expand, cv.x + cv.w + expand, cv.y + cv.h + expand,
        Z.CONTROLLER_FADE, fade_color);
    }
  } else {
    // Note: logic for blending fade colors is wrong with multi-viewports on one frame
    last_frame_did_fade = false;
  }
}

let last_frame_idx = -1;
export function crawlerPrepAndRenderFrame(param: Omit<RenderFramePrepParam, 'is_first_viewport'>): void {
  let is_first_viewport = last_frame_idx !== getFrameIndex();
  last_frame_idx = getFrameIndex();
  let param2: RenderFramePrepParam = {
    ...param,
    is_first_viewport,
  };
  crawlerRenderFramePrep(param2);
  crawlerRenderFrame(is_first_viewport, param.no_controller);
}

export type CrawlerChatUIParam = ChatUIRunParam & { y_bottom: number };
let chat_ui_param: CrawlerChatUIParam;
let chat_ui_param_build_mode: CrawlerChatUIParam;
let allow_offline_console: boolean;
let chat_as_message_log: boolean;
let do_chat: boolean;
export function crawlerPlayTopOfFrame(
  overlay_menu_up: boolean,
  but_show_chat: boolean,
  chat_ui_param_override?: CrawlerChatUIParam
): void {
  crawlerEntityManager().tick();

  if (!engine.isInBackgroundOrBlurred()) {
    play_time_since_save += engine.getFrameDt();
  }

  let map_view = mapViewActive();
  if (overlay_menu_up || isMenuUp()) {
    controller.cancelQueuedMoves(false);
  }
  if (!(map_view || isMenuUp() || overlay_menu_up)) {
    spotSuppressPad();
    profilerSupressPad();
  }

  crawlerTurnBasedTick();

  let hide_chat = (overlay_menu_up && !but_show_chat) ||
    map_view ||
    buildModeOverlayActive() ||
    (!isOnline() && !chat_as_message_log);
  do_chat = allow_offline_console || isOnline() !== OnlineMode.OFFLINE;
  if (do_chat) {
    let eff_param = (chat_ui_param_override || (buildModeActive() ? chat_ui_param_build_mode : chat_ui_param));
    getChatUI().run({
      hide: hide_chat,
      hide_input: chat_as_message_log,
      y: eff_param.y_bottom - getChatUI().h,
      always_scroll: !hide_chat,
      ...eff_param,
    });
  }
}

export function crawlerPlayBottomOfFrame(): void {
  if (crawlerCommWant()) {
    crawlerCommStart();
  }

  crawlerEntityManager().actionListFlush();

  if (do_chat) {
    getChatUI().runLate();
  }
}

export function crawlerPlaySetOfflineNewPlayerData(new_player_data: DataObject): void {
  assert(offline_data);
  offline_data.new_player_data = new_player_data;
}


export function crawlerPlayStartup<AppEntity extends Entity>(param: {
  on_broadcast?: (data: EntityManagerEvent) => void;
  play_init_online?: (room: ClientChannelWorker) => void;
  play_init_offline?: () => void;
  offline_data?: CrawlerOfflineData<AppEntity>;
  play_state: EngineState;
  on_init_level_offline?: InitLevelFunc;
  on_init_level_online?: InitLevelFunc;
  default_vstyle?: string;
  allow_offline_console?: boolean;
  chat_as_message_log?: boolean;
  chat_ui_param?: CrawlerChatUIParam;
  chat_ui_param_build_mode?: CrawlerChatUIParam;
  turn_based_step?: (reason: TurnBasedStepReason) => void;
  turn_based_allowed?: () => boolean;
  on_pre_move?: VoidFunc;
  do_repeat_hasher: boolean;
  level_fallback_provider?: LevelProvider;
  level_is_generated_test?: (floor_id: number) => boolean;
}): void {
  on_broadcast = param.on_broadcast || undefined;
  play_init_online = param.play_init_online;
  play_init_offline = param.play_init_offline;
  offline_data = param.offline_data as CrawlerOfflineData<Entity>;
  play_state = param.play_state;
  default_vstyle = param.default_vstyle || 'demo';
  on_init_level_offline = param.on_init_level_offline || null;
  on_init_level_online = param.on_init_level_online || null;
  allow_offline_console = param.allow_offline_console || false;
  chat_as_message_log = param.chat_as_message_log || false;
  chat_ui_param = param.chat_ui_param || { x: 2, y_bottom: engine.game_height - 2, border: 2 };
  chat_ui_param_build_mode = param.chat_ui_param_build_mode || chat_ui_param;
  turn_based_step = param.turn_based_step;
  turn_based_allowed = param.turn_based_allowed;
  on_pre_move = param.on_pre_move;
  do_repeat_hasher = param.do_repeat_hasher;
  level_fallback_provider = param.level_fallback_provider || levelFallbackProviderDefault;
  level_is_generated_test = param.level_is_generated_test;
  window.addEventListener('beforeunload', beforeUnload, false);
  viewport_sprite = spriteCreate({ texs: [textureWhite()] });
  supports_frag_depth = engine.webgl2 || gl.getExtension('EXT_frag_depth');

  registerShader('copy_depth', {
    fp: 'shaders/copy_depth.fp',
  });

  setting_pixely = settings.pixely;

  crawlerControllerStartup();

  past_startup = true;
}
