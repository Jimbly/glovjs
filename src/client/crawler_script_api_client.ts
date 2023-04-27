import assert from 'assert';
import {
  mashString,
  randCreate,
} from 'glov/common/rand_alea';
import { isInteger } from 'glov/common/util';
import {
  ROVec2,
  v2copy,
} from 'glov/common/vmath';
import {
  CrawlerScriptAPI,
  RandProvider,
} from '../common/crawler_script';
import {
  CrawlerCell,
  CrawlerLevel,
  CrawlerState,
  DIR_CELL,
  DX,
  DY,
  DirType,
  DirTypeOrCell,
} from '../common/crawler_state';
import { crawlerRoom } from './crawler_comm';
import { CrawlerController } from './crawler_controller';
import {
  OnlineMode,
  crawlerMyEnt,
} from './crawler_entity_client';
import { dialog } from './dialog_system';
import { statusSet } from './status';

export type CrawlerScriptLocalData = {
  keys?: string[];
};

export interface CrawlerScriptAPIClient extends CrawlerScriptAPI {
  setCrawlerState(game_state: CrawlerState): void;
  setController(controller: CrawlerController): void;
  predictionClear(): void;
  is_visited: boolean; // for stashing some state in map_view

  localDataSet(data: CrawlerScriptLocalData): void;
  localDataGet(): CrawlerScriptLocalData;

  pos: [number, number];
}

class CrawlerScriptAPIClientBase {
  game_state!: CrawlerState;
  controller!: CrawlerController;
  level!: CrawlerLevel;
  pos: [number, number] = [0,0];
  rand = randCreate();
  private need_reseed: boolean = false;
  predicted_keys: Partial<Record<string, boolean>> = {};
  is_visited = false;
  predictionClear(): void {
    this.predicted_keys = {};
  }
  setCrawlerState(game_state: CrawlerState): void {
    this.game_state = game_state;
    this.need_reseed = true;
    this.predictionClear();
  }
  setController(controller: CrawlerController): void {
    this.controller = controller;
  }
  setLevel(level: CrawlerLevel): void {
    this.level = level;
    this.need_reseed = true;
  }
  setPos(pos: ROVec2): void {
    assert(isInteger(pos[0]));
    assert(isInteger(pos[1]));
    v2copy(this.pos, pos);
    this.need_reseed = true;
  }
  getCellRelative(dir?: DirTypeOrCell): CrawlerCell | null {
    let [x, y] = this.pos;
    if (dir !== undefined && dir !== DIR_CELL) {
      x += DX[dir];
      y += DY[dir];
    }
    return this.level.getCell(x, y);
  }
  status(key: string, message: string): void {
    statusSet(key, message);
  }
  dialog(key: string, param?: string): void {
    dialog(key, param);
  }
  getRand(): RandProvider {
    if (this.need_reseed) {
      this.need_reseed = false;
      this.rand.reseed(mashString(`${this.level.seed};${this.pos}`)); // TODO: mash in a step counter?
    }
    return this.rand;
  }
  floorDelta(delta: number, pos_key: string, keep_rot: boolean): void {
    this.controller.floorDelta(delta, pos_key, keep_rot);
  }

  floorAbsolute(floor_id: number, x: number, y: number, rot?: DirType): void {
    this.controller.floorAbsolute(floor_id, x, y, rot);
  }

  startPit(floor_id: number, pos_key?: string, pos_pair?: [number, number, DirType]): void {
    this.controller.fallThroughPit(floor_id, pos_key, pos_pair);
  }

  forceMove(dir: DirType): void {
    this.controller.forceMove(dir);
  }

  getFloor(): number {
    return this.game_state.levels.indexOf(this.level);
  }
}

class CrawlerScriptAPIClientNetwork extends CrawlerScriptAPIClientBase implements CrawlerScriptAPIClient {
  keyClear(key: string): void {
    // TODO
    // this.predicted_keys[key] = false;
  }
  keySet(key: string): void {
    // TODO
    // this.predicted_keys[key] = true;
  }
  keyGet(key: string): boolean {
    let predicted = this.predicted_keys[key];
    if (predicted !== undefined) {
      return predicted;
    }
    if (key.startsWith('u:')) {
      return Boolean(crawlerMyEnt().getData<Record<string, boolean>>('keys', {})[key.slice(2)]);
    } else {
      let room = crawlerRoom();
      assert(room);
      return room.getChannelData(`public.keys.${key}`, false);
    }
  }

  localDataSet(data: CrawlerScriptLocalData): void {
    assert(false, 'Offline only');
  }
  localDataGet(): CrawlerScriptLocalData {
    assert(false, 'Offline only');
  }
}

class CrawlerScriptAPIClientNetworkDummy extends CrawlerScriptAPIClientNetwork {
  keyClear(key: string): void {
    let room = crawlerRoom();
    assert(room);
    room.setChannelData(`public.keys.${key}`, undefined);
  }
  keySet(key: string): void {
    assert(!key.startsWith('u:'), 'User-scoped keys not supported');
    let room = crawlerRoom();
    assert(room);
    room.setChannelData(`public.keys.${key}`, true);
  }
}

class CrawlerScriptAPIClientLocal extends CrawlerScriptAPIClientBase implements CrawlerScriptAPIClient {
  keyClear(key: string): void {
    this.predicted_keys[key] = false;
  }
  keySet(key: string): void {
    this.predicted_keys[key] = true;
  }
  keyGet(key: string): boolean {
    return this.predicted_keys[key] || false;
  }
  localDataSet(data: CrawlerScriptLocalData): void {
    this.predicted_keys = {};
    if (data.keys) {
      for (let ii = 0; ii < data.keys.length; ++ii) {
        this.predicted_keys[data.keys[ii]] = true;
      }
    }
  }
  localDataGet(): CrawlerScriptLocalData {
    let keys = [];
    for (let key in this.predicted_keys) {
      if (this.predicted_keys[key]) {
        keys.push(key);
      }
    }
    return {
      keys,
    };
  }
}

let dummy_server = false;
export function crawlerScriptAPIDummyServer(is_dummy: boolean): void {
  dummy_server = is_dummy;
}

export function crawlerScriptAPIClientCreate(online_mode: OnlineMode): CrawlerScriptAPIClient {
  if (online_mode === OnlineMode.ONLINE_ONLY) {
    if (dummy_server) {
      return new CrawlerScriptAPIClientNetworkDummy();
    } else {
      return new CrawlerScriptAPIClientNetwork();
    }
  } else {
    return new CrawlerScriptAPIClientLocal();
  }
}
