import assert from 'assert';
// import { Packet } from 'glov/common/packet';
// import { HandlerSource, NetResponseCallback } from 'glov/common/types';
import {
  EntityFieldEncoding,
} from 'glov/common/entity_base_common';
import {
  DataObject,
  ErrorCallback,
  HandlerSource,
  NetErrorCallback,
  isClientHandlerSource,
} from 'glov/common/types';
import { v3copy } from 'glov/common/vmath';
import { ChannelServer } from 'glov/server/channel_server';
import { ChannelWorker } from 'glov/server/channel_worker';
import { chattableWorkerInit } from 'glov/server/chattable_worker';
import {
  ActionHandlerParam,
  EntityBaseServer,
  VAID,
} from 'glov/server/entity_base_server';
import {
  SEMClient,
  ServerEntityManager,
  createServerEntityManager,
  entityManagerWorkerInit,
} from 'glov/server/entity_manager_server';
import {
  EntityTestDataCommon,
  VA_SIZE,
  VIEW_DIST,
  entityTestCommonClass,
} from '../common/entity_test_common';
const { floor, random } = Math;

type Entity = EntityTestServer;

type EntityTestDataServer = {
} & EntityTestDataCommon;

EntityBaseServer.registerFieldDefs<EntityTestDataServer>({
  pos: { encoding: EntityFieldEncoding.Vec3 },
  speed: { encoding: EntityFieldEncoding.Float },
  state: { encoding: EntityFieldEncoding.AnsiString, ephemeral: true },
  display_name: { encoding: EntityFieldEncoding.String, ephemeral: true },
});

class EntityTestServer extends entityTestCommonClass(EntityBaseServer) {
  entity_manager!: ServerEntityManager<EntityTestServer, EntTestWorker>;

  data!: EntityTestDataServer;

  // cb(err, constructed entity)
  static loadPlayerEntityImpl = ((
    sem: ServerEntityManager<Entity, EntTestWorker>,
    player_uid: string,
    cb: NetErrorCallback<Entity>
  ): void => {
    // Not loading anything
    let ent = new this(-1, sem);
    ent.fromSerialized({
      pos: [random() * 1200 + 40, random() * 880 + 40, 0],
      display_name: sem.worker.getChannelData(`public.clients.${player_uid}.ids.display_name`),
    });
    cb(null, ent);
  }) as typeof EntityBaseServer.loadPlayerEntityImpl;

  savePlayerEntity(cb: () => void): void {
    // Not saving anything
    cb();
  }

  visibleAreaGet(): VAID {
    return floor(this.data.pos[0] / VA_SIZE) + floor(this.data.pos[1] / VA_SIZE) * 100;
  }

  visibleAreaSees(): VAID[] {
    let vax0 = floor((this.data.pos[0] - VIEW_DIST) / VA_SIZE);
    let vax1 = floor((this.data.pos[0] + VIEW_DIST) / VA_SIZE);
    let vay0 = floor((this.data.pos[1] - VIEW_DIST) / VA_SIZE);
    let vay1 = floor((this.data.pos[1] + VIEW_DIST) / VA_SIZE);
    let vaids: VAID[] = [];
    for (let xx = vax0; xx <= vax1; ++xx) {
      for (let yy = vay0; yy <= vay1; ++yy) {
        vaids.push(xx + yy * 100);
      }
    }
    return vaids;
  }
}

EntityTestServer.registerActions<EntityTestServer>([{
  action_id: 'move',
  allowed_data_assignments: {
    pos: 'array', // actually number[3]
    speed: 'number',
    state: 'string',
  },
  self_only: true,
  handler: function (
    this: EntityTestServer,
    { src, payload, data_assignments }: ActionHandlerParam,
    resp_func: ErrorCallback<never, string>
  ) {
    // Dirty the ent, apply their change to their VAID and VAIDs they see
    v3copy(this.data.pos, data_assignments.pos as [number, number, number]);
    this.dirtyVA('pos', 'move');

    let client = this.entity_manager.getClient(src.id);
    this.entity_manager.clientSetVisibleAreaSees(client, this.visibleAreaSees());
    resp_func();
  },

}]);

class EntTestWorker extends ChannelWorker {
  entity_manager: ServerEntityManager<Entity, EntTestWorker>;

  constructor(channel_server: ChannelServer, channel_id: string, channel_data: DataObject) {
    super(channel_server, channel_id, channel_data);

    this.entity_manager = createServerEntityManager({
      worker: this,
      EntityCtor: EntityTestServer,
    });
  }

  postNewClient(src: HandlerSource): void {
    if (isClientHandlerSource(src)) {
      this.entity_manager.clientJoin(src, src.id);
    }
  }

  handleClientDisconnect(src: HandlerSource, opts: unknown): void {
    if (isClientHandlerSource(src)) {
      this.entity_manager.clientLeave(src.id);
    }
  }

  semClientInitialVisibleAreaSees(sem_client: SEMClient): VAID[] {
    let ent = this.entity_manager.getEntityForClient(sem_client);
    assert(ent);
    return ent.visibleAreaSees();
  }
}
EntTestWorker.prototype.maintain_client_list = true;
EntTestWorker.prototype.maintain_subscription_ids = true;
EntTestWorker.prototype.emit_join_leave_events = true;
EntTestWorker.prototype.require_login = false;
EntTestWorker.prototype.auto_destroy = true;

entityManagerWorkerInit(EntTestWorker);

chattableWorkerInit(EntTestWorker);

export function entTestWorkerInit(channel_server: ChannelServer): void {
  channel_server.registerChannelWorker('enttest', EntTestWorker, {
    autocreate: true,
    subid_regex: /^.+$/,
  });
}
