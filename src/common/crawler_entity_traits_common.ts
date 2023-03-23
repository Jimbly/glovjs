import { TraitFactory } from 'glov/common/trait_factory';
import { DataObject } from 'glov/common/types';

import type { EntityCrawlerClient } from '../client/crawler_entity_client';
import type { EntityCrawlerServer } from '../server/crawler_entity_server';


export function crawlerEntityTraitsCommonStartup(
  ent_factory: TraitFactory<EntityCrawlerClient, DataObject> | TraitFactory<EntityCrawlerServer, DataObject>
): void {
  // Basic behaviors
  ent_factory.registerTrait('player', {
    properties: {
      is_player: true,
    },
  });
  ent_factory.registerTrait('enemy', {
    properties: {
      is_enemy: true,
    },
  });
}
