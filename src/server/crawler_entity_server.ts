import assert from 'assert';
import { EntityFieldEncoding, EntityFieldSub } from 'glov/common/entity_base_common';
import { TraitFactory, traitFactoryCreate } from 'glov/common/trait_factory';
import { DataObject } from 'glov/common/types';
import { plural } from 'glov/common/util';
import {
  EntityBaseServer,
  entityServerRegisterActions,
  entityServerRegisterFieldDefs,
} from 'glov/server/entity_base_server';
import * as glov_server from 'glov/server/server';
import { serverFSAPI } from 'glov/server/serverfs';
import { crawlerEntityTraitsCommonStartup } from '../common/crawler_entity_traits_common';
import type { EntityCrawlerDataCommon } from '../common/crawler_entity_common';

type EntityCrawlerDataServer = EntityCrawlerDataCommon & {
  seq_player_move: string;
};

export interface EntityCrawlerServer extends EntityBaseServer {
  data: EntityCrawlerDataServer;
  type_id: string; // will be constant on the prototype

  // On prototype properties:
  is_player: boolean;
  is_enemy: boolean;
}

type Entity = EntityCrawlerServer;

function crawlerTraitsInit(ent_factory: TraitFactory<Entity, DataObject>): void {
  crawlerEntityTraitsCommonStartup(ent_factory as TraitFactory<EntityCrawlerServer, DataObject>);
  // TODO  ent_factory.extendTrait<DrawableOpts>('drawable',
}

let ent_factory: TraitFactory<Entity, DataObject>;

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

export function crawlerEntityTraitsServerStartup<TBaseClass extends EntityCrawlerServer>(param: {
  ent_factory?: TraitFactory<Entity, DataObject>;
  name?: string;
  Ctor?: Constructor<TBaseClass>;
  doing_own_net?: boolean;
}): void {
  if (!param.doing_own_net) {
    entityServerRegisterFieldDefs<EntityCrawlerDataServer>({
      type: { encoding: EntityFieldEncoding.AnsiString },
      pos: { encoding: EntityFieldEncoding.IVec3 },
      state: { ephemeral: true, encoding: EntityFieldEncoding.AnsiString },
      floor: { encoding: EntityFieldEncoding.Int },
      costume: { encoding: EntityFieldEncoding.Int },
      stats: { sub: EntityFieldSub.Record, encoding: EntityFieldEncoding.Int },
      seq_player_move: { encoding: EntityFieldEncoding.AnsiString },
    });

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
    }]);
  }

  if (param.ent_factory) {
    ent_factory = param.ent_factory;
  } else {
    ent_factory = traitFactoryCreate<Entity, DataObject>();
  }
  crawlerTraitsInit(ent_factory);

  ent_factory.initialize({
    name: param.name || 'EntityCrawlerServer',
    fs: serverFSAPI(),
    directory: 'entities',
    ext: '.entdef',
    Ctor: param.Ctor || EntityBaseServer as Constructor<TBaseClass>,
    reload_cb: onEntDefReload,
    ignore_unknown_traits: true,
  });
}
