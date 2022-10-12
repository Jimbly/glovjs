// Portions Copyright 2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import { asyncSeries } from 'glov-async';
import {
  ActionMessageParam,
  ClientID,
  EntityBaseCommon,
  EntityFieldDefCommon,
  EntityFieldEncoding,
  EntityFieldEncodingType,
  EntityFieldSpecial,
  EntityFieldSub,
  EntityID,
  EntityManagerEvent,
} from 'glov/common/entity_base_common';
import {
  Packet,
} from 'glov/common/packet';
import {
  ClientHandlerSource,
  DataObject,
  ErrorCallback,
  HandlerSource,
  NetErrorCallback,
  WithRequired,
} from 'glov/common/types';
import { clone, defaults, has, objectToSet } from 'glov/common/util';
import {
  ServerEntityManagerInterface,
} from './entity_manager_server';

export type VAID = number; // Or, maybe `number | string`?

export type FieldEncoder<Entity extends EntityBaseServer> = (
  ent: Entity,
  pak: Packet,
  value: unknown,
) => void;

/*
  Note: Can extend this per-app with code like:

  declare module 'glov/server/entity_base_server' {
    interface EntityFieldDef {
      my_option?: boolean;
    }
  }

  And then reference these options in, e.g., the savePlayerEntity() override
*/
export interface EntityFieldDef extends EntityFieldDefCommon {
  ephemeral: boolean; // not saved to storage
  server_only: boolean; // not synced to clients
  // Next two are auto-filled, and only actually required for non-server_only fields
  encoder: FieldEncoder<EntityBaseServer>; // Looked up by `encoding`, _not_ specified per-field (just cached here)
  field_id: number;
}
export type EntityFieldDefOpts = Partial<Exclude<EntityFieldDef, 'encoder'>>;

export interface ActionHandlerParam extends WithRequired<ActionMessageParam, 'data_assignments' | 'self' | 'ent_id'> {
  src: ClientHandlerSource;
  predicate?: { field: string; expected_value: string }; // expected_value no longer optional
}

export type ActionHandler<Entity extends EntityBaseServer> = (
  this: Entity,
  param: ActionHandlerParam,
  resp_func: ErrorCallback<unknown, string>
) => void;

export type DataAssignmentType = 'number' | 'string' | 'array' | 'boolean' | null;

export type ActionDef<Entity extends EntityBaseServer> = {
  self_only: boolean;
  allowed_data_assignments: Partial<Record<string, DataAssignmentType>>;
  handler?: ActionHandler<Entity>;
};

export interface ActionDefOpts<Entity extends EntityBaseServer>
  extends Partial<ActionDef<Entity>>
{
  action_id: string;
}

function actionDefDefaults<Entity extends EntityBaseServer>(
  action_def: Partial<ActionDefOpts<Entity>>
): asserts action_def is ActionDef<EntityBaseServer> {
  if (has(action_def, 'handler')) {
    assert(action_def.handler, `Undefined function set for action ${action_def.action_id}`);
  }
  if (action_def.self_only === undefined) {
    action_def.self_only = true;
  }
  action_def.allowed_data_assignments = objectToSet(action_def.allowed_data_assignments);
}

interface PlayerEntity extends EntityBaseServer {
  is_player: true;
  player_uid: string;
}

export type DirtyFields = Partial<Record<string, true>>;

export class EntityBaseServer extends EntityBaseCommon {
  entity_manager!: ServerEntityManagerInterface;

  static DEFAULT_PLAYER_DATA = {
    // pos: [0,0]
  };

  is_player: boolean;
  in_dirty_list: boolean;
  dirty_fields: DirtyFields;
  dirty_sub_fields: Partial<Record<string, DirtyFields>>;
  need_save: boolean;
  player_uid?: string; // Only for player-type entities
  current_vaid!: VAID; // Initially set in finishDeserialize()
  last_vaid?: VAID;
  last_delete_reason?: string = undefined;

  constructor(ent_id: EntityID, entity_manager: ServerEntityManagerInterface) {
    super(ent_id, entity_manager);
    this.is_player = false;
    this.in_dirty_list = false;
    this.need_save = false;
    this.dirty_fields = {};
    this.dirty_sub_fields = {};
  }

  debugSrc(src: HandlerSource, ...args: unknown[]): void {
    this.entity_manager.worker.debugSrc(src, ...args);
  }
  infoSrc(src: HandlerSource, ...args: unknown[]): void {
    this.entity_manager.worker.infoSrc(src, ...args);
  }
  logSrc(src: HandlerSource, ...args: unknown[]): void {
    this.entity_manager.worker.logSrc(src, ...args);
  }
  warnSrc(src: HandlerSource, ...args: unknown[]): void {
    this.entity_manager.worker.warnSrc(src, ...args);
  }
  errorSrc(src: HandlerSource, ...args: unknown[]): void {
    this.entity_manager.worker.errorSrc(src, ...args);
  }

  getData<T>(field: string, deflt: T): T;
  getData<T>(field: string): T | undefined;
  getData(field: string, deflt?: unknown): unknown {
    return (this.data as DataObject)[field];
  }

  last_saved_data?: string;
  savePlayerEntity(cb: ErrorCallback): void {
    // Optional app-specific override
    let data = this.toSerializedStorage();
    let data_string = JSON.stringify(data);
    if (data_string === this.last_saved_data) {
      return void cb();
    }
    this.last_saved_data = data_string;
    this.entity_manager.worker.setBulkChannelData(`pent.${this.player_uid}`, data, cb);
  }

  // Note: this function is called immediately after savePlayerEntity(nop) (potentially before it has resolved)
  releasePlayerEntity(): void {
    // Optional app-specific override
    // Called immediately before delete, after last save has been issued (but not yet finished)
  }

  fixupPostLoad(): void {
    // Optional app-specific override
    // Also ran upon creation
  }

  isPlayer(): this is PlayerEntity {
    return this.is_player;
  }

  getClientID(): null | ClientID {
    if (!this.isPlayer()) {
      return null;
    }
    let sem = this.entity_manager;
    let { player_uid } = this;
    let client = sem.player_uid_to_client[player_uid];
    return client && client.client_id || null;
  }

  sendClientMessage(data: EntityManagerEvent): void {
    let client_id = this.getClientID();
    assert(client_id);
    this.entity_manager.worker.sendChannelMessage(`client.${client_id}`, 'ent_broadcast', data);
  }

  fromSerialized(ser: DataObject): void {
    this.data = ser;
    this.finishDeserialize();
  }

  // Serialized when saving to the data store
  toSerializedStorage(): DataObject {
    let { data, field_defs } = this;
    let ret: DataObject = {};
    for (let key in data) {
      let field_def = field_defs[key];
      if (!field_def) {
        assert(field_def, `Missing field definition for ${key}`);
      }
      if (!field_def.ephemeral) {
        let value = (data as DataObject)[key];
        if (value !== field_def.default_value) {
          ret[key] = value;
        }
      }
    }
    return ret;
  }

  finishDeserialize(): void {
    this.current_vaid = this.visibleAreaGet();
  }

  visibleAreaGet(): VAID {
    // App-specific override
    return 0;
  }

  dirty(field: string): void {
    this.entity_manager.dirty(this, field, null);
  }

  dirtySub(field: string, index: string | number): void {
    this.entity_manager.dirtySub(this, field, index);
  }

  dirtyVA(field: string, delete_reason: string): void {
    this.entity_manager.dirty(this, field, delete_reason);
  }

  handleAction(action_data: ActionHandlerParam, resp_func: NetErrorCallback<unknown>): void {
    let { action_id, ent_id, predicate, self, /*payload, */data_assignments, src } = action_data;

    // Validate
    let action_def = this.action_defs[action_id];
    if (!action_def) {
      this.errorSrc(src, `Received invalid action_id=${action_id}`);
      return void resp_func('ERR_INVALID_ACTION');
    }

    let { allowed_data_assignments, self_only, handler } = action_def;

    if (self) {
      assert.equal(ent_id, this.id);
    }

    if (self_only && !self) {
      this.errorSrc(src, `Received self_only action_id=${action_id} not on self`);
      return void resp_func('ERR_SELF_ONLY');
    }

    if (predicate) {
      let { field, expected_value } = predicate;
      let existing_value = (this.data as DataObject)[field];
      if (existing_value || expected_value) {
        if (existing_value !== expected_value) {
          this.debugSrc(src, `Rejecting action ${action_id} ` +
            `due to field "${field}" mismatch (was ${JSON.stringify(existing_value)}, ` +
            `expected ${JSON.stringify(expected_value)})`);
          return void resp_func('ERR_FIELD_MISMATCH');
        }
      }
    }

    for (let key in data_assignments) {
      let allowed_type = allowed_data_assignments[key];
      let provided_type = Array.isArray(data_assignments[key]) ? 'array' : typeof data_assignments[key];
      if (allowed_type === null && data_assignments[key] === null) {
        // OK
      } else if (!allowed_type) {
        this.errorSrc(src, `Action ${action_id} attempted to set disallowed field "${key}"`);
        return void resp_func('ERR_INVALID_ASSIGNMENT');
      } else if (provided_type !== allowed_type) {
        this.errorSrc(src, `Action ${action_id} attempted to set field "${key}"` +
          ` to incorrect type (${provided_type})`);
        return void resp_func('ERR_INVALID_ASSIGNMENT');
      }
    }

    let result: unknown;
    asyncSeries([
      (next) => {
        // First attempt to execute action handler if there is one
        if (handler) {
          if (!data_assignments) {
            data_assignments = action_data.data_assignments = {}; // in case the handler wants to add some
          }
          let is_async = true;
          handler.call(this, action_data, (err?: string | null, data?: unknown) => {
            is_async = false;
            result = data;
            next(err);
          });
          if (is_async) {
            assert(!predicate); // Otherwise, predicate is checked and applied non-atomically
          }
        } else {
          next();
        }
      },
      (next) => {
        // If action was successful, apply data changes
        // (should include setting the expected field)
        for (let key in data_assignments) {
          let value = data_assignments[key];
          this.setData(key, value);
        }
        next();
      },
    ], (err?: string | null) => {
      resp_func(err || null, result);
    });
  }

  setData(field: string, value: unknown): void {
    assert(value !== undefined); // Use `null` for an explicit delete
    let data = this.data as DataObject;
    if (value === null && data[field] !== undefined ||
      value !== null && value !== data[field]
    ) {
      if (value === null) {
        delete data[field];
      } else {
        data[field] = value;
      }
      this.dirty(field);
    }
  }

  setDataSub(field: string, index: string | number, value: unknown): void {
    assert(value !== undefined); // Use `null` for an explicit delete
    let data = this.data as DataObject;
    let sub_value = data[field] as (unknown[] | DataObject);
    if (!sub_value) {
      let field_def = this.field_defs[field];
      assert(field_def);
      let { sub } = field_def;
      assert(sub);
      sub_value = data[field] = (sub === EntityFieldSub.Array) ? [] : {};
    }
    if (Array.isArray(sub_value)) {
      assert(typeof index === 'number');
      if (value !== sub_value[index]) {
        if (value === null) {
          // Remove and swap last element
          let last = sub_value.pop();
          if (index !== sub_value.length) {
            sub_value[index] = last;
            this.dirtySub(field, index);
          }
          this.dirtySub(field, 'length');
        } else {
          sub_value[index] = value;
          this.dirtySub(field, index);
        }
      }
    } else {
      if (value === null && sub_value[index] !== undefined ||
        value !== null && value !== sub_value[index]
      ) {
        if (value === null) {
          delete sub_value[index];
        } else {
          sub_value[index] = value;
        }
        this.dirtySub(field, index);
      }
    }
  }

  static field_encoders: Partial<Record<EntityFieldEncodingType, FieldEncoder<EntityBaseServer>>> = {};
  // Note: must be called _before_ registerFieldDefs()
  static registerFieldEncoders<Entity extends EntityBaseServer>(
    encoders: Partial<Record<EntityFieldEncodingType, FieldEncoder<Entity>>>
  ): void {
    for (let key_string in encoders) {
      let key = Number(key_string) as EntityFieldEncodingType;
      let func = encoders[key] as FieldEncoder<EntityBaseServer>;
      assert(!this.field_encoders[key]);
      this.field_encoders[key] = func;
    }
  }

  field_defs!: Partial<Record<string, EntityFieldDef>>; // on prototype, not instances
  private static last_field_id = EntityFieldSpecial.MAX - 1;
  static registerFieldDefs<DataObjectType>(defs: Record<keyof DataObjectType, EntityFieldDefOpts>): void;
  static registerFieldDefs(defs: Record<string, EntityFieldDefOpts>): void {
    for (let key in defs) {
      let def_in = defs[key];
      // Construct an EntityFieldDef in a type-safe manner
      let ephemeral = def_in.ephemeral || false;
      let server_only = def_in.server_only || false;
      let default_value = def_in.default_value;
      let encoding = def_in.encoding || EntityFieldEncoding.JSON;
      let encoder = this.field_encoders[encoding];
      assert(encoder, `Missing encoder for type ${encoding} referenced by field ${key}`);
      let sub = def_in.sub || EntityFieldSub.None;
      if (sub) {
        assert(default_value === undefined, 'Default values not supported for Records/Arrays');
      }
      let field_id = server_only ? -1 : ++this.last_field_id;
      let def_out: EntityFieldDef = {
        ephemeral,
        server_only,
        encoding,
        encoder,
        default_value,
        field_id,
        sub,
      };

      // Then also copy all other app-specific fields
      defaults(def_out, def_in);

      assert(!this.prototype.field_defs[key]);
      this.prototype.field_defs[key] = def_out;
    }
  }

  action_defs!: Partial<Record<string, ActionDef<EntityBaseServer>>>; // on prototype, not instances
  static registerActions<Entity extends EntityBaseServer>(action_defs: ActionDefOpts<Entity>[]): void {
    action_defs.forEach((action_def) => {
      let { action_id } = action_def;
      assert(!this.prototype.action_defs[action_id]);
      actionDefDefaults(action_def);
      this.prototype.action_defs[action_id] = action_def;
    });
  }

  // Optional app-specific override
  // cb(err, constructed entity)
  static loadPlayerEntityImpl<
    Entity extends EntityBaseServer,
  >(
    sem: ServerEntityManagerInterface,
    player_uid: string,
    cb: NetErrorCallback<Entity>,
  ): void {
    sem.worker.getBulkChannelData(`pent.${player_uid}`, null, (err: null | string, data: DataObject) => {
      if (err) {
        return void cb(err);
      }
      if (!data) {
        data = clone(this.DEFAULT_PLAYER_DATA);
      }
      let ent = new this(-1, sem);
      ent.last_saved_data = JSON.stringify(data);
      ent.fromSerialized(data);
      cb(null, ent as Entity);
    });
  }
}

EntityBaseServer.registerFieldEncoders({
  [EntityFieldEncoding.JSON]: function encJSON(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeJSON(value);
  },
  [EntityFieldEncoding.Int]: function encInt(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeInt(value as number);
  },
  [EntityFieldEncoding.Float]: function encFloat(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeFloat(value as number);
  },
  [EntityFieldEncoding.AnsiString]: function encAnsiString(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeAnsiString(value as string);
  },
  [EntityFieldEncoding.U8]: function encU8(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeU8(value as number);
  },
  [EntityFieldEncoding.U32]: function encU32(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeU32(value as number);
  },
  [EntityFieldEncoding.String]: function encString(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeString(value as string);
  },
  [EntityFieldEncoding.Boolean]: function encBool(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    pak.writeBool(value as boolean);
  },
  [EntityFieldEncoding.Vec2]: function encVec2(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    let v = value as [number, number];
    pak.writeFloat(v[0]);
    pak.writeFloat(v[1]);
  },
  [EntityFieldEncoding.Vec3]: function encVec3(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    let v = value as [number, number, number];
    pak.writeFloat(v[0]);
    pak.writeFloat(v[1]);
    pak.writeFloat(v[2]);
  },
  [EntityFieldEncoding.U8Vec3]: function encU8Vec3(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    let v = value as [number, number, number];
    pak.writeU8(v[0]);
    pak.writeU8(v[1]);
    pak.writeU8(v[2]);
  },
  [EntityFieldEncoding.IVec3]: function encIVec3(ent: EntityBaseServer, pak: Packet, value: unknown): void {
    let v = value as [number, number, number];
    pak.writeInt(v[0]);
    pak.writeInt(v[1]);
    pak.writeInt(v[2]);
  },
});

EntityBaseServer.prototype.field_defs = Object.create(null);
EntityBaseServer.registerFieldDefs({
  // no longer on .data: id: { ephemeral: true },

  // expect game to register pos/state/etc definitions as appropriate
});

EntityBaseServer.prototype.action_defs = Object.create(null);
// Example, handler-less, permissive move and animation state
// EntityBaseServer.registerActions([{
//   action_id: 'move',
//   self_only: false,
//   allowed_data_assignments: {
//     pos: 'array',
//     state: 'string',
//   },
// }]);