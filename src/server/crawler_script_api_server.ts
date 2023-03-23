import {
  mashString,
  randCreate,
} from 'glov/common/rand_alea';
import {
  ROVec2,
  v2copy,
} from 'glov/common/vmath';
import { ChannelWorker } from 'glov/server/channel_worker';
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
import { EntityCrawlerServer } from './crawler_entity_server';

export type CrawlerScriptAPIServer = CrawlerScriptAPIServerImpl;
export class CrawlerScriptAPIServerImpl implements CrawlerScriptAPI {
  rand = randCreate();
  private need_reseed: boolean = false;
  game_state!: CrawlerState;
  setCrawlerState(game_state: CrawlerState): void {
    this.game_state = game_state;
    this.need_reseed = true;
  }
  level!: CrawlerLevel;
  setLevel(level: CrawlerLevel): void {
    this.level = level;
    this.need_reseed = true;
  }
  pos: [number, number] = [0,0];
  setPos(pos: ROVec2): void {
    v2copy(this.pos, pos);
    this.need_reseed = true;
  }
  worker!: ChannelWorker;
  setWorker(worker: ChannelWorker): void {
    this.worker = worker;
  }
  ent!: EntityCrawlerServer;
  setEnt(ent: EntityCrawlerServer): void {
    this.ent = ent;
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
    // No-op on server
  }
  getRand(): RandProvider {
    if (this.need_reseed) {
      this.need_reseed = false;
      this.rand.reseed(mashString(`${this.level.seed};${this.pos}`)); // TODO: mash in a step counter?
    }
    return this.rand;
  }
  keyClear(key: string): void {
    let key_str = `public.keys.${key}`;
    if (this.worker.getChannelData(key_str, false)) {
      this.worker.setChannelData(key_str, undefined);
    }
  }
  keySet(key: string): void {
    let key_str = `public.keys.${key}`;
    if (!this.worker.getChannelData(key_str, false)) {
      this.worker.setChannelData(key_str, true);
    }
  }
  keyGet(key: string): boolean {
    let key_str = `public.keys.${key}`;
    return this.worker.getChannelData(key_str, false);
  }

  floorDelta(delta: number, pos_key: string): void {
    // Nothing: client handles this currently
  }

  floorAbsolute(floor_id: number, x: number, y: number, rot?: DirType): void {
    // Nothing: client handles this currently
  }

  startPit(floor_id: number, pos_key?: string, pos_pair?: [number, number, DirType]): void {
    // Nothing: client handles this currently
  }

  forceMove(dir: DirType): void {
    // Nothing: client handles this currently
  }

  getFloor(): number {
    return this.game_state.levels.indexOf(this.level);
  }
}

export function crawlerScriptAPIServerCreate(): CrawlerScriptAPIServer {
  return new CrawlerScriptAPIServerImpl();
}
