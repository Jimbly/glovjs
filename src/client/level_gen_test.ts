import * as glov_font from 'glov/client/font';
import { keyDownEdge } from 'glov/client/input';
import { slider } from 'glov/client/slider';
import * as ui from 'glov/client/ui';
import { dotPropGet, dotPropSet } from 'glov/common/dot-prop';
import { clamp, clone } from 'glov/common/util';
import { CrawlerState } from '../common/crawler_state';
import { default_gen_params } from '../common/level_generator';
import {
  buildModeActive,
  crawlerBuildModeBegin,
  crawlerBuildModeCommit,
} from './crawler_build_mode';
import { crawlerInitBuildModeLevelGenerator } from './crawler_play';

const { round } = Math;

let params = {
  //floor: 0,
  seed: 0,
  ...clone(default_gen_params.brogue),

  // More Moraff-y
  // w: 63,
  // h: 47,
  // max_rooms: 80,
  // odds: {
  //   small_rect: 1,
  //   organic_large: 1,
  // },
  // hallway_chance: 1,
};

function hundreds(v: number): number {
  return round(v * 100) / 100;
}

let style = glov_font.style(null, {
  outline_width: 2.5,
  outline_color: 0x000000ff,
  color: 0xFFFFFFff,
});

let last_params = '';
let need_pos_reinit = false;
export function levelGenTest(game_state: CrawlerState): boolean {
  let x = 0;
  let y = -1;
  let w = 40;
  let z = Z.DEBUG + 10;

  function param(
    shortname: string, key: string, min: number, max: number,
    proc: (v:number) => number, keydec?: number, keyinc?: number
  ): void {
    let value = dotPropGet(params, key);
    dotPropSet(params, key, (value = proc(slider(value, { x, y, z, w, min, max }))));
    ui.print(style, x + w + 2, y + 4, z, `${value} : ${shortname}`);
    y += ui.button_height;
    if (keydec && keyDownEdge(keydec)) {
      dotPropSet(params, key, clamp(value - 1, min, max));
    }
    if (keyinc && keyDownEdge(keyinc)) {
      dotPropSet(params, key, clamp(value + 1, min, max));
    }
  }
  //param('floor', 'floor', 0, 20, round, KEYS.COMMA, KEYS.PERIOD);
  param('seed', 'seed', 0, 100, round);
  param('w', 'w', 4, 100, round);
  param('h', 'h', 4, 100, round);
  param('rooms', 'max_rooms', 1, 500, round);
  for (let key in default_gen_params.brogue.odds) {
    param(key, `odds.${key}`, 0, 10, round);
  }
  param('hallway', 'hallway_chance', 0, 1, hundreds);
  param('closets', 'closets', 0, 100, round);
  param('passage', 'passageway_chance', 0, 1, hundreds);
  param('shops', 'shops', 0, 3, round);
  param('min pits', 'pits_min', 0, 20, round);
  param('+ pits rnd', 'pits_random', 0, 20, round);
  param('min enemies', 'enemies_min', 0, 20, round);
  param('+ enemies rnd', 'enemies_random', 0, 20, round);


  let cur_params = JSON.stringify(params);
  if (cur_params !== last_params && !game_state.anyLevelLoading()) {
    last_params = cur_params;
    let level_generator_test = crawlerInitBuildModeLevelGenerator();
    level_generator_test.seed_override = String(params.seed);
    level_generator_test.level_gen_params = { type: 'brogue', brogue: clone(params) };
    level_generator_test.resetAllLevels();
    if (buildModeActive()) {
      crawlerBuildModeBegin();
    }
    game_state.resetAllLevels();
    game_state.getLevelForFloorAsync(game_state.floor_id, () => {
      game_state.setLevelActive(game_state.floor_id);
      if (buildModeActive()) {
        crawlerBuildModeCommit();
      }
      need_pos_reinit = true;
    });
  }
  let ret = need_pos_reinit;
  need_pos_reinit = false;
  return ret;
}
