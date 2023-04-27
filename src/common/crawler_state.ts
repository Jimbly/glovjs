export const BLOCK_OPEN = 0;
export const BLOCK_MOVE = 1;
export const BLOCK_VIS = 2;
export type BlockType = typeof BLOCK_OPEN | typeof BLOCK_MOVE | typeof BLOCK_VIS;

export type VisualOpts = { _opaque: 'visualopts' };
type CrawlerVisual = {
  pass: string; // defaults to 'default'
  type: string;
  opts?: VisualOpts; // some type-specific opts
};
type CrawlerVisualsInput = CrawlerVisual | CrawlerVisual[];
type CrawlerVisuals = Partial<Record<string, CrawlerVisual[]>>;

const CORNER_DETAIL_TYPES = {
  one: true,
  two: true,
  three: true,
  four: true,
};
type CornerDetailType = keyof typeof CORNER_DETAIL_TYPES;

export type DescReplacement<T> = {
  func: string;
  name: string;
  desc: T;
};

export type WallDesc = {
  id: string;
  ascii_char?: string;
  open_vis: boolean;
  open_move: boolean;
  advertise_other_side: boolean;
  sound_id?: string;
  build_hide?: boolean;
  is_secret?: boolean; // Not allowed for pathfinding, not shown on map, until traversed
  map_view_wall_frame_north?: number;
  map_view_wall_frame_east?: number;
  map_view_wall_frame_south?: number; // defaults to north's value if unspecified
  map_view_wall_frame_west?: number; // defaults to east's value if unspecified
  map_view_wall_frame_priority: number; // For resolving a north and south abutting wall mismatch; default 0
  map_view_wall_frames_from?: string;
  visuals?: CrawlerVisualsInput;
  visuals_runtime: CrawlerVisuals;
  swapped: WallDesc; // or references itself
  replace?: DescReplacement<WallDesc>[];
};
export type WallDescs = Partial<Record<string, WallDesc>> & { open: WallDesc };
export type CellDesc = {
  id: string;
  ascii_char?: string;
  open_move: boolean;
  open_vis: boolean;
  advertised_wall?: string; // This indicates a special door coming into it, but also that it's a special "zone"
  advertised_wall_desc?: WallDesc;
  sound_id?: string | null; // for footsteps / play upon player enter; default 'footstep'
  default_wall?: string;
  default_wall_desc: WallDesc;
  default_spawn?: string;
  default_props?: string[];
  default_events?: string[];
  special_pos?: string;
  map_view_detail_frame?: number;
  map_view_detail_frame_visited?: number;
  blocks_pathing_if_visited?: boolean;
  build_hide?: boolean;
  auto_evict?: boolean;
  debug_msg?: string;
  code?: string;
  // Load-time: CrawlerVisaul | CrawlerVisual[] (with passes specified)
  visuals?: CrawlerVisualsInput;
  visuals_visited?: CrawlerVisualsInput;
  // Run-time: pass -> CrawlerVisual[]
  visuals_runtime: CrawlerVisuals;
  visuals_visited_runtime: CrawlerVisuals;
  // Load-time: one-four -> CrawlerVisaul | CrawlerVisual[] (with passes specified)
  corners?: null | Partial<Record<CornerDetailType, CrawlerVisualsInput>>;
  // Runtime: pass -> one-four -> CrawlerVisual[]
  corners_runtime: Partial<Record<string, Record<CornerDetailType, CrawlerVisual[]>>>;

  swapped: CellDesc; // or references itself
  replace?: DescReplacement<CellDesc>[];
};
export type CellDescs = Partial<Record<string, CellDesc>> & { open: CellDesc };
export type VstyleDesc = {
  id: string;
  cell_swaps: Partial<Record<string, string>>;
  wall_swaps: Partial<Record<string, string>>;
  fog_params: Vec3;
  fog_color: Vec3;
  background_color: Vec3;
  background_img?: string;
};
export type VstyleDescs = Partial<Record<string, VstyleDesc>>;
export type CrawlerStateParams = {
  level_provider: (floor_id: number, cb: LevelSerCB) => void;
};

export const DX = [1,0,-1,0];
export const DY = [0,1,0,-1];
export const EAST = 0;
export const NORTH = 1;
export const WEST = 2;
export const SOUTH = 3;
export const DIR_CELL = 4;
export type DirType = typeof EAST | typeof NORTH | typeof WEST | typeof SOUTH;
export type DirTypeOrCell = DirType | typeof DIR_CELL;
export const VIS_SEEN = 1;
export const VIS_PASSED_EAST = 2;
export const VIS_PASSED_NORTH = 4;
export const VIS_VISITED = 8;

import assert from 'assert';
import { base64CharTable } from 'glov/common/base64';
import { dataError } from 'glov/common/data_error';
import { FSAPI, fileBaseName } from 'glov/common/fsapi';
import { DataObject } from 'glov/common/types';
import { callEach, clone, empty, ridx } from 'glov/common/util';
import {
  ROVec2,
  Vec2,
  Vec3,
  v2set,
  vec2,
  vec3,
} from 'glov/common/vmath';
import { CrawlerScriptAPI, getEffCell, getEffWall } from './crawler_script';

export type JSVec2 = [number, number];
export type JSVec3 = [number, number, number];
export type JSVec4 = [number, number, number, number];

let descs: {
  wall: WallDescs;
  cell: CellDescs;
  ascii_lookup: {
    wall: Partial<Record<string, WallDesc>>;
    cell: Partial<Record<string, CellDesc>>;
  };
  vstyle: VstyleDescs;
};

export const DXY = [vec2(DX[0],DY[0]), vec2(DX[1],DY[1]), vec2(DX[2],DY[2]), vec2(DX[3],DY[3])];

export function getWallDescs(): WallDescs {
  return descs.wall;
}
export function getCellDescs(): CellDescs {
  return descs.cell;
}
export function getVstyles(): VstyleDescs {
  return descs.vstyle;
}

export function dirFromDelta(delta: Vec2): DirType {
  if (delta[0] === 1) {
    return EAST;
  } else if (delta[1] === 1) {
    return NORTH;
  } else if (delta[0] === -1) {
    return WEST;
  } else {
    return SOUTH;
  }
}

export function dirMod(v: number): DirType {
  return v % 4 as DirType;
}

let last_vstyle: VstyleDesc | null = null;
function crawlerApplyVstyle(vstyle: VstyleDesc): void {
  last_vstyle = vstyle;
  let { cell_swaps, wall_swaps } = vstyle;
  for (let key in descs.wall) {
    let wall_desc = descs.wall[key]!;
    let swapped = descs.wall[wall_swaps[key] || key];
    assert(swapped);
    wall_desc.swapped = swapped;
  }
  for (let key in descs.cell) {
    let cell_desc = descs.cell[key]!;
    let swapped = descs.cell[cell_swaps[key] || key];
    assert(swapped);
    cell_desc.swapped = swapped;
  }
}

let inv_base64_char_table = (function () {
  let ret: Record<string, number> = {};
  for (let ii = 0; ii < base64CharTable.length; ++ii) {
    ret[base64CharTable[ii]] = ii;
  }
  return ret;
}());

type FloorOverlayType = 'both' | 'bottom' | 'left' | 'diag';
function floorOverlayCorner(
  level: CrawlerLevel,
  x: number,
  y: number,
  cell: CrawlerCell,
  idx: DirType,
): FloorOverlayType | undefined {
  let style: FloorOverlayType | undefined;
  let idx2 = (idx + 1) % 4;
  idx = ((idx + 2) % 4) as DirType;
  if (!cell.walls[idx].open_vis) {
    if (!cell.walls[idx2].open_vis) {
      style = 'both';
    } else {
      style = 'bottom';
    }
  } else if (!cell.walls[idx2].open_vis) {
    style = 'left';
  } else {
    // we have no walls - do either of these two neighbors have the respective walls?
    // Only need to check one neighbor - shouldn't ever be just one!
    let nx = x + DX[idx2];
    let ny = y + DY[idx2];
    let ncell = level.getCell(nx, ny);
    if (ncell && !ncell.walls[idx].open_vis) {
      style = 'diag';
    }
  }
  return style;
}

function cornerDetailType(
  level: CrawlerLevel,
  x: number,
  y: number,
  cell: CrawlerCell,
  idx: number,
): CornerDetailType | null {
  let ncell = level.getCell(x+1, y+1);
  if (idx === 0 && cell.walls[0].open_vis && cell.walls[1].open_vis &&
    ncell && ncell.walls[2].open_vis && ncell.walls[3].open_vis
  ) {
    return 'four';
  }
  if (cell.walls[idx].open_vis) {
    return null;
  }
  let idx2 = (idx + 1) % 4;
  if (!cell.walls[idx2].open_vis) {
    return 'one';
  }
  // we're empty, check parallel wall in next cell
  ncell = level.getCell(x + DX[idx2], y + DY[idx2]);
  if (ncell && !ncell.walls[idx].open_vis) {
    return 'two';
  }
  // that's empty, check diagonal cell, wall around corner
  ncell = level.getCell(x + DX[idx] + DX[idx2], y + DY[idx] + DY[idx2]);
  if (ncell && !ncell.walls[(idx + 3) % 4].open_vis) {
    return 'three';
  }
  return 'four';
}

function wallFromChar(c: string): WallDesc {
  return descs.ascii_lookup.wall[c] || descs.wall.open;
}

function cellFromChar(c: string): CellDesc {
  return descs.ascii_lookup.cell[c] || descs.cell.open;
}

function charFromCell(cell_desc: CellDesc): string {
  return cell_desc.ascii_char || ' ';
}

export type CrawlerCellPropValue = string; // | number | boolean;
export type CrawlerCellProps = Partial<Record<string, CrawlerCellPropValue>>;


export type CrawlerCellEvent = {
  id: string;
  param: string;
};

export type CrawlerCellSerialized = {
  id: string;
  walls: [string, string, string, string];
  events?: CrawlerCellEvent[];
  props?: CrawlerCellProps;
};

function getID(desc: WallDesc | CellDesc): string {
  return desc.id;
}

const wall_key = {
  [NORTH]: 'key_north',
  [SOUTH]: 'key_south',
  [EAST]: 'key_east',
  [WEST]: 'key_west',
  [DIR_CELL]: 'key_cell',
} as const;

export class CrawlerCell {
  desc: CellDesc = descs.cell.open;
  walls: [WallDesc, WallDesc, WallDesc, WallDesc] = [
    descs.wall.open, // EAST
    descs.wall.open, // up
    descs.wall.open, // left
    descs.wall.open, // down
  ];
  events?: CrawlerCellEvent[];
  props?: CrawlerCellProps;
  //style = 0;
  corner_pos: [Vec2, Vec2, Vec2, Vec2];
  // results of visibility calculations
  visible_frame = 0;
  visible_adjacent_frame = 0;
  visible_bits = 0;
  floor_corners?: (FloorOverlayType | undefined)[];
  corner_details?: (CornerDetailType | null)[];
  x: number;
  y: number;

  constructor(xx: number, yy: number) {
    this.x = xx;
    this.y = yy;
    this.corner_pos = [
      vec2(xx + 1, yy + 0),
      vec2(xx + 1, yy + 1),
      vec2(xx + 0, yy + 1),
      vec2(xx + 0, yy + 0),
    ];
  }

  isVisited(): boolean {
    return Boolean(this.visible_bits & VIS_VISITED);
  }

  isVisiblePit(): boolean {
    return (this.desc.blocks_pathing_if_visited || false) && this.isVisited();
  }

  serialize(): CrawlerCellSerialized {
    let ret: CrawlerCellSerialized = {
      id: this.desc.id,
      walls: this.walls.map(getID) as [string, string, string, string],
    };
    if (this.props) {
      ret.props = this.props;
    }
    if (this.events) {
      ret.events = this.events;
    }
    return ret;
  }

  deserialize(data: CrawlerCellSerialized): void {
    let desc = descs.cell[data.id];
    assert(desc);
    this.desc = desc;
    for (let ii = 0; ii < 4; ++ii) {
      let wdesc = descs.wall[data.walls[ii]];
      if (!wdesc) {
        dataError(`Reference to unknown wall_desc "${data.walls[ii]}"`);
        wdesc = descs.wall.solid;
      }
      assert(wdesc);
      this.walls[ii] = wdesc;
    }
    this.props = data.props;
    this.events = data.events;
  }

  setProp(key: string, value: CrawlerCellPropValue | undefined): void {
    if (value === undefined) {
      if (this.props) {
        delete this.props[key];
        if (empty(this.props)) {
          delete this.props;
        }
      }
    } else {
      if (!this.props) {
        this.props = {};
      }
      this.props[key] = value;
    }
  }
  getProp(key: string): CrawlerCellPropValue | undefined {
    return this.props && this.props[key];
  }

  addEvent(id: string, param: string): void {
    this.events = this.events || [];
    this.events.push({ id, param });
  }

  getKeyNameForWall(dir: DirTypeOrCell): string | null {
    return this.getProp(wall_key[dir]) as string || null;
  }
}

function serializeCell(cell: CrawlerCell): CrawlerCellSerialized {
  return cell.serialize();
}

let dummy_cell: CrawlerCell;
let identity_vstyle: VstyleDesc = {
  id: '',
  cell_swaps: {},
  wall_swaps: {},
  fog_params: vec3(0.003, 0.001, 800.0),
  background_color: vec3(0,0,0),
  fog_color: vec3(0,0,0),
};

export type CrawlerLevelState = {
  // Nothing for now, may want this later, though?
};

export type CrawlerLevelPaths = Record<string, DirType[]>; // `x,y` -> dir[]

export type CrawlerLevelSerialized = {
  special_pos: Partial<Record<string, JSVec3>>;
  w: number;
  h: number;
  cells: CrawlerCellSerialized[];
  initial_entities?: DataObject[];
  initial_state?: CrawlerLevelState;
  state?: CrawlerLevelState;
  vstyle: string;
  seed: string;
  props?: CrawlerCellProps;
  paths?: CrawlerLevelPaths;
};

export class CrawlerLevel {
  special_pos: Partial<Record<string, JSVec3>> & {
    stairs_in: JSVec3;
    stairs_out: JSVec3;
  } = {
    stairs_in: [1,1,2],
    stairs_out: [1,1,2],
  };
  seen_cells = 0;
  total_cells = 0;
  connected = false;
  gen_data: unknown = null; // private level generator data
  w = 0;
  h = 0;
  cells!: CrawlerCell[];
  initial_entities?: DataObject[];
  initial_state?: CrawlerLevelState;
  state: CrawlerLevelState = {};
  props: CrawlerCellProps = {};
  paths: CrawlerLevelPaths = {};
  default_open_cell = descs.cell.open;
  vstyle: VstyleDesc = identity_vstyle;
  seed: string = 'dummyseed';
  // constructor() {
  // }


  getVisString(): string {
    // Simple RLE
    let str = [];
    let v = 0;
    let c = 0;
    let { cells } = this;
    for (let ii = 0; ii < cells.length; ++ii) {
      let nextv = cells[ii].visible_bits;
      if (c && nextv !== v || c === 64) {
        str.push(base64CharTable[v]);
        str.push(base64CharTable[c-1]);
        c = 0;
        v = nextv;
      }
      c++;
    }
    str.push(base64CharTable[v]);
    str.push(base64CharTable[c-1]);
    return str.join('');
  }

  applyVisString(str: string): void {
    assert.equal(str.length % 2, 0);
    let cell_idx = 0;
    let str_idx = 0;
    let { cells } = this;
    while (cell_idx < cells.length && str_idx < str.length) {
      let v = inv_base64_char_table[str[str_idx++]];
      let c = inv_base64_char_table[str[str_idx++]] + 1;
      if (v) {
        while (c && cell_idx < cells.length) {
          if (!cells[cell_idx].visible_bits) {
            this.seen_cells++;
          }
          cells[cell_idx++].visible_bits |= v;
          --c;
        }
      } else {
        cell_idx += c;
      }
    }
  }

  alloc(w: number, h: number): void {
    this.w = w;
    this.h = h;
    let cells = this.cells = new Array(w * h);
    // Allocate cell basics
    for (let yy = 0; yy < h; ++yy) {
      for (let xx = 0; xx < w; ++xx) {
        cells[yy*w + xx] = new CrawlerCell(xx, yy);
      }
    }
    this.seed = `${Math.random()}`.slice(-8);
  }

  setVstyle(id: string): void {
    let vstyle_desc = descs.vstyle[id || 'default'];
    assert(vstyle_desc);
    this.vstyle = vstyle_desc;
  }

  resetState(): void {
    this.state = clone(this.initial_state || {});
  }

  // Assumes all walls are symmetrical
  fillFromHVWalls(hwalls: WallDesc[], vwalls: WallDesc[]): void {
    // Fill walls
    let { w, h, cells } = this;
    for (let yy = 0; yy < h; ++yy) {
      for (let xx = 0; xx < w; ++xx) {
        let cell = cells[yy*w + xx];
        let { walls } = cell;

        walls[EAST] = vwalls[(xx+1)*h + yy];
        walls[NORTH] = hwalls[(yy+1)*w + xx];
        walls[WEST] = vwalls[xx*h + yy];
        walls[SOUTH] = hwalls[yy*w + xx];

        let neighbors = this.getNeighbors(xx, yy);

        for (let ii = 0; ii < 4; ++ii) {
          let wall = walls[ii];
          if (wall.advertise_other_side) {
            let other_side = neighbors[ii].desc;
            if (other_side.advertised_wall_desc) {
              walls[ii] = other_side.advertised_wall_desc;
            }
          }
        }
      }
    }
  }

  setWall(x: number, y: number, dir: DirType, wall: WallDesc, invwall?: WallDesc | null): void {
    let cell = this.getCell(x, y);
    assert(cell);
    cell.walls[dir] = wall;
    let neighbor = this.getCell(x + DX[dir], y + DY[dir]);
    let nwall = dirMod(dir + 2);
    if (neighbor && invwall !== null) {
      neighbor.walls[nwall] = invwall || wall;
    }
  }

  setCell(x: number, y: number, cell_desc: CellDesc): void {
    let cell = this.getCell(x, y);
    assert(cell);
    let neighbors = this.getNeighbors(x, y);
    let is_solid = !cell_desc.open_vis;
    if (is_solid !== !cell.desc.open_vis) {
      for (let ii = 0 as DirType; ii < 4; ++ii) {
        let want: WallDesc;
        if (is_solid) { // was open
          if (!neighbors[ii].desc.open_vis) {
            want = descs.wall.open;
          } else {
            want = cell_desc.default_wall_desc;
          }
        } else { // was solid
          if (cell.walls[ii].open_vis) {
            want = cell_desc.default_wall_desc;
          } else {
            // Any other solid wall variety, leave alone
            continue;
          }
        }
        if (cell.walls[ii] !== want) {
          this.setWall(x, y, ii, want);
        }
      }
    }
    cell.desc = cell_desc;
  }

  finalize(): void {
    let { w, h, cells } = this;
    let total_cells = 0;
    for (let yy = 0; yy < h; ++yy) {
      for (let xx = 0; xx < w; ++xx) {
        let floor_corners: (FloorOverlayType | undefined)[] = [];
        let corner_details: (CornerDetailType | null)[] = [];
        let cell = cells[yy*w + xx];
        if (!cell.desc.open_vis) {
          continue;
        }
        ++total_cells;
        for (let ii = 0 as DirType; ii < 4; ++ii) {
          floor_corners.push(floorOverlayCorner(this, xx, yy, cell, ii));
          corner_details.push(cornerDetailType(this, xx, yy, cell, ii));
        }
        cell.floor_corners = floor_corners;
        cell.corner_details = corner_details;
      }
    }
    this.total_cells = total_cells;
    // console.log(this.toDebugString());
  }

  wallsBlock(pos: ROVec2, dir: DirType, script_api: CrawlerScriptAPI): BlockType {
    let cur_cell = this.getCell(pos[0], pos[1]);
    let ret = BLOCK_OPEN; // 0
    if (cur_cell) {
      let wall_desc = getEffWall(script_api, cur_cell, dir);
      if (!wall_desc.open_move) {
        ret |= BLOCK_MOVE;
      } else {
        let neighbor_cell = this.getCell(pos[0] + DX[dir], pos[1] + DY[dir]);
        if (neighbor_cell) {
          let cell_desc = getEffCell(script_api, neighbor_cell);
          if (!cell_desc.open_move) {
            ret |= BLOCK_MOVE;
          }
        }
      }
      if (!wall_desc.open_vis) { // e.g. doors
        ret |= BLOCK_VIS;
      }
    }
    return ret as BlockType;
  }

  fromASCII(source: string[]): void {
    source = source.slice(0).reverse();

    let w = (source[0].length - 1) /2;
    let h = (source.length - 1) / 2;
    this.alloc(w, h);
    let { cells } = this;
    let initial_entities: DataObject[] = this.initial_entities = [];
    // Allocate cell basics
    for (let yy = 0; yy < h; ++yy) {
      for (let xx = 0; xx < w; ++xx) {
        let c = source[yy*2 + 1][xx*2 + 1];
        let cell_desc = cellFromChar(c);
        if (cell_desc.special_pos) {
          let v = this.special_pos[cell_desc.special_pos];
          if (!v) {
            v = this.special_pos[cell_desc.special_pos] = [0,0,0];
          }
          v2set(v, xx, yy);
        }
        cells[yy*w + xx].desc = cell_desc;
        if (c === 'e') {
          initial_entities.push({
            type: 'enemy0',
            pos: [xx,yy],
          });
        }
      }
    }
    let hwalls = new Array(w * (h + 1));
    for (let yy = 0; yy <= h; ++yy) {
      for (let xx = 0; xx < w; ++xx) {
        let c = source[yy*2][xx*2 + 1];
        hwalls[yy*w + xx] = wallFromChar(c);
      }
    }
    let vwalls = new Array((w + 1) * h);
    for (let yy = 0; yy < h; ++yy) {
      for (let xx = 0; xx <= w; ++xx) {
        let c = source[yy*2 + 1][xx*2];
        vwalls[xx*h + yy] = wallFromChar(c);
      }
    }

    this.fillFromHVWalls(hwalls, vwalls);
    this.connected = true;
  }

  serialize(opts?: {
    reserved?: boolean;
  }): CrawlerLevelSerialized {
    //let { strip_ents } = opts || { strip_ents: false };

    return {
      special_pos: this.special_pos,
      w: this.w,
      h: this.h,
      cells: this.cells.map(serializeCell),
      initial_entities: this.initial_entities,
      initial_state: this.initial_state,
      state: this.state,
      vstyle: this.vstyle.id,
      seed: this.seed,
      props: this.props,
      paths: this.paths,
    };
  }

  deserialize(data: CrawlerLevelSerialized): void {
    let w = data.w;
    let h = data.h;
    this.alloc(w, h);
    this.initial_entities = data.initial_entities;
    this.initial_state = data.initial_state;
    this.state = data.state || {};
    this.props = data.props || {};
    this.paths = data.paths || {};
    this.seed = data.seed;
    let { cells } = this;
    for (let idx = 0; idx < w * h; ++idx) {
      for (let xx = 0; xx < w; ++xx) {
        cells[idx].deserialize(data.cells[idx]);
      }
    }
    for (let key in data.special_pos) {
      this.special_pos[key] = data.special_pos[key]!.slice(0) as JSVec3;
    }
    this.connected = true;
    this.setVstyle(data.vstyle);
    this.finalize();
  }

  toDebugString(): string {
    let ret = [];
    let first = ['*'];
    ret.push(first);
    for (let yy = 0; yy < this.h; ++yy) {
      let row = [];
      let below = [];
      row.push(this.getCell(0, yy)!.walls[WEST] ? '|' : ' ');
      below.push('*');
      for (let xx = 0; xx < this.w; ++xx) {
        let cell = this.getCell(xx, yy)!;
        let { desc, walls } = cell;
        row.push(charFromCell(desc));
        if (yy === 0) {
          if (!walls[SOUTH].open_move) {
            first.push('-');
          } else {
            first.push(' ');
          }
          first.push('*');
        }
        if (!walls[EAST].open_move) {
          row.push('|');
        } else if (walls[EAST].open_vis) {
          row.push(' ');
        } else { // door, shop, etc
          row.push('+');
        }
        if (!walls[NORTH].open_move) {
          below.push('-');
        } else if (walls[NORTH].open_vis) {
          below.push(' ');
        } else {
          below.push('+');
        }
        below.push('*');
      }
      ret.push(row);
      ret.push(below);
    }

    // Prune extra *s and convert to box-drawing characters
    for (let ii = 0; ii < ret.length; ++ii) {
      let row = ret[ii];
      for (let jj = 0; jj < row.length; ++jj) {
        if (row[jj] === '*') {
          let bits = 0;
          for (let kk = 0; kk < 4; ++kk) {
            let n = ret[ii+DY[kk]]?.[jj+DX[kk]];
            if (n && n !== ' ') {
              bits |= (1 << kk);
            }
          }
          let c = bits ? '*' : ' ';
          if (bits === (1|4)) {
            c = '━';
          } else if (bits === (2|8)) {
            c = '┃';
          } else if (bits === (1|2|4|8)) {
            c = '╋';
          } else if (bits === (1|8)) {
            c = '┏';
          } else if (bits === (1|2)) {
            c = '┗';
          } else if (bits === (4|8)) {
            c = '┓';
          } else if (bits === (4|2)) {
            c = '┛';
          } else if (bits === (1|2|8)) {
            c = '┣';
          } else if (bits === (4|2|8)) {
            c = '┫';
          } else if (bits === (1|4|8)) {
            c = '┳';
          } else if (bits === (1|4|2)) {
            c = '┻';
          }
          row[jj] = c;
        } else if (row[jj] === '+') {
          if (ret[ii][jj-1] === ' ') {
            row[jj] = '╪';
          } else {
            row[jj] = '╫';
          }
        } else if (row[jj] === '|') {
          row[jj] = '┃';
        } else if (row[jj] === '-') {
          row[jj] = '━';
        } else if (row[jj] === '<') {
          row[jj] = '╱';
        } else if (row[jj] === '>') {
          row[jj] = '╲';
        }
      }
    }
    return `[\n"${ret.reverse().map((a) => a.join('')).join('",\n"')}"\n]`;
  }

  getNeighbors(x: number, y: number): [CrawlerCell, CrawlerCell, CrawlerCell, CrawlerCell] {
    let ret = new Array(4) as [CrawlerCell, CrawlerCell, CrawlerCell, CrawlerCell];
    for (let ii = 0; ii < 4; ++ii) {
      ret[ii] = this.getCell(x + DX[ii], y + DY[ii]) || dummy_cell;
    }
    return ret;
  }

  getCell(x: number, y: number): CrawlerCell | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return null;
    }
    return this.cells[y * this.w + x];
  }

  setProp(key: string, value: CrawlerCellPropValue | undefined): void {
    if (value === undefined) {
      delete this.props[key];
    } else {
      this.props[key] = value;
    }
  }
  getProp(key: string): CrawlerCellPropValue | undefined {
    return this.props && this.props[key];
  }

  togglePath(x: number, y: number, dir: DirType): void {
    let x2 = x + DX[dir];
    let y2 = y + DY[dir];
    if (x2 < x || x2 === x && y2 < y) {
      // Key is always lexographically first
      let t = x;
      x = x2;
      x2 = t;
      t = y;
      y = y2;
      y2 = t;
      dir = dirMod(dir + 2);
    }
    if (x2 >= 0 && y2 >= 0 && x2 < this.w && y2 < this.h) {
      let key = `${x},${y}`;
      let list = this.paths[key];
      if (!list) {
        list = this.paths[key] = [];
      }
      for (let ii = 0; ii < list.length; ++ii) {
        if (list[ii] === dir) {
          ridx(list, ii);
          return;
        }
      }
      list.push(dir);
    }
  }

  getPathsForMap(x: number, y: number): DirType[] {
    let key = `${x},${y}`;
    return this.paths[key] || [];
  }
  getPaths(x: number, y: number): DirType[] {
    let key = `${x},${y}`;
    let ret = this.paths[key] || [];
    let west = this.paths[`${x-1},${y}`];
    if (west && west.includes(EAST)) {
      ret = ret.slice(0);
      ret.push(WEST);
    }
    let south = this.paths[`${x},${y-1}`];
    if (south && south.includes(NORTH)) {
      ret = ret.slice(0);
      ret.push(SOUTH);
    }
    return ret;
  }
}

type LevelCB = (level: CrawlerLevel) => void;
type LevelSerCB = (level_data: CrawlerLevelSerialized) => void;

export class CrawlerState {
  level_provider: (floor_id: number, cb: LevelSerCB) => void;

  pos = vec2(1,1); // Interpolated current position
  angle = 0; // Interpolated current angle
  floor_id = -1;
  level!: CrawlerLevel | null;
  levels!: CrawlerLevel[];

  constructor(params: CrawlerStateParams) {
    this.level_provider = params.level_provider;
    this.resetAllLevels();
  }

  setLevelActive(floor_id: number): void {
    assert(this.hasLevel(floor_id));
    // this.getLevelForFloor(floor_id);
    this.floor_id = floor_id;
    this.level = this.levels[floor_id];
    crawlerApplyVstyle(this.level.vstyle);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    celltypeFinalizeReferences();
  }

  setLevelDebug(floor_id: number, cur_level: CrawlerLevel): void {
    assert(isFinite(floor_id));
    cur_level.finalize();
    this.levels[floor_id] = cur_level;
  }

  setLevelFromSerialized(floor_id: number, level_data: CrawlerLevelSerialized): void {
    assert(!this.levels[floor_id]); // Maybe fine?
    let level = new CrawlerLevel();
    level.deserialize(level_data);
    this.levels[floor_id] = level;
  }

  hasLevel(floor_id: number): boolean {
    return Boolean(this.levels[floor_id]);
  }

  levels_loading: Partial<Record<number, LevelCB[]>> = {};
  getLevelForFloorAsync(floor_id: number, cb: LevelCB): void {
    if (this.levels[floor_id]) {
      return void cb(this.levels[floor_id]);
    }
    let cbs = this.levels_loading[floor_id];
    if (cbs) {
      cbs.push(cb);
      return;
    }
    this.levels_loading[floor_id] = [cb];
    this.level_provider(floor_id, (level_data: CrawlerLevelSerialized) => {
      assert(!this.levels[floor_id]);
      this.setLevelFromSerialized(floor_id, level_data);
      let level = this.levels[floor_id];
      callEach(this.levels_loading[floor_id], delete this.levels_loading[floor_id], level);
    });
  }

  getLevelForFloorExisting(floor_id: number): CrawlerLevel {
    assert(this.levels[floor_id]);
    return this.levels[floor_id];
  }

  anyLevelLoading(): boolean {
    for (let key in this.levels_loading) {
      return true;
    }
    return false;
  }
  resetAllLevels(): void {
    assert(!this.anyLevelLoading());
    this.levels = [];
    this.levels_loading = [];
    this.level = null;
    // if (this.floor_id !== -1) {
    //   this.setLevelActive(this.floor_id);
    // }
  }
}

function fixupVisuals(visuals?: CrawlerVisualsInput): CrawlerVisuals {
  if (!visuals) {
    visuals = [];
  }
  if (!Array.isArray(visuals)) {
    visuals = [visuals];
  }
  let by_pass: CrawlerVisuals = {};
  for (let ii = 0; ii < visuals.length; ++ii) {
    let v = visuals[ii];
    if (!v.pass) {
      v.pass = 'default';
    }
    let bp = by_pass[v.pass];
    if (!bp) {
      bp = by_pass[v.pass] = [];
    }
    bp.push(v);
  }
  return by_pass;
}

let fs: FSAPI;
let default_wall_desc: WallDesc;

function descTypeLoad<T extends WallDesc|CellDesc>(filename: string, fixer?: (desc: T) => void): T {
  let obj = fs.getFile<T>(filename, 'jsobj');
  let id = fileBaseName(filename);
  obj.id = id;
  obj.visuals_runtime = fixupVisuals(obj.visuals);
  if (fixer) {
    fixer(obj);
  }
  return obj;
}

function celltypeFixup(cell_desc: CellDesc): void {
  cell_desc.visuals_visited_runtime = fixupVisuals(cell_desc.visuals_visited);
  if (cell_desc.open_move !== false) {
    cell_desc.open_move = true;
  }

  let by_pass: Partial<Record<string, Partial<Record<CornerDetailType, CrawlerVisual[]>>>> = {};
  let key: CornerDetailType;
  for (key in CORNER_DETAIL_TYPES) {
    let visuals_for_corner = fixupVisuals(cell_desc.corners?.[key]);
    for (let pass in visuals_for_corner) {
      let bp = by_pass[pass];
      if (!bp) {
        bp = by_pass[pass] = {};
      }
      bp[key] = visuals_for_corner[pass];
    }
  }
  let by_pass_full: Partial<Record<string, Record<CornerDetailType, CrawlerVisual[]>>> = {};
  for (let pass in by_pass) {
    let bp = by_pass[pass]!;
    let one = bp.one || [];
    let two = bp.two || [];
    let three = bp.three || [];
    let four = bp.four || [];
    by_pass_full[pass] = { one, two, three, four };
  }
  cell_desc.corners_runtime = by_pass_full;
}

function celltypeLoad(filename: string): CellDesc {
  let cell_desc = descTypeLoad<CellDesc>(filename, celltypeFixup);
  return cell_desc;
}

function walltypeFixup(wall_desc: WallDesc): void {
  wall_desc.map_view_wall_frame_priority = wall_desc.map_view_wall_frame_priority || 0;
  wall_desc.map_view_wall_frame_west = wall_desc.map_view_wall_frame_west || wall_desc.map_view_wall_frame_east;
  wall_desc.map_view_wall_frame_south = wall_desc.map_view_wall_frame_south || wall_desc.map_view_wall_frame_north;
}

function walltypeLoad(filename: string): WallDesc {
  let wall_desc = descTypeLoad<WallDesc>(filename, walltypeFixup);
  return wall_desc;
}

function vstyleLoad(filename: string): VstyleDesc {
  let vstyle_desc = fs.getFile<VstyleDesc>(filename, 'jsobj');
  let id = fileBaseName(filename);
  vstyle_desc.id = id;
  vstyle_desc.cell_swaps = vstyle_desc.cell_swaps || {};
  vstyle_desc.wall_swaps = vstyle_desc.wall_swaps || {};
  vstyle_desc.background_color = vstyle_desc.background_color || identity_vstyle.background_color;
  vstyle_desc.fog_params = vstyle_desc.fog_params || identity_vstyle.fog_params;
  vstyle_desc.fog_color = vstyle_desc.fog_color || identity_vstyle.fog_color;
  return vstyle_desc;
}

let no_corners: Partial<Record<string, Record<CornerDetailType, CrawlerVisual[]>>> = {};
function celltypeFinalizeReferences(): void {
  let default_corners = no_corners;
  if (descs.cell.open.swapped.corners) {
    default_corners = descs.cell.open.swapped.corners_runtime;
  }
  for (let id in descs.cell) {
    let cell_desc = descs.cell[id]!;
    if (cell_desc.ascii_char) {
      descs.ascii_lookup.cell[cell_desc.ascii_char] = cell_desc;
    }
    if (cell_desc.advertised_wall) {
      assert(descs.wall[cell_desc.advertised_wall]);
      cell_desc.advertised_wall_desc = descs.wall[cell_desc.advertised_wall];
    }
    cell_desc.default_wall_desc = descs.wall[cell_desc.default_wall!] || default_wall_desc;
    if (cell_desc.corners === undefined) {
      cell_desc.corners_runtime = default_corners;
    }
    if (cell_desc.replace) {
      for (let ii = 0; ii < cell_desc.replace.length; ++ii) {
        let replace = cell_desc.replace[ii];
        let { name } = replace;
        assert(name);
        let target = descs.cell[name];
        if (!target) {
          dataError(`Referencing unknown cell type "${name}" in replace in "${id}"`);
          replace.desc = descs.cell.open;
        } else {
          replace.desc = target;
        }
      }
    }
  }
}

function walltypeFinalizeReferences(): void {
  let lookup = descs.ascii_lookup.wall = {} as Partial<Record<string, WallDesc>>;
  for (let key in descs.wall) {
    let wall_desc = descs.wall[key]!;
    if (wall_desc.ascii_char) {
      wall_desc.ascii_char.split('').forEach((c) => {
        lookup[c] = wall_desc;
      });
    }
    if (wall_desc.map_view_wall_frames_from) {
      let from = descs.wall[wall_desc.map_view_wall_frames_from];
      assert(from);
      wall_desc.map_view_wall_frame_north = from.map_view_wall_frame_north;
      wall_desc.map_view_wall_frame_east = from.map_view_wall_frame_east;
      wall_desc.map_view_wall_frame_south = from.map_view_wall_frame_south;
      wall_desc.map_view_wall_frame_west = from.map_view_wall_frame_west;
    }

    if (wall_desc.replace) {
      for (let ii = 0; ii < wall_desc.replace.length; ++ii) {
        let replace = wall_desc.replace[ii];
        let { name } = replace;
        assert(name);
        let target = descs.wall[name];
        assert(target);
        replace.desc = target;
      }
    }
  }
}

function vstyleFinalizeReferences(): void {
  crawlerApplyVstyle(last_vstyle || identity_vstyle);
}

function reloadDesctype(set: 'wall' | 'cell' | 'vstyle', new_desc: CellDesc | WallDesc | VstyleDesc): void {
  let { id } = new_desc;
  let old_desc = descs[set][id];
  if (!old_desc) {
    descs[set][id] = new_desc;
  } else {
    assert(new_desc !== old_desc); // already same object? Something went wrong, maybe not actually changed/reloading?
    for (let key in old_desc) {
      delete (old_desc as DataObject)[key];
    }
    for (let key in new_desc) {
      (old_desc as DataObject)[key] = (new_desc as DataObject)[key];
    }
    new_desc = old_desc;
  }
}

function reloadWalltype(path: string): void {
  let new_desc = walltypeLoad(path);
  reloadDesctype('wall', new_desc);
  vstyleFinalizeReferences();
  walltypeFinalizeReferences();
}

function reloadCelltype(path: string): void {
  let new_desc = celltypeLoad(path);
  reloadDesctype('cell', new_desc);
  vstyleFinalizeReferences();
  celltypeFinalizeReferences();
}

function reloadVstyle(path: string): void {
  let new_desc = vstyleLoad(path);
  reloadDesctype('vstyle', new_desc);
  vstyleFinalizeReferences();
}


export function crawlerLoadData(fs_in: FSAPI): void {
  if (descs) {
    return;
  }
  fs = fs_in;
  let wall_descs: WallDescs = {} as WallDescs;
  let wall_lookup: Partial<Record<string, WallDesc>> = {};
  let cell_descs: CellDescs = {} as CellDescs;
  let cell_lookup: Partial<Record<string, CellDesc>> = {};
  let vstyle_descs: VstyleDescs = {} as VstyleDescs;
  vstyle_descs.default = identity_vstyle;

  descs = {
    wall: wall_descs,
    cell: cell_descs,
    ascii_lookup: {
      cell: cell_lookup,
      wall: wall_lookup,
    },
    vstyle: vstyle_descs,
  };

  let files = fs.getFileNames('walls/');
  for (let ii = 0; ii < files.length; ++ii) {
    let filename = files[ii];
    let obj = walltypeLoad(filename);
    wall_descs[obj.id] = obj;
  }

  files = fs.getFileNames('cells/');
  for (let ii = 0; ii < files.length; ++ii) {
    let filename = files[ii];
    let obj = celltypeLoad(filename);
    cell_descs[obj.id] = obj;
  }

  files = fs.getFileNames('vstyles/');
  for (let ii = 0; ii < files.length; ++ii) {
    let filename = files[ii];
    let obj = vstyleLoad(filename);
    vstyle_descs[obj.id] = obj;
  }

  // validate and look up references
  assert(wall_descs.open);
  assert(cell_descs.open);
  assert(cell_descs.solid); // Just for dummy logic, not actually important? maybe build into engine?
  let default_temp = wall_descs[cell_descs.open.default_wall!];
  assert(default_temp);
  default_wall_desc = default_temp;

  vstyleFinalizeReferences();
  celltypeFinalizeReferences();
  walltypeFinalizeReferences();

  dummy_cell = new CrawlerCell(-100, -100);
  dummy_cell.desc = cell_descs.solid;

  fs.filewatchOn('.walldef', reloadWalltype);
  fs.filewatchOn('.celldef', reloadCelltype);
  fs.filewatchOn('.vstyle', reloadVstyle);
}

export function crawlerGetWallDesc(id: string): WallDesc {
  let wall_desc = descs.wall[id];
  assert(wall_desc, id);
  return wall_desc;
}

export function crawlerGetCellDesc(id: string): CellDesc {
  let cell_desc = descs.cell[id];
  assert(cell_desc, id);
  return cell_desc;
}

export function crawlerHasWallDesc(id: string): boolean {
  return Boolean(descs.wall[id]);
}

export function crawlerHasCellDesc(id: string): boolean {
  return Boolean(descs.cell[id]);
}

export function createLevelFromASCII(source: string[]): CrawlerLevel {
  let ret = new CrawlerLevel();
  ret.fromASCII(source);
  return ret;
}

export function createLevel(): CrawlerLevel {
  return new CrawlerLevel();
}

export function createCrawlerState(params: CrawlerStateParams): CrawlerState {
  return new CrawlerState(params);
}
