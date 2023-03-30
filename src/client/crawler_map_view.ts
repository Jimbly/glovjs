import assert from 'assert';
import * as engine from 'glov/client/engine';
import * as input from 'glov/client/input';
import { shaderCreate } from 'glov/client/shaders';
import {
  Sprite,
  spriteClipPop,
  spriteClipPush,
  spriteCreate,
} from 'glov/client/sprites';
import * as ui from 'glov/client/ui';
import {
  ROVec4,
  rovec4,
  vec2,
} from 'glov/common/vmath';
import {
  CrawlerScriptEventMapIcon,
  crawlerScriptEventsGetIcon,
  crawlerScriptRegisterFunc,
  getEffCell,
  getEffWall,
} from '../common/crawler_script';
import {
  CrawlerCell,
  CrawlerState,
  DX, DY,
  DirType,
  DirTypeOrCell,
  EAST,
  NORTH,
  SOUTH,
  VIS_PASSED_EAST,
  VIS_PASSED_NORTH,
  WEST,
} from '../common/crawler_state';
import { pathFind } from '../common/pathfind';
import { buildModeActive } from './crawler_build_mode';
import { crawlerEntityManager } from './crawler_entity_client';
import { crawlerController, crawlerSetLevelGenMode } from './crawler_play';
import { CrawlerScriptAPIClient } from './crawler_script_api_client';

type Shader = ReturnType<typeof shaderCreate>;

const { floor, max, min, round, PI } = Math;

let map_sprite: Sprite;
let compass_sprite: Sprite;
let sprite_mult: Shader;

const MAP_TILE_SIZE = 7;
const MAP_STEP_SIZE = 6;
const MAP_CENTER_OFFS = 3;

let map_view: boolean = engine.defines.MAP || false;
export function mapViewActive(): boolean {
  return map_view;
}
export function mapViewSetActive(val: boolean): void {
  map_view = val;
  engine.defines.MAP = val;
  if (!map_view) {
    crawlerSetLevelGenMode(false);
  }
}
export function mapViewToggle(): void {
  mapViewSetActive(!mapViewActive());
}

export function pathTo(target_x: number, target_y: number): void {
  mapViewSetActive(false);
  crawlerController().pathTo(target_x, target_y);
}


function percLabel(cur: number, total: number): string {
  let perc = max(1, round(cur/total * 100));
  if (cur !== total) {
    perc = min(perc, 99);
  }
  return `${perc}%`;
}

crawlerScriptRegisterFunc('UNVISITED', function (
  script_api: CrawlerScriptAPIClient, cell: CrawlerCell, dir: DirTypeOrCell
): boolean {
  return !script_api.is_visited;
});

let last_progress = 0;
export function mapViewLastProgress(): number {
  if (engine.defines.HAPPY) {
    return input.mousePos()[0] / engine.game_width;
  }
  return last_progress;
}

let mouse_pos = vec2();
let moved_since_fullscreen = false;
let color_map_rollover = rovec4(1,1,1,1);

export function crawlerMapViewDraw(
  game_state: CrawlerState,
  x: number,
  y: number,
  w: number,
  h: number,
  compass_h: number,
  z: number,
  level_gen_test: boolean,
  script_api: CrawlerScriptAPIClient,
  button_disabled: boolean,
): void {
  const build_mode = buildModeActive();
  let { level } = game_state;
  if (!level) {
    // still loading
    return;
  }
  let entity_manager = crawlerEntityManager();
  if (input.keyDownEdge(input.KEYS.F4)) {
    engine.defines.FULL_VIS = !engine.defines.FULL_VIS;
  }
  let full_vis = engine.defines.FULL_VIS || build_mode;

  let fullscreen = w === engine.game_width;

  if (!fullscreen) {
    let { ret, state } = ui.buttonShared({
      x, y, w, h: h + compass_h,
      disabled: button_disabled,
    });
    if (state === 'rollover') {
      ui.drawRect(x - 1, y - 1, x + w + 1, y + h + compass_h + 1,
        Z.MAP - 1, color_map_rollover);
    }
    if (ret) {
      mapViewToggle();
    }
  }

  let { entities } = entity_manager;
  let num_enemies = 0;
  for (let ent_id in entities) {
    let ent = entities[ent_id]!;
    if (ent.isEnemy() && !ent.fading_out) {
      ++num_enemies;
    }
  }
  let initial_entities = level.initial_entities || [];
  let total_enemies = initial_entities.length;
  //last_progress = level.seen_cells/level.total_cells;
  last_progress = total_enemies ? max(0, 1 - (num_enemies / total_enemies)) : 1;
  if (fullscreen) {
    ui.font.drawSizedAligned(null, x, y + 2, z + 1, ui.font_height,
      ui.font.ALIGN.HCENTER, w, 0, `Floor ${game_state.floor_id}`);
    if (full_vis) {
      ui.font.drawSizedAligned(null, x, y + h - (ui.font_height + 2)*2, z + 1, ui.font_height,
        ui.font.ALIGN.HCENTER, w, 0, `${num_enemies}/${total_enemies}`);
      ui.font.drawSizedAligned(null, x, y + h - (ui.font_height + 2), z + 1, ui.font_height,
        ui.font.ALIGN.HCENTER, w, 0, `${level.seen_cells}/${level.total_cells}`);
    } else {
      ui.font.drawSizedAligned(null, x, y + h - (ui.font_height + 2)*2, z + 1, ui.font_height,
        ui.font.ALIGN.HCENTER, w, 0, `${num_enemies} enemies remaining`);
      ui.font.drawSizedAligned(null, x, y + h - (ui.font_height + 2), z + 1, ui.font_height,
        ui.font.ALIGN.HCENTER, w, 0, `${percLabel(level.seen_cells, level.total_cells)} explored`);
    }
  }

  if (compass_h) {
    moved_since_fullscreen = false;
    // draw compass rose underneath
    let uoffs = (-game_state.angle / (2*PI)) * 92/256;
    while (uoffs < 0) {
      uoffs += 92/256;
    }
    uoffs = round(uoffs * 256) / 256;
    // overlays
    compass_sprite.draw({
      x, y: y+h, z: z+1,
      w: 6, h: compass_h,
      frame: 1,
    });
    compass_sprite.draw({
      x: x + 54-6, y: y+h, z: z+1,
      w: 6, h: compass_h,
      frame: 2,
    });
    // background
    compass_sprite.draw({
      x, y: y + h, z,
      w, h: compass_h,
      uvs: [uoffs, 11/32, 54/256+uoffs, 22/32],
    });
    // text
    compass_sprite.draw({
      x, y: y + h, z: z + 2,
      w, h: compass_h - 1,
      uvs: [0, 22/32, 54/256, 1],
      shader: sprite_mult,
      shader_params: {
        tex_offs: vec2(uoffs, -22/32),
      },
    });
  }

  if (!fullscreen) {
    ui.font.drawSizedAligned(null, x, y + 1, z + 1, ui.font_height,
      ui.font.ALIGN.HCENTER, w, 0, `Floor ${game_state.floor_id}`);
  }

  spriteClipPush(z, x, y, w, h);
  map_sprite.draw({
    x, y, z, w, h,
    frame: 0,
  });
  z += 0.1;
  if (fullscreen) {
    // full screen, center map
    let xoffs = (w - (level.w + 2) * MAP_STEP_SIZE) / 2;
    x += xoffs;
    y += (h - (level.h + 2) * MAP_STEP_SIZE) / 2;
    if (level_gen_test && xoffs > 0) {
      // offset to right
      x += round(xoffs * 0.75);
    }
  } else {
    // mini

    // center on self
    x -= round(game_state.pos[0] * MAP_STEP_SIZE - w/2 + MAP_STEP_SIZE * 1.5);
    y -= round((level.h - game_state.pos[1])*MAP_STEP_SIZE - h/2 + MAP_STEP_SIZE * 0.5);
  }
  let x0 = x + MAP_STEP_SIZE;
  let y1 = y + level.h * MAP_STEP_SIZE;
  // draw self
  let self_x = round(game_state.pos[0]);
  let self_y = round(game_state.pos[1]);
  let self_dir = (round(game_state.angle / (PI/2)) + 4) % 4 as DirType;
  map_sprite.draw({
    x: x0 + self_x * MAP_STEP_SIZE,
    y: y1 - self_y * MAP_STEP_SIZE,
    z: z + 1,
    w: MAP_TILE_SIZE,
    h: MAP_TILE_SIZE,
    frame: 12 + self_dir,
  });
  for (let yy = 0; yy < level.h; ++yy) {
    for (let xx = 0; xx < level.w; ++xx) {
      let cell = level.getCell(xx, yy)!;
      let cell_desc = getEffCell(script_api, cell);
      let visible = cell.visible_bits || full_vis && cell_desc.open_vis;
      let detail = cell_desc.map_view_detail_frame;
      if (cell_desc.map_view_detail_frame_visited) {
        if (full_vis || cell.isVisited()) {
          detail = cell_desc.map_view_detail_frame_visited;
        }
      }
      let detail_visible = visible;
      if (detail) {
        if (!detail_visible && cell_desc.advertised_wall_desc) {
          // This is looking to see if we have a (not visible) shop cell on the other side of a
          // (visible) shop door, and therefore should draw it on the map, as the player
          // knows it's there.  Same for entrance, exit, stairs, etc.
          for (let ii = 0; ii < 4; ++ii) {
            let neighbor = level.getCell(xx + DX[ii], yy + DY[ii]);
            if (neighbor && neighbor.visible_bits &&
              neighbor.walls[(ii+2)%4] === cell_desc.advertised_wall_desc
            ) {
              detail_visible = true; // Draw the detail, and the floor, but not any thing else
            }
          }
        }
        if (detail_visible) {
          map_sprite.draw({
            x: x0 + xx * MAP_STEP_SIZE,
            y: y1 - yy * MAP_STEP_SIZE,
            z: z - 0.01,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame: detail,
          });
        }
      }
      if (detail_visible && cell.events) {
        // Draw any event icons
        let event_icon = crawlerScriptEventsGetIcon(cell.events);
        if (build_mode && !event_icon && !(detail && detail_visible)) {
          event_icon = CrawlerScriptEventMapIcon.QUESTION;
        }
        if (event_icon) {
          map_sprite.draw({
            x: x0 + xx * MAP_STEP_SIZE,
            y: y1 - yy * MAP_STEP_SIZE,
            z: z - 0.005,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame: event_icon,
          });
        }
      }
      // Floor
      if (full_vis && !cell_desc.open_vis) {
        map_sprite.draw({
          x: x0 + xx * MAP_STEP_SIZE,
          y: y1 - yy * MAP_STEP_SIZE,
          z: z - 0.05,
          w: MAP_TILE_SIZE,
          h: MAP_TILE_SIZE,
          frame: 11,
        });
      } else if (visible || detail_visible) {
        map_sprite.draw({
          x: x0 + xx * MAP_STEP_SIZE,
          y: y1 - yy * MAP_STEP_SIZE,
          z: z - 0.05,
          w: MAP_TILE_SIZE,
          h: MAP_TILE_SIZE,
          frame: cell.visible_frame === engine.frame_index - 1 || level_gen_test ? 1 : 20,
        });
      }
      // Walls
      let neighbor = level.getCell(xx, yy+1);
      let north_visible = neighbor && (neighbor.visible_bits || full_vis && neighbor.desc.open_vis);
      if (visible || north_visible) {
        script_api.is_visited = (cell.visible_bits & VIS_PASSED_NORTH) || full_vis;
        let frame;
        if (visible) {
          let wall = getEffWall(script_api, cell, NORTH);
          frame = wall.map_view_wall_frame_north;
          if (north_visible) {
            assert(neighbor);
            let wall_south = getEffWall(script_api, neighbor, SOUTH);
            if (wall_south.map_view_wall_frame_priority > wall.map_view_wall_frame_priority) {
              frame = wall_south.map_view_wall_frame_south;
            }
          }
        } else {
          assert(neighbor);
          let wall_south = getEffWall(script_api, neighbor, SOUTH);
          frame = wall_south.map_view_wall_frame_south;
        }
        if (frame) {
          map_sprite.draw({
            x: x0 + xx * MAP_STEP_SIZE,
            y: y1 - yy * MAP_STEP_SIZE - MAP_CENTER_OFFS,
            z,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame,
          });
        }
      }
      neighbor = level.getCell(xx+1, yy);
      let east_visible = neighbor && (neighbor.visible_bits || full_vis && neighbor.desc.open_vis);
      if (visible || east_visible) {
        script_api.is_visited = (cell.visible_bits & VIS_PASSED_EAST) || full_vis;
        let frame;
        if (visible) {
          let wall = getEffWall(script_api, cell, EAST);
          frame = wall.map_view_wall_frame_east;
          if (east_visible) {
            assert(neighbor);
            let wall_west = getEffWall(script_api, neighbor, WEST);
            if (wall_west.map_view_wall_frame_priority > wall.map_view_wall_frame_priority) {
              frame = wall_west.map_view_wall_frame_west;
            }
          }
        } else {
          assert(neighbor);
          let wall_west = getEffWall(script_api, neighbor, WEST);
          frame = wall_west.map_view_wall_frame_west;
        }
        if (frame) {
          map_sprite.draw({
            x: x0 + xx * MAP_STEP_SIZE + MAP_CENTER_OFFS,
            y: y1 - yy * MAP_STEP_SIZE,
            z,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame,
          });
        }
      }
      if (xx === 0 && visible) {
        script_api.is_visited = false;
        let wall = getEffWall(script_api, cell, WEST);
        if (wall.map_view_wall_frame_east) {
          map_sprite.draw({
            x: x0 + xx * MAP_STEP_SIZE - MAP_CENTER_OFFS,
            y: y1 - yy * MAP_STEP_SIZE,
            z,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame: wall.map_view_wall_frame_west || wall.map_view_wall_frame_east,
          });
        }
      }
      if (yy === 0 && visible) {
        script_api.is_visited = false;
        let wall = getEffWall(script_api, cell, SOUTH);
        if (wall.map_view_wall_frame_north) {
          map_sprite.draw({
            x: x0 + xx * MAP_STEP_SIZE,
            y: y1 - yy * MAP_STEP_SIZE + MAP_CENTER_OFFS,
            z,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame: wall.map_view_wall_frame_south || wall.map_view_wall_frame_north,
          });
        }
      }
    }
  }

  if (full_vis && initial_entities) {
    for (let ii = 0; ii < initial_entities.length; ++ii) {
      let ent = initial_entities[ii];
      let [xx,yy] = ent.pos as [number, number];
      map_sprite.draw({
        x: x0 + xx * MAP_STEP_SIZE,
        y: y1 - yy * MAP_STEP_SIZE,
        z: z - 0.01,
        w: MAP_TILE_SIZE,
        h: MAP_TILE_SIZE,
        frame: 19,
      });
    }
  }

  let vis_entities = {} as Partial<Record<number, boolean>>;
  if (!level_gen_test && !build_mode) {
    for (let ent_id in entities) {
      let ent = entities[ent_id]!;
      if (ent.isEnemy() && !ent.fading_out) {
        let [xx,yy] = ent.data.pos;
        let vis = false;
        if (full_vis) {
          vis = true;
        } else {
          let cell = level.getCell(xx, yy);
          if (!cell || cell.visible_frame === engine.frame_index - 1 && cell.visible_bits) {
            vis = true;
          }
        }
        if (vis) {
          // draw it
          vis_entities[xx + yy * level.w] = true;
          map_sprite.draw({
            x: x0 + xx * MAP_STEP_SIZE,
            y: y1 - yy * MAP_STEP_SIZE,
            z: z - 0.01,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame: 18,
          });
        }
      }
    }
  }

  if (!level_gen_test) {
    if (fullscreen) {
      if (input.mouseMoved() || input.mouseDownAnywhere()) {
        moved_since_fullscreen = true;
      }
      input.mousePos(mouse_pos);
      let mx = floor((mouse_pos[0] - x0 - 0.5) / MAP_STEP_SIZE);
      let my = floor((y1 - mouse_pos[1] + MAP_STEP_SIZE + 0.5) / MAP_STEP_SIZE);
      let mouse_cell = level.getCell(mx, my);
      if (mouse_cell && moved_since_fullscreen) { // && mouse_cell.visible_bits) {
        let mouse_frame: number | null = null;
        if (build_mode) {
          // teleport
          if (mouse_cell.desc.open_move) {
            mouse_frame = 23;
            if (input.click({
              max_dist: Infinity, // allow drag in touch mode
            })) {
              mapViewSetActive(false);
              crawlerController().floorAbsolute(game_state.floor_id, mx, my);
            }
          } else {
            mouse_frame = 24; // error
          }
        } else {
          // pathfind
          let path = pathFind(level, self_x, self_y, self_dir, mx, my, full_vis);
          if (path) {
            for (let ii = 0; ii < path.length; ++ii) {
              let idx = path[ii];
              let frame = ii === path.length - 1 ? level.cells[idx].isVisiblePit() ? 24 : 23 : 22;
              if (vis_entities[idx]) {
                frame = 24;
              }
              let cx = idx % level.w;
              let cy = (idx - cx) / level.w;
              map_sprite.draw({
                x: x0 + cx * MAP_STEP_SIZE,
                y: y1 - cy * MAP_STEP_SIZE,
                z: z - 0.01,
                w: MAP_TILE_SIZE,
                h: MAP_TILE_SIZE,
                frame,
              });
              if (frame === 24) {
                break;
              }
            }
            if (input.click({
              max_dist: Infinity, // allow drag in touch mode
            })) {
              pathTo(mx, my);
            }
          } else {
            mouse_frame = 24; // error
          }
        }
        if (mouse_frame) {
          map_sprite.draw({
            x: x0 + mx * MAP_STEP_SIZE,
            y: y1 - my * MAP_STEP_SIZE,
            z: z - 0.01,
            w: MAP_TILE_SIZE,
            h: MAP_TILE_SIZE,
            frame: mouse_frame,
          });
        }
      }
      if (input.click()) {
        mapViewToggle();
      }
    }
  }

  spriteClipPop();
}

export function crawlerMapViewStartup(color_rollover?: ROVec4): void {
  if (color_rollover) {
    color_map_rollover = color_rollover;
  }
  map_sprite = spriteCreate({
    name: 'map_tileset',
    ws: [7,7,7,7,7,7,7,7,7],
    hs: [7,7,7,7],
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
  });
  compass_sprite = spriteCreate({
    name: 'compass',
    ws: [160,6,6,256-6-6-160],
    hs: [11,11,10],
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
  });
  sprite_mult = shaderCreate('shaders/sprite_mult.fp');
}
