/* eslint comma-spacing:error */
import assert from 'assert';
import { cmd_parse } from 'glov/client/cmds';
import {
  applyCopy,
  applyPixelyExpand,
  effectsIsFinal,
  effectsPassAdd,
  effectsPassConsume,
  registerShader,
} from 'glov/client/effects';
import * as engine from 'glov/client/engine';
import { ClientEntityManagerInterface } from 'glov/client/entity_manager_client';
import { fetch } from 'glov/client/fetch';
import { framebufferEnd } from 'glov/client/framebuffer';
import {
  localStorageGetJSON,
  localStorageSet,
  localStorageSetJSON,
} from 'glov/client/local_storage';
import { ClientChannelWorker } from 'glov/client/net';
import * as settings from 'glov/client/settings';
import {
  settingsRegister,
  settingsSet,
} from 'glov/client/settings';
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
} from 'glov/common/types';
import {
  callEach,
  clone,
  mod,
} from 'glov/common/util';
import {
  v3copy,
  v4copy,
  vec3,
  Vec4,
  vec4,
} from 'glov/common/vmath';
import '../common/crawler_events'; // side effects: register events
import {
  CrawlerLevel,
  CrawlerLevelSerialized,
  CrawlerState,
  createCrawlerState,
  DX,
  DY,
  JSVec3,
  VstyleDesc,
} from '../common/crawler_state';
import { LevelGenerator, levelGeneratorCreate } from '../common/level_generator';
import { billboardBiasPrep } from './crawler_billboard_bias';
import {
  buildModeActive,
  buildModeOverlayActive,
  buildModeSetActive,
} from './crawler_build_mode';
import {
  crawlerCommStart,
  crawlerCommStartBuildComm,
  crawlerCommWant,
  getChatUI,
} from './crawler_comm';
import { CrawlerController } from './crawler_controller';
import {
  crawlerEntitiesInit,
  crawlerEntitiesOnEntStart,
  crawlerEntityManager,
  crawlerEntityManagerOffline,
  crawlerMyActionSend,
  crawlerMyEnt,
  EntityCrawlerClient,
  entityPosManager,
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
  crawlerRenderViewportGet,
  crawlerSetFogColor,
  crawlerSetFogParams,
  FOV,
  render,
  renderPrep,
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

const { PI, floor } = Math;

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
  if (settings.time_scale === 1) {
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

export type SavedGameData = {
  entities?: DataObject[];
  floors_inited?: Partial<Record<number, true>>;
  vis_data?: Partial<Record<number, string>>;
  script_data?: DataObject;
  time_played?: number;
  timestamp: number;
};
let local_game_data: SavedGameData = { timestamp: Date.now() };

export function crawlerCurSavePlayTime(): number {
  let now = Date.now();
  let dt = now - local_game_data.timestamp;
  return (local_game_data.time_played || 0) + dt;
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

export function crawlerSaveGameGetData(): SavedGameData {
  crawlerFlushVisData(true);
  let { entities } = crawlerEntityManager();
  let ent_list: DataObject[] = [];
  for (let ent_id_str in entities) {
    let ent = entities[ent_id_str]!;
    if (!ent.fading_out) {
      ent_list.push(ent.data as unknown as DataObject);
    }
  }
  local_game_data.entities = ent_list;
  local_game_data.script_data = script_api.localDataGet();
  let now = Date.now();
  if (local_game_data.timestamp) {
    local_game_data.time_played = (local_game_data.time_played || 0) + (now - local_game_data.timestamp);
  }
  local_game_data.timestamp = now;
  return local_game_data;
}

export function crawlerSaveGame(mode: 'auto' | 'manual'): void {
  let slot = urlhash.get('slot') || '1';
  let data = crawlerSaveGameGetData();
  localStorageSetJSON<SavedGameData>(`savedgame_${slot}.${mode}`, data);
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
      level.applyVisString(data);
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
      level.applyVisString(data);
    }
    let prev = localStorageGetJSON<LocalVisData>('last_vis_data');
    if (prev && prev.floor === floor_id && prev.room === crawlerRoomID()) {
      level.applyVisString(prev.data);
    }
  });
}

cmd_parse.register({
  cmd: 'floor',
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

function populateLevelFromInitialEntities(
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

function crawlerOnInitHaveLevel(floor_id: number): void {
  crawlerInitVisData(floor_id);
  if (isLocal()) {
    let level = game_state.level;
    assert(level);
    if (!local_game_data.floors_inited || !local_game_data.floors_inited[floor_id]) {
      assert(game_state.floor_id === floor_id);
      local_game_data.floors_inited = local_game_data.floors_inited || {};
      local_game_data.floors_inited[floor_id] = true;
      populateLevelFromInitialEntities(crawlerEntityManagerOffline(), floor_id, level);
    }
    on_init_level_offline?.(crawlerEntityManagerOffline(), floor_id, level);
  }
}

cmd_parse.register({
  cmd: 'floor_reset',
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
    let ents = entity_manager.entitiesFind((ent) => ent.data.floor === floor_id, true);
    let count = 0;
    for (let ii = 0; ii < ents.length; ++ii) {
      let ent = ents[ii];
      if (!ent.is_player) {
        ++count;
        entity_manager.deleteEntity(ent.id, 'reset');
      }
    }
    let added = populateLevelFromInitialEntities(entity_manager, floor_id, level);
    resp_func(null, `${count} entities deleted, ${added} entities spawned`);
  },
});
cmd_parse.register({
  cmd: 'spawn',
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

export type CrawlerOfflineData = {
  new_player_data: DataObject;
  loading_state: EngineState;
};
let offline_data: CrawlerOfflineData | undefined;

function crawlerLoadGame(data: SavedGameData): boolean {
  assert(offline_data);
  const { new_player_data } = offline_data;
  local_game_data = data;
  local_game_data.timestamp = Date.now();
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
  let url = `${getURLBase()}/levels/${filename}.json`;
  fetch({
    url,
    response_type: 'json',
  }, (err?: string, data?: unknown) => {
    cb(err, data as CrawlerLevelSerialized);
  });
}

function getLevelForFloorFromWebFS(floor_id: number, cb: (level: CrawlerLevelSerialized) => void): void {
  let url = `${getURLBase()}/levels/level${floor_id}.json`;
  fetchLevel(`level${floor_id}`, (err?: string, data?: CrawlerLevelSerialized) => {
    if (err) {
      return fetchLevel('empty', (err?: string, data2?: CrawlerLevelSerialized) => {
        if (err) {
          throw new Error(`Error loading "${url}": ${err}`);
        }
        cb(data2!);
      });
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
      crawlerSaveGame('manual');
    }
  }
}

function crawlerPlayInitShared(): void {
  entityPosManager().reinit();

  script_api = crawlerScriptAPIClientCreate(onlineMode());
  script_api.setCrawlerState(game_state);

  controller = new CrawlerController({
    game_state,
    entity_manager: crawlerEntityManager(),
    script_api,
    on_init_level: crawlerOnInitHaveLevel,
    flush_vis_data: crawlerFlushVisData,
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

  // Load and init current floor
  engine.setState(loading_state);
  let floor_id = crawlerMyEnt().data.floor;
  game_state.getLevelForFloorAsync(floor_id, (level: CrawlerLevel) => {
    if (need_init_pos) {
      v3copy(crawlerMyEnt().data.pos, level.special_pos.stairs_in);
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
function uiClearColor(): void {
  gl.clearColor(ui_clear_color[0],
    ui_clear_color[1],
    ui_clear_color[2],
    ui_clear_color[3]);
}


let entity_split: boolean;
let default_bg_color = vec3();
let default_fog_params = vec3(0.003, 0.001, 800.0);
export function crawlerRenderFramePrep(): void {
  let opts_3d: {
    fov: number;
    clear_all: boolean;
    clear_color?: Vec4;
    clear_all_color?: Vec4;
    width?: number;
    height?: number;
    viewport?: Vec4;
    need_depth?: string;
  } = {
    fov: FOV,
    clear_all: true,
    clear_all_color: ui_clear_color,
  };
  entity_split = setting_pixely === 1 &&
    settings.entity_split && crawlerRenderDoSplit() &&
    textureSupportsDepth() && supports_frag_depth && settings.use_fbos;
  if (setting_pixely) {
    let cv = crawlerRenderViewportGet();
    opts_3d.width = cv.w;
    opts_3d.height = cv.h;
    effectsPassAdd();
  } else {
    uiClearColor();
    gl.clear(gl.COLOR_BUFFER_BIT);
    let viewport = crawlerCalc3DViewport();
    opts_3d.width = viewport[2];
    opts_3d.height = viewport[3];
    opts_3d.viewport = viewport;
  }
  if (entity_split) {
    // need depth buffer attachment
    opts_3d.need_depth = 'texture';
  }
  let { level } = game_state;
  let clear = default_bg_color;
  let fog = default_bg_color;
  let fog_params = default_fog_params;
  let vstyle: VstyleDesc | null = null;
  if (level) {
    vstyle = level.vstyle;
  }
  if (vstyle) {
    clear = vstyle.background_color;
    fog = vstyle.fog_color;
    fog_params = vstyle.fog_params;
  }
  opts_3d.clear_color = [clear[0], clear[1], clear[2], 0];
  gl.clearColor(clear[0], clear[1], clear[2], 0);
  crawlerSetFogColor(fog);
  crawlerSetFogParams(fog_params);
  engine.start3DRendering(opts_3d);
  if (vstyle && vstyle.background_img) {
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
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      let voffs = mod(-game_state.angle / PI * 2 / hsize, 1);
      applyCopy({ source: tex, no_framebuffer: true, params: {
        copy_uv_scale: [tex.src_width / tex.width / hsize, -tex.src_height / tex.height,
                        voffs, tex.src_height / tex.height],
      } });
      if (voffs) {
        let viewport_save = engine.viewport.slice(0);
        if (setting_pixely) {
          let cv = crawlerRenderViewportGet();
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
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }
  }

  uiClearColor();

  billboardBiasPrep(game_state);

  renderPrep(controller.getRenderPrepParam());

  crawlerRenderEntitiesPrep();

  controller.flushMapUpdate();
}

export function crawlerRenderFrame(): void {
  let cv = crawlerRenderViewportGet();
  if (setting_pixely) {
    effectsPassConsume();
    if (setting_pixely === 3) {
      profilerStopStart('renderAll');
      render(game_state, script_api, SPLIT_ALL);
      profilerStopStart('drawEntitiesAll');
      crawlerRenderEntities(SPLIT_ALL);
      profilerStopStart('bottom');
      let viewport = crawlerCalc3DViewport();
      applyPixelyExpand({
        final: effectsIsFinal(), clear: true, clear_all: true,
        viewport,
      });
      gl.disable(gl.SCISSOR_TEST); // who's leaving this on? effect into a viewport
      engine.setViewport([0, 0, engine.width, engine.height]);
    } else if (entity_split) { // && pixely=1
      profilerStopStart('renderFar');
      render(game_state, script_api, SPLIT_FAR);
      profilerStopStart('drawEntitiesFar');
      crawlerRenderEntities(SPLIT_FAR);
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
      crawlerRenderEntities(SPLIT_NEAR);
      profilerStopStart('bottom');
      gl.disable(gl.SCISSOR_TEST); // who's leaving this on? effect into a viewport
      engine.setViewport([0, 0, engine.width, engine.height]);
    } else {
      profilerStopStart('renderAll');
      render(game_state, script_api, SPLIT_ALL);
      profilerStopStart('drawEntitiesAll');
      crawlerRenderEntities(SPLIT_ALL);
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
    crawlerRenderEntities(SPLIT_ALL);
    profilerStopStart('bottom');
    gl.disable(gl.SCISSOR_TEST);
    engine.setViewport([0, 0, engine.width, engine.height]);
  }

  if (controller.getFadeAlpha()) {
    let fade_v = controller.getFadeColor();
    ui.drawRect(cv.x, cv.y, cv.x + cv.w, cv.y + cv.h, 2, [fade_v, fade_v, fade_v, controller.getFadeAlpha()]);
  }
}

export function crawlerPrepAndRenderFrame(): void {
  crawlerRenderFramePrep();
  crawlerRenderFrame();
}

export type ChatUIParam = { // TODO: Typescript: remove when chat_ui is migrated
  border?: number;
  scroll_grow?: number;
  cuddly_scroll?: boolean;
  x: number;
  y_bottom: number;
  z?: number;
};
let chat_ui_param: ChatUIParam;
let allow_offline_console: boolean;
let do_chat: boolean;
export function crawlerPlayTopOfFrame(overlay_menu_up: boolean): void {
  crawlerEntityManager().tick();

  let map_view = mapViewActive();
  if (overlay_menu_up || isMenuUp()) {
    controller.cancelQueuedMoves();
  }
  if (!(map_view || isMenuUp() || overlay_menu_up)) {
    spotSuppressPad();
  }

  let hide_chat = overlay_menu_up || map_view || buildModeOverlayActive() || !isOnline();
  do_chat = allow_offline_console || isOnline() !== OnlineMode.OFFLINE;
  if (do_chat) {
    getChatUI().run({
      ...chat_ui_param,
      hide: hide_chat,
      y: chat_ui_param.y_bottom - getChatUI().h,
      always_scroll: !hide_chat,
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

export function crawlerPlayStartup(param: {
  on_broadcast?: (data: EntityManagerEvent) => void;
  play_init_online?: (room: ClientChannelWorker) => void;
  play_init_offline?: () => void;
  offline_data?: CrawlerOfflineData;
  play_state: EngineState;
  on_init_level_offline?: InitLevelFunc;
  default_vstyle?: string;
  allow_offline_console?: boolean;
  chat_ui_param?: ChatUIParam;
}): void {
  on_broadcast = param.on_broadcast || undefined;
  play_init_online = param.play_init_online;
  play_init_offline = param.play_init_offline;
  offline_data = param.offline_data;
  play_state = param.play_state;
  default_vstyle = param.default_vstyle || 'demo';
  on_init_level_offline = param.on_init_level_offline || null;
  allow_offline_console = param.allow_offline_console || false;
  chat_ui_param = param.chat_ui_param || { x: 2, y_bottom: engine.game_height - 2, border: 2 };
  window.addEventListener('beforeunload', beforeUnload, false);
  viewport_sprite = spriteCreate({ texs: [textureWhite()] });
  supports_frag_depth = engine.webgl2 || gl.getExtension('EXT_frag_depth');

  registerShader('copy_depth', {
    fp: 'shaders/copy_depth.fp',
  });

  setting_pixely = settings.pixely;

  past_startup = true;
}
