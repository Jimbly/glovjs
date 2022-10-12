// Portions Copyright 2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import { asyncEach } from 'glov-async';
import {
  ActionListResponse,
  ActionMessageParam,
  ClientID,
  EALF_HAS_ASSIGNMENTS,
  EALF_HAS_ENT_ID,
  EALF_HAS_PAYLOAD,
  EALF_HAS_PREDICATE,
  EntityFieldDefSerialized,
  EntityFieldEncoding,
  EntityFieldSpecial,
  EntityFieldSub,
  EntityID,
  EntityManager,
  EntityManagerEvent,
  EntityManagerSchema,
  EntityUpdateCmd,
} from 'glov/common/entity_base_common';
import { Packet, packetCreate } from 'glov/common/packet';
import { EventEmitter } from 'glov/common/tiny-events';
import {
  ClientHandlerSource,
  DataObject,
  ErrorCallback,
  NetErrorCallback,
  NetResponseCallback,
} from 'glov/common/types';
import { callEach, logdata, nop } from 'glov/common/util';
import { ChannelWorker } from './channel_worker.js';
import {
  ActionHandlerParam,
  DirtyFields,
  EntityBaseServer,
  EntityFieldDef,
  VAID,
} from './entity_base_server';

const { min } = Math;

export interface EntityManagerReadyWorker<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
> extends ChannelWorker {
  semClientInitialVisibleAreaSees(client: SEMClient): VAID[];
  entity_manager: ServerEntityManager<Entity, Worker>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerEntityManagerInterface = ServerEntityManager<any,any>;

type VARecord = {
  loading: NetErrorCallback<never>[] | null;
};

function visibleAreaInit<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
>(sem: ServerEntityManager<Entity, Worker>, vaid: VAID, next: ErrorCallback<never, string>) {
  let va = sem.visible_areas[vaid];
  if (va) {
    if (va.loading) {
      va.loading.push(next);
      return;
    }
    return void next();
  }
  let va2: VARecord = va = sem.visible_areas[vaid] = {
    loading: [next],
  };
  function done(err?: string) {
    if (err) {
      delete sem.visible_areas[vaid];
    }
    callEach(va2.loading, va2.loading = null, err);
  }
  sem.worker.log(`Initializing VisibleArea ${vaid}: Loading existing entities`);
  sem.worker.getBulkChannelData(`ents.${vaid}`, null, function (err?: string, ent_data?: DataObject[]) {
    if (err) {
      return void done(err);
    }
    if (!ent_data) {
      // initial load of VA
      sem.worker.log(`Initializing VisibleArea ${vaid}: No existing data, asking worker to initialize`);
      // Want to at least save an empty ent_data[] so that the next load is not consider initial
      sem.visible_areas_need_save[vaid] = true;
      sem.emit('visible_area_init', vaid);
    } else {
      sem.worker.log(`Initializing VisibleArea ${vaid}: Loaded ${ent_data.length} entities`);
      for (let ii = 0; ii < ent_data.length; ++ii) {
        // Same as addEntityFromSerialized(), but does not flag `visible_areas_need_save`
        let ent_id = ++sem.last_ent_id;
        let ent = sem.entities[ent_id] = new sem.EntityCtor(ent_id, sem) as Entity;
        ent.fromSerialized(ent_data[ii]);
        ent.fixupPostLoad();
        // Dirty flag should not be set: anyone who sees this VA must be waiting to send
        // initial ents anyway, do not need to send this entity to anyone
        // during regular ticking.
        assert(!ent.in_dirty_list);
        assert(ent.current_vaid !== undefined);
      }
      sem.emit('visible_area_load', vaid);
    }
    done();
  });
}

function addToDirtyList<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
>(
  sem: ServerEntityManager<Entity, Worker>,
  ent: Entity,
): void {
  assert(!ent.in_dirty_list);
  sem.dirty_list.push(ent);
  ent.in_dirty_list = true;
}

function loadPlayerEntity<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
>(
  sem: ServerEntityManager<Entity, Worker>,
  src: ClientHandlerSource,
  client: SEMClient,
  player_uid: string,
  cb: NetErrorCallback<EntityID>
) {
  // Asks the entity to load it's data (presumably from the worker) if needed
  // Boots existing client registered for this player_uid

  let old_client = sem.player_uid_to_client[player_uid];
  if (old_client) {
    if (old_client.loading) {
      return void cb('ERR_STILL_LOADING');
    }
    assert(old_client.ent_id);
    // Kick old client
    let target_channel = `client.${old_client.client_id}`;
    sem.worker.logSrc(src, `Booting previous client ${old_client.client_id} for player_uid ${player_uid}`);
    // TODO: use force_unsub instead?  Probably also need an app-level message to send.
    sem.worker.sendChannelMessage(target_channel, 'force_kick');

    // Steal entity/player_uid
    client.player_uid = player_uid;
    client.ent_id = old_client.ent_id;
    old_client.player_uid = null;
    old_client.ent_id = 0;
    sem.player_uid_to_client[player_uid] = client;

    sem.clientLeave(old_client.client_id);

    return void cb(null, client.ent_id);
  }

  assert(!client.loading);
  sem.player_uid_to_client[player_uid] = client;
  client.player_uid = player_uid;
  client.loading = true;
  sem.EntityCtor.loadPlayerEntityImpl(sem, player_uid, (err?: string | null, ent?: Entity) => {
    client.loading = false;
    if (err || client.left_while_loading) {
      sem.clientLeave(client.client_id);
      return void cb(err || 'ERR_LEFT_WHILE_LOADING');
    }

    assert(ent);
    assert.equal(client, sem.player_uid_to_client[player_uid]); // hasn't changed async while loading
    let ent_id = ++sem.last_ent_id;
    ent.id = /*ent.data.id = */ent_id;
    sem.entities[ent_id] = ent;
    assert(ent.current_vaid !== undefined);
    // ent.user_id = user_id; // not currently needed, but might be generally useful?
    ent.player_uid = player_uid;
    ent.is_player = true;
    client.ent_id = ent_id;
    ent.fixupPostLoad();

    // Add to dirty list so full update gets sent to all subscribers
    addToDirtyList(sem, ent);

    cb(null, ent_id);
  });
}

function newEntsInVA<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
>(
  sem: ServerEntityManager<Entity, Worker>,
  array_out: Entity[],
  vaid: VAID,
  known_entities: Partial<Record<EntityID, true>>
): void {
  for (let ent_id_string in sem.entities) {
    let ent = sem.entities[ent_id_string]!;
    if (!ent.in_dirty_list && !known_entities[ent.id]) {
      if (ent.visibleAreaGet() === vaid) {
        known_entities[ent.id] = true;
        array_out.push(ent);
      }
    }
  }
}

function toSerializedStorage(ent: EntityBaseServer) {
  return ent.toSerializedStorage();
}

export type SEMClient = SEMClientImpl;
class SEMClientImpl {
  client_id: ClientID;
  player_uid: string | null;
  ent_id: EntityID;
  known_entities: Partial<Record<EntityID, true>>;
  loading: boolean;
  left_while_loading: boolean;
  visible_area_sees: VAID[];
  has_schema: boolean;
  constructor(client_id: ClientID) {
    this.client_id = client_id;
    this.player_uid = null;
    this.ent_id = 0;
    this.known_entities = {};
    this.loading = false;
    this.left_while_loading = false;
    this.visible_area_sees = [];
    this.has_schema = false;
  }
}

interface ServerEntityManagerOpts<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
> {
  worker: Worker;
  EntityCtor: typeof EntityBaseServer;
  max_ents_per_tick?: number;
}

export type ServerEntityManager<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
> = ServerEntityManagerImpl<Entity, Worker>;

type EntDelete = [EntityID, string];

type PerVAUpdate = {
  ent_ids: EntityID[];
  pak: Packet;
  debug: string[];
};

class ServerEntityManagerImpl<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
>
  extends EventEmitter
  implements EntityManager<Entity>
{ // eslint-disable-line brace-style
  worker: Worker;
  EntityCtor: typeof EntityBaseServer;
  field_defs: Partial<Record<string, EntityFieldDef>>;

  last_ent_id: EntityID = 0;
  clients: Partial<Record<ClientID, SEMClient>> = {};
  player_uid_to_client: Partial<Record<string, SEMClient>> = {}; // player_uid -> SEMClient
  visible_areas: Partial<Record<VAID, VARecord>> = {};
  visible_areas_need_save: Partial<Record<VAID, true>> = {};
  visible_area_broadcasts: Partial<Record<VAID, EntityManagerEvent[]>> = {};
  ent_deletes: Partial<Record<VAID, EntDelete[]>> = {};
  entities: Partial<Record<EntityID, Entity>> = {};
  flushing_changes = false;
  dirty_list: Entity[] = [];
  max_ents_per_tick: number;
  schema: EntityManagerSchema;
  all_client_fields: DirtyFields;

  constructor(options: ServerEntityManagerOpts<Entity, Worker>) {
    super();
    this.worker = options.worker;
    this.EntityCtor = options.EntityCtor;
    this.field_defs = this.EntityCtor.prototype.field_defs;
    this.max_ents_per_tick = options.max_ents_per_tick || 100;
    this.schema = [];
    this.all_client_fields = {};
    let { field_defs, all_client_fields } = this;
    for (let key in field_defs) {
      let field_def = field_defs[key]!;
      if (!field_def.server_only) {
        assert(field_def.field_id);
        let index = field_def.field_id - EntityFieldSpecial.MAX;
        assert(!this.schema[index]);
        let schema_def: EntityFieldDefSerialized = {
          n: key,
        };
        if (field_def.encoding !== EntityFieldEncoding.JSON) {
          schema_def.e = field_def.encoding;
        }
        if (field_def.default_value !== undefined) {
          schema_def.d = field_def.encoding;
        }
        if (field_def.sub !== EntityFieldSub.None) {
          schema_def.s = field_def.sub;
        }
        this.schema[index] = schema_def;
        all_client_fields[key] = true;
      }
    }
    // Ensure we properly filled in the schema
    for (let ii = 0; ii < this.schema.length; ++ii) {
      assert(this.schema[ii]);
    }
  }
  getClient(client_id: ClientID): SEMClient {
    let client = this.clients[client_id];
    assert(client);
    return client;
  }

  getEntityForClient(client: SEMClient): Entity | undefined {
    return this.entities[client.ent_id];
  }

  visibleAreaReset(vaid: VAID, resp_func: ErrorCallback<string>): void {
    let va = this.visible_areas[vaid];
    if (!va) {
      return void resp_func('VisibleArea not loaded');
    }
    if (va.loading) {
      return void resp_func('VisibleArea still loading');
    }

    this.worker.setBulkChannelData(`ents.${vaid}`, null, (err?: string) => {
      if (err) {
        return void resp_func(err);
      }
      let { entities } = this;
      for (let ent_id_string in entities) {
        let ent = entities[ent_id_string]!;
        if (ent.visibleAreaGet() === vaid && !ent.is_player) {
          this.deleteEntity(ent.id, 'debug');
        }
      }
      delete this.visible_areas[vaid];
      delete this.visible_areas_need_save[vaid];

      visibleAreaInit(this, vaid, (err) => {
        resp_func(err, 'VisibleArea re-initialized');
      });
    });
  }

  clientJoin(
    src: ClientHandlerSource,
    player_uid: string,
  ): void {
    let { id: client_id } = src;
    assert(!this.clients[client_id]);
    let client = this.clients[client_id] = new SEMClientImpl(client_id);
    let sub_id = this.worker.getSubscriberId(src.channel_id); // Just for logging for now?

    loadPlayerEntity(this, src, client, player_uid, (err, ent_id) => {
      if (err) {
        // Immediately failed, remove this client
        this.clientLeave(client_id);
        this.worker.logSrc(src, `${client_id}: clientJoin failed: ${err}`);
        // TODO: send error to client?
        return;
      }
      assert(ent_id);
      this.worker.debugSrc(src, `${client_id}: clientJoin success: ent_id=${ent_id}, sub_id="${sub_id}"`);
      // Immediately let client know their entity ID, and notify that they are
      //   now receiving entity updates (will not yet have own entity yet, though)
      this.worker.sendChannelMessage(`client.${client_id}`, 'ent_start', {
        ent_id,
        sub_id,
      });
      // Join and initialize appropriate visible areas
      client.visible_area_sees = this.worker.semClientInitialVisibleAreaSees(client);
      this.sendInitialEntsToClient(client, false, () => {
        // By now, client has already received the initial update for all relevant
        //   entities (should include own entity)
        this.worker.sendChannelMessage(`client.${client_id}`, 'ent_ready');
      });
    });
  }

  clientLeave(client_id: ClientID): void {
    let client = this.clients[client_id];
    if (!client) {
      // ignore, maybe subscribed to the worker, never actually joined the entity
      //   manager, or was kicked
      return;
    }
    if (client.loading) {
      client.left_while_loading = true;
      // This function will be called again when loading flag is cleared
      return;
    }
    let { player_uid, ent_id } = client;
    if (player_uid) {
      if (ent_id) {
        let ent = this.entities[ent_id];
        assert(ent);
        if (ent.need_save) {
          ent.savePlayerEntity(nop);
        }
        ent.releasePlayerEntity();
        this.deleteEntity(ent_id, 'disconnect');

        client.ent_id = 0;
      }
      if (player_uid) {
        delete this.player_uid_to_client[player_uid];
        client.player_uid = null;
      }
    }
    delete this.clients[client.client_id];
  }

  deleteEntity(ent_id: EntityID, reason: string): void {
    assert.equal(typeof ent_id, 'number');
    let ent = this.entities[ent_id];
    assert(ent);
    let vaid = ent.visibleAreaGet();
    let dels = this.ent_deletes[vaid] = this.ent_deletes[vaid] || [];
    dels.push([ent_id, reason]);
    delete this.entities[ent_id];
    if (!ent.is_player) {
      this.visible_areas_need_save[vaid] = true;
    }
  }

  addEntityFromSerialized(data: DataObject): void {
    let sem = this;
    let ent_id = ++sem.last_ent_id;
    let ent = sem.entities[ent_id] = new this.EntityCtor(ent_id, sem) as Entity;
    assert(!ent.is_player);
    let vaid = ent.visibleAreaGet();
    sem.visible_areas_need_save[vaid] = true;
    ent.fromSerialized(data);
    ent.fixupPostLoad();

    // Add to dirty list so full update gets sent to all subscribers
    addToDirtyList(this, ent);
  }

  handleActionList(src: ClientHandlerSource, pak: Packet, resp_func: NetResponseCallback<ActionListResponse>): void {
    let count = pak.readInt();
    let actions = [];
    for (let ii = 0; ii < count; ++ii) {
      let flags = pak.readInt();
      let action_data = {} as ActionMessageParam;
      action_data.action_id = pak.readAnsiString();
      if (flags & EALF_HAS_PREDICATE) {
        let field = pak.readAnsiString();
        let expected_value = pak.readAnsiString();
        action_data.predicate = { field, expected_value };
      }
      if (flags & EALF_HAS_ENT_ID) {
        action_data.ent_id = pak.readInt();
      } else {
        action_data.self = true;
      }
      if (flags & EALF_HAS_PAYLOAD) {
        action_data.payload = pak.readJSON();
      }
      if (flags & EALF_HAS_ASSIGNMENTS) {
        action_data.data_assignments = {};
        let key = pak.readAnsiString();
        while (key) {
          action_data.data_assignments[key] = pak.readJSON();
          key = pak.readAnsiString();
        }
      }
      actions.push(action_data);
    }
    this.worker.debugSrc(src, `${src.id}: ent_action_list(${count}): ${logdata(actions)}`);
    let results: undefined | ActionListResponse;
    asyncEach(actions, (action_data, next, idx) => {
      function returnResult(err?: string | null, data?: unknown) {
        if (data !== undefined || err) {
          results = results || [];
          if (!err) {
            err = undefined;
          }
          results[idx] = { err, data };
        }
        next();
      }
      if (action_data.self) {
        assert(src);
        let { id: client_id } = src;
        let client = this.clients[client_id];
        if (!client || !client.ent_id) {
          this.worker.warnSrc(src, `${src.id}: ent_action_list:${action_data.action_id}: ERR_NO_ENTITY`);
          return void returnResult('ERR_NO_ENTITY');
        }
        action_data.ent_id = client.ent_id;
      }
      let ent_id = action_data.ent_id;
      assert(ent_id);
      let ent = this.entities[ent_id];
      if (!ent) {
        return void returnResult('ERR_INVALID_ENT_ID');
      }
      (action_data as ActionHandlerParam).src = src;
      ent.handleAction(action_data as ActionHandlerParam, returnResult);
    }, (err?: string | null) => {
      resp_func(err, results);
    });
  }

  dirty(ent: Entity, field: string, delete_reason: string | null): void {
    if (!ent.in_dirty_list) {
      addToDirtyList(this, ent);
    }
    ent.dirty_fields[field] = true;
    ent.need_save = true;
    let vaid = ent.visibleAreaGet();
    ent.current_vaid = vaid;
    if (!ent.is_player) {
      this.visible_areas_need_save[vaid] = true;
      if (vaid !== ent.last_vaid) {
        if (ent.last_vaid !== undefined) {
          this.visible_areas_need_save[ent.last_vaid] = true;
        }
      }
    }
    if (delete_reason) {
      ent.last_delete_reason = delete_reason;
    }
  }

  dirtySub(ent: Entity, field: string, index: string | number): void {
    let sub = ent.dirty_sub_fields[field];
    if (!sub) {
      sub = ent.dirty_sub_fields[field] = {};
    }
    sub[index] = true;
    this.dirty(ent, field, null);
  }

  // Optional resp_func called when all full updates have been sent to the client,
  // but dirty ents still pending, likely including one's own entity.
  clientSetVisibleAreaSees(client: SEMClient, new_visible_areas: VAID[], resp_func?: NetErrorCallback<never>): void {
    client.visible_area_sees = new_visible_areas;
    this.sendInitialEntsToClient(client, true, resp_func);
  }

  private flushChangesToDataStores() {
    if (this.flushing_changes) {
      return;
    }
    this.flushing_changes = true;
    let left = 1;
    let self = this;
    function done() {
      if (!--left) {
        self.flushing_changes = false;
      }
    }

    // Go through all need_save entities and batch them up to user stores and bulk store
    let { visible_areas_need_save } = this;
    this.visible_areas_need_save = {};
    let dirty_players:Partial<Record<string, true>> = {};
    let by_vaid: Partial<Record<VAID, Entity[]>> = {};
    let { entities } = this;
    for (let ent_id_string in entities) {
      let ent = entities[ent_id_string]!;
      if (ent.isPlayer()) {
        if (ent.need_save) {
          dirty_players[ent.player_uid] = true;
          ++left;
          ent.savePlayerEntity(done);
          ent.need_save = false;
        }
      } else {
        let vaid = ent.visibleAreaGet();
        if (visible_areas_need_save[vaid]) {
          let bv = by_vaid[vaid];
          if (!bv) {
            bv = by_vaid[vaid] = [];
          }
          bv.push(ent);
        }
      }
    }

    for (let vaid in visible_areas_need_save) {
      let ents: Entity[] = by_vaid[vaid] || [];
      ++left;
      let ent_data = ents.map(toSerializedStorage);
      this.worker.debug(`Saving ${ent_data.length} ent(s) for VA ${vaid}`);
      this.worker.setBulkChannelData(`ents.${vaid}`, ent_data, done);
    }

    done();
  }

  broadcast(ent: Entity, msg: string, data: unknown): void {
    let vaid = ent.visibleAreaGet();
    let list = this.visible_area_broadcasts[vaid];
    if (!list) {
      list = this.visible_area_broadcasts[vaid] = [];
    }
    list.push({
      from: ent.id,
      msg,
      data,
    });
  }

  private sendFullEnts(
    client: SEMClient,
    new_ents: Entity[],
    deletes: EntDelete[][] | null,
  ): void {
    let debug: string[] = [];
    let pak = this.worker.pak(`client.${client.client_id}`, 'ent_update', null, 1);
    pak.writeU8(EntityUpdateCmd.IsInitialList);
    if (!client.has_schema) {
      client.has_schema = true;
      pak.writeU8(EntityUpdateCmd.Schema);
      pak.writeJSON(this.schema);
    }
    for (let ii = 0; ii < new_ents.length; ++ii) {
      let ent = new_ents[ii];
      this.addFullEntToPacket(pak, debug, ent);
    }
    if (deletes) {
      for (let ii = 0; ii < deletes.length; ++ii) {
        let dels = deletes[ii];
        for (let jj = 0; jj < dels.length; ++jj) {
          let pair = dels[jj];
          let [ent_id, reason] = pair;
          debug.push(`${ent_id}:X(${reason})`);
          pak.writeU8(EntityUpdateCmd.Delete);
          pak.writeInt(ent_id);
          pak.writeAnsiString(reason);
        }
      }
    }
    pak.writeU8(EntityUpdateCmd.Terminate);
    // TODO: logging is probably too verbose
    this.worker.debug(`->${client.client_id}: ent_update(initial) ${debug.join(';')}`);
    pak.send();
  }

  private sendInitialEntsToClient(
    client: SEMClient,
    needs_deletes: boolean,
    cb?: NetErrorCallback<never>,
  ): void {
    let {
      known_entities,
      visible_area_sees: needed_areas,
    } = client;
    let left = 1;
    let any_err: string | null = null;
    function done(err?: string) {
      if (!any_err && err) {
        any_err = err;
      }
      if (!--left) {
        if (cb) {
          cb(any_err);
        }
      }
    }
    let sync_ents: Entity[] | null = [];
    needed_areas.forEach((vaid) => {
      ++left;
      visibleAreaInit(this, vaid, (err?: string | null) => {
        if (err) {
          return void done(err); // not expected
        }

        let new_ents: Entity[] = sync_ents || [];
        newEntsInVA(this, new_ents, vaid, known_entities);
        if (!sync_ents && new_ents.length) {
          // send immediately (was an async load)
          this.sendFullEnts(client, new_ents, null);
        }
        done();
      });
    });

    let all_dels: EntDelete[][] | null = null;
    if (needs_deletes) {
      let dels: EntDelete[] = [];
      for (let ent_id_str in known_entities) {
        let ent_id = Number(ent_id_str);
        let other_ent = this.entities[ent_id];
        if (!other_ent) {
          // Presumably there is a delete queued in the VA we just left.
          // Could look up why somewhere in ent_deletes, but presumably they're now
          //   out of view anyway, so just sending 'unknown'
          dels.push([ent_id, 'unknown']);
          delete known_entities[ent_id];
        } else {
          let vaid = other_ent.visibleAreaGet();
          if (!needed_areas.includes(vaid)) {
            dels.push([ent_id, 'oldva']);
            delete known_entities[ent_id];
          }
        }
      }
      if (dels.length) {
        if (!all_dels) {
          all_dels = [];
        }
        all_dels.push(dels);
      }
    }

    let ent = this.getEntityForClient(client);
    if (ent && !known_entities[ent.id]) {
      // Always send own entity if it is currently unknown
      known_entities[ent.id] = true;
      sync_ents.push(ent);
    }

    if (sync_ents.length || all_dels) {
      this.sendFullEnts(client, sync_ents, all_dels);
    }

    sync_ents = null;
    done();
  }

  private addFullEntToPacket(pak: Packet, debug_out: string[], ent: Entity): void {
    let { field_defs, all_client_fields } = this;
    pak.writeU8(EntityUpdateCmd.Full);
    pak.writeInt(ent.id);

    let data: DataObject = ent.data;
    let debug = [];

    for (let field in all_client_fields) {
      let field_def = field_defs[field];
      assert(field_def);
      let { field_id, sub, encoder, default_value } = field_def;
      assert(typeof field_id === 'number');
      let value = data[field];
      if (value === default_value) {
        continue;
      }
      if (sub) {
        debug.push(field);
        pak.writeInt(field_id);
        if (sub === EntityFieldSub.Array) {
          assert(Array.isArray(value));
          for (let index = 0; index < value.length; ++index) {
            pak.writeInt(index + 1);
            let sub_value = value[index];
            encoder(ent, pak, sub_value);
          }
          pak.writeInt(0);
        } else { // EntityFieldSub.Record
          assert(value && typeof value === 'object' && !Array.isArray(value));
          let keys = Object.keys(value);
          for (let ii = 0; ii < keys.length; ++ii) {
            let key = keys[ii];
            let sub_value = (value as DataObject)[key];
            pak.writeAnsiString(key);
            encoder(ent, pak, sub_value);
          }
          pak.writeAnsiString('');
        }
      } else {
        debug.push(field);
        pak.writeInt(field_id);
        encoder(ent, pak, value);
      }
    }
    debug_out.push(`${ent.id}:${debug.join()}`);
    pak.writeInt(EntityFieldSpecial.Terminate);
  }

  private addDiffToPacket(pak: Packet, debug_out: string[], ent: Entity): boolean {
    let { field_defs } = this;
    let data: DataObject = ent.data;
    let wrote_header = false;
    let debug = [];
    let { dirty_fields, dirty_sub_fields } = ent;

    // Clear these *before* iterating, in case of crash, don't crash repeatedly!
    ent.dirty_fields = {};
    ent.dirty_sub_fields = {};

    for (let field in dirty_fields) {
      let field_def = field_defs[field];
      assert(field_def);
      let { server_only, field_id, sub, encoder, default_value } = field_def;
      if (server_only) {
        continue;
      }
      assert(typeof field_id === 'number');
      if (!wrote_header) {
        pak.writeU8(EntityUpdateCmd.Diff);
        pak.writeInt(ent.id);
        wrote_header = true;
      }
      debug.push(field);
      let value = data[field];
      if (sub) {
        pak.writeInt(field_id);
        let dirty_sub = dirty_sub_fields[field];
        assert(dirty_sub);
        if (sub === EntityFieldSub.Array) {
          assert(Array.isArray(value));
          for (let index_string in dirty_sub) {
            if (index_string === 'length') {
              pak.writeInt(-1);
              pak.writeInt(value.length);
            } else {
              let index = Number(index_string);
              assert(isFinite(index));
              pak.writeInt(index + 1);
              let sub_value = value[index];
              encoder(ent, pak, sub_value);
            }
          }
          pak.writeInt(0);
        } else { // EntityFieldSub.Record
          assert(value && typeof value === 'object' && !Array.isArray(value));
          for (let key in dirty_sub) {
            let sub_value = (value as DataObject)[key];
            pak.writeAnsiString(key);
            encoder(ent, pak, sub_value);
          }
          pak.writeAnsiString('');
        }
      } else {
        if (value === default_value) {
          pak.writeInt(EntityFieldSpecial.Default);
          pak.writeInt(field_id);
        } else {
          pak.writeInt(field_id);
          encoder(ent, pak, value);
        }
      }
    }
    if (wrote_header) {
      debug_out.push(`${ent.id}:${debug.join()}`);
      pak.writeInt(EntityFieldSpecial.Terminate);
    }
    return wrote_header;
  }

  update_per_va!: Partial<Record<VAID, PerVAUpdate>>;

  private prepareUpdate(ent: Entity) {
    let vaid = ent.current_vaid;
    assert.equal(vaid, ent.visibleAreaGet()); // Should have been updated upon call to .dirty()

    let { update_per_va } = this;

    let per_va = update_per_va[vaid];
    if (!per_va) {
      // TODO: only allocate this if actually needed in addDiffToPacket/etc
      per_va = update_per_va[vaid] = {
        ent_ids: [],
        pak: packetCreate(),
        debug: [],
      };
    }
    let had_diff = this.addDiffToPacket(per_va.pak, per_va.debug, ent);

    let vaid_changed = vaid !== ent.last_vaid;
    if (vaid_changed) {
      // If they existed elsewhere, add a transit delete
      if (ent.last_vaid !== undefined) {
        let dels = this.ent_deletes[ent.last_vaid];
        if (!dels) {
          dels = this.ent_deletes[ent.last_vaid] = [];
        }
        dels.push([ent.id, ent.last_delete_reason || 'newva']);
      }
      ent.last_vaid = vaid;
    }

    if (had_diff || vaid_changed) {
      // Even if no diff, if the VAID changed (or was undefined), we may need to send full updates to some clients
      per_va.ent_ids.push(ent.id);
    }

    // Clean up per-tick state
    ent.in_dirty_list = false;
    ent.last_delete_reason = undefined;
  }

  private prepareNonEntUpdates() {
    let { update_per_va } = this;
    let any = false;
    for (let vaid in this.visible_area_broadcasts) {
      let broadcasts = this.visible_area_broadcasts[vaid]!;
      let per_va = update_per_va[vaid];
      if (!per_va) {
        per_va = update_per_va[vaid] = {
          ent_ids: [],
          pak: packetCreate(),
          debug: [],
        };
      }
      let pak = per_va.pak;
      for (let ii = 0; ii < broadcasts.length; ++ii) {
        let event = broadcasts[ii];
        pak.writeU8(EntityUpdateCmd.Event);
        pak.writeJSON(event);
      }
      any = true;
    }
    if (any) {
      this.visible_area_broadcasts = {};
    }
  }

  private gatherUpdates(client: SEMClient) {
    let { update_per_va } = this;
    let { visible_area_sees: needed_areas, known_entities } = client;
    let va_updates: PerVAUpdate[] | undefined;
    let va_deletes: EntDelete[][] | undefined;
    for (let ii = 0; ii < needed_areas.length; ++ii) {
      let vaid = needed_areas[ii];
      let per_va = update_per_va[vaid];
      if (per_va) {
        va_updates = va_updates || [];
        va_updates.push(per_va);
      }
      let dels = this.ent_deletes[vaid];
      if (dels) {
        va_deletes = va_deletes || [];
        va_deletes.push(dels);
      }
    }

    if (va_updates || va_deletes) {
      let pak = this.worker.pak(`client.${client.client_id}`, 'ent_update', null, 1);
      if (!client.has_schema) {
        client.has_schema = true;
        pak.writeU8(EntityUpdateCmd.Schema);
        pak.writeJSON(this.schema);
      }
      let new_ents: EntityID[] | undefined;
      let debug: string[] = [];
      if (va_updates) {
        for (let ii = 0; ii < va_updates.length; ++ii) {
          let per_va = va_updates[ii];
          pak.append(per_va.pak);
          debug = debug.concat(per_va.debug);
          for (let jj = 0; jj < per_va.ent_ids.length; ++jj) {
            let ent_id = per_va.ent_ids[jj];
            if (!known_entities[ent_id]) {
              known_entities[ent_id] = true;
              if (!new_ents) {
                new_ents = [];
              }
              new_ents.push(ent_id);
            }
          }
        }
      }
      if (va_deletes) {
        for (let ii = 0; ii < va_deletes.length; ++ii) {
          let dels = va_deletes[ii];
          for (let jj = 0; jj < dels.length; ++jj) {
            let pair = dels[jj];
            let [ent_id, reason] = pair;
            if (known_entities[ent_id]) {
              let current_ent = this.entities[ent_id];
              if (
                // It's a transit delete, and to a VA we are not watching
                current_ent && !needed_areas.includes(current_ent.current_vaid) ||
                // Or, it's a full delete
                !current_ent
              ) {
                debug.push(`${ent_id}:X(${reason})`);
                pak.writeU8(EntityUpdateCmd.Delete);
                pak.writeInt(ent_id);
                pak.writeAnsiString(reason);
                delete known_entities[ent_id];
              }
            }
          }
        }
      }
      if (new_ents) {
        for (let ii = 0; ii < new_ents.length; ++ii) {
          let ent_id = new_ents[ii];
          let ent = this.entities[ent_id];
          assert(ent);
          this.addFullEntToPacket(pak, debug, ent);
        }
      }
      pak.writeU8(EntityUpdateCmd.Terminate);
      // TODO: logging is probably too verbose, combine to summary for all updates sent?
      this.worker.debug(`->${client.client_id}: ent_update(tick) ${debug.join(';')}`);
      pak.send();
    }
  }

  tick(dt: number, server_time: number): void {
    this.update_per_va = {};
    let { clients, dirty_list, max_ents_per_tick, update_per_va } = this;

    let ent_count = min(max_ents_per_tick, dirty_list.length);
    // Clearing dirty list _before_ iterating, in case of crash (leave some possibly
    //   out of sync entities instead of repeatedly crashing on them every tick).
    if (ent_count === dirty_list.length) {
      this.dirty_list = [];
    } else {
      this.dirty_list = dirty_list.slice(ent_count);
    }
    for (let dirty_idx = 0; dirty_idx < ent_count; ++dirty_idx) {
      let ent = dirty_list[dirty_idx];
      this.prepareUpdate(ent);
    }

    this.prepareNonEntUpdates();

    for (let client_id in clients) {
      this.gatherUpdates(clients[client_id]!);
    }

    // Reset / clear state
    for (let vaid in update_per_va) {
      let per_va = update_per_va[vaid]!;
      per_va.pak.pool();
    }
    for (let vaid in this.ent_deletes) {
      delete this.ent_deletes[vaid];
    }

    this.flushChangesToDataStores();
    this.update_per_va = null!; // only valid/used inside `tick()`, release references so they can be GC'd
  }

  entitiesFind(
    predicate: (ent: Entity) => boolean,
    skip_fading_out?: boolean
  ) {
    let { entities } = this;
    let ret = [];
    for (let ent_id_string in entities) {
      let ent = entities[ent_id_string]!;
      if (!predicate(ent)) {
        continue;
      }
      ret.push(ent);
    }
    return ret;
  }
}

export function createServerEntityManager<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
>(
  // TODO: figure out why callers error if this is `Worker` instead of `any`, any clean way around this?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: ServerEntityManagerOpts<Entity, any>
): ServerEntityManager<Entity, Worker> {
  return new ServerEntityManagerImpl<Entity, Worker>(options);
}


// TODO: should get this from ChannelWorker automatically after channel_worker.js is converted to TypeScript
type TickableWorker = {
  tick?(dt: number, server_time: number): void;
};

export function entityManagerWorkerInit<
  Entity extends EntityBaseServer,
  Worker extends EntityManagerReadyWorker<Entity, Worker>,
>(ctor: typeof ChannelWorker): void {
  if (!(ctor.prototype as TickableWorker).tick) {
    // Add a default tick function if the worker does not have one
    (ctor.prototype as TickableWorker).tick = function tick(
      this: EntityManagerReadyWorker<Entity, Worker>,
      dt: number,
      server_time: number
    ): void {
      this.entity_manager.tick(dt, server_time);
    };
  }
  ctor.registerClientHandler('ent_action_list', function (
    this: EntityManagerReadyWorker<Entity, Worker>,
    src: ClientHandlerSource,
    pak: Packet,
    resp_func: NetResponseCallback<ActionListResponse>
  ): void {
    this.entity_manager.handleActionList(src, pak, resp_func);
  });
}
