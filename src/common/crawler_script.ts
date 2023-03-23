import assert from 'assert';
import { WithRequired } from 'glov/common/types';
import { ROVec2 } from 'glov/common/vmath';
import {
  CellDesc,
  CrawlerCell,
  CrawlerCellEvent,
  CrawlerLevel,
  DIR_CELL,
  DirType,
  DirTypeOrCell,
  WallDesc,
} from './crawler_state';

const { max } = Math;

export type RandProvider = {
  random(): number;
  range(max: number): number;
};

export type CrawlerScriptAPI = {
  keyClear(key: string): void;
  keySet(key: string): void;
  keyGet(key: string): boolean;
  status(key: string, message: string): void;
  getRand(): RandProvider;
  getFloor(): number;
  floorDelta(delta: number, pos_key: string): void;
  floorAbsolute(floor_id: number, x: number, y: number, rot?: DirType): void;
  startPit(floor_id: number, pos_key?: string, pos_pair?: [number, number, DirType]): void;
  forceMove(dir: DirType): void;
  getCellRelative(dir?: DirTypeOrCell): CrawlerCell | null;

  // Not for use in scripts, just for setup
  setLevel(level: CrawlerLevel): void;
  setPos(pos: ROVec2): void;
};


export type CrawlerScriptFunc<T extends CrawlerScriptAPI> = (ctx: T, cell: CrawlerCell, dir: DirTypeOrCell) => boolean;

let script_funcs: Partial<Record<string, CrawlerScriptFunc<CrawlerScriptAPI>>> = {};
export function crawlerScriptRegisterFunc<T extends CrawlerScriptAPI>(key: string, func: CrawlerScriptFunc<T>): void {
  assert(!script_funcs[key]);
  script_funcs[key] = func as CrawlerScriptFunc<CrawlerScriptAPI>;
}

export function getEffCell<T extends CrawlerScriptAPI>(ctx: T, cell: CrawlerCell): CellDesc {
  let cell_desc = cell.desc;
  let replace = cell_desc.replace;
  if (replace) {
    for (let ii = 0; ii < replace.length; ++ii) {
      let { func } = replace[ii];
      let fn = script_funcs[func];
      if (!fn) {
        assert(false, `Unknown replace func "${func}" on "${cell_desc.id}"`);
      }
      if (fn(ctx, cell, DIR_CELL)) {
        return replace[ii].desc;
      }
    }
  }
  return cell_desc;
}

export function getEffWall<T extends CrawlerScriptAPI>(ctx: T, cell: CrawlerCell, dir: DirType): WallDesc {
  let wall_desc = cell.walls[dir];
  let replace = wall_desc.replace;
  if (replace) {
    for (let ii = 0; ii < replace.length; ++ii) {
      let { func } = replace[ii];
      let fn = script_funcs[func];
      if (!fn) {
        assert(false, `Unknown replace func "${func}" on "${wall_desc.id}"`);
      }
      if (fn(ctx, cell, dir)) {
        return replace[ii].desc;
      }
    }
  }
  return wall_desc;
}

export enum CrawlerScriptWhen {
  PRE,
  POST,
}
export enum CrawlerScriptEventMapIcon {
  NONE=0,
  QUESTION=27,
  EXCLAIMATION=28,
}

export type CrawlerScriptEvent = (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => void;
export type CrawlerScriptEventInfo = {
  key: string;
  func: CrawlerScriptEvent;
  when: CrawlerScriptWhen; // Default = PRE
  map_icon: CrawlerScriptEventMapIcon; // Default = NONE
};
export type CrawlerScriptEventInfoParam = WithRequired<Partial<CrawlerScriptEventInfo>, 'key' | 'func'>;
let event_funcs: Partial<Record<string, CrawlerScriptEventInfo>> = {};
export function crawlerScriptRegisterEvent(param: CrawlerScriptEventInfoParam): void {
  let { key } = param;
  let info: CrawlerScriptEventInfo = {
    key,
    func: param.func,
    when: param.when || CrawlerScriptWhen.PRE,
    map_icon: param.map_icon || CrawlerScriptEventMapIcon.NONE,
  };
  assert(!event_funcs[key]);
  event_funcs[key] = info;
}
export function crawlerScriptListEvents(): string[] {
  return Object.keys(event_funcs);
}

export function crawlerScriptRunEvents(
  api: CrawlerScriptAPI,
  cell: CrawlerCell,
  when: CrawlerScriptWhen,
): void {
  let { events } = cell;
  assert(events && events.length);
  for (let ii = 0; ii < events.length; ++ii) {
    let event = events[ii];
    let { id, param } = event;
    let info = event_funcs[id];
    assert(info, `No event "${id}" registered`);
    if (info.when === when) {
      info.func(api, cell, param);
    }
  }
}

export function crawlerScriptEventsGetIcon(events: CrawlerCellEvent[]): CrawlerScriptEventMapIcon {
  let ret = CrawlerScriptEventMapIcon.NONE;
  for (let ii = 0; ii < events.length; ++ii) {
    let event = events[ii];
    let { id } = event;
    if (event_funcs[id]) {
      ret = max(ret, event_funcs[id]!.map_icon);
    }
  }
  return ret;
}
