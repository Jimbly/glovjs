// Portions Copyright 2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import { DataObject } from 'glov/common/types';

// Entity Action List Flags
export const EALF_HAS_PREDICATE = 1<<0;
export const EALF_HAS_ENT_ID = 1<<1; // otherwise: entity target is self
export const EALF_HAS_PAYLOAD = 1<<2;
export const EALF_HAS_ASSIGNMENTS = 1<<3;

export const EntityFieldEncoding = {
  // Note: changing any of these is a breaking change with all clients, change with care
  JSON: 1,
  Int: 2, // Packet integer taking between 1 and 9 bytes, in the range -2^64...2^64
  Float: 3,
  AnsiString: 4,  // Much more efficient than String if the input is known to be ANSI-ish (all characters <= 255)
  U8: 5,
  U32: 6,
  String: 7,
  Boolean: 8,
  Vec2: 9,
  Vec3: 10,
  U8Vec3: 11, // e.g. RGB
  IVec3: 12,

  Custom0: 127, // App-specific encodings in the range 127...255
};
export type EntityFieldEncodingType = typeof EntityFieldEncoding[keyof typeof EntityFieldEncoding];

export const EntityFieldSub = {
  None: 0,
  Array: 1, // numerical indices to elements
  Record: 2, // string keys to elements
} as const;
export type EntityFieldSubType = typeof EntityFieldSub[keyof typeof EntityFieldSub];

export interface EntityFieldDefCommon {
  encoding: EntityFieldEncodingType; // Default: JSON
  default_value?: undefined | number | string; // Default: undefined
  sub: EntityFieldSubType; // Default: None
}

export interface EntityFieldDefSerialized {
  n: string;
  e?: EntityFieldEncodingType;
  d?: number | string;
  s?: EntityFieldSubType;
}

export const EntityFieldSpecial = {
  Terminate: 0,
  Default: 1,
  MAX: 2, // Actual field indices start after here
} as const;

export type EntityManagerSchema = EntityFieldDefSerialized[];

export type EntityID = number;

export type ClientID = string;

export type ActionDataAssignments = Partial<Record<string, unknown>>;
export type ActionListResponse = { err?: string; data?: unknown }[];

export interface ActionMessageParam {
  action_id: string;
  self?: boolean;
  ent_id?: EntityID;
  predicate?: { field: string; expected_value?: string };
  data_assignments?: ActionDataAssignments;
  payload?: unknown;
}

// Server -> Client ent_update packet commands
export const enum EntityUpdateCmd {
  Terminate = 0,
  Full = 1,
  Diff = 2,
  Delete = 3,
  Event = 4,
  Schema = 5,
  IsInitialList = 6,
}

export type EntityManagerEvent = {
  from?: EntityID;
  msg: string;
  data?: unknown;
};

export interface EntityManager<Entity extends EntityBaseCommon = EntityBaseCommon> {
  entities: Partial<Record<EntityID, Entity>>;
  entitiesFind: (
    predicate: (ent: Entity) => boolean,
    skip_fading_out?: boolean
  ) => Entity[];
}

export type EntityBaseDataCommon = {
  // Nothing anymore (previously had `pos: number[]`)
};

export class EntityBaseCommon {
  id: EntityID;
  data: EntityBaseDataCommon | DataObject;
  entity_manager: EntityManager;

  constructor(ent_id: EntityID, entity_manager: EntityManager) {
    this.id = ent_id;
    this.data = {};
    // this.data.pos = [0,0];
    this.entity_manager = entity_manager;
  }

  getData<T>(field: string): T | undefined {
    assert(0); // should hit EntityBaseServer or EntityBaseClient's implementation instead
    return undefined;
  }
}
