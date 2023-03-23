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
import { fetch } from 'glov/client/fetch';
import { framebufferEnd } from 'glov/client/framebuffer';
import {
  localStorageGetJSON,
  localStorageSet,
  localStorageSetJSON,
} from 'glov/client/local_storage';
import * as settings from 'glov/client/settings';
import {
  Sprite,
  spriteCreate,
} from 'glov/client/sprites';
import { textureSupportsDepth, textureWhite } from 'glov/client/textures';
import * as ui from 'glov/client/ui';
import { getURLBase } from 'glov/client/urlhash';
import { EntityManagerEvent } from 'glov/common/entity_base_common';
import {
  ClientChannelWorker,
  CmdRespFunc,
  DataObject,
} from 'glov/common/types';
import {
  callEach,
  clone,
} from 'glov/common/util';
import {
  Vec4,
  v3copy,
  v4copy,
  vec4,
} from 'glov/common/vmath';
import '../common/crawler_events'; // side effects: register events
import {
  CrawlerLevel,
  CrawlerLevelSerialized,
  CrawlerState,
  createCrawlerState,
} from '../common/crawler_state';
import { LevelGenerator, levelGeneratorCreate } from '../common/level_generator';
import { buildModeSetActive } from './crawler_build_mode';
import { CrawlerController } from './crawler_controller';
import {
  EntityCrawlerClient,
  crawlerEntitiesInit,
  crawlerEntitiesOnEntStart,
  crawlerEntityManager,
  crawlerMyActionSend,
  crawlerMyEnt,
  entityPosManager,
  isOnline,
} from './crawler_entity_client';
import {
  FOV,
  SPLIT_ALL,
  SPLIT_FAR,
  SPLIT_NEAR,
  crawlerCalc3DViewport,
  crawlerRenderDoSplit,
  crawlerRenderViewportGet,
  render,
} from './crawler_render';
import { crawlerRenderEntities } from './crawler_render_entities';
import {
  CrawlerScriptAPIClient,
  crawlerScriptAPIClientCreate,
} from './crawler_script_api_client';

const { floor } = Math;

type Entity = EntityCrawlerClient;

declare module 'glov/client/settings' {
  export let filter: 0 | 1;
  export let pixely: 0 | 1 | 2 | 3;
  export let entity_split: 0 | 1;
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

let crawl_room: ClientChannelWorker;
export function crawlerRoom(): ClientChannelWorker {
  return crawl_room;
}
export function crawlerRoomID(): string {
  return crawl_room.getChannelID();
}

let controller: CrawlerController;
export function crawlerController(): CrawlerController {
  return controller;
}

let on_broadcast: ((data: EntityManagerEvent) => void) | undefined;
let play_init_online: (room: ClientChannelWorker) => void;
let play_init_offline: () => void;

let setting_pixely: 0 | 1 | 2 | 3;

let on_pixely_change: ((pixely: number) => void)[] = [];
export function crawlerOnPixelyChange(fn: (pixely: number) => void): void {
  on_pixely_change.push(fn);
}
let past_startup = false;
settings.register({
  filter: {
    default_value: 0, // 1 for spire, 0 for demo
    type: cmd_parse.TYPE_INT,
    range: [0, 1],
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
        callEach(on_pixely_change, on_pixely_change = [], setting_pixely);
      }, 1);
    },
  },
  entity_split: { // only with pixely=1
    default_value: 1,
    type: cmd_parse.TYPE_INT,
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

type SavedGameData = {
  entities?: DataObject[];
  floors_inited?: Partial<Record<number, true>>;
  vis_data?: Partial<Record<number, string>>;
  script_data?: DataObject;
};
let local_game_data: SavedGameData = {};

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
    if (!isOnline()) {
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

export function crawlerSaveGame(): void {
  crawlerFlushVisData(true);
  let { entities } = crawlerEntityManager();
  let ent_list: DataObject[] = [];
  for (let ent_id_str in entities) {
    let ent = entities[ent_id_str]!;
    ent_list.push(ent.data as unknown as DataObject);
  }
  local_game_data.entities = ent_list;
  local_game_data.script_data = script_api.localDataGet();

  localStorageSetJSON<SavedGameData>('savedgame', local_game_data);
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
  if (!isOnline()) {
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
  if (game_state?.level && isOnline()) {
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

function crawlerOnInitHaveLevel(floor_id: number): void {
  crawlerInitVisData(floor_id);
  if (!isOnline()) {
    if (!local_game_data.floors_inited || !local_game_data.floors_inited[floor_id]) {
      assert(game_state.floor_id === floor_id);
      let level = game_state.level;
      assert(level);
      local_game_data.floors_inited = local_game_data.floors_inited || {};
      local_game_data.floors_inited[floor_id] = true;
      if (level.initial_entities) {
        let initial_entities = clone(level.initial_entities);
        let entity_manager = crawlerEntityManager();
        for (let ii = 0; ii < initial_entities.length; ++ii) {
          initial_entities[ii].floor = floor_id;
          entity_manager.addEntityFromSerialized(initial_entities[ii]);
        }
      }
    }
  }
}

function getLevelForFloorFromServer(floor_id: number, cb: (level: CrawlerLevelSerialized) => void): void {
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

function getLevelForFloorFromWebFS(floor_id: number, cb: (level: CrawlerLevelSerialized) => void): void {
  let url = `${getURLBase()}/levels/level${floor_id}.json`;
  fetch({
    url,
    response_type: 'json',
  }, (err?: string, data?: unknown) => {
    if (err) {
      throw new Error(`Error loading "${url}": ${err}`);
    }
    cb(data as CrawlerLevelSerialized);
  });
}

export function crawlerPlayInitShared(online: boolean): void {
  if (!online) {
    buildModeSetActive(false);
  }

  entityPosManager().reinit();

  script_api = crawlerScriptAPIClientCreate(online);
  script_api.setCrawlerState(game_state);

  controller = new CrawlerController({
    online,
    game_state,
    entity_manager: crawlerEntityManager(),
    script_api,
    on_init_level: crawlerOnInitHaveLevel,
    flush_vis_data: crawlerFlushVisData,
  });

  last_saved_vis_string = {};
}

export function crawlerPlayInitOfflineEarly(): void {
  crawlerEntitiesInit(false);

  game_state = createCrawlerState({
    entity_manager: crawlerEntityManager(),
    level_provider: getLevelForFloorFromWebFS,
  });

  crawlerEntityManager().reinit({
    on_broadcast: on_broadcast,
  });
}

export function crawlerPlayInitOnlineEarly(room: ClientChannelWorker): void {
  crawlerEntitiesInit(true);
  crawl_room = room;
  game_state = createCrawlerState({
    entity_manager: crawlerEntityManager(),
    level_provider: getLevelForFloorFromServer,
  });
  crawlerEntityManager().reinit({
    channel: room,
    on_broadcast: on_broadcast,
  });
  play_init_online(room);
}

export function crawlerPlayInitOnlineLate(): void {
  controller.initFromMyEnt();
}

let want_new_game = false;
export function crawlerPlayWantNewGame(): void {
  want_new_game = true;
}

export function crawlerPlayInitOfflineLate(param: {
  new_player_data: DataObject;
  loading_state: (dt: number) => void;
  next_state: (dt: number) => void;
}): void {
  const { new_player_data, loading_state, next_state } = param;
  let player_ent: Entity | null = null;
  let entity_manager = crawlerEntityManager();

  // Load or init game
  local_game_data = localStorageGetJSON<SavedGameData>('savedgame', {});
  if (want_new_game) {
    want_new_game = false;
    local_game_data = {};
  }

  // Initialize entities
  if (local_game_data.entities) {
    for (let ii = 0; ii < local_game_data.entities.length; ++ii) {
      let ent = entity_manager.addEntityFromSerialized(local_game_data.entities[ii]);
      if (ent.is_player) {
        player_ent = ent;
      }
    }
  }
  script_api.localDataSet(local_game_data.script_data || {});

  let need_init_pos = false;
  if (!player_ent) {
    need_init_pos = true;
    player_ent = entity_manager.addEntityFromSerialized(new_player_data);
  }
  entity_manager.setMyEntID(player_ent.id);
  crawlerEntitiesOnEntStart();

  // Load and init current floor
  engine.setState(loading_state);
  let floor_id = crawlerMyEnt().data.floor;
  game_state.getLevelForFloorAsync(floor_id, (level: CrawlerLevel) => {
    if (need_init_pos) {
      v3copy(player_ent!.data.pos, level.special_pos.stairs_in);
    }
    engine.setState(next_state);
    controller.initFromMyEnt();
  });
}

export function crawlerPlayInitOffline(): void {
  crawlerPlayInitOfflineEarly();
  play_init_offline();
}

let level_generator_test: LevelGenerator;
export function crawlerInitBuildModeLevelGenerator(): LevelGenerator {
  if (!level_generator_test) {
    let room_public_data = crawl_room.getChannelData('public') as { seed: string };
    level_generator_test = levelGeneratorCreate({
      seed: room_public_data.seed,
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
    // TODO: gets out of sync with server, causes error
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
export function crawlerRenderFramePrep(): void {
  let opts_3d: {
    fov: number;
    clear_all: boolean;
    width?: number;
    height?: number;
    viewport?: Vec4;
    need_depth?: string;
  } = {
    fov: FOV,
    clear_all: false,
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
  gl.clearColor(0, 0, 0, 0);
  engine.start3DRendering(opts_3d);

  uiClearColor();
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

export function crawlerPlayStartup(param: {
  on_broadcast?: (data: EntityManagerEvent) => void;
  play_init_online: (room: ClientChannelWorker) => void;
  play_init_offline: () => void;
}): void {
  on_broadcast = param.on_broadcast || undefined;
  play_init_online = param.play_init_online;
  play_init_offline = param.play_init_offline;
  window.addEventListener('beforeunload', beforeUnload, false);
  viewport_sprite = spriteCreate({ texs: [textureWhite()] });
  supports_frag_depth = engine.webgl2 || gl.getExtension('EXT_frag_depth');

  registerShader('copy_depth', {
    fp: 'shaders/copy_depth.fp',
  });

  setting_pixely = settings.pixely;

  past_startup = true;
}
