import { TraitFactory } from 'glov/common/trait_factory';
import { DataObject } from 'glov/common/types';
import { clone } from 'glov/common/util';

import type { HunterOpts, HunterState } from '../client/ai';
import type { DrawableOpts, DrawableSpriteOpts, DrawableSpriteState } from '../client/crawler_render_entities';
import type { EntityClient, StatsData } from '../client/entity_game_client';
// import type { EntityServer } from '../server/entity_game_server';


type Entity = EntityClient; // | EntityServer;

export function gameEntityTraitsCommonStartup(
  ent_factory: TraitFactory<EntityClient, DataObject> // | TraitFactory<EntityServer, DataObject>
): void {
  ent_factory.registerTrait<StatsData, undefined>('stats_default', {
    default_opts: {} as StatsData, // moraff hack
    alloc_state: function (opts: StatsData, ent: Entity) {
      // TODO: use a callback that doesn't actually need to allocate any state on the entity?
      if (!ent.data.stats) {
        const stats = ent.data.stats = clone(opts);
        stats.hp_max = stats.hp;
      }
      // fillInEnemyStats(ent);
      return undefined;
    }
  });
  ent_factory.extendTrait('enemy', {
    properties: {
      blocks_player: true,
    },
    alloc_state: function (opts: unknown, ent: Entity) {
      // fillInEnemyStats(ent);
    },
  });
  ent_factory.extendTrait<HunterOpts, HunterState>('hunter', {
    default_opts: {
      radius: 5,
      see_through_walls: true,
      player_blocks: true,
    },
  });
  ent_factory.extendTrait<DrawableOpts>('drawable', {
    default_opts: {
      // lod_bias: [0,0],
      // biasL: [-0.2,0.45],
      // biasF: [-0.25,0],
      // biasR: [-0.2,0.45],
      // biasIn: [0, 0, 0],
    },
  });

  ent_factory.extendTrait<DrawableSpriteOpts, DrawableSpriteState>('drawable_sprite', {
    default_opts: {
      hflip_random: true,
    },
  });
}
