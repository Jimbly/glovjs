// Portions Copyright 2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import * as engine from 'glov/client/engine';
import {
  ActionDataAssignments,
  ActionMessageParam,
  EALF_HAS_ASSIGNMENTS,
  EALF_HAS_ENT_ID,
  EALF_HAS_PAYLOAD,
  EALF_HAS_PREDICATE,
  EntityBaseCommon,
  EntityFieldEncoding,
  EntityFieldEncodingType,
  EntityID,
} from 'glov/common/entity_base_common';
import { Packet } from 'glov/common/packet';
import { DataObject, NetErrorCallback } from 'glov/common/types';
import { Vec2, Vec3 } from 'glov/common/vmath';
import {
  ClientEntityManagerInterface,
} from './entity_manager_client';

type DataOverride = {
  field: string;
  field_start: string | undefined;
  field_new: string;
  data: Partial<Record<string, unknown>>;
};

export interface ClientActionMessageParam extends ActionMessageParam {
  ent: EntityBaseClient;
}

interface BatchUpdateParam extends ActionMessageParam {
  field: string;
}

export type FieldDecoder<Entity extends EntityBaseClient> = (ent: Entity, pak: Packet, old_value: unknown) => unknown;

export function entActionAppend(pak: Packet, action_data: ActionMessageParam): void {
  let { action_id, ent_id, predicate, self, payload, data_assignments } = action_data;
  let flags = 0;
  if (predicate) {
    flags |= EALF_HAS_PREDICATE;
  }
  if (self) {
    // not sending ent ID
  } else {
    flags |= EALF_HAS_ENT_ID;
  }
  if (payload !== undefined) {
    flags |= EALF_HAS_PAYLOAD;
  }
  if (data_assignments) {
    flags |= EALF_HAS_ASSIGNMENTS;
  }
  pak.writeInt(flags);
  pak.writeAnsiString(action_id);
  if (flags & EALF_HAS_PREDICATE) {
    assert(predicate);
    pak.writeAnsiString(predicate.field);
    pak.writeAnsiString(predicate.expected_value || '');
  }
  if (flags & EALF_HAS_ENT_ID) {
    assert(ent_id);
    pak.writeInt(ent_id);
  }
  if (flags & EALF_HAS_PAYLOAD) {
    pak.writeJSON(payload);
  }
  if (flags & EALF_HAS_ASSIGNMENTS) {
    for (let key in data_assignments) {
      pak.writeAnsiString(key);
      pak.writeJSON(data_assignments[key]);
    }
    pak.writeAnsiString('');
  }
}

export class EntityBaseClient extends EntityBaseCommon {
  entity_manager!: ClientEntityManagerInterface;
  fading_out: boolean;
  fading_in: boolean;
  seq_id: number;
  data_overrides: DataOverride[];
  fade: number | null;
  last_update_timestamp: number;

  constructor(ent_id: EntityID, entity_manager: ClientEntityManagerInterface) {
    super(ent_id, entity_manager);
    this.fade = null;
    this.fading_out = false;
    this.fading_in = false;
    this.data_overrides = [];
    this.seq_id = 0;
    this.last_update_timestamp = engine.frame_timestamp;
  }

  getData<T>(field: string, deflt: T): T;
  getData<T>(field: string): T | undefined;
  getData(field: string, deflt?: unknown): unknown {
    let ret = (this.data as DataObject)[field];
    for (let ii = 0; ii < this.data_overrides.length; ++ii) {
      let override = this.data_overrides[ii];
      let { data } = override;
      let v = data[field];
      if (v !== undefined) {
        if (v === null) {
          ret = undefined;
        } else {
          ret = v;
        }
      }
    }
    return ret ?? deflt;
  }
  setDataOverride(field: string, data: Partial<Record<string, unknown>>): string | undefined {
    let field_start = this.getData<string>(field);
    let sub_id_prefix = this.entity_manager.sub_id_prefix;
    let field_new = `${sub_id_prefix}${++this.seq_id}`;
    // Also predict this change
    data[field] = field_new;
    this.data_overrides.push({
      field,
      field_start,
      field_new,
      data,
    });
    return field_start;
  }
  postEntUpdate(): void {
    this.last_update_timestamp = engine.frame_timestamp;
    if (this.data_overrides.length) {
      // Flush all data overrides up to the one who's field_start matches our current values
      let by_field: Partial<Record<string, true>> = {};
      this.data_overrides = this.data_overrides.filter((override) => {
        let { field } = override;
        if (by_field[field]) {
          // already validated
          return true;
        } else if ((this.data as DataObject)[field] === override.field_start) {
          // this, and any following, still need to be applied
          by_field[field] = true;
          return true;
        } else {
          // this has been applied, or failed to apply
          return false;
        }
      });
    }
  }

  actionPrepDataAssignments(
    action_data: ActionMessageParam,
    field: string,
    data_assignments: ActionDataAssignments
  ): void {
    assert(!action_data.data_assignments);
    assert(!action_data.predicate);
    let expected_value = this.setDataOverride(field, data_assignments);
    action_data.predicate = {
      field,
      expected_value,
    };
    if (data_assignments.client_only) {
      action_data.data_assignments = {
        [field]: data_assignments[field],
      };
    } else {
      action_data.data_assignments = data_assignments;
    }
  }

  handleActionResult(action_data: ActionMessageParam, err?: string, data?: unknown): void {
    // If any error, we need to clear all overrides from this point onward, they will all fail
    // Note: we may have already had an update come in that cleared all overrides
    //   and started a new chain from a different ID!
    if (err) {
      let { predicate } = action_data;
      if (predicate) {
        let { field, expected_value } = predicate;
        let walk_id = expected_value;
        this.data_overrides = this.data_overrides.filter((override) => {
          if (override.field === field) {
            if (override.field_start === walk_id) {
              // This is part of the chain stemming from what failed
              walk_id = override.field_new;
              return false;
            }
            // else this must be in a new chain
          }
          return true;
        });
      }
    }
  }

  actionSend<T=unknown>(action: ActionMessageParam, resp_func: NetErrorCallback<T>): void {
    (action as ClientActionMessageParam).ent = this;
    this.entity_manager.actionSendQueued(action as ClientActionMessageParam, resp_func as NetErrorCallback<unknown>);
  }

  applyBatchUpdate<T=unknown>(update: BatchUpdateParam, resp_func: NetErrorCallback<T>): void {
    let { field, action_id, payload, data_assignments } = update;
    assert(data_assignments);
    assert(!update.predicate);
    let action_data = {
      action_id,
      payload,
    };
    this.actionPrepDataAssignments(action_data, field, data_assignments);
    this.actionSend(action_data, resp_func);
  }


  // Expected to be overridden by app
  onDelete(reason: string): number {
    // Returns how many milliseconds to keep the entity around in a fading_out state
    return 250;
  }

  // Expected to be overridden by app
  // Called after full ent update has been applied to the entity
  // is_initial is true if this is part of the initial updates (old entities we're
  //   just seeing now) as opposed to a brand new entity
  onCreate(is_initial: boolean): number {
    // Returns how many milliseconds to keep the entity in a fading_in state
    return is_initial && !this.entity_manager.received_ent_ready ? 0 : 250;
  }

  static field_decoders: Partial<Record<EntityFieldEncodingType, FieldDecoder<EntityBaseClient>>> = {};
  // Note: must be called _before_ registerFieldDefs()
  static registerFieldDecoders<Entity extends EntityBaseClient>(
    encoders: Partial<Record<EntityFieldEncodingType, FieldDecoder<Entity>>>
  ): void {
    for (let key_string in encoders) {
      let key = Number(key_string) as EntityFieldEncodingType;
      let func = encoders[key] as FieldDecoder<EntityBaseClient>;
      assert(!this.field_decoders[key]);
      this.field_decoders[key] = func;
    }
  }
}
EntityBaseClient.registerFieldDecoders({
  // Using functions with names to get better callstacks
  [EntityFieldEncoding.JSON]: function decJSON(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    return pak.readJSON();
  },
  [EntityFieldEncoding.Int]: function decInt(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    return pak.readInt();
  },
  [EntityFieldEncoding.Float]: function decFloat(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    return pak.readFloat();
  },
  [EntityFieldEncoding.AnsiString]: function decAnsiString(
    ent: EntityBaseClient, pak: Packet, old_value: unknown
  ): unknown {
    return pak.readAnsiString();
  },
  [EntityFieldEncoding.U8]: function decU8(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    return pak.readU8();
  },
  [EntityFieldEncoding.U32]: function decU32(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    return pak.readU32();
  },
  [EntityFieldEncoding.String]: function decString(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    return pak.readString();
  },
  [EntityFieldEncoding.Boolean]: function decBool(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    return pak.readBool();
  },
  [EntityFieldEncoding.Vec2]: function decVec2(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    let v = old_value as Vec2;
    v[0] = pak.readFloat();
    v[1] = pak.readFloat();
    return v;
  },
  [EntityFieldEncoding.Vec3]: function decVec3(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    let v = old_value as Vec3;
    v[0] = pak.readFloat();
    v[1] = pak.readFloat();
    v[2] = pak.readFloat();
    return v;
  },
  [EntityFieldEncoding.U8Vec3]: function decU8Vec3(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    let v = old_value as Vec3;
    v[0] = pak.readU8();
    v[1] = pak.readU8();
    v[2] = pak.readU8();
    return v;
  },
  [EntityFieldEncoding.IVec3]: function decIVec3(ent: EntityBaseClient, pak: Packet, old_value: unknown): unknown {
    let v = old_value as Vec3;
    v[0] = pak.readInt();
    v[1] = pak.readInt();
    v[2] = pak.readInt();
    return v;
  },
});
