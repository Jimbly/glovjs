import assert from 'assert';
import { EntityFieldEncoding, EntityFieldSub } from 'glov/common/entity_base_common';
import { TraitFactory, traitFactoryCreate } from 'glov/common/trait_factory';
import { DataObject } from 'glov/common/types';
import { isInteger, plural } from 'glov/common/util';
import { v3copy } from 'glov/common/vmath';
import {
  EntityBaseServer,
  VAID,
  entityServerRegisterActions,
  entityServerRegisterFieldDefs,
} from 'glov/server/entity_base_server';
import * as glov_server from 'glov/server/server';
import { serverFSAPI } from 'glov/server/serverfs';
import { crawlerEntityTraitsCommonStartup } from '../common/crawler_entity_traits_common';
import { JSVec3 } from '../common/crawler_state';
import type { EntityCrawlerDataCommon } from '../common/crawler_entity_common';

type VisData = Partial<Record<number, string>>;
type EntityCrawlerDataServer = EntityCrawlerDataCommon & {
  seq_player_move: string;
  vis_data?: VisData;
};

export interface EntityCrawlerServer extends EntityBaseServer {
  data: EntityCrawlerDataServer;
  type_id: string; // will be constant on the prototype

  // On prototype properties:
  is_player: boolean;
  is_enemy: boolean;
}
class EntityCrawlerServerImpl extends EntityBaseServer implements EntityCrawlerServer {
  declare data: EntityCrawlerDataServer;
  declare type_id: string; // will be constant on the prototype

  // On prototype properties:
  declare is_player: boolean;
  declare is_enemy: boolean;

  visibleAreaGet(): VAID {
    return this.data.floor as number || 0;
  }
}


type Entity = EntityCrawlerServer;

function crawlerTraitsInit(ent_factory: TraitFactory<Entity, DataObject>): void {
  crawlerEntityTraitsCommonStartup(ent_factory as TraitFactory<EntityCrawlerServer, DataObject>);
  // TODO  ent_factory.extendTrait<DrawableOpts>('drawable',
}

let ent_factory: TraitFactory<Entity, DataObject>;

export function crawlerEntFactory<T extends Entity=Entity>(): TraitFactory<T, DataObject> {
  return ent_factory as TraitFactory<T, DataObject>;
}

export function crawlerEntityAlloc(data: DataObject): Entity {
  let type_id = data.type;
  assert(typeof type_id === 'string');
  return ent_factory.allocate(type_id, data);
}

function onEntDefReload(type_id: string): void {
  let channels = glov_server.channel_server.getLocalChannelsByType('spire');
  for (let ii = 0; ii < channels.length; ++ii) {
    let channel = channels[ii];
    if (channel.entity_manager) {
      let reloaded = channel.entity_manager.entitiesReload((ent: Entity) => ent.type_id === type_id);
      if (reloaded.length) {
        channel.debug(`Reloaded ${reloaded.length} "${type_id}" ${plural(reloaded.length, 'ent')}`);
      }
    }
  }
}

export function crawlerEntityServerStarupEarly(): void {
  ent_factory = traitFactoryCreate<Entity, DataObject>();
  crawlerTraitsInit(ent_factory);
}

export function crawlerEntityTraitsServerStartup<TBaseClass extends EntityCrawlerServer>(param: {
  name?: string;
  Ctor?: Constructor<TBaseClass>;
  doing_own_net?: boolean;
}): void {
  if (!ent_factory) {
    crawlerEntityServerStarupEarly();
  }
  if (!param.doing_own_net) {
    entityServerRegisterFieldDefs<EntityCrawlerDataServer>({
      type: { encoding: EntityFieldEncoding.AnsiString },
      pos: { encoding: EntityFieldEncoding.IVec3 },
      state: { ephemeral: true, encoding: EntityFieldEncoding.AnsiString },
      floor: { encoding: EntityFieldEncoding.Int },
      costume: { encoding: EntityFieldEncoding.Int },
      stats: { sub: EntityFieldSub.Record, encoding: EntityFieldEncoding.Int },
      seq_player_move: { encoding: EntityFieldEncoding.AnsiString },
      vis_data: { server_only: true },
    });

    type ActionFloorChangePayload = {
      reason?: string;
      floor: number;
    };
    entityServerRegisterActions<EntityCrawlerServer>([{
      action_id: 'move_debug',
      allowed_data_assignments: {
        pos: 'array', // actually number[3]
        seq_player_move: 'string',
      },
    }, {
      action_id: 'move',
      allowed_data_assignments: {
        pos: 'array', // actually number[3]
        seq_player_move: 'string',
      },
    }, {
      action_id: 'ai_move',
      self_only: false,
      allowed_data_assignments: {
        seq_ai_update: 'string',
        pos: 'array',
      },
    }, {
      action_id: 'set_debug',
      self_only: false,
      allow_any_assignment: true,
    }, {
      action_id: 'set_vis_data',
      handler: function (this: EntityCrawlerServer, { payload }, resp_func) {
        let { data, floor: floor_id } = (payload as { data: string; floor: number });
        let vis_data = this.data.vis_data;
        if (!vis_data) {
          vis_data = this.data.vis_data = {};
        }
        vis_data[floor_id] = data;
        this.dirty('vis_data'); // TODO: Dirty for saving, but not for broadcasting to others
        resp_func();
      }
    }, {
      action_id: 'get_vis_data',
      handler: function (this: EntityCrawlerServer, { payload }, resp_func) {
        let vis_data = this.data.vis_data;
        let { floor: floor_id } = (payload as { floor: number });
        resp_func(null, vis_data?.[floor_id] || '');
      }
    }, {
      action_id: 'floorchange',
      self_only: true,
      allowed_data_assignments: {
        seq_player_move: 'string', // maybe add a special `predicate` field instead?
        pos: 'array',
        floor: 'number',
      },
      handler: function (this: EntityCrawlerServer, { src, payload, data_assignments }, resp_func) {
        let new_pos = data_assignments.pos as JSVec3;
        assert(Array.isArray(new_pos));
        if (!new_pos || new_pos.length !== 3 ||
          !isInteger(data_assignments.floor) ||
          !payload
        ) {
          return void resp_func('ERR_INVALID_DATA');
        }
        let payload2 = payload as ActionFloorChangePayload;
        // if (payload2.reason === 'respawn') {
        //   this.data.stats.hp = this.data.stats.hp_max;
        //   this.dirtySub('stats', 'hp');
        // }

        // TODO: this is using data_assignments (set after this function finishes),
        //   except, we need the new data.floor set within here for dirtyVA(),
        //   should that be more automatic somehow?
        v3copy(this.data.pos, new_pos);
        this.dirty('pos');
        let floor_id = data_assignments.floor;
        this.data.floor = floor_id;
        // Dirty the ent, apply their change to their vaid
        this.dirtyVA('floor', payload2.reason || null);

        let client = this.entity_manager.getClient(src.id);
        this.entity_manager.clientSetVisibleAreaSees(client, [floor_id], () => {
          // By now, client has already received the initial update for all relevant
          //   entities (own entity may still be dirty and unsent, though)
          this.entity_manager.worker.sendChannelMessage(src.channel_id, 'floorchange_ack');
        });
        resp_func(); // Action must always be synchronous, has a predicate
      }
    }]);
  }

  ent_factory.initialize({
    name: param.name || 'EntityCrawlerServer',
    fs: serverFSAPI(),
    directory: 'entities',
    ext: '.entdef',
    Ctor: param.Ctor || EntityCrawlerServerImpl as Constructor<TBaseClass>,
    reload_cb: onEntDefReload,
    ignore_unknown_traits: true,
  });
}
