// Portions Copyright 2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import {
  ActionListResponse,
  ClientID,
  EntityFieldDefCommon,
  EntityFieldEncoding,
  EntityFieldEncodingType,
  EntityFieldSpecial,
  EntityFieldSub,
  EntityID,
  EntityManager,
  EntityManagerEvent,
  EntityManagerSchema,
  EntityUpdateCmd,
} from 'glov/common/entity_base_common';
import { Packet } from 'glov/common/packet';
import { EventEmitter } from 'glov/common/tiny-events';
import { ClientChannelWorker, DataObject, NetErrorCallback } from 'glov/common/types';
import { ridx } from 'glov/common/util';
import * as engine from './engine';
import {
  ClientActionMessageParam,
  EntityBaseClient,
  FieldDecoder,
} from './entity_base_client';
import { netClientId, netDisconnected, netSubs } from './net';

const { min, round } = Math;

interface ClientEntityManagerBaseOpts {
  on_broadcast?: (data: EntityManagerEvent) => void;
  EntityCtor: typeof EntityBaseClient;

  channel?: ClientChannelWorker;
}

interface ClientEntityManagerOpts extends ClientEntityManagerBaseOpts {
  channel_type: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClientEntityManagerInterface = ClientEntityManager<any>;

interface FadingEnt {
  is_out: boolean; // fading out? otherwise, is fading in
  ent_id: EntityID;
  countdown: number;
  countdown_max: number;
}

export type WithNotRequired<T, K extends keyof T> = T & { [P in K]?: T[P] };

interface EntityFieldDefClient extends EntityFieldDefCommon {
  field_name: string;
}

export type ClientEntityManager<Entity extends EntityBaseClient> =
  Readonly<ClientEntityManagerImpl<Entity>>; // Really want all non-functions private, not readonly...
class ClientEntityManagerImpl<
  Entity extends EntityBaseClient
> extends EventEmitter implements EntityManager<Entity>, ClientEntityManagerBaseOpts {
  my_ent_id?: EntityID;

  on_broadcast!: (data: EntityManagerEvent) => void;
  EntityCtor!: typeof EntityBaseClient;
  channel?: ClientChannelWorker;

  client_id?: ClientID;
  subscription_id?: string;

  entities!: Partial<Record<EntityID, Entity>>;
  fading_ents!: FadingEnt[];

  field_defs?: (EntityFieldDefClient|null)[];
  field_decoders: Partial<Record<EntityFieldEncodingType, FieldDecoder<EntityBaseClient>>>;

  received_ent_ready!: boolean;
  received_ent_start!: boolean;

  constructor(options: ClientEntityManagerOpts) {
    super();
    assert(options.channel_type);
    netSubs().onChannelMsg(options.channel_type, 'ent_update', this.onEntUpdate.bind(this));
    netSubs().onChannelMsg(options.channel_type, 'ent_broadcast', this.onBroadcast.bind(this));
    netSubs().onChannelMsg(options.channel_type, 'ent_start', this.onEntStart.bind(this));
    netSubs().onChannelMsg(options.channel_type, 'ent_ready', this.onEntReady.bind(this));
    netSubs().onChannelEvent(options.channel_type, 'subscribe', this.onChannelSubscribe.bind(this));

    this.reinit(options);

    this.field_decoders = this.EntityCtor.field_decoders;
  }

  reinit(options: Partial<ClientEntityManagerBaseOpts>): void {
    this.deinit();

    this.EntityCtor = options.EntityCtor || this.EntityCtor;
    this.on_broadcast = options.on_broadcast || this.on_broadcast;

    // Never inheriting this over reinit()
    this.channel = options.channel;

    this.reinitInternal();
  }

  private reinitInternal(): void {
    this.entities = {};
    this.fading_ents = [];
    this.my_ent_id = 0;
    this.received_ent_ready = false;
    this.received_ent_start = false;
  }

  deinit(): void {
    // Maybe this function is not needed anymore
    this.received_ent_start = false;
  }

  private finalizeDelete(ent_id: EntityID) {
    this.emit('ent_delete', ent_id);
    delete this.entities[ent_id];
  }

  tick(): void {
    if (this.fading_ents) {
      for (let ii = this.fading_ents.length - 1; ii >= 0; --ii) {
        let elem = this.fading_ents[ii];
        elem.countdown -= engine.frame_dt;
        let { ent_id } = elem;
        if (elem.countdown <= 0) {
          if (elem.is_out) {
            this.finalizeDelete(ent_id);
          } else {
            let ent = this.entities[ent_id];
            assert(ent);
            assert(ent.fading_in);
            ent.fading_in = false;
            ent.fade = null;
          }
          ridx(this.fading_ents, ii);
        } else {
          let ent = this.entities[ent_id];
          assert(ent);
          if (elem.is_out) {
            // if playing death animations, dividing by this was better (adds a
            //    delay before starting fading): min(elem.countdown_max, 500));
            ent.fade = min(1, elem.countdown / elem.countdown_max);
          } else {
            ent.fade = 1 - elem.countdown / elem.countdown_max;
          }
        }
      }
    }
  }

  private onChannelSubscribe(data: unknown): void {
    // initial connection or reconnect
    this.client_id = netClientId();
    this.subscription_id = (data as DataObject).sub_id as string || this.client_id;
    this.reinitInternal();
    this.emit('subscribe', data);
  }

  private onBroadcast(data: EntityManagerEvent): void {
    if (!this.received_ent_start) {
      return;
    }
    this.on_broadcast(data);
  }

  private fadeInEnt(ent: Entity, time: number): void {
    assert(!ent.fading_out);
    assert(!ent.fading_in);
    ent.fading_in = true;
    this.fading_ents.push({
      is_out: false,
      ent_id: ent.id,
      countdown: time,
      countdown_max: time,
    });
  }

  private deleteEntityInternal(ent_id: EntityID, reason: string): void {
    let ent = this.entities[ent_id];
    assert(ent); // Previously might happen from a queued delete from before we joined, but no longer?
    assert(!ent.fading_out);
    ent.fading_out = true;
    let countdown_max = ent.onDelete(reason);

    if (ent.fading_in) {
      ent.fading_in = false;
      for (let ii = 0; ii < this.fading_ents.length; ++ii) {
        let fade = this.fading_ents[ii];
        if (fade.ent_id === ent_id) {
          if (countdown_max) {
            fade.is_out = true;
            fade.countdown = round((ent.fade || 0) * countdown_max);
            fade.countdown_max = countdown_max;
          } else {
            ridx(this.fading_ents, ii);
            this.finalizeDelete(ent_id);
          }
          return;
        }
      }
      assert(false);
    }

    if (countdown_max) {
      this.fading_ents.push({
        is_out: true,
        ent_id,
        countdown: countdown_max,
        countdown_max: countdown_max,
      });
    } else {
      this.finalizeDelete(ent_id);
    }
  }

  private getEntityForUpdate(ent_id: EntityID): Entity {
    let ent = this.entities[ent_id];
    if (!ent) {
      ent = this.entities[ent_id] = new this.EntityCtor(ent_id, this) as Entity;
    }
    if (ent.fading_out) {
      // was deleting, but got a new update on it (presumably was out of view, and came back), cancel delete
      // TODO: start fade in from appropriate value (after getting full update
      //   later in the packet and calling onCreate)
      ent.fading_out = false;
      ent.fade = null;
      for (let jj = 0; jj < this.fading_ents.length; ++jj) {
        let fade = this.fading_ents[jj];
        if (fade.ent_id === ent_id) {
          ridx(this.fading_ents, jj);
          break;
        }
      }
    }
    return ent;
  }

  private readDiffFromPacket(ent_id: EntityID, pak: Packet): void {
    let { field_defs, field_decoders } = this;
    assert(field_defs); // should have received this before receiving any diffs!
    // Get an entity to apply the diff to.  Note: this may allocate an entity
    //   that did not previously exist, and apply a meaningless diff, but we
    //   need to do so in order to advance through the packet.  Presumably there's
    //   a full update for this entity at the end of the packet for us.
    let ent = this.getEntityForUpdate(ent_id);
    let data = ent.data as DataObject;
    let field_id: number;
    while ((field_id = pak.readInt())) {
      let do_default = field_id === EntityFieldSpecial.Default;
      if (do_default) {
        field_id = pak.readInt();
      }
      let field_def = field_defs[field_id];
      if (!field_def) {
        assert(field_def, `Missing field_def in server-provided schema for field#"${field_id}"`); // catch coding bug
      }
      let { default_value, encoding, field_name, sub } = field_def;
      let decoder = field_decoders[encoding];
      if (!decoder) {
        assert(decoder, `Missing decoder for type ${field_def.encoding}`); // catch server<->client unable to comm
      }
      if (sub) {
        assert(!do_default);
        let sub_value = data[field_name];
        if (sub === EntityFieldSub.Array) {
          if (!sub_value) {
            sub_value = data[field_name] = [];
          }
          assert(Array.isArray(sub_value));
          let index;
          while ((index = pak.readInt())) {
            if (index === -1) {
              sub_value.length = pak.readInt();
            } else {
              let old_value = sub_value[index-1];
              let new_value = decoder(ent, pak, old_value);
              sub_value[index-1] = new_value;
            }
          }
        } else { // EntityFieldSub.Record
          if (!sub_value) {
            sub_value = data[field_name] = {};
          }
          assert(sub_value && typeof sub_value === 'object' && !Array.isArray(sub_value));
          let sub_obj: DataObject = sub_value;
          let key;
          while ((key = pak.readAnsiString())) {
            let old_value = sub_obj[key];
            let new_value = decoder(ent, pak, old_value);
            if (new_value === undefined) {
              delete sub_obj[key];
            } else {
              sub_obj[key] = new_value;
            }
          }
        }
      } else {
        let old_value = data[field_name];
        let new_value = do_default ? default_value : decoder(ent, pak, old_value);
        if (new_value === undefined) {
          delete data[field_name];
        } else {
          data[field_name] = new_value;
        }
      }
    }
    ent.postEntUpdate();
    this.emit('ent_update', ent.id);
  }

  private initSchema(schema: EntityManagerSchema): void {
    let field_defs: (EntityFieldDefClient|null)[] = [null];
    for (let ii = 0; ii < schema.length; ++ii) {
      let ser_def = schema[ii];
      field_defs[ii + EntityFieldSpecial.MAX] = {
        encoding: ser_def.e || EntityFieldEncoding.JSON,
        default_value: ser_def.d, // *not* `|| undefined` - 0, '', and null allowed here
        sub: ser_def.s || EntityFieldSub.None,
        field_name: ser_def.n,
      };
    }
    this.field_defs = field_defs;
  }

  private initializeNewFullEnt(ent: Entity): void {
    let { field_defs } = this;
    assert(field_defs);
    let data = ent.data as DataObject;
    for (let ii = 0; ii < field_defs.length; ++ii) {
      let def = field_defs[ii];
      if (!def) {
        continue;
      }
      let { default_value, field_name } = def;
      if (default_value !== undefined && default_value !== data[field_name]) {
        data[field_name] = default_value;
      }
    }
  }

  private onEntUpdate(pak: Packet): void {
    if (!this.received_ent_start) {
      pak.pool();
      return;
    }
    let cmd: EntityUpdateCmd;
    let is_initial = false;
    while ((cmd = pak.readU8())) {
      switch (cmd) {
        case EntityUpdateCmd.Full: {
          let ent_id = pak.readInt();
          let ent = this.getEntityForUpdate(ent_id);
          this.initializeNewFullEnt(ent);
          this.readDiffFromPacket(ent_id, pak);
          let fade_in_time = ent.onCreate(is_initial);
          if (fade_in_time) {
            this.fadeInEnt(ent, fade_in_time);
          }
        } break;
        case EntityUpdateCmd.Diff: {
          let ent_id = pak.readInt();
          this.readDiffFromPacket(ent_id, pak);
        } break;
        case EntityUpdateCmd.Delete: {
          let ent_id = pak.readInt();
          let reason = pak.readAnsiString();
          this.deleteEntityInternal(ent_id, reason);
        } break;
        case EntityUpdateCmd.Event: {
          let data = pak.readJSON() as EntityManagerEvent;
          this.onBroadcast(data);
        } break;
        case EntityUpdateCmd.Schema: {
          let schema = pak.readJSON() as EntityManagerSchema;
          this.initSchema(schema);
        } break;
        case EntityUpdateCmd.IsInitialList:
          is_initial = true;
          break;
        default:
          assert(false, `Unexpected EntityUpdateCmd: ${cmd}`);
      }
    }
  }

  private onEntReady(): void {
    if (this.received_ent_start) {
      this.received_ent_ready = true;
      this.emit('ent_ready');
    } // else may have been from a previous connection?
  }

  isReady(): boolean {
    return this.received_ent_ready;
  }

  private onEntStart(data: { ent_id: EntityID; sub_id: string }): void {
    if (data.sub_id === this.subscription_id) {
      this.my_ent_id = data.ent_id;
      this.received_ent_start = true;
    } // else may have been from a previous connection
  }

  checkNet(): boolean {
    if (netDisconnected() || !this.channel || !this.received_ent_ready) {
      // Not yet receiving updates, do nothing
      return true;
    }
    if (netClientId() !== this.client_id) {
      // Haven't yet subscribed to this room under the new client_id
      return true;
    }

    return false;
  }

  private handleActionListResult(
    action_list: ClientActionMessageParam[],
    resp_list: NetErrorCallback<unknown>[],
    err: string | null,
    resp?: ActionListResponse,
  ): void {
    resp = resp || [];
    for (let ii = 0; ii < resp_list.length; ++ii) {
      let this_resp = resp[ii] || {};
      let this_err = err || this_resp.err;
      let this_data = this_resp.data;
      let action_data = action_list[ii];
      let { ent } = action_data;
      ent.handleActionResult(action_data, this_err, this_data);
      let resp_func = resp_list[ii];
      if (resp_func) {
        resp_func(this_err || null, this_data);
      } else {
        // "Expected" errors
        let { predicate, data_assignments } = action_data;
        if (predicate && data_assignments) {
          let { field, expected_value } = predicate;
          if (
            this_err === 'ERR_FIELD_MISMATCH' || // prediction mismatch
            this_err === 'ERR_INVALID_ENT_ID' // entity has been removed / moved out of range / etc
          ) {
            console.log(`Received (not unexpected) error ${this_err} applying batch update ` +
              `${field}=${expected_value}->${data_assignments[field]} to ent:${ent.id}`);
            return;
          }
        }
        // Otherwise received an error but no client code handling the error, throw it
        if (this_err) {
          throw this_err;
        }
      }
    }
  }

  actionListSend(
    action_list: ClientActionMessageParam[],
    resp_list: NetErrorCallback<unknown>[],
  ): void {
    assert(this.channel);
    let pak = this.channel.pak('ent_action_list');
    pak.writeInt(action_list.length);
    for (let ii = 0; ii < action_list.length; ++ii) {
      let action_data = action_list[ii];
      let { ent } = action_data;
      if (ent.id === this.my_ent_id) {
        action_data.self = true;
      } else {
        action_data.ent_id = ent.id;
      }
      ent.actionAppend(pak, action_data);
    }

    pak.send<ActionListResponse>(this.handleActionListResult.bind(this, action_list, resp_list));
  }

  getEnt(ent_id: EntityID): Entity | undefined {
    return this.entities[ent_id];
  }

  getMyEnt(): Entity {
    assert(this.my_ent_id);
    let ent = this.getEnt(this.my_ent_id);
    assert(ent);
    return ent;
  }

  entitiesFind(
    predicate: (ent: Entity) => boolean,
    skip_fading_out?: boolean
  ) {
    let { entities } = this;
    let ret = [];
    for (let ent_id_string in entities) {
      let ent = entities[ent_id_string]!;
      if (ent.fading_out && skip_fading_out) {
        continue;
      }
      if (!predicate(ent)) {
        continue;
      }
      ret.push(ent);
    }
    return ret;
  }
}

export function clientEntityManagerCreate<Entity extends EntityBaseClient>(
  options: ClientEntityManagerOpts
): ClientEntityManager<Entity> {
  return new ClientEntityManagerImpl(options);
}
