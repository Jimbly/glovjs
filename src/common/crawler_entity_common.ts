import type { JSVec3 } from './crawler_state';
import type { Diff } from 'glov/common/differ';
import type { EntityBaseCommon, EntityBaseDataCommon } from 'glov/common/entity_base_common';
import type { ROVec2 } from 'glov/common/vmath';

const { abs } = Math;
const EPSILON = 0.01;

export type CrawlerJoinPayload = {
  pos?: JSVec3; // Only set if joining from hybrid offline build mode
  floor_id?: number;
};

export interface EntityCrawlerDataCommon extends EntityBaseDataCommon {
  type: string;
  pos: JSVec3;
  state?: string;
  floor: number;
  costume?: number; // For drawablesprite with tint colors
  stats: { hp: number };
}

export interface EntityCrawlerCommon extends EntityBaseCommon {
  data: EntityCrawlerDataCommon;
}

export type BuildModeOp = {
  sub_id: string;
  floor: number;
  diff: Diff;
};

export function entSamePos(ent: EntityBaseCommon, pos: ROVec2): boolean {
  let ent_pos = ent.getData('pos') as number[];
  for (let ii = 0; ii < 2; ++ii) {
    if (abs(ent_pos[ii] - pos[ii]) > EPSILON) {
      return false;
    }
  }
  return true;
}
