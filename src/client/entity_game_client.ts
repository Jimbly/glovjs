import { getFrameTimestamp } from 'glov/client/engine';
import { EntityBaseClient } from 'glov/client/entity_base_client';
import { ClientEntityManagerInterface } from 'glov/client/entity_manager_client';
import {
  ActionDataAssignments,
} from 'glov/common/entity_base_common';
import {
  DataObject,
  NetErrorCallback,
} from 'glov/common/types';
import type {
  JSVec2,
  JSVec3,
  ROVec2,
} from 'glov/common/vmath';
import {
  EntityCrawlerDataCommon,
} from '../common/crawler_entity_common';
import {
  crawlerEntClientDefaultDraw2D,
  crawlerEntClientDefaultOnDelete,
  crawlerEntityManager,
  DEFAULT_SERIALIZE_IGNORED,
  EntityCrawlerClient,
  EntityDraw2DOpts,
  EntityDrawOpts,
  EntityOnDeleteSubParam,
  entityPosManager,
  Floater,
  INDEX_POS,
  indexPosKey,
} from './crawler_entity_client';

const { random } = Math;

type Entity = EntityClient;

export function entityManager(): ClientEntityManagerInterface<Entity> {
  return crawlerEntityManager() as unknown as ClientEntityManagerInterface<Entity>;
}

export function entitiesAt(
  pos: JSVec2 | ROVec2,
  floor_id: number,
  skip_fading_out: boolean
): Entity[] {
  let entity_manager = entityManager();
  let ents = entity_manager.indexedGet(INDEX_POS, indexPosKey(floor_id, pos[0], pos[1]));
  let ret = Object.values(ents) as Entity[];
  if (skip_fading_out) {
    ret = ret.filter((ent) => !ent.fading_out);
  }
  return ret;
}

export type StatsData = {
  hp: number;
  hp_max: number;
};

export type EntityDataClient = {
  type: string;
  pos: JSVec3;
  state: string;
  floor: number;
  stats: StatsData;
  // Player:
  events_done?: Partial<Record<string, boolean>>;
} & EntityCrawlerDataCommon;

class EntityClient extends EntityBaseClient implements EntityCrawlerClient {
  declare entity_manager: ClientEntityManagerInterface<Entity>;
  declare data: EntityDataClient;

  floaters: Floater[];
  delete_reason?: string;

  declare onDelete: (reason: string) => number;
  declare draw2D: (param: EntityDraw2DOpts) => void;
  declare draw?: (param: EntityDrawOpts) => void;
  declare onDeleteSub?: (param: EntityOnDeleteSubParam) => void;
  declare triggerAnimation?: (anim: string) => void;

  // On prototype properties:
  declare type_id: string; // will be constant on the prototype
  declare do_split: boolean;
  declare is_player: boolean;
  declare is_enemy: boolean;
  declare blocks_player: boolean;
  declare ai_move_min_time: number;
  declare ai_move_rand_time: number;
  declare display_name: string;

  constructor(data_in: DataObject) {
    super(data_in);
    let data = this.data;

    if (!data.pos) {
      data.pos = [0,0,0];
    }
    while (data.pos.length < 3) {
      data.pos.push(0);
    }
    this.floaters = [];
    this.aiResetMoveTime(true);
  }
  static AI_UPDATE_FIELD = 'seq_ai_update';
  applyAIUpdate(
    action_id: string,
    data_assignments: ActionDataAssignments,
    payload?: unknown,
    resp_func?: NetErrorCallback,
  ): void {
    this.applyBatchUpdate({
      field: EntityClient.AI_UPDATE_FIELD,
      action_id,
      data_assignments,
      payload,
    }, resp_func);
    entityPosManager().otherEntityChanged(this.id);
  }
  aiLastUpdatedBySomeoneElse(): boolean {
    return false;
  }
  ai_next_move_time!: number;
  aiResetMoveTime(initial: boolean): void {
    this.ai_next_move_time = getFrameTimestamp() + this.ai_move_min_time + random() * this.ai_move_rand_time;
  }

  isAlive(): boolean {
    return this.data.stats ? this.getData('stats.hp', 0) > 0 : true;
  }

  isEnemy(): boolean {
    return this.is_enemy;
  }
  isPlayer(): boolean {
    return this.is_player;
  }

  onCreate(is_initial: boolean): number {
    if (!this.isAlive() && this.triggerAnimation) {
      this.triggerAnimation('death');
    }
    return is_initial ? 0 : 250;
  }

  moveTo(pos: ROVec2): void {
    this.applyAIUpdate('ai_move', {
      pos: [pos[0], pos[1], this.data.pos[2] || 0],
    }, undefined, function (err?: unknown): void {
      if (err) {
        throw err;
      }
    });
  }
}
EntityClient.prototype.draw2D = crawlerEntClientDefaultDraw2D;
EntityClient.prototype.onDelete = crawlerEntClientDefaultOnDelete;
EntityClient.prototype.do_split = true;
EntityClient.prototype.ai_move_min_time = 500;
EntityClient.prototype.ai_move_rand_time = 500;
EntityClient.prototype.display_name = '?';
EntityClient.prototype.serialize_ignored = {
  ...DEFAULT_SERIALIZE_IGNORED,
};
export type { EntityClient };

export function entityClientConstructor(): Constructor<EntityClient> {
  return EntityClient;
}
