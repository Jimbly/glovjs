import {
  EntityBaseCommon,
  EntityBaseDataCommon,
} from 'glov/common/entity_base_common';

export const VA_SIZE = 500;
export const VIEW_DIST = 200;

export enum EntityType {
  Player = 1,
  Bot = 2,
}

export type EntityTestDataCommon = {
  type: EntityType;
  pos: [number, number, number];
  speed?: number;
  test_anim_state?: string;
  display_name?: string;
  seq_ai_move?: string;
} & EntityBaseDataCommon;

// export function entSamePos(ent: EntityBaseCommon, pos: [number, number]): boolean {
//   let ent_pos = ent.getData('pos') as number[];
//   for (let ii = 0; ii < 2; ++ii) {
//     if (abs(ent_pos[ii] - pos[ii]) > EPSILON) {
//       return false;
//     }
//   }
//   return true;
// }

// eslint-disable-next-line @stylistic/max-len
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function entityTestCommonClass<T extends Constructor<EntityBaseCommon>>(base: T) {
  // Note: `base` is either `EntityBaseServer` or `EntityBaseClient`
  return class EntityTestCommon extends base {
    declare data: EntityTestDataCommon;
    // // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // constructor(...args: any[]) {
    //   super(...args);
    //   No data init here, client data comes from server.
    // }
  };
}
