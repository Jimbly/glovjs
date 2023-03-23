export const AI_CLAIM_TIME = 2000;

// import assert from 'assert';
// import { getFrameTimestamp } from 'glov/client/engine';
// import { EntityID, EntityManager } from 'glov/common/entity_base_common';
// import {
//   Vec2,
//   vec2,
// } from 'glov/common/vmath';
// import { entSamePos } from '../common/crawler_entity_common';
// import {
//   BLOCK_MOVE,
//   BLOCK_OPEN,
//   CrawlerState,
//   DX,
//   DY,
//   DirType,
//   JSVec3,
// } from '../common/crawler_state';
// import { isOnline } from './crawler_entity_client';
// const { floor, random } = Math;

// import type { CrawlerScriptAPI } from '../common/crawler_script';
// import type { EntitySpireClient } from './entity_spire_client';
// import type { TraitFactory } from 'glov/common/trait_factory';
// import type { DataObject } from 'glov/common/types';

// type Entity = EntitySpireClient;

// const ATTACK_TIME = 1000;

// let frame_wall_time: number;

// function randomFrom<T>(arr: T[]): T {
//   return arr[floor(random() * arr.length)];
// }

// function entitiesAt<T extends Entity>(
//   entity_manager: EntityManager<T>,
//   pos: Vec2,
//   floor_id: number,
//   skip_fading_out: boolean
// ): T[] {
//   return entity_manager.entitiesFind((ent) => entSamePos(ent, pos) && ent.data.floor === floor_id, skip_fading_out);
// }

// let temp_pos = vec2();
// function entitiesAdjacentTo<T extends Entity>(
//   game_state: CrawlerState,
//   entity_manager: EntityManager<T>,
//   floor_id: number,
//   pos: Vec2,
//   script_api: CrawlerScriptAPI,
// ): T[] {
//   let ret: T[] = [];
//   let level = game_state.levels[floor_id];
//   script_api.setPos(pos);
//   for (let dir = 0 as DirType; dir < 4; ++dir) {
//     if (level.wallsBlock(pos, dir, script_api) !== BLOCK_OPEN) {
//       continue;
//     }
//     temp_pos[0] = pos[0] + DX[dir];
//     temp_pos[1] = pos[1] + DY[dir];
//     let ents = entitiesAt(entity_manager, temp_pos, floor_id, true);
//     if (ents.length) {
//       ret = ret.concat(ents);
//     }
//   }
//   return ret;
// }

// export type WanderOpts = {
// };
// export type WanderState = {
//   home_pos: JSVec3;
// };
// export type EntityWander = EntitySpireClient & {
//   wander_state: WanderState;
//   wander_opts: WanderOpts;
//   aiWander: (game_state: CrawlerState, script_api: CrawlerScriptAPI) => void;
// };

// function ignoreErrors(): void {
//   // nothing
// }

// export function aiTraitsClientStartup(ent_factory: TraitFactory<Entity, DataObject>): void {
//   ent_factory.extendTrait<WanderOpts, WanderState>('wander', {
//     methods: {
//       aiWander: function (this: EntityWander, game_state: CrawlerState, script_api: CrawlerScriptAPI) {
//         let pos = this.getData<JSVec3>('pos');
//         assert(pos);
//         let dir = floor(random() * 4) as DirType;
//         let floor_id = this.getData<number>('floor');
//         assert(typeof floor_id === 'number');
//         let level = game_state.levels[floor_id];
//         script_api.setPos(pos);
//         if (level.wallsBlock(pos, dir, script_api) & BLOCK_MOVE) {
//           return;
//         }
//         let new_pos: JSVec3 = [pos[0] + DX[dir], pos[1] + DY[dir], pos[2]];
//         if (entitiesAt(this.entity_manager, new_pos, floor_id, true).length) {
//           return;
//         }
//         this.applyAIUpdate('ai_move', {
//           pos: new_pos,
//         }, undefined, ignoreErrors);
//       },
//     },
//     default_opts: {},
//     alloc_state: function (opts: WanderOpts, ent: Entity) {
//       let ret: WanderState = {
//         home_pos: ent.data.pos.slice(0) as JSVec3,
//       };
//       return ret;
//     }
//   });
// }


// function isLivingPlayer(ent: Entity): boolean {
//   return ent.isPlayer() && ent.isAlive();
// }

// function foeNear<T extends Entity>(game_state: CrawlerState, ent: T, script_api: CrawlerScriptAPI): T | null {
//   // search, needs game_state, returns list of foes
//   let ents: T[] = entitiesAdjacentTo(game_state,
//     ent.entity_manager as unknown as EntityManager<T>,
//     ent.data.floor, ent.data.pos, script_api);
//   ents = ents.filter(isLivingPlayer);
//   if (ents.length) {
//     return randomFrom(ents);
//   }
//   return null;
// }

// function doAttack(ent: EntitySpireClient, target_ent_id: EntityID, fields: DataObject): void {
//   ent.applyAIUpdate('ai_attack', {
//     ready: null,
//     ready_start: null,
//     action_dur: null,
//   }, {
//     target_ent_id,
//     time: frame_wall_time,
//     ...fields,
//   }, ignoreErrors);
// }

// function aiDoEnemy(
//   game_state: CrawlerState,
//   ent: EntitySpireClient,
//   defines: Partial<Record<string, true>>,
//   script_api: CrawlerScriptAPI,
// ): void {
//   let foe_near = foeNear(game_state, ent, script_api);
//   if (defines?.PEACE || defines?.AIPEACE) {
//     foe_near = null;
//   }
//   let am_ready = ent.getData('ready');
//   if (foe_near) {
//     if (foe_near.isPlayer() && !foe_near.isMe()) {
//       // want to attack a player that's not on our client, let them handle it!
//       return;
//     }
//     if (!am_ready) {
//       // If we're not ready, and there's a foe nearby, ready up
//       return void ent.applyAIUpdate('ai_attack_ready', {
//         ready: true,
//         ready_start: frame_wall_time,
//         action_dur: ATTACK_TIME,
//       }, undefined, ignoreErrors);
//     }
//     // If we're ready, and it's been long enough, execute attack and unready
//     if (frame_wall_time - ent.getData('ready_start', 0) > ent.getData('action_dur', 0)) {
//       // Find a target
//       let target_ent_id = foe_near.id;
//       return void doAttack(ent, target_ent_id, {
//         type: 'melee',
//       });
//     }
//   } else {
//     // No foe near
//     if (am_ready) {
//       // If we're ready, and there's no foe nearby, unready
//       return void ent.applyAIUpdate('ai_attack_unready', {
//         ready: null,
//         ready_start: null,
//         action_dur: null,
//       }, undefined, ignoreErrors);
//     }
//     // not ready, no foe, move?
//   }
// }

// export function aiSetFrameWallTime(frame_wall_time_in: number): void {
//   frame_wall_time = frame_wall_time_in;
// }

// export function aiDoFloor(
//   floor_id: number,
//   game_state: CrawlerState,
//   entity_manager: EntityManager<EntitySpireClient>,
//   defines: Partial<Record<string, true>>,
//   ai_pause: 0 | 1,
//   script_api: CrawlerScriptAPI,
// ): void {
//   if (ai_pause) {
//     return;
//   }
//   let frame_timestamp = getFrameTimestamp();
//   let entities = entity_manager.entities;
//   let level = game_state.levels[floor_id];
//   script_api.setLevel(level);
//   for (let ent_id in entities) {
//     let ent = entities[ent_id]!;
//     if (ent.data.floor !== floor_id || ent.fading_out) {
//       // not on current floor
//       continue;
//     }

//     if (frame_timestamp < ent.ai_next_move_time) {
//       continue;
//     }
//     if (ent.aiLastUpdatedBySomeoneElse()) {
//       if (frame_timestamp - ent.last_update_timestamp < AI_CLAIM_TIME) {
//         // someone else updated recently, ignore
//         ent.aiResetMoveTime(false);
//         continue;
//       } // else it's been a while, do an update if we want
//     }
//     if ((ent as EntityWander).aiWander) {
//       (ent as EntityWander).aiWander(game_state, script_api);
//     }
//     if (ent.isEnemy() && isOnline()) {
//       aiDoEnemy(game_state, ent, defines, script_api);
//     }
//     ent.aiResetMoveTime(false);
//   }
// }

// export function aiOnPlayerMoved(
//   game_state: CrawlerState,
//   ent: EntitySpireClient,
//   old_pos: Vec2,
//   new_pos: Vec2,
//   ai_pause: 0 | 1,
//   script_api: CrawlerScriptAPI,
// ): void {
//   if (ai_pause) {
//     return;
//   }
//   // NOTE: `ent` may not yet be in either old_pos *or* new_pos (though the
//   //   messages to move it to old_pos has gone to the server, new_pos has not)
//   let { entity_manager } = ent;

//   // Find neighboring ents that are ready, or could be, and trigger their attack on us
//   let ents = entitiesAdjacentTo(game_state, entity_manager, ent.data.floor, old_pos, script_api);
//   ents = ents.filter((other_ent) => other_ent.isEnemy() !== ent.isEnemy());
//   for (let ii = 0; ii < ents.length; ++ii) {
//     let attacker = ents[ii];
//     if (attacker.getData('ready', false)) {
//       assert(attacker.isEnemy()); // Player opportunity attacks should be handled elsewhere?
//       // Ready or not, do an attack!
//       doAttack(attacker, ent.id, {
//         type: 'opportunity',
//       });
//     }
//   }
// }
