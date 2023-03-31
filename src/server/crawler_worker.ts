const LEVEL_VERSION = 1;
const EXPORT_PATH = './src/client/levels/';

import assert from 'assert';
import fs from 'fs';
import {
  Diff,
  diffApply,
} from 'glov/common/differ';
import { clone } from 'glov/common/util';
import { v3copy } from 'glov/common/vmath';
import { ChannelWorker } from 'glov/server/channel_worker';
import { chattableWorkerInit } from 'glov/server/chattable_worker';
import {
  VAID,
  entityServerDefaultLoadPlayerEntity,
} from 'glov/server/entity_base_server';
import {
  EntityManagerReadyWorker,
  SEMClient,
  ServerEntityManager,
  ServerEntityManagerInterface,
  createServerEntityManager,
  entityManagerWorkerInit,
} from 'glov/server/entity_manager_server';
import { serverFSAPI } from 'glov/server/serverfs';
import {
  CrawlerLevel,
  CrawlerLevelSerialized,
  CrawlerState,
  DX,
  DY,
  JSVec3,
  crawlerLoadData,
  createCrawlerState,
  createLevel,
} from '../common/crawler_state';
import { EntityCrawlerServer, crawlerEntityAlloc, crawlerEntityTraitsServerStartup } from './crawler_entity_server';
import {
  CrawlerScriptAPIServer,
  crawlerScriptAPIServerCreate,
} from './crawler_script_api_server';

import type {
  BuildModeOp,
  CrawlerJoinPayload,
} from '../common/crawler_entity_common';
import type { ActionListResponse } from 'glov/common/entity_base_common';
import type { Packet } from 'glov/common/packet';
import type {
  ClientHandlerSource,
  CmdRespFunc,
  DataObject,
  ErrorCallback,
  NetErrorCallback,
  NetResponseCallback,
} from 'glov/common/types';
import type { ChannelServer } from 'glov/server/channel_server';

export class CrawlerWorker<
  Entity extends EntityCrawlerServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>
> extends ChannelWorker {
  game_state!: CrawlerState;
  entity_manager!: ServerEntityManager<Entity, Worker>;
  script_api!: CrawlerScriptAPIServer;

  overrides_constructor!: boolean; // on prototype

  constructor(channel_server: ChannelServer, channel_id: string, channel_data: DataObject) {
    super(channel_server, channel_id, channel_data);

    if (!this.overrides_constructor) {
      this.initCrawlerState();
    }
  }

  semClientInitialVisibleAreaSees(join_payload: unknown, sem_client: SEMClient): VAID[] {
    let ent = this.entity_manager.getEntityForClient(sem_client);
    assert(ent);
    return [ent.data.floor || 0];
  }

  scriptAPICreate(): CrawlerScriptAPIServer {
    // Can be overridden by app
    return crawlerScriptAPIServerCreate();
  }

  initCrawlerState(): void {
    // Can be overridden by app
    this.entity_manager = createServerEntityManager<Entity, Worker>({
      worker: this as unknown as Worker,
      create_func: crawlerEntityAlloc as (data: DataObject) => Entity,
      load_player_func: (
        sem: ServerEntityManagerInterface,
        src: ClientHandlerSource,
        join_payload: unknown,
        player_uid: string,
        cb: NetErrorCallback<Entity>,
      ) => {
        let payload = join_payload as CrawlerJoinPayload;
        this.game_state.getLevelForFloorAsync(0, (level: CrawlerLevel) => {
          entityServerDefaultLoadPlayerEntity<Entity>({
            type: 'player',
            floor: 0,
            pos: level.special_pos.stairs_in,
          }, sem, src, join_payload, player_uid, function (err: null | string, ent?: Entity) {
            if (ent && payload.pos) {
              // This is only for transitioning from offline-play to online-build mode for the first time in a session
              assert(typeof payload.floor_id === 'number');
              v3copy(ent.data.pos, payload.pos);
              ent.data.floor = payload.floor_id;
              ent.finishCreation();
            }
            cb(err, ent);
          });
        });
      },
    });
    this.initCrawlerStateBase();
  }

  initCrawlerStateBase(): void {
    crawlerLoadData(serverFSAPI());
    this.entity_manager.on('visible_area_load', this.visibleAreaLoad.bind(this));
    this.entity_manager.on('visible_area_init', this.visibleAreaInit.bind(this));
    this.game_state = createCrawlerState({
      level_provider: this.levelProvider.bind(this),
    });
    this.script_api = this.scriptAPICreate();
    this.script_api.setWorker(this);
    this.script_api.setCrawlerState(this.game_state);
  }

  levelFallbackProvider(floor_id: number, cb: (level_data: CrawlerLevelSerialized)=> void): void {
    // Can be overridden by app
    let file = `${EXPORT_PATH || './src/client/levels/'}empty.json`;
    if (fs.existsSync(file)) {
      let data = fs.readFileSync(file, 'utf8');
      return void cb(JSON.parse(data));
    }
    let level = createLevel();
    level.alloc(16, 16);
    cb(level.serialize());
  }

  levelProviderDataStore(floor_id: number, cb: (level_data: CrawlerLevelSerialized)=> void): void {
    this.getBulkChannelData(`level${floor_id}`, null, (err?: string, data?: DataObject) => {
      if (!err && data && data.ver && data.ver === LEVEL_VERSION) {
        return cb(data.level as CrawlerLevelSerialized);
      }
      this.levelFallbackProvider(floor_id, cb);
    });
  }
  levelProvider(floor_id: number, cb: (level_data: CrawlerLevelSerialized)=> void): void {
    if (!EXPORT_PATH) {
      return this.levelProviderDataStore(floor_id, cb);
    }
    // First try on-disk
    let file = `${EXPORT_PATH}level${floor_id}.json`;
    fs.readFile(file, 'utf8', (err, data?: string) => {
      if (!err && data) {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (ex) {
          // ignored
          console.error(ex);
          console.error('Loading from datastore instead');
        }
        if (parsed && parsed.special_pos) {
          return cb(parsed as CrawlerLevelSerialized);
        }
      }
      // Nothing on disk, or disk load failed, load from data store
      this.levelProviderDataStore(floor_id, cb);
    });
  }

  levelSave(
    level: CrawlerLevel,
    floor_id: number,
    pre_serialized: CrawlerLevelSerialized | null,
    do_export: boolean
  ): void {
    let level_data = pre_serialized || level.serialize();
    // Write to data store even if exporting to disk, exporting to disk may corrupt/error, is not robust
    this.setBulkChannelData(`level${floor_id}`, {
      ver: LEVEL_VERSION,
      level: level_data,
    });
    if (EXPORT_PATH && do_export) {
      // Also export somewhere else as JSON for easy integration
      if (!fs.existsSync(EXPORT_PATH)) {
        fs.mkdirSync(EXPORT_PATH);
      }
      fs.writeFileSync(`${EXPORT_PATH}level${floor_id}.json`, JSON.stringify(level_data, undefined, 2));
    }
  }

  visibleAreaLoad(floor: number): void {
    // get the level / initialize it in the game state, even if we don't need the initial ents
    this.game_state.getLevelForFloorAsync(floor, function () {
      // nothing, just make sure it's loaded
    });
  }

  visibleAreaInit(floor: number): void {
    // get the level and initialize entities
    // TODO: race condition: entity manager might save before we get the initial entities!
    //       Maybe need a "don't save this VA" flag we can set until we're done
    //       initializing, so that the save is atomic?
    this.game_state.getLevelForFloorAsync(floor, (level: CrawlerLevel) => {
      let initial_entities = clone(level.initial_entities || []);
      assert(initial_entities);

      // alternative test: stream 2/second into entity manager
      // let idx = 0;
      // let sendNext = () => {
      //   if (idx < initial_entities.length) {
      //     initial_entities[idx].floor = floor;
      //     this.entity_manager.addEntityFromSerialized(initial_entities[idx]);
      //     idx++;
      //     setTimeout(sendNext, 500);
      //   }
      // };
      // sendNext();

      for (let ii = 0; ii < initial_entities.length; ++ii) {
        initial_entities[ii].floor = floor;
        this.entity_manager.addEntityFromSerialized(initial_entities[ii]);
      }
    });
  }

  handleClientDisconnect(src: ClientHandlerSource, opts: unknown): void {
    let is_client = src.type === 'client';
    if (is_client) {
      this.entity_manager.clientLeave(src.id);
    }
  }

  tick(dt: number, server_time: number): void {
    this.entity_manager.tick(dt, server_time);
  }

  cmdFindEnt(): Entity | undefined {
    let src = this.cmd_parse_source;
    let { id } = src;
    let client = this.entity_manager.getClient(id);
    return this.entity_manager.getEntityForClient(client);
  }
}
CrawlerWorker.prototype.maintain_client_list = true;
CrawlerWorker.prototype.maintain_subscription_ids = true;
CrawlerWorker.prototype.emit_join_leave_events = true;
CrawlerWorker.prototype.require_login = true;
CrawlerWorker.prototype.auto_destroy = true;
CrawlerWorker.prototype.overrides_constructor = false;
CrawlerWorker.prototype.permissive_client_set = true; // For keySet dummy on client, etc

entityManagerWorkerInit(CrawlerWorker);

interface DummyWorker extends CrawlerWorker<EntityCrawlerServer, DummyWorker> {
  circular: true;
}

CrawlerWorker.registerClientHandler('ent_action_list', function (
  this: DummyWorker,
  src: ClientHandlerSource,
  pak: Packet,
  resp_func: NetResponseCallback<ActionListResponse>
): void {
  this.entity_manager.handleActionList(src, pak, resp_func);
});

CrawlerWorker.registerClientHandler('get_level', function (
  this: DummyWorker,
  src: ClientHandlerSource,
  pak: Packet,
  resp_func: NetResponseCallback<CrawlerLevelSerialized>
): void {
  let floor = pak.readInt();
  this.game_state.getLevelForFloorAsync(floor, (level: CrawlerLevel) => {
    let data = level.serialize();
    resp_func(null, data);
  });
});

CrawlerWorker.registerClientHandler('build', function (
  this: DummyWorker,
  src: ClientHandlerSource,
  pak: Packet,
  resp_func: NetResponseCallback<CrawlerLevelSerialized>
): void {
  let floor = pak.readInt();
  let level = this.game_state.getLevelForFloorExisting(floor);
  let diff: Diff = pak.readJSON() as Diff;
  let level_data = level.serialize();
  this.logSrc(src, `build edit from ${src.user_id}, floor ${floor}:`, diff);
  diffApply(level_data, diff);
  level.deserialize(level_data);
  let param: BuildModeOp = {
    sub_id: this.getSubscriberId(src.channel_id) || src.channel_id,
    floor,
    diff,
  };
  this.channelEmit('build_op', param);
  this.levelSave(level, floor, level_data, true);
  resp_func();
});

CrawlerWorker.registerCmds([{
  cmd: 'floor_reset_worker',
  access_show: ['hidden'],
  func: function (this: DummyWorker, data: string, resp_func: ErrorCallback<string>): void {
    let ent = this.cmdFindEnt();
    if (!ent) {
      return void resp_func('Could not find relevant entity');
    }
    let floor = ent.data.floor;
    let level = this.game_state.getLevelForFloorExisting(floor);
    level.resetState();
    this.levelSave(level, floor, null, false);
    this.entity_manager.visibleAreaReset(ent.data.floor, resp_func);
  },
}, {
  cmd: 'spawn_worker',
  access_show: ['hidden'],
  func: function (this: DummyWorker, str: string, resp_func: CmdRespFunc) {
    let ent = this.cmdFindEnt();
    if (!ent) {
      return void resp_func('Could not find relevant entity');
    }
    let my_pos = ent.getData<JSVec3>('pos')!;
    let ent_data = {
      type: str || 'enemy0',
      floor: ent.data.floor,
      pos: [my_pos[0] + DX[my_pos[2]], my_pos[1] + DY[my_pos[2]], 0],
    };
    this.entity_manager.addEntityFromSerialized(ent_data);

    resp_func();
  }
}, {
  cmd: 'key_global',
  help: 'Show or toggle per-worker-scoped keys',
  func: function (this: DummyWorker, str: string, resp_func: CmdRespFunc) {
    if (!str) {
      let keys = Object.keys(this.getChannelData('public.keys', {}));
      return void resp_func(null, `Global keys = ${keys.join()}`);
    }

    if (str.includes('.')) {
      return void resp_func('Invalid key');
    }

    let key = `public.keys.${str}`;
    let old = this.getChannelData(key, false);
    this.setChannelData(key, old ? undefined : true);
    return void resp_func(null, `Global key "${str}" ${old ? 'cleared' : 'set'}`);
  },
}]);

// Note: ONLY call this if not extending CrawlerWorker
export function crawlerWorkerInit(channel_server: ChannelServer): void {

  CrawlerWorker.registerClientHandler('ent_join', function (
    this: DummyWorker,
    src: ClientHandlerSource,
    payload: CrawlerJoinPayload,
    resp_func: NetResponseCallback
  ): void {
    let { user_id } = src;
    assert(user_id);
    this.entity_manager.clientJoin(src, user_id, payload);
    resp_func();
  });

  chattableWorkerInit(CrawlerWorker);

  channel_server.registerChannelWorker('crawl', CrawlerWorker, {
    autocreate: true,
    subid_regex: /^build$/,
  });
  crawlerEntityTraitsServerStartup({});
}
