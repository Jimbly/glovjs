import { getFrameTimestamp } from 'glov/client/engine';
import { EntityBaseClient } from 'glov/client/entity_base_client';
import { ClientEntityManagerInterface } from 'glov/client/entity_manager_client';
import {
  ActionDataAssignments,
} from 'glov/common/entity_base_common';
import {
  DataObject,
  NetErrorCallback,
} from 'glov/common/types.js';
import { EntityCrawlerDataCommon, entSamePos } from '../common/crawler_entity_common';
import {
  EntityCrawlerClient,
  EntityDraw2DOpts,
  EntityDrawOpts,
  EntityOnDeleteSubParam,
  Floater,
  crawlerEntClientDefaultDraw2D,
  crawlerEntClientDefaultOnDelete,
  crawlerEntityManager,
} from './crawler_entity_client';

import type { JSVec3 } from '../common/crawler_state';
import type { ROVec2 } from 'glov/common/vmath';

const { random } = Math;

export function entitiesAt(cem: ClientEntityManagerInterface<EntityDemoClient>,
  pos: [number, number] | ROVec2,
  floor_id: number,
  skip_fading_out:boolean
): EntityDemoClient[] {
  return cem.entitiesFind((ent) => entSamePos(ent, pos) && ent.data.floor === floor_id, skip_fading_out);
}

export function entityManager(): ClientEntityManagerInterface<EntityDemoClient> {
  return crawlerEntityManager() as ClientEntityManagerInterface<EntityDemoClient>;
}

export type StatsData = {
  hp: number;
};

export type EntityDataClient = {
  type: string;
  pos: JSVec3;
  state: string;
  floor: number;
  stats: StatsData;
} & EntityCrawlerDataCommon;


export class EntityDemoClient extends EntityBaseClient implements EntityCrawlerClient {
  declare entity_manager: ClientEntityManagerInterface<EntityDemoClient>;
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

  constructor(data: DataObject) {
    super(data);
    if (!this.data.pos) {
      this.data.pos = [0,0,0];
    }
    while (this.data.pos.length < 3) {
      this.data.pos.push(0);
    }
    this.floaters = [];
    this.aiResetMoveTime(true);
  }
  applyAIUpdate(
    action_id: string,
    data_assignments: ActionDataAssignments,
    payload?: unknown,
    resp_func?: NetErrorCallback,
  ): void {
    this.actionSend({
      action_id,
      data_assignments,
      payload,
    }, resp_func);
  }
  aiLastUpdatedBySomeoneElse(): boolean {
    return false;
  }
  ai_next_move_time!: number;
  aiResetMoveTime(initial: boolean): void {
    this.ai_next_move_time = getFrameTimestamp() + 500 + random() * 500;
  }

  isAlive(): boolean {
    return true;
  }

  isEnemy(): boolean {
    return this.is_enemy;
  }
  isPlayer(): boolean {
    return this.is_player;
  }

  onCreate(is_initial: boolean): number {
    return is_initial ? 0 : 250;
  }
}
EntityDemoClient.prototype.draw2D = crawlerEntClientDefaultDraw2D;
EntityDemoClient.prototype.onDelete = crawlerEntClientDefaultOnDelete;
EntityDemoClient.prototype.do_split = true;
