import assert from 'assert';
import * as camera2d from 'glov/client/camera2d';
import { cmd_parse } from 'glov/client/cmds';
import * as engine from 'glov/client/engine';
import {
  ALIGN,
  Font,
  fontStyle,
  vec4ColorFromIntColor,
} from 'glov/client/font';
import { Box } from 'glov/client/geom_types';
import {
  KEYS,
  PAD,
  keyDown,
  keyDownEdge,
  padButtonDown,
} from 'glov/client/input';
import {
  localStorageGet,
  localStorageGetJSON,
  localStorageSet,
  localStorageSetJSON,
} from 'glov/client/local_storage';
import { ScrollArea, scrollAreaCreate } from 'glov/client/scroll_area';
import {
  MenuItem,
  SelectionBoxDisplay,
  dropDown,
} from 'glov/client/selection_box';
import * as settings from 'glov/client/settings';
import {
  button,
  buttonText,
  drawRect,
  makeColorSet,
  modalTextEntry,
} from 'glov/client/ui';
import * as ui from 'glov/client/ui';
import {
  Diff,
  Differ,
  diffApply,
  differCreate,
} from 'glov/common/differ';
import { ErrorCallback } from 'glov/common/types';
import { arrayToSet, ridx } from 'glov/common/util';
import { v2same, vec4 } from 'glov/common/vmath';
import { BuildModeOp } from '../common/crawler_entity_common';
import { crawlerScriptListEvents } from '../common/crawler_script';
import {
  CellDesc,
  CellDescs,
  CrawlerCell,
  CrawlerCellEvent,
  CrawlerLevel,
  CrawlerLevelSerialized,
  DX,
  DY,
  DirType,
  JSVec3,
  WallDesc,
  WallDescs,
  crawlerGetCellDesc,
  crawlerGetWallDesc,
  crawlerHasCellDesc,
  crawlerHasWallDesc,
  dirMod,
  getCellDescs,
  getVstyles,
  getWallDescs,
} from '../common/crawler_state';
import { getChatUI } from './crawler_comm';
import {
  SpawnDesc,
  SpawnDescs,
  crawlerEntityManager,
  crawlerGetSpawnDescs,
  crawlerMyEnt,
} from './crawler_entity_client';
import { mapViewSetActive } from './crawler_map_view';
import {
  crawlerGameState,
  crawlerRoom,
  crawlerSetLevelGenMode,
} from './crawler_play';
import { crawlerRenderGetThumbnail } from './crawler_render';
import { statusPush } from './status';

const { floor, min } = Math;

declare module 'glov/client/settings' {
  export let build_mode_help: 0 | 1;
}

settings.register({
  build_mode_help: {
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0, 1],
  },
});

let build_mode: boolean = engine.defines.BUILD || false;
export function buildModeActive(): boolean {
  return build_mode;
}
export function buildModeSetActive(new_value: boolean): void {
  build_mode = new_value;
  engine.defines.BUILD = build_mode;
}

enum BuildTab {
  Paint = 'Pnt',
  Path = 'Path',
  Config = 'Cnfg',
}

function validBuildTab(str: string | undefined): BuildTab | null {
  for (let key in BuildTab) {
    if (BuildTab[key as keyof typeof BuildTab] === str) {
      return str;
    }
  }
  return null;
}

let build_tab = validBuildTab(localStorageGet('build_tab')) || BuildTab.Paint;
let build_favorites = localStorageGetJSON<Partial<Record<string,true>>>('build_favs', {});
type PaletteEntry = ['wall' | 'cell' | 'spawn', string];
type PaletteData = {
  entries: PaletteEntry[];
  selected: number;
};
const DEFAULT_PALETTE: PaletteData = {
  entries: [['cell', 'open'], ['wall', 'solid'], ['wall', 'door']],
  selected: 0,
};
const PALETTE_SIZE = 9;
let palette = localStorageGetJSON<PaletteData>('build_palette', DEFAULT_PALETTE);
let show_palette_config = false;

export function buildModeOverlayActive(): boolean {
  return build_mode && show_palette_config;
}

const serialize_opts = {};
let last_floor: number;
let differ: Differ;

function buildModeFinishUndoRedo(diff: Diff, level_data: CrawlerLevelSerialized): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  if (diff.length) {
    // Send to server
    let pak = crawlerRoom().pak('build');
    pak.writeInt(game_state.floor_id);
    pak.writeJSON(diff);
    pak.send(function (err: string | null) {
      if (err) {
        statusPush(err);
      }
    });
    // Apply locally
    let vis_str = level.getVisString();
    level.deserialize(level_data);
    level.finalize();
    level.applyVisString(vis_str);
    // Re-set this as active to get vstyle updates applies
    game_state.setLevelActive(last_floor);
  }
}

function buildModeUndo(): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  if (game_state.floor_id !== last_floor) {
    return;
  }
  if (!differ.canUndo()) {
    statusPush('Cannot undo');
    return;
  }
  let [diff, level_data] = differ.undo();
  buildModeFinishUndoRedo(diff, level_data as CrawlerLevelSerialized);
  statusPush('Undo successful');
}

function buildModeRedo(): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  if (game_state.floor_id !== last_floor) {
    return;
  }
  if (!differ.canRedo()) {
    statusPush('Cannot redo');
    return;
  }
  let [diff, level_data] = differ.redo();
  buildModeFinishUndoRedo(diff, level_data as CrawlerLevelSerialized);
  statusPush('Redo successful');
}

export function crawlerBuildModeBegin(): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  let level_data = level.serialize(serialize_opts);
  if (game_state.floor_id !== last_floor) {
    last_floor = game_state.floor_id;
    differ = differCreate(level_data, { history_size: 128 });
  } else {
    // consume any changes since our last build operation (e.g. other people's edits)
    differ.update(level_data);
  }
}

export function crawlerBuildModeCommit(): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  level.finalize();
  let diff = differ.update(level.serialize(serialize_opts));
  if (diff.length) {
    let pak = crawlerRoom().pak('build');
    pak.writeInt(game_state.floor_id);
    pak.writeJSON(diff);
    pak.send(function (err: string | null) {
      if (err) {
        statusPush(err);
      }
    });
  }
}

export function buildModeOnBuildOp(data: BuildModeOp, resp_func: ErrorCallback): void {
  let { sub_id, floor: floor_id, diff } = data;
  if (sub_id === crawlerEntityManager().getSubscriptionId()) {
    return;
  }
  let game_state = crawlerGameState();
  if (!game_state.hasLevel(floor_id)) {
    return;
  }
  let level = game_state.getLevelForFloorExisting(floor_id);
  let vis_str = level.getVisString();
  let level_data = level.serialize();
  diffApply(level_data, diff);
  level.deserialize(level_data);
  level.finalize();
  level.applyVisString(vis_str);
  if (floor_id === game_state.floor_id) {
    // Re-set this as active to get vstyle updates applies
    game_state.setLevelActive(floor_id);
  }
  resp_func();
}

function wallOpenVis(level: CrawlerLevel, x: number, y: number, dir: DirType): boolean {
  return Boolean(level.getCell(x, y)?.walls[dir].open_vis);
}

function wallIfNotOpen(level: CrawlerLevel, x: number, y: number, dir: DirType): null | WallDesc {
  let desc = level.getCell(x, y)?.walls[dir];
  if (!desc || desc.id === 'open') {
    return null;
  }
  return desc;
}

function openCell(myx: number, myy: number, dir: DirType, tx: number, ty: number, desired_cell?: string): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  let cell_desc = crawlerGetCellDesc(desired_cell || 'open');
  assert(cell_desc);
  level.setCell(tx, ty, cell_desc);
  level.setWall(myx, myy, dir, getWallDescs().open!);
  // More generically: just prune any walls with orphaned corners?
  // If no wall to my left and to the left+ahead
  let left = dirMod(dir + 1);
  let clear_left = wallOpenVis(level, myx, myy, left) &&
    wallOpenVis(level, myx + DX[left], myy + DY[left], dir);
  if (clear_left) {
    level.setWall(tx, ty, left, getWallDescs().open!);
  }
  // same for right
  let right = dirMod(dir + 3);
  let clear_right = wallOpenVis(level, myx, myy, right) &&
    wallOpenVis(level, myx + DX[right], myy + DY[right], dir);
  if (clear_right) {
    level.setWall(tx, ty, right, getWallDescs().open!);
  }
  if (clear_left && wallOpenVis(level, tx + DX[left], ty + DY[left], dir) &&
    wallOpenVis(level, tx + DX[dir], ty + DY[dir], left) ||
    clear_right && wallOpenVis(level, tx + DX[right], ty + DY[right], dir) &&
    wallOpenVis(level, tx + DX[dir], ty + DY[dir], right)
  ) {
    level.setWall(tx, ty, dir, getWallDescs().open!);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toggleCell(): void {
  crawlerBuildModeBegin();
  let my_ent = crawlerMyEnt();
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  let pos = my_ent.getData<[number, number, DirType]>('pos')!;
  let [myx, myy, dir] = pos;
  let tx = myx + DX[dir];
  let ty = myy + DY[dir];
  let cell = level.getCell(tx, ty);
  if (!cell) {
    statusPush('Out of bounds');
    return;
  }
  if (cell.desc.open_move) {
    level.setCell(tx, ty, crawlerGetCellDesc('solid')!);
  } else {
    // Open between us
    openCell(myx, myy, dir, tx, ty);
  }
  crawlerBuildModeCommit();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toggleWall(): void {
  crawlerBuildModeBegin();
  let my_ent = crawlerMyEnt();
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  let pos = my_ent.getData<[number, number, DirType]>('pos')!;
  let [myx, myy, dir] = pos;
  let tx = myx + DX[dir];
  let ty = myy + DY[dir];
  let cell = level.getCell(tx, ty);
  if (!cell) {
    statusPush('Out of bounds');
    return;
  }
  if (wallOpenVis(level, myx, myy, dir)) {
    // close it, see if it should be removed
    level.setWall(myx, myy, dir, getWallDescs().solid!);
    if (!wallOpenVis(level, tx, ty, dirMod(dir + 1)) &&
      !wallOpenVis(level, tx, ty, dirMod(dir + 2)) &&
      !wallOpenVis(level, tx, ty, dirMod(dir + 3))
    ) {
      level.setCell(tx, ty, crawlerGetCellDesc('solid')!);
    }
  } else {
    // open it, see if it needs to also have the cell opened
    if (cell.desc.open_vis) {
      level.setWall(myx, myy, dir, getWallDescs().open!);
    } else {
      openCell(myx, myy, dir, tx, ty);
    }
  }
  crawlerBuildModeCommit();
}

function spawnAt(level: CrawlerLevel, x: number, y: number): string | null {
  let { initial_entities } = level;
  if (initial_entities) {
    for (let ii = 0; ii < initial_entities.length; ++ii) {
      let ent_ser = initial_entities[ii];
      let pos = ent_ser.pos as JSVec3;
      if (pos[0] === x && pos[1] === y) {
        return ent_ser.type as string;
      }
    }
  }
  return null;
}

function spawnRemove(level: CrawlerLevel, x: number, y: number): void {
  let { initial_entities } = level;
  if (initial_entities) {
    for (let ii = 0; ii < initial_entities.length; ++ii) {
      let ent_ser = initial_entities[ii];
      let pos = ent_ser.pos as JSVec3;
      if (pos[0] === x && pos[1] === y) {
        ridx(initial_entities, ii);
      }
    }
  }
}

function eventsRemove(level: CrawlerLevel, x: number, y: number): void {
  delete level.getCell(x, y)!.events;
}

function eventKeyOnly(str: string): string {
  let idx = str.indexOf(' ');
  if (idx !== -1) {
    return str.slice(0, idx);
  }
  return str;
}

// Deals with advertised wall descs, default spawns, props, events
function setCellEx(
  level: CrawlerLevel, myx: number, myy: number, dir: DirType, tx: number, ty: number, cell_desc: CellDesc
): void {
  let old_cell_desc = level.getCell(tx, ty)!.desc;
  level.setCell(tx, ty, cell_desc);
  let target_cell = level.getCell(tx, ty);
  assert(target_cell);
  if (cell_desc.advertised_wall_desc) {
    level.setWall(myx, myy, dir, cell_desc.advertised_wall_desc, crawlerGetWallDesc('door'));
    // also add walls around it, for any edge that goes to a different cell type
    for (let check_dir = 0 as DirType; check_dir < 4; ++check_dir) {
      let check_wall = target_cell.walls[check_dir];
      let target_neighbor = level.getCell(tx + DX[check_dir], ty + DY[check_dir]);
      if (check_wall.open_vis && check_wall.open_move) {
        if (target_neighbor && target_neighbor.desc !== cell_desc) {
          level.setWall(tx, ty, check_dir, crawlerGetWallDesc('solid'));
        }
      } else if (check_wall === cell_desc.advertised_wall_desc ||
        check_wall.open_move && target_neighbor && target_neighbor.desc === cell_desc &&
        target_neighbor.walls[dirMod(check_dir + 2)] === cell_desc.advertised_wall_desc
      ) {
        // combine
        level.setWall(tx, ty, check_dir, crawlerGetWallDesc('open'));
      }
    }
  }
  if (cell_desc.default_wall_desc && old_cell_desc.default_wall_desc) {
    // Also convert any previous default walls to our default wall
    if (cell_desc.default_wall_desc !== old_cell_desc.default_wall_desc) {
      for (let check_dir = 0 as DirType; check_dir < 4; ++check_dir) {
        if (target_cell.walls[check_dir] === old_cell_desc.default_wall_desc) {
          target_cell.walls[check_dir] = cell_desc.default_wall_desc;
        }
      }
    }
  }
  if (old_cell_desc.default_spawn) {
    if (spawnAt(level, tx, ty) === old_cell_desc.default_spawn) {
      spawnRemove(level, tx, ty);
    }
  }
  if (cell_desc.default_spawn && !spawnAt(level, tx, ty)) {
    if (!level.initial_entities) {
      level.initial_entities = [];
    }
    level.initial_entities.push({
      type: cell_desc.default_spawn,
      pos: [tx, ty, dirMod(dir + 2)],
    });
  }
  // Remove old default props
  if (old_cell_desc.default_props && target_cell.props) {
    let new_props = arrayToSet(cell_desc.default_props || []);
    for (let ii = 0; ii < old_cell_desc.default_props.length; ++ii) {
      let key = old_cell_desc.default_props[ii];
      if (!new_props[key] && target_cell.props[key] !== undefined) {
        delete target_cell.props[key];
      }
    }
  }
  // Add default props
  if (cell_desc.default_props) {
    for (let ii = 0; ii < cell_desc.default_props.length; ++ii) {
      let key = cell_desc.default_props[ii];
      target_cell.setProp(key, '');
    }
  }
  // Remove old default events
  if (old_cell_desc.default_events && target_cell.events) {
    let new_events = arrayToSet((cell_desc.default_events || []).map(eventKeyOnly));
    let old_events = arrayToSet(old_cell_desc.default_events.map(eventKeyOnly));
    for (let jj = target_cell.events.length - 1; jj >= 0; --jj) {
      let event = target_cell.events[jj];
      if (!new_events[event.id] && old_events[event.id]) {
        target_cell.events.splice(jj, 1);
      }
    }
  }
  // Add default events
  if (cell_desc.default_events) {
    let cur_events: Partial<Record<string, true>> = {};
    if (target_cell.events) {
      for (let jj = target_cell.events.length - 1; jj >= 0; --jj) {
        let event = target_cell.events[jj];
        cur_events[event.id] = true;
      }
    }
    for (let ii = 0; ii < cell_desc.default_events.length; ++ii) {
      let key = cell_desc.default_events[ii];
      let param = '';
      let idx = key.indexOf(' ');
      if (idx !== -1) {
        param = key.slice(idx + 1);
        key = key.slice(0, idx);
      }
      if (!cur_events[key]) {
        target_cell.addEvent(key, param);
      }
    }
  }
  if (target_cell.events && !target_cell.events.length) {
    delete target_cell.events;
  }

  if (cell_desc.special_pos) {
    level.special_pos[cell_desc.special_pos] = [tx, ty, dirMod(dir + 2)];
  }
}

function togglePath(): void {
  crawlerBuildModeBegin();
  let my_ent = crawlerMyEnt();
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  let pos = my_ent.getData<[number, number, DirType]>('pos')!;
  let [myx, myy, dir] = pos;
  level.togglePath(myx, myy, dir);
  crawlerBuildModeCommit();
}

function toggleWithSelected(): void {
  let selected = palette.entries[palette.selected];
  if (!selected) {
    return;
  }
  crawlerBuildModeBegin();
  let my_ent = crawlerMyEnt();
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  let pos = my_ent.getData<[number, number, DirType]>('pos')!;
  let [myx, myy, dir] = pos;
  let tx = myx + DX[dir];
  let ty = myy + DY[dir];

  let wall_ahead = wallIfNotOpen(level, myx, myy, dir);
  let target_cell = level.getCell(tx, ty);
  if (selected[0] === 'cell') {
    let cell_desc = crawlerGetCellDesc(selected[1]);
    assert(cell_desc);
    if (!target_cell) {
      statusPush('Out of bounds');
      return;
    }

    if (wall_ahead) {
      // open it, see if it needs to also have the cell opened
      if (target_cell.desc.open_vis) {
        if (cell_desc.advertised_wall_desc && target_cell.desc === cell_desc) {
          // there's a wall (possibly a door) and then our special zone, just fill it in
          level.setCell(tx, ty, crawlerGetCellDesc('solid'));
          spawnRemove(level, tx, ty); // Also clear spawns
          eventsRemove(level, tx, ty); // And events
        } else if (target_cell.desc.advertised_wall_desc) {
          // open, but is a special zone
          if (cell_desc.advertised_wall_desc) {
            // we're also placing a special zone, just replace it
            setCellEx(level, myx, myy, dir, tx, ty, cell_desc);
          } else {
            // can't replace a special zone with a non-special, just fill it in
            level.setCell(tx, ty, crawlerGetCellDesc('solid'));
            spawnRemove(level, tx, ty); // Also clear spawns
            eventsRemove(level, tx, ty); // And events
          }
        } else {
          // already open, just open up the wall, do nothing with the cell
          level.setWall(myx, myy, dir, crawlerGetWallDesc('open'));
        }
      } else {
        // it's solid, replace it with our selected cell
        if (cell_desc.advertised_wall_desc) {
          // want a self-contained zone
          setCellEx(level, myx, myy, dir, tx, ty, cell_desc);
        } else {
          openCell(myx, myy, dir, tx, ty, selected[1]);
        }
      }
    } else {
      // facing open wall
      if (target_cell.desc === cell_desc) {
        // already matches
        if (selected[1] === 'open' || cell_desc.advertised_wall_desc) {
          // and we're placing open, close it!
          level.setCell(tx, ty, crawlerGetCellDesc('solid'));
          spawnRemove(level, tx, ty); // Also clear spawns
          eventsRemove(level, tx, ty); // And events
        } else {
          // we're placing anything else, toggle it back to open
          let open_desc = crawlerGetCellDesc('open');
          level.setCell(tx, ty, open_desc);
          spawnRemove(level, tx, ty); // Also clear spawns
          eventsRemove(level, tx, ty); // And events
          // Also any walls that are our default wall, reset to the default wall
          if (
            cell_desc.default_wall_desc && open_desc.default_wall_desc &&
            cell_desc.default_wall_desc !== open_desc.default_wall_desc
          ) {
            for (let ii = 0; ii < 4; ++ii) {
              if (target_cell.walls[ii] === cell_desc.default_wall_desc) {
                target_cell.walls[ii] = open_desc.default_wall_desc;
              }
            }
          }
        }
      } else {
        // different cell, replace
        setCellEx(level, myx, myy, dir, tx, ty, cell_desc);
      }
    }
  } else if (selected[0] === 'wall') {
    // if wall is selected
    let selected_wall = crawlerGetWallDesc(selected[1]);
    assert(selected_wall);
    if (wall_ahead && wall_ahead === selected_wall) {
      level.setWall(myx, myy, dir, crawlerGetWallDesc('open'));
      if (target_cell && !target_cell.desc.open_vis) {
        openCell(myx, myy, dir, tx, ty);
      }
    } else {
      let neighbor_wall = target_cell?.walls[dirMod(dir + 2)];
      if (selected_wall.advertise_other_side || neighbor_wall?.open_vis && !selected_wall.open_vis) {
        level.setWall(myx, myy, dir, selected_wall);
      } else {
        level.setWall(myx, myy, dir, selected_wall, null);
      }
      if (target_cell && !target_cell.desc.open_vis) {
        if (selected_wall.open_vis) {
          openCell(myx, myy, dir, tx, ty);
        } else if (selected_wall.open_move) {
          let cell_desc = crawlerGetCellDesc('open');
          level.setCell(tx, ty, cell_desc);
        }
      }
    }
  } else if (selected[0] === 'spawn') {
    let type_id = selected[1];
    let { initial_entities } = level;
    if (!initial_entities) {
      initial_entities = level.initial_entities = [];
    }
    let found = false;
    let cell_pos: [number, number, number] = [tx, ty, dirMod(dir + 2)];
    for (let ii = initial_entities.length - 1; ii >= 0; --ii) {
      let ent_ser = initial_entities[ii];
      let epos = ent_ser.pos as JSVec3;
      if (epos && v2same(epos, cell_pos)) {
        found = true;
        if (ent_ser.type === type_id) {
          ridx(initial_entities, ii);
        } else {
          initial_entities[ii] = { type: type_id, pos: cell_pos };
        }
      }
    }
    if (!found) {
      initial_entities.push({ type: type_id, pos: cell_pos });
    }

  } else {
    assert(false);
  }

  crawlerBuildModeCommit();
}

function buildModeSetVstyle(id: string): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  assert(level);
  crawlerBuildModeBegin();
  level.setVstyle(id);
  game_state.setLevelActive(game_state.floor_id);
  crawlerBuildModeCommit();
}

type DescPair = ['wall', WallDesc] | ['cell', CellDesc] | ['spawn', SpawnDesc];

let font: Font;
let button_height: number;
const palette_style_base = fontStyle(null, {
  glow_xoffs: 2,
  glow_yoffs: 2,
  glow_inner: -1,
  glow_outer: 5,
  glow_color: 0x000000ff,
});
const palette_style = {
  wall: fontStyle(palette_style_base, {
    color: 0xFFFF80ff,
  }),
  cell: fontStyle(palette_style_base, {
    color: 0x80FFFFff,
  }),
  spawn: fontStyle(palette_style_base, {
    color: 0xFF80FFff,
  }),
};
let palette_style_focused = {
  wall: fontStyle(palette_style.wall, {
    outline_color: 0xFFFF00ff,
    outline_width: 1.5,
  }),
  cell: fontStyle(palette_style.cell, {
    outline_color: 0xFFFF00ff,
    outline_width: 1.5,
  }),
  spawn: fontStyle(palette_style.spawn, {
    outline_color: 0xFFFF00ff,
    outline_width: 1.5,
  }),
};
let font_style_prop = fontStyle(palette_style_base, {
  color: 0xFFFF80ff,
  glow_xoffs: 0,
  glow_yoffs: 0,
});
let colors_prop = makeColorSet(vec4ColorFromIntColor(vec4(), 0x000080ff));
let font_style_event = fontStyle(palette_style_base, {
  color: 0xFF80FFff,
  glow_xoffs: 0,
  glow_yoffs: 0,
});
let colors_event = makeColorSet(vec4ColorFromIntColor(vec4(), 0x008000ff));

function drawPaletteThumbnail(param: {
  pair: DescPair;
  x: number; y: number; z: number;
  w: number; h: number;
}): void {
  let { x, y, z, w, h, pair } = param;
  if (pair[0] === 'spawn') {
    let desc = pair[1];
    desc.example_ent.draw2D({
      x, y, z,
      w, h,
    });
  } else {
    let desc = pair[1];
    let pairs = crawlerRenderGetThumbnail(desc);
    for (let ii = 0; ii < pairs.length; ++ii) {
      let [sprite, thumb_param] = pairs[ii];
      sprite.draw({
        x, y, z: z + ii * 0.001,
        w, h,
        ...thumb_param,
      });
    }
  }
}

const PALETTE_FONT_SCALE = 0.5;
const THUMBNAIL_PAD = 1;

let palette_config_scroll: ScrollArea;

type PaletteConfigTab = 'all' | 'wall' | 'cell' | 'spawn';
let palette_config_tab: PaletteConfigTab = (localStorageGet('pal_tab') as PaletteConfigTab) || 'all';

function showPaintPaletteConfig(level: CrawlerLevel, x1: number): void {
  const x0 = camera2d.x0() + 2;
  const y0 = camera2d.y0() + 2;
  const w = x1 - x0;
  const y1 = camera2d.y1() - 2;
  let x = x0;
  let y = y0;
  let z = Z.UI + 100;

  if (!palette_config_scroll) {
    palette_config_scroll = scrollAreaCreate({
      z,
      background_color: null,
      auto_hide: true,
    });
  }


  const TAB_W = 60;
  ['all', 'wall', 'cell', 'spawn'].forEach(function (tab_str, idx) {
    let tab = tab_str as PaletteConfigTab;
    if (button({
      x: x + TAB_W * idx, y, z,
      w: TAB_W, h: button_height,
      disabled: palette_config_tab === tab,
      base_name: palette_config_tab === tab ? 'buttonselected' : 'button',
      text: tab,
      font,
      hotkey: keyDown(KEYS.ALT) ? KEYS['1'] + idx : undefined,
    })) {
      palette_config_tab = tab;
      localStorageSet('pal_tab', tab);
    }
  });
  y += button_height;

  let scroll_y_start = y;
  palette_config_scroll.begin({
    x: x0, y, w, h: y1 - y, z,
  });
  x = 1;
  y = 1;
  const mapped_x1 = x1 - x0 - palette_config_scroll.barWidth() - 1;


  let show_all = palette_config_tab === 'all';
  let wall_descs: WallDescs = palette_config_tab === 'wall' || show_all ? getWallDescs() : {} as WallDescs;
  let cell_descs: CellDescs = palette_config_tab === 'cell' || show_all ? getCellDescs() : {} as CellDescs;
  let spawn_descs: SpawnDescs = palette_config_tab === 'spawn' || show_all ? crawlerGetSpawnDescs() : {};
  let all_descs: DescPair[] = [];
  let hide_walls: Partial<Record<string, true>> = {};
  let hide_cells: Partial<Record<string, true>> = {};
  for (let key in cell_descs) {
    let desc = cell_descs[key]!;
    if (desc.advertised_wall) {
      hide_walls[desc.advertised_wall] = true;
    }
  }
  let vstyle = level.vstyle;
  for (let key in vstyle.cell_swaps) {
    hide_cells[vstyle.cell_swaps[key]!] = true;
  }
  for (let key in vstyle.wall_swaps) {
    hide_walls[vstyle.wall_swaps[key]!] = true;
  }
  for (let key in wall_descs) {
    if (key === 'solid' || key === 'door' || key === 'open' || hide_walls[key]) {
      // built-ins
      continue;
    }
    let desc = wall_descs[key]!;
    if (!desc.build_hide) {
      all_descs.push(['wall', desc]);
    }
  }
  for (let key in cell_descs) {
    if (key === 'solid' || key === 'open' || hide_cells[key]) {
      // built-ins
      continue;
    }
    let desc = cell_descs[key]!;
    if (!desc.build_hide) {
      all_descs.push(['cell', desc]);
    }
  }
  for (let key in spawn_descs) {
    if (key !== 'player') {
      all_descs.push(['spawn', spawn_descs[key]!]);
    }
  }
  all_descs.sort((a: DescPair, b: DescPair): number => {
    let a_key = `${a[0]},${a[1].id}`;
    let b_key = `${b[0]},${b[1].id}`;
    if (build_favorites[a_key] && !build_favorites[b_key]) {
      return -1;
    }
    if (!build_favorites[a_key] && build_favorites[b_key]) {
      return 1;
    }
    if (a[1].id < b[1].id) {
      return -1;
    } else if (b[1].id < a[1].id) {
      return 1;
    }
    return a[0] < b[0] ? -1 : 1;
  });
  let col_width = 32;
  for (let ii = 0; ii < all_descs.length; ++ii) {
    let pair = all_descs[ii];
    let [type, desc] = pair;
    let id = desc.id;
    let key = `${type},${id}`;
    let label = `${show_all ? `[${type}]\n` : ''}${id}${build_favorites[key] ? '*' : ''}`;
    drawPaletteThumbnail({
      pair,
      x: x + THUMBNAIL_PAD, y: y + THUMBNAIL_PAD, z,
      w: col_width - THUMBNAIL_PAD * 2, h: col_width - THUMBNAIL_PAD * 2,
    });
    if (button({
      font,
      font_style_normal: type ? palette_style[type] : undefined,
      font_style_focused: type ? palette_style_focused[type] : undefined,
      font_height: ui.font_height * PALETTE_FONT_SCALE,
      x, y, z,
      w: col_width, h: col_width,
      align: ALIGN.HWRAP|ALIGN.HVCENTER,
      text: label,
      base_name: palette.entries[palette.selected]?.join(',') === key ? 'buttonselected' : undefined,
    })) {
      if (keyDown(KEYS.ALT)) {
        if (build_favorites[key]) {
          delete build_favorites[key];
        } else {
          build_favorites[key] = true;
        }
        localStorageSetJSON('build_favs', build_favorites);
      } else {
        palette.entries[palette.selected] = [type, id];
        localStorageSetJSON<PaletteData>('build_palette', palette);
        show_palette_config = false;
      }
    }

    x += col_width + 1;
    if (x + col_width > mapped_x1) {
      x = 1;
      y += col_width + 1;
    }
  }
  if (x !== 1) {
    y += col_width + 1;
  }

  palette_config_scroll.end(y);
  y = min(scroll_y_start + y, y1);

  const PANEL_PAD = 3;
  ui.panel({
    x: x0 - PANEL_PAD, y: y0 - PANEL_PAD, z: z - 1,
    w: x1 - x0 + PANEL_PAD * 2,
    h: y - y0 + PANEL_PAD * 2,
  });
}

function showPaintPalette({
  level,
  x, y, z,
  x0, x1, col_width,
}: {
  level: CrawlerLevel;
  x: number; y: number; z: number;
  x0: number; x1: number; col_width: number;
}): {
  x : number; y: number;
} {
  const y0 = y;
  y += (col_width + 1) * 2;
  let { entries } = palette;
  for (let ii = 0; ii < PALETTE_SIZE; ++ii) {
    let entry = entries[ii] || [null, null];
    let type: 'wall' | 'cell' | 'spawn' | null = entry[0];
    let id = entry[1];
    let label;
    let pair: DescPair | null = null;
    if (type === 'cell') {
      if (crawlerHasCellDesc(id)) {
        let d2 = crawlerGetCellDesc(id);
        pair = ['cell', d2];
      }
    } else if (type === 'wall') {
      if (crawlerHasWallDesc(id)) {
        let d2 = crawlerGetWallDesc(id);
        pair = ['wall', d2];
      }
    } else if (type === 'spawn') {
      let d2 = crawlerGetSpawnDescs()[id];
      if (d2) {
        pair = ['spawn', d2];
      }
    } else {
      assert(type === null);
    }
    let desc: WallDesc | CellDesc | SpawnDesc | null = pair && pair[1];
    if (desc) {
      assert(pair);
      drawPaletteThumbnail({
        pair,
        x: x + THUMBNAIL_PAD, y: y + THUMBNAIL_PAD, z,
        w: col_width - THUMBNAIL_PAD * 2, h: col_width - THUMBNAIL_PAD * 2,
      });
      label = `[${type}]\n${desc.id}`;
    } else {
      type = null;
      label = '?';
    }
    let ret;
    let hotkeys = keyDown(KEYS.ALT) ? [] : [KEYS.NUMPAD1 + ii, KEYS['1'] + ii];
    if ((ret = button({
      font,
      font_style_normal: type ? palette_style[type] : undefined,
      font_style_focused: type ? palette_style_focused[type] : undefined,
      font_height: ui.font_height * PALETTE_FONT_SCALE,
      x, y, z,
      w: col_width, h: col_width,
      align: ALIGN.HWRAP|ALIGN.HVCENTER,
      base_name: palette.selected === ii ? 'buttonselected' : undefined,
      text: label,
      hotkeys,
    }))) {
      if (palette.selected === ii && show_palette_config) {
        show_palette_config = false;
      } else {
        if (palette.selected === ii || ret.double_click ||
          keyDown(KEYS.SHIFT) || padButtonDown(PAD.LEFT_TRIGGER) ||
          id === null
        ) {
          show_palette_config = true;
        }
        palette.selected = ii;
        localStorageSetJSON<PaletteData>('build_palette', palette);
      }
    }

    x += col_width + 1;
    if (x + col_width > x1) {
      x = x0;
      y -= col_width + 1;
    }
  }

  y = y0 + (col_width + 1) * 3;

  if (show_palette_config) {
    if (palette.selected < 3) {
      // not configurable
      show_palette_config = false;
    } else {
      showPaintPaletteConfig(level, x0 - 4);
    }
  }
  return { x, y };
}

let last_event: CrawlerCellEvent | null = null;
function setLastEvent(e: CrawlerCellEvent): void {
  last_event = e;
}
let last_prop: { key: string; text: string };
function setLastProp(prop: { key: string; text: string }): void {
  last_prop = prop;
}

let event_items: MenuItem[];
let default_event_name: string;
let cell_prop_key_items: MenuItem[] = [
  'key_cell',
  'key_north',
  'key_south',
  'key_east',
  'key_west',
  'new',
].map((name) => ({ name, tag: name }));
let level_prop_key_items: MenuItem[] = [
  'title',
  'new',
].map((name) => ({ name, tag: name }));

function addProps(level_props?: string[], cell_props?: string[]): void {
  if (level_props) {
    let last = level_prop_key_items.pop();
    for (let ii = 0; ii < level_props.length; ++ii) {
      level_prop_key_items.push({
        name: level_props[ii],
        tag: level_props[ii],
      });
    }
    level_prop_key_items.push(last!);
  }
  if (cell_props) {
    let last = cell_prop_key_items.pop();
    for (let ii = 0; ii < cell_props.length; ++ii) {
      cell_prop_key_items.push({
        name: cell_props[ii],
        tag: cell_props[ii],
      });
    }
    cell_prop_key_items.push(last!);
  }
}

let dropdown_display: Partial<SelectionBoxDisplay> = {
  xpad: 2,
};

function showCurrentCell(param: {
  level: CrawlerLevel;
  x: number;
  y: number;
  z: number;
  w: number;
}): { x: number; y: number } {
  let { x, y, z, w, level } = param;
  y += 2;
  let my_ent = crawlerMyEnt();
  let pos = my_ent.getData<[number, number, DirType]>('pos')!;
  let [myx, myy, dir] = pos;
  let tx = myx + DX[dir];
  let ty = myy + DY[dir];
  let font_height = ui.font_height * 0.75;
  let my_cell = level.getCell(myx, myy);
  let target_cell = level.getCell(tx, ty);
  font.draw({
    style: palette_style.wall,
    x, y, z,
    size: font_height,
    text: `Wall: ${my_cell && my_cell.walls[dir].id}`,
  });
  y += font_height + 1;
  if (target_cell) {
    let btn_w = w * 0.2;
    font.draw({
      style: palette_style.cell,
      x, y, z,
      size: font_height,
      w: w - btn_w * 2 - 2,
      align: font.ALIGN.HFIT,
      text: `Cell: ${target_cell.desc.id}`,
    });
    if (buttonText({
      x: x + w - btn_w * 2 - 1,
      y, z,
      w: btn_w,
      font_height: font_height*0.75,
      h: font_height,
      font,
      text: '+Event',
      font_style_normal: font_style_event,
      colors: colors_event,
    })) {
      crawlerBuildModeBegin();
      if (last_event) {
        target_cell.addEvent(last_event.id, last_event.param);
      } else {
        target_cell.addEvent(default_event_name, '');
      }
      crawlerBuildModeCommit();
    }
    if (buttonText({
      x: x + w - btn_w,
      y, z,
      w: btn_w,
      font_height: font_height*0.75,
      h: font_height,
      font,
      text: '+Prop',
      font_style_normal: font_style_prop,
      colors: colors_prop,
    })) {
      crawlerBuildModeBegin();
      if (last_prop && !target_cell.getProp(last_prop.key)) {
        target_cell.setProp(last_prop.key, last_prop.text);
      } else {
        target_cell.setProp('new', '');
      }
      crawlerBuildModeCommit();
    }
    y += font_height + 1;
    let { events, props } = target_cell;
    let w1 = w * 0.4;
    let x1 = x + w1 + 1;
    let x2 = x + w - font_height;
    let w2 = x2 - 1 - x1;
    if (events) {
      for (let ii = 0; ii < events.length; ++ii) {
        let event = events[ii];
        let new_id = dropDown({
          display: dropdown_display,
          x, y, z,
          width: w1,
          entry_height: font_height,
          font_height: font_height * 0.75,
          items: event_items,
        }, event.id, { suppress_return_during_dropdown: true });
        if (new_id) {
          crawlerBuildModeBegin();
          event.id = String(new_id.name);
          crawlerBuildModeCommit();
        }

        if (buttonText({
          x: x1,
          y, z,
          w: w2,
          font_height: font_height*0.75,
          h: font_height,
          font,
          text: event.param || '...',
          font_style_normal: font_style_event,
          colors: colors_event,
        })) {
          modalTextEntry({
            title: 'Event Parameter',
            text: `Enter parameter for event of type "${event.id}"`,
            edit_text: event.param || '',
            buttons: {
              ok: function (text: string) {
                crawlerBuildModeBegin();
                event.param = text;
                crawlerBuildModeCommit();
                setLastEvent(event);
              },
              cancel: null,
            },
          });
        }

        if (buttonText({
          x: x + w - font_height,
          y, z,
          w: font_height,
          font_height: font_height*0.75,
          h: font_height,
          font,
          text: 'X',
          font_style_normal: font_style_event,
          colors: colors_event,
        })) {
          crawlerBuildModeBegin();
          events.splice(ii, 1);
          if (!events.length) {
            delete target_cell.events;
          }
          crawlerBuildModeCommit();
        }

        y += font_height + 1;
      }
    }
    if (props) {
      let prop_keys = Object.keys(props);
      for (let ii = 0; ii < prop_keys.length; ++ii) {
        let prop_key = prop_keys[ii];
        let value = props[prop_key];
        let new_id = dropDown({
          display: dropdown_display,
          x, y, z,
          width: w1,
          entry_height: font_height,
          font_height: font_height * 0.75,
          items: cell_prop_key_items,
        }, prop_key, { suppress_return_during_dropdown: true });
        if (new_id) {
          crawlerBuildModeBegin();
          target_cell.setProp(prop_key, undefined);
          target_cell.setProp(String(new_id.name), value);
          crawlerBuildModeCommit();
        }

        if (buttonText({
          x: x1,
          y, z,
          w: w2,
          font_height: font_height*0.75,
          h: font_height,
          font,
          text: value && String(value) || '...',
          font_style_normal: font_style_prop,
          colors: colors_prop,
        })) {
          modalTextEntry({
            title: 'Cell Property',
            text: `Enter property value for "${prop_key}"`,
            edit_text: String(value) || '',
            buttons: {
              ok: function (text: string) {
                crawlerBuildModeBegin();
                target_cell!.setProp(prop_key, text);
                crawlerBuildModeCommit();
                setLastProp({ key: prop_key, text });
              },
              cancel: null,
            },
          });
        }

        if (buttonText({
          x: x + w - font_height,
          y, z,
          w: font_height,
          font_height: font_height*0.75,
          h: font_height,
          font,
          text: 'X',
          font_style_normal: font_style_prop,
          colors: colors_prop,
        })) {
          crawlerBuildModeBegin();
          target_cell.setProp(prop_key, undefined);
          crawlerBuildModeCommit();
        }

        y += font_height + 1;
      }
    }
  }
  let { initial_entities } = level;
  if (initial_entities) {
    for (let ii = 0; ii < initial_entities.length; ++ii) {
      let ent_ser = initial_entities[ii];
      let epos = ent_ser.pos as JSVec3;
      if (epos && epos[0] === tx && epos[1] === ty) {
        font.draw({
          style: palette_style.spawn,
          x, y, z,
          size: font_height,
          text: `Spawn: ${ent_ser.type}`,
        });
        y += font_height + 1;
      }
    }
  }

  return { x, y };
}

function resizeLevel(dx: number, dy: number): void {
  crawlerBuildModeBegin();
  let game_state = crawlerGameState();
  let level = game_state.level!;

  let old_cells = level.cells;
  let new_cells = [];
  let old_w = level.w;
  let old_h = level.h;
  let new_w = old_w + dx;
  let new_h = old_h + dy;
  let solid_desc = crawlerGetCellDesc('solid')!;
  // Fill in anything not solid if shrinking
  if (dx < 0) {
    for (let yy = 0; yy < old_h; ++yy) {
      for (let xx = old_w + dx; xx < old_w; ++xx) {
        level.setCell(xx, yy, solid_desc);
      }
    }
  }
  if (dy < 0) {
    for (let xx = 0; xx < old_w; ++xx) {
      for (let yy = old_h + dy; yy < old_h; ++yy) {
        level.setCell(xx, yy, solid_desc);
      }
    }
  }

  for (let yy = 0; yy < new_h; ++yy) {
    for (let xx = 0; xx < new_w; ++xx) {
      let idx = yy * new_w + xx;
      if (xx < old_w && yy < old_h) {
        new_cells[idx] = old_cells[yy * old_w + xx];
      } else {
        let cell = new_cells[idx] = new CrawlerCell(xx, yy);
        cell.desc = solid_desc;
      }
    }
  }
  level.cells = new_cells;
  level.w = new_w;
  level.h = new_h;
  // Prune out of bounds initial ents
  if (level.initial_entities) {
    for (let ii = level.initial_entities.length - 1; ii >= 0; --ii) {
      let data = level.initial_entities[ii];
      let pos = data.pos as JSVec3;
      if (pos[0] >= new_w || pos[1] >= new_h) {
        ridx(level.initial_entities, ii);
      }
    }
  }

  crawlerBuildModeCommit();
}


export function crawlerBuildModeUI(frame: Box & { map_view: boolean }): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  if (!level) {
    return;
  }
  if (keyDownEdge(KEYS.Z) && keyDown(KEYS.CTRL)) {
    buildModeUndo();
  }
  if (keyDownEdge(KEYS.Y) && keyDown(KEYS.CTRL)) {
    buildModeRedo();
  }
  if (keyDownEdge(KEYS.SPACE)) {
    if (build_tab === BuildTab.Path) {
      togglePath();
    } else {
      // toggleCell();
      // toggleWall();
      toggleWithSelected();
    }
  }
  if (keyDownEdge(KEYS.EQUALS)) {
    getChatUI().cmdParse(`floor ${game_state.floor_id + 1}`);
  }
  if (keyDownEdge(KEYS.MINUS) && game_state.floor_id !== 0) {
    getChatUI().cmdParse(`floor ${game_state.floor_id - 1}`);
  }

  if (frame.map_view) {
    return;
  }

  let { x, y, w, h } = frame;
  const x0 = x;
  const x1 = x + w;
  // const y0 = y;
  let z = Z.UI;
  drawRect(x, y, x + w, y + h, z - 1, [0,0,0,0.1]);

  const num_columns = 3;
  const col_width = floor((w - num_columns + 1) / num_columns);

  [BuildTab.Paint, BuildTab.Path, BuildTab.Config].forEach((tab: BuildTab, idx: number) => {
    if (button({
      x, y, z,
      w: col_width,
      h: button_height,
      disabled: build_tab === tab,
      base_name: build_tab === tab ? 'buttonselected' : 'button',
      text: tab,
      hotkey: show_palette_config && build_tab === BuildTab.Paint ? undefined :
        keyDown(KEYS.ALT) ? KEYS['1'] + idx : undefined,
      font,
    })) {
      localStorageSet('build_tab', tab);
      build_tab = tab;
    }
    x += col_width + 1;
  });

  x = x0;
  y += button_height + 2;

  if (build_tab === BuildTab.Paint) {
    // Palette area
    ({ x, y } = showPaintPalette({
      level,
      x, y, z,
      x0, x1, col_width,
    }));
    ({ x, y } = showCurrentCell({
      level, x, y, z, w,
    }));
  }
  if (build_tab === BuildTab.Config) {
    let vstyles = getVstyles();
    let items: MenuItem[] = [];
    for (let key in vstyles) {
      items.push({
        name: key,
        tag: key,
      });
    }

    let new_vstyle = dropDown({
      display: dropdown_display,
      auto_reset: false,
      x, y, z,
      width: w,
      entry_height: button_height,
      items,
    }, level.vstyle.id || 'default');
    if (new_vstyle) {
      buildModeSetVstyle(new_vstyle.tag!);
    }
    y += button_height + 2;

    let font_height = ui.font_height * 0.75;
    let button_w = font_height;
    let button_x = x + w - button_w * 2 - 1;

    font.draw({
      x, y, z,
      size: font_height,
      text: `Floor: ${game_state.floor_id}`,
    });
    if (ui.buttonText({
      x: button_x, y, z,
      w: button_w, h: button_w,
      text: '-',
      disabled: game_state.floor_id === 0,
    })) {
      getChatUI().cmdParse(`floor ${game_state.floor_id - 1}`);
    }
    if (ui.buttonText({
      x: button_x + button_w + 1, y, z,
      w: button_w, h: button_w,
      text: '+',
    })) {
      getChatUI().cmdParse(`floor ${game_state.floor_id + 1}`);
    }
    y += font_height + 2;

    font.draw({
      x, y, z,
      size: font_height,
      text: `Width: ${level.w}`,
    });
    if (ui.buttonText({
      x: button_x, y, z,
      w: button_w, h: button_w,
      text: '-',
      disabled: level.w <= 3,
    })) {
      resizeLevel(-1, 0);
    }
    if (ui.buttonText({
      x: button_x + button_w + 1, y, z,
      w: button_w, h: button_w,
      text: '+',
    })) {
      resizeLevel(1, 0);
    }
    y += font_height + 2;

    font.draw({
      x, y, z,
      size: font_height,
      text: `Height: ${level.h}`,
    });
    if (ui.buttonText({
      x: button_x, y, z,
      w: button_w, h: button_w,
      text: '-',
      disabled: level.h <= 3,
    })) {
      resizeLevel(0, -1);
    }
    if (ui.buttonText({
      x: button_x + button_w + 1, y, z,
      w: button_w, h: button_w,
      text: '+',
    })) {
      resizeLevel(0, 1);
    }
    y += font_height + 2;

    if (ui.buttonText({
      x, y, z,
      h: button_height,
      font,
      text: 'Generate Level',
    })) {
      mapViewSetActive(true);
      crawlerSetLevelGenMode(true);
    }
    y += button_height + 2;

    if (ui.buttonText({
      x, y, z,
      h: button_height,
      font,
      text: 'Reset Entities',
    })) {
      getChatUI().cmdParse('floor_reset');
    }
    y += button_height + 2;

    if (ui.buttonText({
      x, y, z,
      h: button_height,
      font,
      text: 'Reset Visibility',
    })) {
      getChatUI().cmdParse('reset_vis_data');
    }
    y += button_height + 2;

    // Level Props
    let btn_w = w * 0.2;
    if (buttonText({
      x: x + w - btn_w,
      y, z,
      w: btn_w,
      font_height: font_height*0.75,
      h: font_height,
      font,
      text: '+Prop',
      font_style_normal: font_style_prop,
      colors: colors_prop,
    })) {
      crawlerBuildModeBegin();
      level.setProp('new', '');
      crawlerBuildModeCommit();
    }

    y += font_height + 1;
    let { props } = level;
    let w1 = w * 0.4;
    let x1b = x + w1 + 1;
    let x2 = x + w - font_height;
    let w2 = x2 - 1 - x1b;
    let prop_keys = Object.keys(props);
    for (let ii = 0; ii < prop_keys.length; ++ii) {
      let prop_key = prop_keys[ii];
      let value = props[prop_key];
      let new_id = dropDown({
        display: dropdown_display,
        x, y, z,
        width: w1,
        entry_height: font_height,
        font_height: font_height * 0.75,
        items: level_prop_key_items,
      }, prop_key, { suppress_return_during_dropdown: true });
      if (new_id) {
        crawlerBuildModeBegin();
        level.setProp(prop_key, undefined);
        level.setProp(String(new_id.name), value);
        crawlerBuildModeCommit();
      }

      if (buttonText({
        x: x1b,
        y, z,
        w: w2,
        font_height: font_height*0.75,
        h: font_height,
        font,
        text: value && String(value) || '...',
        font_style_normal: font_style_prop,
        colors: colors_prop,
      })) {
        modalTextEntry({
          title: 'Level Property',
          text: `Enter property value for "${prop_key}"`,
          edit_text: String(value) || '',
          buttons: {
            ok: function (text: string) {
              crawlerBuildModeBegin();
              level!.setProp(prop_key, text);
              crawlerBuildModeCommit();
            },
            cancel: null,
          },
        });
      }

      if (buttonText({
        x: x + w - font_height,
        y, z,
        w: font_height,
        font_height: font_height*0.75,
        h: font_height,
        font,
        text: 'X',
        font_style_normal: font_style_prop,
        colors: colors_prop,
      })) {
        crawlerBuildModeBegin();
        level.setProp(prop_key, undefined);
        crawlerBuildModeCommit();
      }

      y += font_height + 1;
    }
  }

  x = 5;
  y = 5;
  if (keyDownEdge(KEYS.F1)) {
    settings.set('build_mode_help', 1 - settings.build_mode_help);
  }
  (settings.build_mode_help ? [
    'BUILD MODE',
    '[B] - Toggle Build Mode',
    build_tab === BuildTab.Path ? '[SPACE] - Toggle path (see map)' : '[SPACE] - Toggle cell/wall with selected',
    build_tab === BuildTab.Paint ? '[NUMPAD/1-9] - Select cell/wall from palette' : '',
    build_tab === BuildTab.Paint ? '  Double-select or shift-click to redefine palette' : '',
    '[ALT+1-3] - Change tab',
    '[CTRL+Z/Y] - Undo/Redo',
    '[M] - Map',
    '[+/-] - Change floor',
    '[F1] - Toggle this help',
    '[F2] - Toggle freecam',
  ] : ['BUILD MODE (F1 Help)']).forEach((text) => {
    let fh = ui.font_height * 0.5;
    font.draw({
      x, y, z,
      size: fh,
      text,
    });
    y += fh + 1;
  });
}

export function crawlerBuildModeStartup(params: {
  font?: Font;
  button_height?: number;
  level_props?: string[];
  cell_props?: string[];
}): void {
  font = params.font || ui.font;
  button_height = params.button_height || ui.button_height;
  event_items = crawlerScriptListEvents().map((id: string) => ({
    name: id,
    tag: id,
  }));
  addProps(params.level_props, params.cell_props);
  default_event_name = crawlerScriptListEvents()[0];
}

cmd_parse.register({
  cmd: 'vstyle',
  help: '(Build mode) change vstyle',
  func: function (param: string, resp_func: ErrorCallback<string>) {
    let game_state = crawlerGameState();
    let level = game_state.level;
    assert(level);
    if (param) {
      buildModeSetVstyle(param === 'reset' ? '' : param);
    }
    resp_func(null, `Vstyle = ${level.vstyle.id}`);
  }
});
