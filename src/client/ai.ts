export const AI_CLAIM_TIME = 2000;

import assert from 'assert';
import { debugDefineIsSet, getFrameTimestamp } from 'glov/client/engine';
import { EntityManager } from 'glov/common/entity_base_common';
import { sign } from 'glov/common/util';
import {
  ROVec2,
  v2copy,
  v2dist,
  v2manhattanDist,
  v3copy,
  Vec2,
} from 'glov/common/vmath';
import { CRAWLER_TURN_BASED } from '../common/crawler_config';
import { entSamePos } from '../common/crawler_entity_common';
import type { CrawlerScriptAPI } from '../common/crawler_script';
import {
  BLOCK_MOVE,
  BLOCK_OPEN,
  BLOCK_VIS,
  CrawlerState,
  dirFromDelta,
  DirType,
  DX,
  DY,
  JSVec2,
  JSVec3,
} from '../common/crawler_state';
import { crawlerEntFactory } from './crawler_entity_client';
import { TurnBasedStepReason } from './crawler_play';
import { EntityClient } from './entity_game_client';
import { attackPlayer, myEnt } from './play';
import { statusSet } from './status';

const { abs, floor, random } = Math;

type Entity = EntityClient;

export type AIStepPayload = {
  reason: TurnBasedStepReason;
};

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
  pos: ROVec2,
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
  prefer_door: boolean;
};
export type EntityWander = Entity & {
  wander_state: WanderState;
  wander_opts: WanderOpts;
  aiWander: (game_state: CrawlerState, script_api: CrawlerScriptAPI, payload: AIStepPayload) => boolean;
};

export type PatrolOpts = Record<never, never>;
export type PatrolState = {
  last_pos: JSVec3;
};
export type EntityPatrol = Entity & {
  patrol_state: PatrolState;
  patrol_opts: PatrolOpts;
  aiPatrol: (game_state: CrawlerState, script_api: CrawlerScriptAPI, payload: AIStepPayload) => boolean;
};

export type HunterOpts = {
  radius: number;
  see_through_walls: boolean;
};
export type HunterState = {
  has_target: boolean;
  target_pos: JSVec3;
  preferred_axis?: 'x' | 'y'; // note: not serialized
};
export type EntityHunter = Entity & {
  hunter_state: HunterState;
  hunter_opts: HunterOpts;
  aiHunt: (game_state: CrawlerState, script_api: CrawlerScriptAPI, payload: AIStepPayload) => boolean;
};


function ignoreErrors(err: unknown): void {
  console.log(`Ignoring error sending AI update: ${err}`);
}

function isEnemy(ent: Entity): boolean {
  return ent.isEnemy();
}

export function aiTraitsClientStartup(): void {
  let ent_factory = crawlerEntFactory<Entity>();
  ent_factory.registerTrait<WanderOpts, WanderState>('wander', {
    methods: {
      aiWander: function (
        this: EntityWander,
        game_state: CrawlerState,
        script_api: CrawlerScriptAPI,
        payload: AIStepPayload,
      ): boolean {
        profilerStartFunc();
        if (random() < 0.25) {
          // just do not wander 1 in 4 times
          // TODO: app/entity override on this parameter?
          profilerStopFunc();
          return false;
        }
        let pos = this.getData<JSVec3>('pos');
        assert(pos);
        let floor_id = this.getData<number>('floor');
        assert(typeof floor_id === 'number');
        let level = game_state.levels[floor_id];
        script_api.setPos(pos);
        let dir = floor(random() * 4) as DirType;
        let was_from_pref = false;
        if (this.wander_state.prefer_door) {
          was_from_pref = true;
          this.wander_state.prefer_door = false;
          let opts: DirType[] = [];
          for (let ii = 0 as DirType; ii < 4; ++ii) {
            let block = level.wallsBlock(pos, ii, script_api);
            if (!(block & BLOCK_MOVE) && (block & BLOCK_VIS)) {
              opts.push(ii);
            }
          }
          if (opts.length) {
            dir = opts[floor(random() * opts.length)];
          }
        }
        if (level.wallsBlock(pos, dir, script_api) & BLOCK_MOVE ||
          !was_from_pref && level.isSecretDoor(pos, dir, script_api)
        ) {
          profilerStopFunc();
          return false;
        }
        let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
        if (level.getCell(new_pos[0], new_pos[1])?.props?.noai ||
          level.getCell(new_pos[0], new_pos[1])?.events?.length
        ) {
          // avoid going onto events (e.g. stairs in/out)
          profilerStopFunc();
          return false;
        }
        if (entitiesAt(this.entity_manager, new_pos, floor_id, true).length) {
          profilerStopFunc();
          return false;
        }
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
        }, undefined, ignoreErrors);
        profilerStopFunc();
        return true;
      },
    },
    default_opts: {},
    alloc_state: function (opts: WanderOpts, ent: Entity) {
      let ret: WanderState = {
        home_pos: ent.data.pos.slice(0) as JSVec3,
        prefer_door: false,
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
      aiPatrol: function (
        this: EntityPatrol,
        game_state: CrawlerState,
        script_api: CrawlerScriptAPI,
        payload: AIStepPayload,
      ): boolean {
        profilerStartFunc();
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
          profilerStopFunc();
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
          profilerStopFunc();
          return false;
        }
        v3copy(this.patrol_state.last_pos, pos);
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
          last_pos: pos,
        }, undefined, ignoreErrors);
        profilerStopFunc();
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
      see_through_walls: false,
    },
    methods: {
      aiHunt: function (
        this: EntityHunter,
        game_state: CrawlerState,
        script_api: CrawlerScriptAPI,
        payload: AIStepPayload,
      ): boolean {
        profilerStartFunc();
        // if they can see the player, update target pos to that pos
        // if they have a target pos, attempt to move towards it
        // if there's no clear path to target, give up

        // in range?
        let pos = this.getData<JSVec3>('pos')!;
        let player_pos = myEnt().getData<JSVec3>('pos')!;
        let floor_id = this.getData<number>('floor');
        assert(typeof floor_id === 'number');
        let level = game_state.levels[floor_id];
        let distance = v2dist(player_pos, pos);
        // let volume = lerp(min(distance/5, 1), 1, 0.25);
        let can_see = false;
        const { radius, see_through_walls } = this.hunter_opts;
        if (distance <= radius) {

          // can see?
          if (level.simpleVisCheck(pos, player_pos, script_api,
            see_through_walls ? 'visBlockSeeThroughDoors' : 'visBlockNormal')
          ) {
            if (!this.hunter_state.has_target) {
              if (distance) {
                if (debugDefineIsSet('HUNTER')) {
                  statusSet(`edbg${this.id}`, `${this.id}: New target: ${player_pos}`).counter = 500;
                }
                // playUISound('hunter_seen', volume);
              }
            } else if (v2dist(this.hunter_state.target_pos, player_pos)) {
              if (debugDefineIsSet('HUNTER')) {
                statusSet(`edbg${this.id}`, `${this.id}: Target update: ${player_pos}`).counter = 500;
              }
            }
            v2copy(this.hunter_state.target_pos, player_pos);
            this.hunter_state.has_target = true;
            can_see = true;
          }
        }

        if (!this.hunter_state.has_target) {
          profilerStopFunc();
          return false;
        }

        let { target_pos } = this.hunter_state;

        // head towards target
        let dx = target_pos[0] - pos[0];
        let dy = target_pos[1] - pos[1];
        let tot = abs(dx) + abs(dy);
        if (!tot) {
          let ret = true;
          if (!can_see) {
            if (debugDefineIsSet('HUNTER')) {
              statusSet(`edbg${this.id}`, `${this.id}: Reached last known target`).counter = 500;
            }
            if ((this as unknown as EntityWander).wander_state) {
              // Got there, can't see him, prefer wandering through doors if possible
              (this as unknown as EntityWander).wander_state.prefer_door = true;
            }
            // playUISound('hunter_lost', volume);
            ret = false; // trigger an immediate wander
          } else {
            // at target, and player is there, don't move, combat should trigger
            if (debugDefineIsSet('HUNTER')) {
              statusSet(`edbg${this.id}`, `${this.id}: On target`).counter = 500;
            }
          }
          this.hunter_state.has_target = false;
          profilerStopFunc();
          return ret;
        }
        let xdir: DirType;
        if (dx) {
          xdir = dirFromDelta([sign(dx), 0]);
          if (level.wallsBlock(pos, xdir, script_api) & BLOCK_MOVE) {
            dx = 0;
          }
          let new_pos = [pos[0] + sign(dx), pos[1]];
          if (level.getCell(new_pos[0], new_pos[1])?.props?.noai ||
            level.getCell(new_pos[0], new_pos[1])?.events?.length
          ) {
            // avoid going onto events (e.g. stairs in/out)
            dx = 0;
          }
        }
        let ydir: DirType;
        if (dy) {
          ydir = dirFromDelta([0, sign(dy)]);
          if (level.wallsBlock(pos, ydir, script_api) & BLOCK_MOVE) {
            dy = 0;
          }
          let new_pos = [pos[0], pos[1] + sign(dy)];
          if (level.getCell(new_pos[0], new_pos[1])?.props?.noai ||
            level.getCell(new_pos[0], new_pos[1])?.events?.length
          ) {
            // avoid going onto events (e.g. stairs in/out)
            dy = 0;
          }
        }

        tot = abs(dx) + abs(dy);
        if (!tot) {
          if (can_see) {
            // keep the target
            if (debugDefineIsSet('HUNTER')) {
              statusSet(`edbg${this.id}`, `${this.id}: Move wall blocked - can see`).counter = 500;
            }
          } else if (!can_see) {
            // give up
            if (debugDefineIsSet('HUNTER')) {
              statusSet(`edbg${this.id}`, `${this.id}: Move wall blocked - giving up`).counter = 500;
            }
            // playUISound('hunter_lost', volume);
            this.hunter_state.has_target = false;
          }
          profilerStopFunc();
          return true;
        }

        if (dx) {
          let new_pos: JSVec3 = [pos[0] + DX[xdir!], pos[1] + DY[xdir!], pos[2]];
          let ents = entitiesAt(this.entity_manager, new_pos, floor_id, true);
          ents = ents.filter(isEnemy);
          if (ents.length) {
            dx = 0;
          }
        }
        if (dy) {
          let new_pos: JSVec3 = [pos[0] + DX[ydir!], pos[1] + DY[ydir!], pos[2]];
          let ents = entitiesAt(this.entity_manager, new_pos, floor_id, true);
          ents = ents.filter(isEnemy);
          if (ents.length) {
            dy = 0;
          }
        }

        tot = abs(dx) + abs(dy);
        if (!tot) {
          if (debugDefineIsSet('HUNTER')) {
            statusSet(`edbg${this.id}`, `${this.id}: Move ent blocked`).counter = 500;
          }
          profilerStopFunc();
          return false;
        }
        let do_x = random() * tot < abs(dx);
        if (dx && dy) {
          if (tot === 2 && !this.hunter_state.preferred_axis) {
            // we're diagonal from them, they were probably in front of us a moment ago,
            //   choose a preferred axis
            this.hunter_state.preferred_axis = random() < 0.5 ? 'x' : 'y';
          }
          if (this.hunter_state.preferred_axis) {
            do_x = this.hunter_state.preferred_axis === 'x';
          } // else, we've never been close, just randomize based on major distance
        }
        let dir = do_x ? xdir! : ydir!;
        let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
        // if (debugDefineIsSet('HUNTER')) {
        //   statusPush(`${this.id}: Moving from ${pos} to ${new_pos}`);
        // }
        this.applyAIUpdate('ai_move', {
          pos: new_pos,
          last_pos: pos,
        }, undefined, ignoreErrors);
        profilerStopFunc();
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
    ent.data.floor, ent.getData('pos')!, script_api);
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
  payload: AIStepPayload,
): boolean {
  profilerStartFunc();
  let target_ent = foeNear(game_state, ent, script_api);
  if (defines?.PEACE || defines?.AIPEACE) {
    target_ent = null;
  }
  if (!target_ent) {
    profilerStopFunc();
    return false;
  }

  // enemy attack logic goes here
  if (random() < 0.01 || CRAWLER_TURN_BASED) {
    attackPlayer(ent, target_ent, 'BAM!');
  }

  profilerStopFunc();
  return true;
}


export function aiDoFloor(params: {
  floor_id: number;
  game_state: CrawlerState;
  entity_manager: EntityManager<Entity>;
  defines: Partial<Record<string, true>>;
  ai_pause: boolean;
  script_api: CrawlerScriptAPI;
  filter?: (ent: Entity) => boolean;
  distance_limit: number;
  payload: AIStepPayload;
}): void {
  const {
    floor_id,
    game_state,
    entity_manager,
    defines,
    ai_pause,
    script_api,
    filter,
    distance_limit,
    payload,
  } = params;
  if (ai_pause) {
    return;
  }
  let frame_timestamp = getFrameTimestamp();
  let entities = entity_manager.entities;
  let level = game_state.levels[floor_id];
  if (level.getProp('aipause')) {
    return;
  }
  profilerStartFunc();
  script_api.setLevel(level);
  let player_pos = myEnt().getData('pos')! as ROVec2;
  for (let ent_id in entities) {
    let ent = entities[ent_id]!;
    if (ent.data.floor !== floor_id || ent.fading_out || ent.is_player || !ent.isAlive()) {
      // not on current floor
      continue;
    }

    if (v2manhattanDist(ent.data.pos, player_pos) > distance_limit) {
      continue;
    }

    if (filter && !filter(ent)) {
      continue;
    }

    let no_move = false;
    if (ent.is_enemy && aiDoEnemy(game_state, ent, defines, script_api, payload)) {
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
        moved = (ent as EntityHunter).aiHunt(game_state, script_api, payload);
      }
      if (!moved && (ent as EntityPatrol).aiPatrol) {
        moved = (ent as EntityPatrol).aiPatrol(game_state, script_api, payload);
      }
      if (!moved && (ent as EntityWander).aiWander) {
        moved = (ent as EntityWander).aiWander(game_state, script_api, payload);
      }
    }
    ent.aiResetMoveTime(false);
  }
  profilerStopFunc();
}

export function aiStepFloor(params: {
  floor_id: number;
  game_state: CrawlerState;
  entity_manager: EntityManager<Entity>;
  defines: Partial<Record<string, true>>;
  ai_pause: boolean;
  script_api: CrawlerScriptAPI;
  filter?: (ent: Entity) => boolean;
  distance_limit: number;
  payload: AIStepPayload;
}): void {
  const {
    floor_id,
    game_state,
    entity_manager,
    defines,
    ai_pause,
    script_api,
    filter,
    distance_limit,
    payload,
  } = params;
  if (ai_pause) {
    return;
  }
  let entities = entity_manager.entities;
  let level = game_state.levels[floor_id];
  if (level.getProp('aipause')) {
    return;
  }
  profilerStartFunc();
  script_api.setLevel(level);
  let player_pos = myEnt().getData('pos')! as ROVec2;
  for (let ent_id in entities) {
    let ent = entities[ent_id]!;
    if (ent.data.floor !== floor_id || ent.fading_out || ent.is_player || !ent.isAlive()) {
      // not on current floor
      continue;
    }

    if (v2manhattanDist(ent.data.pos, player_pos) > distance_limit) {
      continue;
    }

    if (filter && !filter(ent)) {
      continue;
    }

    let no_move = false;
    if (ent.is_enemy && aiDoEnemy(game_state, ent, defines, script_api, payload)) {
      // not wandering/patrolling/etc
      no_move = true;
    }

    if (!no_move) {
      let moved = false;
      if (!moved && (ent as EntityHunter).aiHunt && !defines?.PEACE) {
        moved = (ent as EntityHunter).aiHunt(game_state, script_api, payload);
      }
      if (!moved && (ent as EntityPatrol).aiPatrol) {
        moved = (ent as EntityPatrol).aiPatrol(game_state, script_api, payload);
      }
      if (!moved && (ent as EntityWander).aiWander) {
        moved = (ent as EntityWander).aiWander(game_state, script_api, payload);
      }
    }
  }
  profilerStopFunc();
}
