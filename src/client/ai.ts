export const AI_CLAIM_TIME = 2000;

import assert from 'assert';
import * as engine from 'glov/client/engine';
import { getFrameTimestamp } from 'glov/client/engine';
import { EntityManager } from 'glov/common/entity_base_common';
import { sign } from 'glov/common/util';
import {
  v2copy,
  v2dist,
  v3copy,
  Vec2,
} from 'glov/common/vmath';
import { entSamePos } from '../common/crawler_entity_common';
import type { CrawlerScriptAPI } from '../common/crawler_script';
import {
  BLOCK_OPEN,
  CrawlerState,
  dirFromDelta,
  DirType,
  DX,
  DY,
  JSVec2,
  JSVec3,
} from '../common/crawler_state';
import { crawlerEntFactory } from './crawler_entity_client';
import { EntityDemoClient } from './entity_demo_client';
import { myEnt } from './play';
import { statusSet } from './status';

const { abs, floor, random } = Math;

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


export type WanderOpts = Record<never, never>;
export type WanderState = {
  home_pos: JSVec3;
};
export type EntityWander = EntityDemoClient & {
  wander_state: WanderState;
  wander_opts: WanderOpts;
  aiWander: (game_state: CrawlerState, script_api: CrawlerScriptAPI) => boolean;
};

export type PatrolOpts = Record<never, never>;
export type PatrolState = {
  last_pos: JSVec3;
};
export type EntityPatrol = EntityDemoClient & {
  patrol_state: PatrolState;
  patrol_opts: PatrolOpts;
  aiPatrol: (game_state: CrawlerState, script_api: CrawlerScriptAPI) => boolean;
};

export type HunterOpts = {
  radius: number;
};
export type HunterState = {
  has_target: boolean;
  target_pos: JSVec3;
};
export type EntityHunter = EntityDemoClient & {
  hunter_state: HunterState;
  hunter_opts: HunterOpts;
  aiHunt: (game_state: CrawlerState, script_api: CrawlerScriptAPI) => boolean;
};


function ignoreErrors(): void {
  // nothing
}

function isEnemy(ent: Entity): boolean {
  return ent.isEnemy();
}

export function aiTraitsClientStartup(): void {
  let ent_factory = crawlerEntFactory<Entity>();
  ent_factory.registerTrait<WanderOpts, WanderState>('wander', {
    methods: {
      aiWander: function (this: EntityWander, game_state: CrawlerState, script_api: CrawlerScriptAPI): boolean {
        let pos = this.getData<JSVec3>('pos');
        assert(pos);
        let dir = floor(random() * 4) as DirType;
        let floor_id = this.getData<number>('floor');
        assert(typeof floor_id === 'number');
        let level = game_state.levels[floor_id];
        script_api.setPos(pos);
        if (level.wallsBlock(pos, dir, script_api) !== BLOCK_OPEN) {
          return false;
        }
        let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
        if (entitiesAt(this.entity_manager, new_pos, floor_id, true).length) {
          return false;
        }
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
        }, undefined, ignoreErrors);
        return true;
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
      aiPatrol: function (this: EntityPatrol, game_state: CrawlerState, script_api: CrawlerScriptAPI): boolean {
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
          return false;
        }


        let dir = paths[floor(random() * paths.length)];
        script_api.setPos(pos);
        // if (level.wallsBlock(pos, dir, script_api) !== BLOCK_OPEN) {
        //   return;
        // }
        let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
        let ents = entitiesAt(this.entity_manager, new_pos, floor_id, true);
        ents = ents.filter(isEnemy);
        if (ents.length) {
          return false;
        }
        v3copy(this.patrol_state.last_pos, pos);
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
          last_pos: pos,
        }, undefined, ignoreErrors);
        return true;
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

  ent_factory.registerTrait<HunterOpts, HunterState>('hunter', {
    properties: {
      ai_move_min_time: 500,
      ai_move_rand_time: 100,
    },
    default_opts: {
      radius: 3,
    },
    methods: {
      aiHunt: function (this: EntityHunter, game_state: CrawlerState, script_api: CrawlerScriptAPI): boolean {
        // if they can see the player, update target pos to that pos
        // if they have a target pos, attempt to move towards it
        // if there's no clear path to target, give up

        // in range?
        let pos = this.getData<JSVec3>('pos')!;
        let player_pos = myEnt().data.pos;
        let floor_id = this.getData<number>('floor');
        assert(typeof floor_id === 'number');
        let level = game_state.levels[floor_id];
        let distance = v2dist(player_pos, pos);
        // let volume = lerp(min(distance/5, 1), 1, 0.25);
        let can_see = false;
        if (distance <= this.hunter_opts.radius) {

          // can see?
          if (level.simpleVisCheck(pos, player_pos, script_api)) {
            if (!this.hunter_state.has_target) {
              if (distance) {
                if (engine.defines.HUNTER) {
                  statusSet(`edbg${this.id}`, `${this.id}: New target: ${this.hunter_state.target_pos}`).counter = 500;
                }
                // playUISound('hunter_seen', volume);
              }
            } else if (v2dist(this.hunter_state.target_pos, player_pos)) {
              if (engine.defines.HUNTER) {
                statusSet(`edbg${this.id}`, `${this.id}: Target update: ${this.hunter_state.target_pos}`).counter = 500;
              }
            }
            v2copy(this.hunter_state.target_pos, player_pos);
            this.hunter_state.has_target = true;
            can_see = true;
          }
        }

        if (!this.hunter_state.has_target) {
          return false;
        }

        let { target_pos } = this.hunter_state;

        // head towards target
        let dx = target_pos[0] - pos[0];
        let dy = target_pos[1] - pos[1];
        let tot = abs(dx) + abs(dy);
        if (!tot) {
          if (!can_see) {
            if (engine.defines.HUNTER) {
              statusSet(`edbg${this.id}`, `${this.id}: Reached last known target`).counter = 500;
            }
            // playUISound('hunter_lost', volume);
          } else {
            // at target, and player is there, don't move, combat should trigger
            if (engine.defines.HUNTER) {
              statusSet(`edbg${this.id}`, `${this.id}: On target`).counter = 500;
            }
          }
          this.hunter_state.has_target = false;
          return true;
        }
        let xdir: DirType;
        if (dx) {
          xdir = dirFromDelta([sign(dx), 0]);
          if (level.wallsBlock(pos, xdir, script_api) !== BLOCK_OPEN) {
            dx = 0;
          }
        }
        let ydir: DirType;
        if (dy) {
          ydir = dirFromDelta([0, sign(dy)]);
          if (level.wallsBlock(pos, ydir, script_api) !== BLOCK_OPEN) {
            dy = 0;
          }
        }

        tot = abs(dx) + abs(dy);
        if (!tot) {
          if (can_see) {
            // keep the target
            if (engine.defines.HUNTER) {
              statusSet(`edbg${this.id}`, `${this.id}: Move wall blocked - can see`).counter = 500;
            }
          } else if (!can_see) {
            // give up
            if (engine.defines.HUNTER) {
              statusSet(`edbg${this.id}`, `${this.id}: Move wall blocked - giving up`).counter = 500;
            }
            // playUISound('hunter_lost', volume);
            this.hunter_state.has_target = false;
          }
          return true;
        }
        let do_x = random() * tot < abs(dx);
        let dir = do_x ? xdir! : ydir!;
        let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
        let ents = entitiesAt(this.entity_manager, new_pos, floor_id, true);
        ents = ents.filter(isEnemy);
        if (ents.length) {
          if (engine.defines.HUNTER) {
            statusSet(`edbg${this.id}`, `${this.id}: Move ent blocked`).counter = 500;
          }
          return false;
        }
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
          last_pos: pos,
        }, undefined, ignoreErrors);
        return true;
      },
    },
    alloc_state: function (opts: HunterOpts, ent: Entity) {
      let ret: HunterState = {
        target_pos: [0, 0, 0],
        has_target: false,
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
  ai_pause: boolean,
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
      let moved = false;
      if (!moved && (ent as EntityHunter).aiHunt) {
        moved = (ent as EntityHunter).aiHunt(game_state, script_api);
      }
      if (!moved && (ent as EntityPatrol).aiPatrol) {
        moved = (ent as EntityPatrol).aiPatrol(game_state, script_api);
      }
      if (!moved && (ent as EntityWander).aiWander) {
        moved = (ent as EntityWander).aiWander(game_state, script_api);
      }
    }
    ent.aiResetMoveTime(false);
  }
}

export function aiStepFloor(
  floor_id: number,
  game_state: CrawlerState,
  entity_manager: EntityManager<Entity>,
  defines: Partial<Record<string, true>>,
  ai_pause: boolean,
  script_api: CrawlerScriptAPI,
): void {
  if (ai_pause) {
    return;
  }
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

    if (!no_move) {
      let moved = false;
      if (!moved && (ent as EntityHunter).aiHunt && !defines?.PEACE) {
        moved = (ent as EntityHunter).aiHunt(game_state, script_api);
      }
      if (!moved && (ent as EntityPatrol).aiPatrol) {
        moved = (ent as EntityPatrol).aiPatrol(game_state, script_api);
      }
      if (!moved && (ent as EntityWander).aiWander) {
        moved = (ent as EntityWander).aiWander(game_state, script_api);
      }
    }
  }
}
