import assert from 'assert';
import { autoAtlas, autoAtlasTextureOpts } from 'glov/client/autoatlas';
import * as camera2d from 'glov/client/camera2d';
import * as engine from 'glov/client/engine';
import {
  FontStyle,
  fontStyle,
} from 'glov/client/font';
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
  drawLine,
  uiTextHeight,
} from 'glov/client/ui';
import { merge } from 'glov/common/util';
import {
  ROVec4,
  rovec4,
  vec2,
} from 'glov/common/vmath';
import {
  CrawlerScriptAPI,
  crawlerScriptEventFunc,
  CrawlerScriptEventMapIcon,
  CrawlerScriptEventMapIcons,
  crawlerScriptRegisterFunc,
  getEffCell,
  getEffWall,
} from '../common/crawler_script';
import {
  CrawlerCell,
  CrawlerCellEvent,
  CrawlerState,
  DirType,
  DirTypeOrCell,
  DX, DY,
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

let compass_sprite: Sprite;
let sprite_mult: Shader;
let allow_pathfind: boolean = true;

let build_mode_entity_icons: Partial<Record<string, string>> = {
  def: 'spawner',
};

function crawlerScriptEventsGetIcon(api: CrawlerScriptAPI, events: CrawlerCellEvent[]): CrawlerScriptEventMapIcon {
  let ret: CrawlerScriptEventMapIcon = CrawlerScriptEventMapIcons.NONE;
  for (let ii = 0; ii < events.length; ++ii) {
    let event = events[ii];
    let { id, param } = event;
    let func = crawlerScriptEventFunc(id);
    if (func) {
      let { map_icon } = func;
      if (typeof map_icon === 'function') {
        if (buildModeActive()) {
          map_icon = CrawlerScriptEventMapIcons.NONE;
        } else {
          map_icon = map_icon(api, param || '');
        }
      }
      if (map_icon) {
        if (!ret) {
          ret = map_icon;
        } else if (ret.startsWith('icon_')) { // TODO: maybe need a priority map of some kind?
          ret = map_icon;
        }
      }
    }
  }
  return ret;
}

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
  if (cur < total) {
    perc = min(perc, 99);
  } else if (cur > total) {
    perc = 100;
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
let color_rollover = rovec4(1,1,1,1);
let color_path = rovec4(1,0.5,0,1);

let ents_visible_outside_fog_of_war = false;
let hide_name_on_minimap = false;
let style_map_name: FontStyle | null = fontStyle(null, {
  color: 0xFFFFFFff,
  outline_width: 3,
  outline_color: 0x000000ff,
});
let style_map_info: FontStyle | null = fontStyle(null, {
  color: 0xFFFFFFff,
});

let compass_border_w = 6;

export type CrawlerMapViewParam = {
  game_state: CrawlerState;
  x: number;
  y: number;
  w: number;
  h: number;
  tile_size: number;
  step_size: number;
  compass_x: number;
  compass_y: number;
  compass_w: number;
  compass_h: number; // if 0, compass is disabled
  z: number;
  level_gen_test: boolean;
  script_api: CrawlerScriptAPIClient;
  button_disabled: boolean;
};

export function crawlerMapViewDraw({
  game_state,
  x,
  y,
  w,
  h,
  compass_w,
  compass_h,
  z,
  level_gen_test,
  script_api,
  button_disabled,
  compass_x,
  compass_y,
  tile_size,
  step_size,
}: CrawlerMapViewParam): void {
  const build_mode = buildModeActive();
  let { level } = game_state;
  if (!level) {
    // still loading
    return;
  }
  script_api.setLevel(level);
  let entity_manager = crawlerEntityManager();
  if (engine.DEBUG && input.keyDownEdge(input.KEYS.F4)) {
    engine.defines.FULL_VIS = !engine.defines.FULL_VIS;
  }
  let full_vis = engine.defines.FULL_VIS || build_mode;

  let fullscreen = w > engine.game_width / 2;

  const text_height = uiTextHeight();

  if (!fullscreen) {
    let hover_area = {
      x, y, w, h,
      disabled: button_disabled,
    };
    if (compass_y === hover_area.y + hover_area.h) {
      hover_area.h += compass_h;
    }
    let { ret, state } = ui.buttonShared(hover_area);
    if (state === 'rollover') {
      ui.drawRect(hover_area.x - 1, hover_area.y - 1,
        hover_area.x + hover_area.w + 1,
        hover_area.y + hover_area.h + 1,
        Z.MAP - 1, color_rollover);
    }
    if (ret) {
      mapViewToggle();
    }
  }

  let { entities } = entity_manager;
  let num_enemies = 0;
  for (let ent_id in entities) {
    let ent = entities[ent_id]!;
    if (ent.isEnemy() && !ent.fading_out && ent.data.floor === game_state.floor_id) {
      ++num_enemies;
    }
  }
  let initial_entities = level.initial_entities || [];
  let total_enemies = initial_entities.length;
  //last_progress = level.seen_cells/level.total_cells;
  last_progress = total_enemies ? max(0, 1 - (num_enemies / total_enemies)) : 1;
  let floor_title = level.props.title as string || `Floor ${game_state.floor_id}`;
  let floor_subtitle = level.props.subtitle as string || '';
  if (fullscreen) {
    if (style_map_name) {
      ui.font.drawSizedAligned(style_map_name, x, y + 2, z + 1, text_height,
        ui.font.ALIGN.HCENTER, w, 0, floor_title);
      if (floor_subtitle) {
        ui.font.drawSizedAligned(style_map_name, x, y + 2 + text_height + 2, z + 1, text_height * 0.75,
          ui.font.ALIGN.HCENTER, w, 0, floor_subtitle);
      }
    }
    if (full_vis) {
      ui.font.drawSizedAligned(style_map_info, x, y + h - (text_height + 2)*2, z + 1, text_height,
        ui.font.ALIGN.HCENTER, w, 0, `${num_enemies}/${total_enemies}`);
      ui.font.drawSizedAligned(style_map_info, x, y + h - (text_height + 2), z + 1, text_height,
        ui.font.ALIGN.HCENTER, w, 0, `${level.seen_cells}/${level.total_cells}`);
    } else if (!level.props.noexplore) {
      ui.font.drawSizedAligned(style_map_info, x, y + h - (text_height + 2)*2, z + 1, text_height,
        ui.font.ALIGN.HCENTER, w, 0, `${num_enemies} ${num_enemies === 1 ? 'enemy' : 'enemies'} remaining`);
      ui.font.drawSizedAligned(style_map_info, x, y + h - (text_height + 2), z + 1, text_height,
        ui.font.ALIGN.HCENTER, w, 0, `${percLabel(level.seen_cells, level.total_cells)} explored`);
    }
  }

  if (compass_h) {
    moved_since_fullscreen = false;
    // draw compass rose underneath
    compass_w = compass_w || w;
    let uoffs = (-game_state.angle / (2*PI)) * 92/256;
    while (uoffs < 0) {
      uoffs += 92/256;
    }
    uoffs = round(uoffs * 256) / 256;
    // overlays
    compass_sprite.draw({
      x: compass_x, y: compass_y, z: z+3,
      w: compass_border_w, h: compass_h,
      frame: 1,
    });
    compass_sprite.draw({
      x: compass_x + compass_w - compass_border_w,
      y: compass_y,
      z: z+3,
      w: compass_border_w,
      h: compass_h,
      frame: 2,
    });
    // background
    compass_sprite.draw({
      x: compass_x,
      y: compass_y,
      z,
      w: compass_w,
      h: compass_h,
      uvs: [uoffs, compass_h/32, compass_w/256+uoffs, compass_h*2/32],
    });
    // text
    compass_sprite.draw({
      x: compass_x, y: compass_y, z: z + 2,
      w: compass_w,
      h: compass_h - 1,
      uvs: [0, compass_h*2/32, compass_w/256, 1],
      shader: sprite_mult,
      shader_params: {
        tex_offs: vec2(uoffs, -compass_h*2/32),
      },
    });
  }

  if (!fullscreen) {
    if (style_map_name && !hide_name_on_minimap) {
      ui.font.drawSizedAligned(style_map_name, x, y + 1, z + 1, text_height,
        ui.font.ALIGN.HCENTER, w, 0, floor_title);
    }
    // Optional star for showing completion
    // if (level.seen_cells === level.total_cells && !num_enemies && level.props.map_show_star) {
    //   sprite_icons.draw({
    //     x: x + w - 9 + 1,
    //     y: y + h - 8 + 1,
    //     z: z + 1,
    //     w: 9, h: 8,
    //     frame: FRAME_STAR,
    //   });
    // }
  }

  if (fullscreen) {
    camera2d.push();
    camera2d.setNormalized();
    autoAtlas('map', 'bg').draw({
      x: 0, y: 0, z, w: 1, h: 1,
    });
    camera2d.pop();
    spriteClipPush(z, x, y, w, h);
  } else {
    spriteClipPush(z, x, y, w, h);
    autoAtlas('map', 'bg').draw({
      x, y, z, w, h,
    });
  }
  z += 0.1;
  if (fullscreen) {
    // full screen, center map
    let xoffs = floor((w - (level.w + 2) * step_size) / 2);
    x += xoffs;
    y += floor((h - (level.h + 2) * step_size) / 2);
    if (level_gen_test && xoffs > 0) {
      // offset to right
      x += round(xoffs * 0.75);
    }
  } else {
    // mini

    // center on self
    x -= round(game_state.pos[0] * step_size - floor(w/2) + step_size * 1.5);
    y -= round((level.h - game_state.pos[1])*step_size - floor(h/2) + step_size * 0.5);
  }
  let x0 = x + step_size;
  let y1 = y + level.h * step_size;
  let center_offs = step_size / 2;
  // draw self
  let self_x = round(game_state.pos[0]);
  let self_y = round(game_state.pos[1]);
  let self_dir = (round(game_state.angle / (PI/2)) + 4) % 4 as DirType;
  autoAtlas('map', `playerdir${self_dir}`).draw({
    x: x0 + self_x * step_size,
    y: y1 - self_y * step_size,
    z: z + 1,
    w: tile_size,
    h: tile_size,
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
          autoAtlas('map', detail).draw({
            x: x0 + xx * step_size,
            y: y1 - yy * step_size,
            z: z - 0.01,
            w: tile_size,
            h: tile_size,
          });
        }
      }
      if (detail_visible && cell.events) {
        // Draw any event icons
        script_api.setPos([xx, yy]);
        let event_icon = crawlerScriptEventsGetIcon(script_api, cell.events);
        if (build_mode && !event_icon && !(detail && detail_visible)) {
          event_icon = CrawlerScriptEventMapIcons.QUESTION;
        }
        if (event_icon) {
          autoAtlas('map', event_icon).draw({
            x: x0 + xx * step_size,
            y: y1 - yy * step_size,
            z: z - 0.005,
            w: tile_size,
            h: tile_size,
          });
        }
      }
      // Floor
      if (full_vis && !cell_desc.open_vis) {
        autoAtlas('map', 'floor_solid').draw({
          x: x0 + xx * step_size,
          y: y1 - yy * step_size,
          z: z - 0.05,
          w: tile_size,
          h: tile_size,
        });
      } else if (visible || detail_visible) {
        let is_visible = cell.visible_frame === engine.frame_index - 1 || level_gen_test;
        let icon = is_visible ? 'floor_visible_lit' : 'floor_visible_unlit';
        autoAtlas('map', icon).draw({
          x: x0 + xx * step_size,
          y: y1 - yy * step_size,
          z: z - 0.05,
          w: tile_size,
          h: tile_size,
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
          autoAtlas('map', frame).draw({
            x: x0 + xx * step_size,
            y: y1 - yy * step_size - center_offs,
            z,
            w: tile_size,
            h: tile_size,
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
          autoAtlas('map', frame).draw({
            x: x0 + xx * step_size + center_offs,
            y: y1 - yy * step_size,
            z,
            w: tile_size,
            h: tile_size,
          });
        }
      }
      if (xx === 0 && visible) {
        script_api.is_visited = false;
        let wall = getEffWall(script_api, cell, WEST);
        if (wall.map_view_wall_frame_east) {
          autoAtlas('map', wall.map_view_wall_frame_west || wall.map_view_wall_frame_east).draw({
            x: x0 + xx * step_size - center_offs,
            y: y1 - yy * step_size,
            z,
            w: tile_size,
            h: tile_size,
          });
        }
      }
      if (yy === 0 && visible) {
        script_api.is_visited = false;
        let wall = getEffWall(script_api, cell, SOUTH);
        if (wall.map_view_wall_frame_north) {
          autoAtlas('map', wall.map_view_wall_frame_south || wall.map_view_wall_frame_north).draw({
            x: x0 + xx * step_size,
            y: y1 - yy * step_size + center_offs,
            z,
            w: tile_size,
            h: tile_size,
          });
        }
      }

      if (build_mode) {
        let paths = level.getPathsForMap(xx, yy);
        for (let ii = 0; ii < paths.length; ++ii) {
          let dir = paths[ii];
          let x2 = xx + DX[dir];
          let y2 = yy + DY[dir];
          drawLine(
            x0 + xx * step_size + center_offs + 0.5,
            y1 - yy * step_size + center_offs + 0.5,
            x0 + x2 * step_size + center_offs + 0.5,
            y1 - y2 * step_size + center_offs + 0.5,
            z+3, 0.5, 1,
            color_path);
        }
      }
    }
  }

  if (full_vis && initial_entities) {
    for (let ii = 0; ii < initial_entities.length; ++ii) {
      let ent = initial_entities[ii];
      let [xx,yy] = ent.pos as [number, number];
      let frame = build_mode_entity_icons[ent.type as string] || build_mode_entity_icons.def!;
      autoAtlas('map', frame).draw({
        x: x0 + xx * step_size,
        y: y1 - yy * step_size,
        z: z - 0.01,
        w: tile_size,
        h: tile_size,
      });
    }
  }

  let vis_entities = {} as Partial<Record<number, boolean>>;
  if (!level_gen_test && !build_mode) {
    for (let ent_id in entities) {
      let ent = entities[ent_id]!;
      let icon = ent.map_icon;
      if (icon && !ent.fading_out && ent.data.floor === game_state.floor_id) {
        let [xx,yy] = ent.data.pos;
        let vis = false;
        if (full_vis) {
          vis = true;
        } else {
          let cell = level.getCell(xx, yy);
          if (!cell || cell.visible_frame === engine.frame_index - 1 && cell.visible_bits) {
            vis = true;
          }
          if (ents_visible_outside_fog_of_war && cell?.visible_bits) {
            vis = true;
          }
        }
        if (vis) {
          // draw it
          vis_entities[xx + yy * level.w] = true;
          autoAtlas('map', icon).draw({
            x: x0 + xx * step_size,
            y: y1 - yy * step_size,
            z: z - 0.01,
            w: tile_size,
            h: tile_size,
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
      let mx = floor((mouse_pos[0] - x0 - 0.5) / step_size);
      let my = floor((y1 - mouse_pos[1] + step_size + 0.5) / step_size);
      let mouse_cell = level.getCell(mx, my);
      if (mouse_cell && moved_since_fullscreen) { // && mouse_cell.visible_bits) {
        let mouse_frame: string | null = null;
        if (build_mode) {
          // teleport
          if (mouse_cell.desc.open_move) {
            mouse_frame = 'pathfind_good';
            if (input.click({
              max_dist: Infinity, // allow drag in touch mode
            })) {
              mapViewSetActive(false);
              crawlerController().floorAbsolute(game_state.floor_id, mx, my);
            }
          } else {
            mouse_frame = 'pathfind_bad'; // error
          }
        } else if (allow_pathfind) {
          // pathfind
          let path = pathFind(level, self_x, self_y, self_dir, mx, my, full_vis, script_api);
          if (path) {
            for (let ii = 0; ii < path.length; ++ii) {
              let idx = path[ii];
              let frame = ii === path.length - 1 ? level.cells[idx].isVisiblePit() ? 'pathfind_bad' :
                'pathfind_good' : 'pathfind_unknown';
              if (vis_entities[idx]) {
                frame = 'pathfind_bad';
              }
              let cx = idx % level.w;
              let cy = (idx - cx) / level.w;
              autoAtlas('map', frame).draw({
                x: x0 + cx * step_size,
                y: y1 - cy * step_size,
                z: z - 0.01,
                w: tile_size,
                h: tile_size,
              });
              if (frame === 'pathfind_bad') {
                break;
              }
            }
            if (input.click({
              max_dist: Infinity, // allow drag in touch mode
            })) {
              pathTo(mx, my);
            }
          } else {
            mouse_frame = 'pathfind_bad'; // error
          }
        }
        if (mouse_frame) {
          autoAtlas('map', mouse_frame).draw({
            x: x0 + mx * step_size,
            y: y1 - my * step_size,
            z: z - 0.01,
            w: tile_size,
            h: tile_size,
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

export function crawlerMapViewStartup(param: {
  allow_pathfind?: boolean;
  color_rollover?: ROVec4;
  build_mode_entity_icons?: Partial<Record<string, string>>;
  style_map_name?: FontStyle | null;
  style_map_info?: FontStyle | null;
  hide_name_on_minimap?: boolean;
  ents_visible_outside_fog_of_war?: boolean;
  compass_border_w?: number;
}): void {
  allow_pathfind = param.allow_pathfind ?? true;
  hide_name_on_minimap = param.hide_name_on_minimap ?? false;
  ents_visible_outside_fog_of_war = param.ents_visible_outside_fog_of_war ?? false;
  color_rollover = param.color_rollover || color_rollover;
  if (param.style_map_name !== undefined) {
    style_map_name = param.style_map_name;
  }
  if (param.style_map_info !== undefined) {
    style_map_info = param.style_map_info;
  }
  if (param.build_mode_entity_icons) {
    merge(build_mode_entity_icons, param.build_mode_entity_icons);
  }
  if (1) {
    autoAtlasTextureOpts('map', {
      filter_min: gl.NEAREST,
      filter_mag: gl.NEAREST,
    });
  }
  compass_border_w = param.compass_border_w || 6;
  compass_sprite = spriteCreate({
    name: 'crawler_compass',
    ws: [160,compass_border_w,compass_border_w,256-compass_border_w-compass_border_w-160],
    hs: [11,11,10],
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
  });
  sprite_mult = shaderCreate('shaders/sprite_mult.fp');
}
