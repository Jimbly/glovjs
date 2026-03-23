export type GenParamsBase = {
  type: string;
};

export type GenParamsAny = GenParamsBase;

export const default_gen_params: GenParamsBase = {
  type: 'brogue',
};

import assert from 'assert';
import { TSMap } from 'glov/common/types';
import {
  CrawlerLevel,
  CrawlerLevelSerialized,
} from './crawler_state';

type LevelGeneratorDef<T> = {
  type: string;
  generate: (floor_id: number, seed: string, params: T) => CrawlerLevel;
  connect: (generator: LevelGenerator, floor_id: number, seed: string, params: T) => void;
};
let level_generators: TSMap<LevelGeneratorDef<unknown>> = {};
export function levelGenRegister<T>(def: LevelGeneratorDef<T>): void {
  level_generators[def.type] = def as LevelGeneratorDef<unknown>;
}

function generateLevel(
  floor_id: number,
  seed: string,
  params: GenParamsAny | null
): CrawlerLevel {
  params = params || default_gen_params;
  let def = level_generators[params.type];
  assert(def);
  return def.generate(floor_id, seed, params);
}

function connectLevel(
  generator: LevelGenerator,
  floor_id: number,
  seed: string,
  params: GenParamsAny | null
): void {
  params = params || default_gen_params;
  let def = level_generators[params.type];
  assert(def);
  def.connect(generator, floor_id, seed, params);
}

export type LevelGeneratorParam = { seed: string; default_vstyle: string };
class LevelGenerator {
  spire_seed: string;
  seed_override: string | null = null;
  private level_gen_params: GenParamsBase | null = null; // use defaults
  levels: CrawlerLevel[];
  default_vstyle: string;

  provider: (floor_id: number, cb: (level_data: CrawlerLevelSerialized)=> void) => void;
  constructor(param: LevelGeneratorParam) {
    this.spire_seed = param.seed;
    this.default_vstyle = param.default_vstyle;
    this.provider = this.provideLevel.bind(this);
    this.levels = [];
  }

  setParams<T extends GenParamsBase>(p: T): void {
    this.level_gen_params = p;
  }

  setSeed(seed: string): void {
    this.spire_seed = seed;
  }

  getLevelGenerated(floor_id: number): CrawlerLevel {
    assert(isFinite(floor_id));
    if (!this.levels[floor_id]) {
      let level = this.levels[floor_id] = generateLevel(floor_id,
        `${this.seed_override || this.spire_seed}_f${floor_id}`,
        this.level_gen_params);
      if (!level.vstyle) {
        level.setVstyle(this.default_vstyle);
      }
    }
    return this.levels[floor_id];
  }

  provideLevel(floor_id: number, cb: (level_data: CrawlerLevelSerialized)=> void): void {
    this.getLevelGenerated(floor_id);
    if (!this.levels[floor_id].connected) {
      connectLevel(this, floor_id,
        `${this.seed_override || this.spire_seed}_fc${floor_id}`,
        this.level_gen_params);
      this.levels[floor_id].finalize();
      this.levels[floor_id].connected = true;
    }
    cb(this.levels[floor_id].serialize());
  }

  resetAllLevels(): void {
    this.levels = [];
  }
}
export type { LevelGenerator };

export function levelGeneratorCreate(param: LevelGeneratorParam): LevelGenerator {
  return new LevelGenerator(param);
}
