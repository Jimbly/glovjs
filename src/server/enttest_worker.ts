import assert from 'assert';
// import { Packet } from 'glov/common/packet';
// import { HandlerSource, NetResponseCallback } from 'glov/common/types';
import {
  EntityFieldEncoding,
} from 'glov/common/entity_base_common';
import {
  ClientHandlerSource,
  DataObject,
  ErrorCallback,
  HandlerSource,
  NetErrorCallback,
  NetResponseCallback,
  isClientHandlerSource,
} from 'glov/common/types';
import {
  Vec2,
  Vec3,
  v2copy,
  v2dist,
  v3copy,
} from 'glov/common/vmath';
import { ChannelServer, quietMessagesSet } from 'glov/server/channel_server';
import { ChannelWorker } from 'glov/server/channel_worker';
import { chattableWorkerInit } from 'glov/server/chattable_worker';
import {
  ActionHandlerParam,
  EntityBaseServer,
  VAID,
  entityServerDefaultLoadPlayerEntity,
  entityServerRegisterActions,
  entityServerRegisterFieldDefs,
} from 'glov/server/entity_base_server';
import {
  JoinPayload,
  SEMClient,
  ServerEntityManager,
  createServerEntityManager,
  entityManagerWorkerInit,
} from 'glov/server/entity_manager_server';
import {
  EntityTestDataCommon,
  EntityType,
  VA_SIZE,
  VIEW_DIST,
  entityTestCommonClass,
} from '../common/entity_test_common';
const { floor, random } = Math;

type Entity = EntityTestServer;

type EntityTestDataServer = Record<string, never> & EntityTestDataCommon;

entityServerRegisterFieldDefs<EntityTestDataServer>({
  pos: { encoding: EntityFieldEncoding.Vec3 },
  type: { encoding: EntityFieldEncoding.Int },
  speed: { encoding: EntityFieldEncoding.Float, ephemeral: true },
  test_anim_state: { encoding: EntityFieldEncoding.AnsiString, ephemeral: true },
  display_name: { encoding: EntityFieldEncoding.String, ephemeral: true },
  seq_ai_move: { encoding: EntityFieldEncoding.AnsiString, ephemeral: true },
});

function initialPos(): [number, number, number] {
  return [random() * 1200 + 40, random() * 880 + 40, 0];
}

interface VAIDHolder {
  last_vaids?: VAID[];
  last_vaids_pos?: Vec2;
}

function visibleAreaSees(pos: Vec2, holder: VAIDHolder): VAID[] {
  if (!holder.last_vaids || v2dist(pos, holder.last_vaids_pos!) > VIEW_DIST/4) {
    let vax0 = floor((pos[0] - VIEW_DIST) / VA_SIZE);
    let vax1 = floor((pos[0] + VIEW_DIST) / VA_SIZE);
    let vay0 = floor((pos[1] - VIEW_DIST) / VA_SIZE);
    let vay1 = floor((pos[1] + VIEW_DIST) / VA_SIZE);
    let vaids: VAID[] = [];
    for (let xx = vax0; xx <= vax1; ++xx) {
      for (let yy = vay0; yy <= vay1; ++yy) {
        vaids.push(xx + yy * 100);
      }
    }
    holder.last_vaids = vaids;
    holder.last_vaids_pos = pos.slice(0) as Vec2;
  }
  return holder.last_vaids;
}

function visibleAreaGet(pos: Vec2): VAID {
  let vax = floor((pos[0]) / VA_SIZE);
  let vay = floor((pos[1]) / VA_SIZE);
  return vax + vay * 100;
}

class EntityTestServer extends entityTestCommonClass(EntityBaseServer) implements VAIDHolder {
  declare entity_manager: ServerEntityManager<EntityTestServer, EntTestWorker>;

  declare data: EntityTestDataServer;

  last_vaids?: VAID[];
  last_vaids_pos?: Vec2;

  constructor(
    data: DataObject,
  ) {
    super(data);
    assert(this.data.pos);
  }

  visibleAreaGet(): VAID {
    return floor(this.data.pos[0] / VA_SIZE) + floor(this.data.pos[1] / VA_SIZE) * 100;
  }

  visibleAreaSees(): VAID[] {
    return visibleAreaSees(this.data.pos, this);
  }
}

/// Example: no saved player data
// function entLoadPlayer(
//   sem: ServerEntityManager<Entity, EntTestWorker>,
//   src: ClientHandlerSource,
//   player_uid: string,
//   cb: NetErrorCallback<Entity>
// ): void {
//   // Not loading anything
//   let ent = new EntityTestServer(-1, {
//     pos: initialPos(),
//     type: EntityType.Player,
//     display_name: src.display_name,
//   }, sem);
//   ent.finishDeserialize();
//   cb(null, ent);
// }
// savePlayerEntity(cb: () => void): void {
//   // Not saving anything
//   cb();
// }

/// Example: default player data saving/loading, add current display name upon load
let default_player_data = {
  type: EntityType.Player,
  pos: [10,10,0],
};

function entLoadPlayer(
  sem: ServerEntityManager<Entity, EntTestWorker>,
  src: ClientHandlerSource,
  join_payload: JoinPayload,
  player_uid: string,
  cb: NetErrorCallback<Entity>
): void {
  default_player_data.pos = initialPos();
  entityServerDefaultLoadPlayerEntity(default_player_data, sem, src, join_payload, player_uid,
    (err: null | string, ent_in?: EntityBaseServer) => {
      if (err) {
        return void cb(err);
      }
      assert(ent_in);
      let ent = ent_in as Entity;
      ent.data.display_name = src.display_name;
      cb(null, ent);
    }
  );
}

entityServerRegisterActions<EntityTestServer>([{
  action_id: 'move',
  allowed_data_assignments: {
    pos: 'array', // actually number[3]
    speed: 'number',
    test_anim_state: 'string',
  },
  self_only: true,
  handler: function (
    this: EntityTestServer,
    { src, payload, data_assignments }: ActionHandlerParam,
    resp_func: ErrorCallback<never, string>
  ) {
    let pos = data_assignments.pos as [number, number, number] | undefined;
    // Dirty the ent, apply their change to their VAID and VAIDs they see
    if (pos) {
      v3copy(this.data.pos, pos);
      this.dirtyVA('pos', 'move');
    }

    let client = this.entity_manager.getClient(src.id);
    this.entity_manager.clientSetVisibleAreaSees(client, this.visibleAreaSees());
    resp_func();
  },
}, {
  action_id: 'ai_move',
  allowed_data_assignments: {
    pos: 'array', // actually number[3]
    seq_ai_move: 'string',
    // speed: 'number',
    // state: 'string',
  },
  self_only: false,
  handler: function (
    this: EntityTestServer,
    { src, payload, data_assignments }: ActionHandlerParam,
    resp_func: ErrorCallback<never, string>
  ) {
    // Dirty the ent, apply their change to their VAID
    v3copy(this.data.pos, data_assignments.pos as [number, number, number]);
    this.dirtyVA('pos', 'move');
    resp_func();
  },
}]);

interface NonEntClientData extends VAIDHolder {
  pos: Vec3;
}

function entCreate(
  data: DataObject,
): Entity {
  return new EntityTestServer(data);
}

class EntTestWorker extends ChannelWorker {
  entity_manager: ServerEntityManager<Entity, EntTestWorker>;

  constructor(channel_server: ChannelServer, channel_id: string, channel_data: DataObject) {
    super(channel_server, channel_id, channel_data);

    this.entity_manager = createServerEntityManager<Entity, EntTestWorker>({
      worker: this,
      create_func: entCreate,
      load_player_func: entLoadPlayer,
    });
  }

  postNewClient(src: HandlerSource): void {
    if (isClientHandlerSource(src)) {
      if (src.user_id) {
        // logged in, get an entity
        /// Example: no persisted player data
        // this.entity_manager.clientJoin(src, src.id, null);
        this.entity_manager.clientJoin(src, src.user_id, null);
      } else {
        // anonymous, no entity
        this.entity_manager.clientJoin(src, null, null);
      }
    }
  }

  handleClientChanged(src: ClientHandlerSource): void {
    let client = this.entity_manager.getClient(src.id);
    let ent = this.entity_manager.getEntityForClient(client);
    if (ent) {
      ent.setData('display_name', src.display_name);
    }
  }

  handleClientDisconnect(src: HandlerSource, opts: unknown): void {
    if (isClientHandlerSource(src)) {
      this.entity_manager.clientLeave(src.id);
    }
  }

  semClientInitialVisibleAreaSees(join_payload: JoinPayload, sem_client: SEMClient): VAID[] {
    let ent = this.entity_manager.getEntityForClient(sem_client);
    if (ent) {
      return ent.visibleAreaSees();
    } else {
      let necd: NonEntClientData = {
        pos: initialPos(),
      };
      this.sendChannelMessage(`client.${sem_client.client_id}`, 'initial_pos', necd.pos);
      sem_client.setUserData(necd);
      return visibleAreaSees(necd.pos, necd);
    }
  }
}
EntTestWorker.prototype.maintain_client_list = true;
EntTestWorker.prototype.maintain_subscription_ids = true;
EntTestWorker.prototype.emit_join_leave_events = true;
EntTestWorker.prototype.require_login = false;
EntTestWorker.prototype.auto_destroy = true;

EntTestWorker.registerClientHandler('spawn', function (
  this: EntTestWorker,
  src: HandlerSource,
  data: { pos: [number, number, number] },
  resp_func: NetResponseCallback
) {
  assert(data.pos);
  assert(data.pos.length === 3);
  this.entity_manager.addEntityFromSerialized({
    pos: data.pos,
    type: EntityType.Bot,
  });
  resp_func();
});

EntTestWorker.registerClientHandler('move', function (
  this: EntTestWorker,
  src: HandlerSource,
  data: { pos: [number, number] },
  resp_func: NetResponseCallback
) {
  assert(data.pos);
  assert.equal(data.pos.length, 2);

  let client = this.entity_manager.getClient(src.id);
  let necd = client.getUserData<NonEntClientData>();
  assert(necd.pos);
  assert.equal(necd.pos.length, 3);
  v2copy(necd.pos, data.pos);
  this.entity_manager.clientSetVisibleAreaSees(client, visibleAreaSees(necd.pos, necd));
  resp_func();
});
quietMessagesSet(['move', 'ent_action_list']);

EntTestWorker.registerClientHandler('resetva', function (
  this: EntTestWorker,
  src: HandlerSource,
  data: unknown,
  resp_func: NetResponseCallback<string>
) {
  let client = this.entity_manager.getClient(src.id);
  let ent = this.entity_manager.getEntityForClient(client);
  let pos: Vec2 | undefined = ent && ent.data.pos;
  if (!pos) {
    let necd = client.getUserData<NonEntClientData>();
    pos = necd.pos;
  }
  let vaid = visibleAreaGet(pos);
  this.infoSrc(src, `Resetting VAID ${vaid}`);
  this.entity_manager.visibleAreaReset(vaid, resp_func);
});

entityManagerWorkerInit(EntTestWorker);

chattableWorkerInit(EntTestWorker);

export function entTestWorkerInit(channel_server: ChannelServer): void {
  channel_server.registerChannelWorker('enttest', EntTestWorker, {
    autocreate: true,
    subid_regex: /^.+$/,
  });
}
