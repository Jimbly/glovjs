export const AI_CLAIM_TIME = 2000;

import assert from 'assert';
import { getFrameTimestamp } from 'glov/client/engine';
import { EntityManager } from 'glov/common/entity_base_common';
import {
  Vec2,
} from 'glov/common/vmath';
import { entSamePos } from '../common/crawler_entity_common';
import {
  BLOCK_OPEN,
  CrawlerState,
  DX,
  DY,
  DirType,
  JSVec3,
} from '../common/crawler_state';
import { EntityDemoClient } from './entity_demo_client';

import type { CrawlerScriptAPI } from '../common/crawler_script';
import type { TraitFactory } from 'glov/common/trait_factory';
import type { DataObject } from 'glov/common/types';

const { floor, random } = Math;

type Entity = EntityDemoClient;

function entitiesAt<T extends Entity>(
  entity_manager: EntityManager<T>,
  pos: Vec2,
  floor_id: number,
  skip_fading_out: boolean
): T[] {
  return entity_manager.entitiesFind((ent) => entSamePos(ent, pos) && ent.data.floor === floor_id, skip_fading_out);
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

function ignoreErrors(): void {
  // nothing
}

export function aiTraitsClientStartup(ent_factory: TraitFactory<Entity, DataObject>): void {
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
    if ((ent as EntityWander).aiWander) {
      (ent as EntityWander).aiWander(game_state, script_api);
    }
    ent.aiResetMoveTime(false);
  }
}
