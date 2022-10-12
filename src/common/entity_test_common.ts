import {
  EntityBaseCommon,
  EntityBaseDataCommon,
} from 'glov/common/entity_base_common';

export const VA_SIZE = 500;
export const VIEW_DIST = 200;

export type EntityTestDataCommon = {
  pos: [number, number, number];
  speed: number;
  state: string;
  display_name?: string;
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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function entityTestCommonClass<T extends Constructor<EntityBaseCommon>>(base: T) {
  // Note: `base` is either `EntityBaseServer` or `EntityBaseClient`
  return class EntitySpireCommon extends base {
    data!: EntityTestDataCommon;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      super(...args);
      this.data.pos = [0,0,0];
    }
  };
}
