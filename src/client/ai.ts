export const AI_CLAIM_TIME = 2000;

import assert from 'assert';
import { getFrameTimestamp } from 'glov/client/engine';
import { EntityManager } from 'glov/common/entity_base_common';
import {
  Vec2,
  v3copy,
} from 'glov/common/vmath';
import { entSamePos } from '../common/crawler_entity_common';
import {
  BLOCK_OPEN,
  CrawlerState,
  DX,
  DY,
  DirType,
  JSVec2,
  JSVec3,
} from '../common/crawler_state';
import { crawlerEntFactory } from './crawler_entity_client';
import { EntityDemoClient } from './entity_demo_client';

import type { CrawlerScriptAPI } from '../common/crawler_script';

const { floor, random } = Math;

type Entity = EntityDemoClient;

function randomFrom<T>(arr: T[]): T {
  return arr[floor(random() * arr.length)];
}

function entitiesAt<T extends Entity>(
  entity_manager: EntityManager<T>,
  pos: Vec2,
  floor_id: number,
  skip_fading_out: boolean
): T[] {
  return entity_manager.entitiesFind((ent) => entSamePos(ent, pos) && ent.data.floor === floor_id, skip_fading_out);
}

let temp_pos: JSVec2 = [0, 0];
export function entitiesAdjacentTo<T extends Entity>(
  game_state: CrawlerState,
  entity_manager: EntityManager<T>,
  floor_id: number,
  pos: Vec2,
  script_api: CrawlerScriptAPI,
): T[] {
  let ret: T[] = [];
  let level = game_state.levels[floor_id];
  script_api.setLevel(level);
  script_api.setPos(pos);
  for (let dir = 0 as DirType; dir < 4; ++dir) {
    if (level.wallsBlock(pos, dir, script_api) !== BLOCK_OPEN) {
      continue;
    }
    temp_pos[0] = pos[0] + DX[dir];
    temp_pos[1] = pos[1] + DY[dir];
    let ents = entitiesAt(entity_manager, temp_pos, floor_id, true);
    if (ents.length) {
      ret = ret.concat(ents);
    }
  }
  return ret;
}


export type WanderOpts = {
};
export type WanderState = {
  home_pos: JSVec3;
};
export type EntityWander = EntityDemoClient & {
  wander_state: WanderState;
  wander_opts: WanderOpts;
  aiWander: (game_state: CrawlerState, script_api: CrawlerScriptAPI) => void;
};

export type PatrolOpts = {
};
export type PatrolState = {
  last_pos: JSVec3;
};
export type EntityPatrol = EntityDemoClient & {
  patrol_state: PatrolState;
  patrol_opts: PatrolOpts;
  aiPatrol: (game_state: CrawlerState, script_api: CrawlerScriptAPI) => void;
};


function ignoreErrors(): void {
  // nothing
}

export function aiTraitsClientStartup(): void {
  let ent_factory = crawlerEntFactory<Entity>();
  ent_factory.registerTrait<WanderOpts, WanderState>('wander', {
    methods: {
      aiWander: function (this: EntityWander, game_state: CrawlerState, script_api: CrawlerScriptAPI) {
        let pos = this.getData<JSVec3>('pos');
        assert(pos);
        let dir = floor(random() * 4) as DirType;
        let floor_id = this.getData<number>('floor');
        assert(typeof floor_id === 'number');
        let level = game_state.levels[floor_id];
        script_api.setPos(pos);
        if (level.wallsBlock(pos, dir, script_api) !== BLOCK_OPEN) {
          return;
        }
        let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
        if (entitiesAt(this.entity_manager, new_pos, floor_id, true).length) {
          return;
        }
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
        }, undefined, ignoreErrors);
      },
    },
    default_opts: {},
    alloc_state: function (opts: WanderOpts, ent: Entity) {
      let ret: WanderState = {
        home_pos: ent.data.pos.slice(0) as JSVec3,
      };
      return ret;
    }
  });

  ent_factory.registerTrait<PatrolOpts, PatrolState>('patrol', {
    properties: {
      ai_move_min_time: 667,
      ai_move_rand_time: 0,
    },
    methods: {
      aiPatrol: function (this: EntityPatrol, game_state: CrawlerState, script_api: CrawlerScriptAPI) {
        let pos = this.getData<JSVec3>('pos')!;
        let last_pos = this.patrol_state.last_pos;
        let floor_id = this.getData<number>('floor');
        assert(typeof floor_id === 'number');
        let level = game_state.levels[floor_id];
        let paths = level.getPaths(pos[0], pos[1]);
        if (paths.length > 1) {
          paths = paths.filter((dir: DirType) => {
            let x2 = pos[0] + DX[dir];
            let y2 = pos[1] + DY[dir];
            return !(last_pos[0] === x2 && last_pos[1] === y2);
          });
        }
        if (!paths.length) {
          return;
        }


        let dir = paths[floor(random() * paths.length)];
        script_api.setPos(pos);
        // if (level.wallsBlock(pos, dir, script_api) !== BLOCK_OPEN) {
        //   return;
        // }
        let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
        if (entitiesAt(this.entity_manager, new_pos, floor_id, true).length) {
          return;
        }
        v3copy(this.patrol_state.last_pos, pos);
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
          last_pos: pos,
        }, undefined, ignoreErrors);
      },
    },
    default_opts: {},
    alloc_state: function (opts: PatrolOpts, ent: Entity) {
      let ret: PatrolState = {
        last_pos: ent.data.pos.slice(0) as JSVec3,
      };
      return ret;
    }
  });

}

function isLivingPlayer(ent: Entity): boolean {
  return ent.isPlayer() && ent.isAlive();
}

function foeNear<T extends Entity>(game_state: CrawlerState, ent: T, script_api: CrawlerScriptAPI): T | null {
  // search, needs game_state, returns list of foes
  let ents: T[] = entitiesAdjacentTo(game_state,
    ent.entity_manager as unknown as EntityManager<T>,
    ent.data.floor, ent.data.pos, script_api);
  ents = ents.filter(isLivingPlayer);
  if (ents.length) {
    return randomFrom(ents);
  }
  return null;
}

function aiDoEnemy(
  game_state: CrawlerState,
  ent: Entity,
  defines: Partial<Record<string, true>>,
  script_api: CrawlerScriptAPI,
): boolean {
  let foe_near = foeNear(game_state, ent, script_api);
  if (defines?.PEACE || defines?.AIPEACE) {
    foe_near = null;
  }
  if (!foe_near) {
    return false;
  }

  return true;
}


export function aiDoFloor(
  floor_id: number,
  game_state: CrawlerState,
  entity_manager: EntityManager<Entity>,
  defines: Partial<Record<string, true>>,
  ai_pause: 0 | 1,
  script_api: CrawlerScriptAPI,
): void {
  if (ai_pause) {
    return;
  }
  let frame_timestamp = getFrameTimestamp();
  let entities = entity_manager.entities;
  let level = game_state.levels[floor_id];
  script_api.setLevel(level);
  for (let ent_id in entities) {
    let ent = entities[ent_id]!;
    if (ent.data.floor !== floor_id || ent.fading_out) {
      // not on current floor
      continue;
    }

    let no_move = false;
    if (ent.is_enemy && aiDoEnemy(game_state, ent, defines, script_api)) {
      // not wandering/patrolling/etc
      no_move = true;
    }

    if (frame_timestamp < ent.ai_next_move_time) {
      continue;
    }
    if (ent.aiLastUpdatedBySomeoneElse()) {
      if (frame_timestamp - ent.last_update_timestamp < AI_CLAIM_TIME) {
        // someone else updated recently, ignore
        ent.aiResetMoveTime(false);
        continue;
      } // else it's been a while, do an update if we want
    }
    if (!no_move) {
      if ((ent as EntityWander).aiWander) {
        (ent as EntityWander).aiWander(game_state, script_api);
      }
      if ((ent as EntityPatrol).aiPatrol) {
        (ent as EntityPatrol).aiPatrol(game_state, script_api);
      }
    }
    ent.aiResetMoveTime(false);
  }
}
