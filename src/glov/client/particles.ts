// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import assert from 'assert';
import {
  TSMap,
} from 'glov/common/types';
import {
  JSVec2,
  JSVec3,
  JSVec4,
  ROVec2,
  ROVec3,
  v2copy,
  v2lerp,
  v2mul,
  v3add,
  v4copy,
  v4lerp,
  v4mul,
  vec2,
  Vec3,
  vec3,
  vec4,
} from 'glov/common/vmath';
import { addAppPostTick } from './engine';
import {
  BLEND_ADDITIVE,
  BLEND_ALPHA,
  BLEND_MULTIPLY,
  BLEND_PREMULALPHA,
  BlendMode,
  spriteQueueRaw4Color,
  Texture,
} from './sprites';
import { textureLoad } from './textures';

//////////////////////////////////////////////////////////////////////////
// Particle System Spec

/*
// Definitions
// value = number or
// value = [base, add_max] -> generates a number in the range [base, base + add_max)
let def_fire = {
  particles: {
    fire: {
      blend: 'additive',
      texture: 'fire.png',
      color: [1,1,1,1], // multiplied by animation track, default 1,1,1,1, can be omitted
      color_track: [ // just values, NOT random range
        { t: 0.0, v: [1,0.4,0.4,1] },
        { t: 0.7, v: [1,0,0,1] },
        { t: 0.9, v: [0.2,0,0,1] },
        { t: 1.0, v: [0,0,0,1] },
      ],
      size: [[32,16], [32,16]], // multiplied by animation track
      size_track: [ // just values, NOT random range
        { t: 0.0, v: [1,1] },
        { t: 0.4, v: [0.5,0.5] },
        { t: 0.7, v: [1,1] },
        { t: 1.0, v: [1.5,1.5] },
      ],
      accel: [0,0],
      rot: [0,360], // degrees
      rot_vel: [10,2], // degrees per second
      lifespan: [450,0], // milliseconds
      kill_time_accel: 5,
    },
  },
  emitters: {
    fire: {
      particle: 'fire',
      // Random ranges affect each emitted particle:
      pos: [[0,28], [0,28]],
      vel: [0,0],
      emit_rate: [60,20], // emissions per second
      // Random ranges only calculated upon instantiation:
      emit_time: [0,Infinity],
      emit_initial: 10,
    },
  },
  system_lifespan: Infinity, // must be manually killed
};

// Usage
let system = particlesCreateSystem(def_fire, [50, 50, Z.PARTICLES]);
system.updatePos(75, 75);
system.killSoft(); // stops emitting and speeds up particles by kill_time_accel
system.killHard(); // immediately stops drawing

*/

export type ValueOrRange = number | [number, number];
export type Vec2ValueOrRange = [ValueOrRange, ValueOrRange];
export type Vec3ValueOrRange = [ValueOrRange, ValueOrRange, ValueOrRange];
export type Vec2or3ValueOrRange = Vec2ValueOrRange | Vec3ValueOrRange;

export type TrackEntry<T extends number[]> = {
  t: number;
  // just values, NOT random range
  v: T;
};

export type ParticleDef = {
  blend: 'additive' | 'alpha' | 'multiply' | 'premul';
  texture?: string; // default: soft circle
  // color multiplied by animation track, default [1,1,1,1]
  color?: [ValueOrRange, ValueOrRange, ValueOrRange, ValueOrRange];
  color_track?: TrackEntry<JSVec4>[];
  // size multiplied by animation track, default: [1,1]
  size?: [ValueOrRange, ValueOrRange];
  size_track?: TrackEntry<JSVec2>[];
  accel?: Vec2or3ValueOrRange;
  rot?: ValueOrRange; // degrees
  rot_vel?: ValueOrRange; // degrees per second
  lifespan?: ValueOrRange; // milliseconds
  kill_time_accel?: number; // rate acceleration default: 1
};
export type ParticleEmitterDef = {
  particle: string;
  // Random ranges affect each emitted particle:
  pos?: Vec2or3ValueOrRange;
  vel?: Vec2or3ValueOrRange;
  emit_rate?: ValueOrRange; // emissions per second, default: 10
  // Random ranges only calculated upon instantiation:
  emit_time?: [ValueOrRange, ValueOrRange]; // default: [0, Infinity]
  emit_initial?: ValueOrRange; // default: 1
};
export type ParticleSystemDef = {
  particles: TSMap<ParticleDef>;
  emitters: TSMap<ParticleEmitterDef>;
  system_lifespan?: ValueOrRange; // default: Infinity (must be manually killed)
  no_shift?: boolean;
};

type Range = ROVec2;
type Vec4Range = [Range, Range, Range, Range];
type Vec3Range = [Range, Range, Range];
type Vec2Range = [Range, Range];
type JSVec5 = [number, number, number, number, number];

type ParticleDefNormalized = {
  blend: BlendMode;
  texture: Texture;
  color: Vec4Range;
  color_track: null | (JSVec5[]); // note: actually fixed-length Float32Arrays
  size: Vec2Range;
  size_track: null | (JSVec3[]); // note: actually fixed-length Float32Arrays
  accel: Vec3Range;
  rot: Range;
  rot_vel: Range;
  lifespan: Range;
  kill_time_accel: Range;
};
type ParticleDefWithNormalization = ParticleDef & {
  normalized?: ParticleDefNormalized;
};

type ParticleEmitterDefNormalized = {
  part_idx: number;
  pos: Vec3Range;
  vel: Vec3Range;
  emit_rate: Range;
  // Random ranges only calculated upon instantiation:
  emit_time: Vec2Range;
  emit_initial: Range;
};
type ParticleEmitterDefWithNormalization = ParticleEmitterDef & {
  normalized?: ParticleEmitterDefNormalized;
};

type ParticleSystemDefNormalized = {
  particles: ParticleDefNormalized[];
  emitters: ParticleEmitterDefNormalized[];
  system_lifespan: Range;
  no_shift: boolean;
};
type ParticleSystemDefWithNormalization = ParticleSystemDef & {
  normalized?: ParticleSystemDefNormalized;
};


//////////////////////////////////////////////////////////////////////////
// Implementation

const { random } = Math;

const blend_map = {
  alpha: BLEND_ALPHA,
  additive: BLEND_ADDITIVE,
  premul: BLEND_PREMULALPHA,
  multiply: BLEND_MULTIPLY,
};

export function particlesPreloadData(particle_data: {
  defs: TSMap<ParticleSystemDef>;
}): void {
  // Preload all referenced particle textures
  for (let key in particle_data.defs) {
    let def = particle_data.defs[key]!;
    for (let part_name in def.particles) {
      let part_def = def.particles[part_name]!;
      if (part_def.texture) {
        textureLoad({ url: `img/${part_def.texture}.png` });
      }
    }
  }
}

// Expect all values to be a pair of [base, add_max]
function normalizeValue(v: ValueOrRange | Float32Array): Range {
  if (v instanceof Float32Array && v.length >= 2) {
    return v;
  } else if (typeof v === 'number') {
    return vec2(v, 0);
  } else if (Array.isArray(v) || v instanceof Float32Array) {
    // already an array, convert to Vec2
    return vec2(v[0] || 0, v[1] || 0);
  } else {
    return assert(false)!;
  }
}

function normalizeValueVec(vec: ValueOrRange[],length: 4): [Range, Range, Range, Range];
function normalizeValueVec(vec: ValueOrRange[], length: 3): [Range, Range, Range];
function normalizeValueVec(vec: ValueOrRange[], length: 2): [Range, Range];
function normalizeValueVec(vec: ValueOrRange[] | Float32Array, length: number): Range[] {
  assert(length);
  assert(Array.isArray(vec) || vec instanceof Float32Array);
  let ret = new Array(length);
  for (let ii = 0; ii < length; ++ii) {
    ret[ii] = normalizeValue(vec[ii]);
  }
  return ret;
}

function normalizeParticle(
  def: ParticleDefWithNormalization,
  particle_manager: ParticleManager
): ParticleDefNormalized {
  if (!def.normalized) {
    let norm: ParticleDefNormalized = def.normalized = {
      blend: blend_map[def.blend] || BLEND_ALPHA,
      texture: textureLoad({ url: def.texture ? `img/${def.texture}.png` : 'img/glov/util_circle.png' }),
      color: normalizeValueVec(def.color || [1,1,1,1], 4),
      color_track: null,
      size: normalizeValueVec(def.size || [1,1], 2),
      size_track: null,
      accel: normalizeValueVec(def.accel || [0,0,0], 3),
      rot: normalizeValue(def.rot || 0),
      rot_vel: normalizeValue(def.rot || 0),
      lifespan: normalizeValue(def.lifespan || 1000),
      kill_time_accel: normalizeValue(def.kill_time_accel || 1),
    };
    assert(norm.kill_time_accel[0] >= 1); // cannot slow down on kill!
    if (def.color_track && def.color_track.length) {
      assert(def.color_track.length > 1);
      norm.color_track = [];
      for (let ii = 0; ii < def.color_track.length; ++ii) {
        let e = def.color_track[ii];
        assert(typeof e.t === 'number');
        let arr = new Float32Array(5) as unknown as JSVec5;
        arr[0] = e.v[0];
        arr[1] = e.v[1];
        arr[2] = e.v[2];
        arr[3] = e.v[3];
        arr[4] = e.t;
        norm.color_track.push(arr);
      }
    }
    if (def.size_track && def.size_track.length) {
      assert(def.size_track.length > 1);
      norm.size_track = [];
      for (let ii = 0; ii < def.size_track.length; ++ii) {
        let e = def.size_track[ii];
        assert(typeof e.t === 'number');
        let arr = new Float32Array(3) as unknown as JSVec3;
        arr[0] = e.v[0];
        arr[1] = e.v[1];
        arr[2] = e.t;
        norm.size_track.push(arr);
      }
    }
  }
  return def.normalized;
}

function findParticle(particles: TSMap<number>, name: string): number {
  assert(particles[name] !== undefined);
  return particles[name];
}

function normalizeEmitter(
  def: ParticleEmitterDefWithNormalization,
  part_map: TSMap<number>,
): ParticleEmitterDefNormalized {
  if (!def.normalized) {
    let emit_rate = normalizeValue(def.emit_rate || 10);
    // convert particles per second to ms per emission
    let min = emit_rate[0];
    let max = emit_rate[0] + emit_rate[1];
    emit_rate = vec2(1000 / max, 1000 / min);
    assert(emit_rate[0] > 1); // Not more than 1000 per second, that's ridic'.
    def.normalized = {
      part_idx: findParticle(part_map, def.particle),
      pos: normalizeValueVec(def.pos || [0,0,0], 3),
      vel: normalizeValueVec(def.vel || [0,0,0], 3),
      emit_rate: emit_rate,
      emit_time: normalizeValueVec(def.emit_time || [0,Infinity], 2),
      emit_initial: normalizeValue(def.emit_initial || 1),
    };
  }
  return def.normalized;
}

function normalizeDef(
  def: ParticleSystemDefWithNormalization,
  particle_manager: ParticleManager,
): ParticleSystemDefNormalized {
  if (!def.normalized) {
    let norm: ParticleSystemDefNormalized = def.normalized = {
      system_lifespan: normalizeValue(def.system_lifespan || Infinity),
      particles: [],
      emitters: [],
      no_shift: Boolean(def.no_shift),
    };
    let part_map: TSMap<number> = {};
    for (let key in def.particles) {
      part_map[key] = norm.particles.length;
      norm.particles.push(normalizeParticle(def.particles[key]!, particle_manager));
    }
    for (let key in def.emitters) {
      norm.emitters.push(normalizeEmitter(def.emitters[key]!, part_map));
    }
  }
  return def.normalized;
}

function instValue(v: Range): number {
  return v[0] + random() * v[1];
}
function instValueVec(v: Vec4Range): JSVec4;
function instValueVec(v: Vec3Range): JSVec3;
function instValueVec(v: Vec2Range): JSVec2;
function instValueVec(v: Range[]): number[] {
  let ret = new Float32Array(v.length);
  for (let ii = 0; ii < v.length; ++ii) {
    ret[ii] = instValue(v[ii]);
  }
  return ret as unknown as number[];
}

let temp_color = vec4();
let temp_color2 = vec4();
let temp_size = vec2();
let temp_size2 = vec2();
// let temp_pos = v3allocZero();

type Particle = {
  def: ParticleDefNormalized;
  age: number;
  lifespan: number;
  pos: JSVec3;
  size: JSVec2;
  vel: JSVec3;
  accel: JSVec3;
  color: JSVec4;
  kill_time_accel: number;
};
type PartSet = {
  def: ParticleDefNormalized;
  parts: Particle[];
};
class Emitter {
  def: ParticleEmitterDefNormalized;
  emit_time: JSVec2;
  countdown = 0;
  started = false;
  stopped = false;
  constructor(def: ParticleEmitterDefNormalized) {
    this.def = def;
    this.emit_time = instValueVec(def.emit_time);
  }
}

class ParticleSystem {
  parent: ParticleManager;
  def: ParticleSystemDefNormalized;
  system_lifespan: number;
  age = 0;
  kill_hard = false;
  kill_soft = false;
  pos: Vec3;
  part_sets: PartSet[];
  emitters: Emitter[];
  constructor(parent: ParticleManager, def_in: ParticleSystemDef, pos: ROVec3) {
    assert(pos.length === 3);
    this.parent = parent;
    this.def = normalizeDef(def_in, parent);
    this.system_lifespan = instValue(this.def.system_lifespan);
    assert(this.system_lifespan > 0);
    this.pos = vec3(pos[0], pos[1], pos[2]);
    this.part_sets = [];
    for (let ii = 0; ii < this.def.particles.length; ++ii) {
      let def = this.def.particles[ii];
      let part_set = {
        def,
        parts: [],
      };
      this.part_sets.push(part_set);
    }
    this.emitters = [];
    // Instantiate emitters
    for (let ii = 0; ii < this.def.emitters.length; ++ii) {
      let def = this.def.emitters[ii];
      this.emitters.push(new Emitter(def));
    }
    // Do *not* do this here, causes them to be drawn twice on the first frame,
    //   they'll be ticked as usual.
    // // do initial tick for things that have an emit_time[0] of 0 and have an emit_initial
    // this.tick(0);
  }

  tickParticle(part: Particle, dt: number): boolean {
    let def = part.def;
    part.age += dt;
    let age_norm = part.age / part.lifespan;
    if (age_norm >= 1) {
      return true;
    }

    // Pos, vel - incrementally computed
    let dts = dt / 1000;
    part.pos[0] += part.vel[0] * dts;
    part.pos[1] += part.vel[1] * dts;
    part.pos[2] += part.vel[2] * dts;
    part.vel[0] += part.accel[0] * dts;
    part.vel[1] += part.accel[1] * dts;
    part.vel[2] += part.accel[2] * dts;

    // Color, size, rot - explicitly computed
    v4copy(temp_color, part.color);
    if (def.color_track) {
      if (age_norm < def.color_track[0][4]) {
        v4mul(temp_color, temp_color, def.color_track[0]);
      } else if (age_norm >= def.color_track[def.color_track.length - 1][4]) {
        v4mul(temp_color, temp_color, def.color_track[def.color_track.length - 1]);
      } else {
        for (let ii = 0; ii < def.color_track.length - 1; ++ii) {
          if (age_norm >= def.color_track[ii][4] && age_norm < def.color_track[ii + 1][4]) {
            let weight = (age_norm - def.color_track[ii][4]) / (def.color_track[ii + 1][4] - def.color_track[ii][4]);
            v4lerp(temp_color2, weight, def.color_track[ii], def.color_track[ii + 1]);
            v4mul(temp_color, temp_color, temp_color2);
            break;
          }
        }
      }
    }

    v2copy(temp_size, part.size);
    if (def.size_track) {
      if (age_norm < def.size_track[0][2]) {
        v2mul(temp_size, temp_size, def.size_track[0]);
      } else if (age_norm >= def.size_track[def.size_track.length - 1][2]) {
        v2mul(temp_size, temp_size, def.size_track[def.size_track.length - 1]);
      } else {
        for (let ii = 0; ii < def.size_track.length - 1; ++ii) {
          if (age_norm >= def.size_track[ii][2] && age_norm < def.size_track[ii + 1][2]) {
            let weight = (age_norm - def.size_track[ii][2]) / (def.size_track[ii + 1][2] - def.size_track[ii][2]);
            v2lerp(temp_size2, weight, def.size_track[ii], def.size_track[ii + 1]);
            v2mul(temp_size, temp_size, temp_size2);
            break;
          }
        }
      }
    }

    // TODO: let rot = part.rot + part.age * part.rot_vel;

    // TODO: draw using:
    //   rot
    let w = temp_size[0];
    let h = temp_size[1];
    let x = part.pos[0] - w/2;
    let y = part.pos[1] - h/2;
    let z = part.pos[2];
    spriteQueueRaw4Color([def.texture],
      x, y, temp_color, 0, 0,
      x, y + h, temp_color, 0, 1,
      x + w, y + h, temp_color, 1, 1,
      x + w, y, temp_color, 1, 0,
      z,
      null, null, def.blend);

    return false;
  }

  tickPartSet(dt_orig: number, part_set: PartSet): void {
    //let def = part_set.def;
    let parts = part_set.parts;
    for (let ii = parts.length - 1; ii >= 0; --ii) {
      let part = parts[ii];
      let dt = this.kill_soft ? dt_orig * part.kill_time_accel : dt_orig;
      if (this.tickParticle(part, dt)) {
        parts[ii] = parts[parts.length - 1];
        parts.pop();
      }
    }
  }

  emitParticle(init_dt: number, emitter: Emitter): void {
    let emitter_def = emitter.def;
    let part_set = this.part_sets[emitter_def.part_idx];
    let def = part_set.def;
    let pos = instValueVec(emitter_def.pos);
    v3add(pos, pos, this.pos);
    // PERFTODO: Make the whole Particle just a data[] Float32Array
    let part = {
      def,
      pos,
      color: instValueVec(def.color),
      size: instValueVec(def.size),
      vel: instValueVec(emitter_def.vel),
      accel: instValueVec(def.accel),
      rot: instValue(def.rot),
      rot_vel: instValue(def.rot_vel),
      lifespan: instValue(def.lifespan),
      kill_time_accel: instValue(def.kill_time_accel),
      age: 0,
    };
    if (!this.tickParticle(part, init_dt)) {
      part_set.parts.push(part);
    }
  }

  tickEmitter(dt: number, emitter: Emitter): void {
    let def = emitter.def;
    // check for initial emission
    if (!emitter.started && this.age >= emitter.emit_time[0]) {
      emitter.started = true;
      // ignore time before we started emitting
      dt = this.age - emitter.emit_time[0];
      let num = instValue(def.emit_initial);
      for (let ii = 0; ii < num; ++ii) {
        this.emitParticle(dt, emitter);
      }
      emitter.countdown = instValue(def.emit_rate);
    }
    if (emitter.started && !emitter.stopped && !this.kill_soft) {
      // should we stop?
      let remaining_dt = dt;
      let emit_dt = dt;
      if (this.age >= emitter.emit_time[1]) {
        emitter.stopped = true;
        // Do not emit during time after we stopped
        emit_dt -= this.age - emitter.emit_time[1];
      }
      // Emit dt's worth of particles
      while (emit_dt >= emitter.countdown) {
        emit_dt -= emitter.countdown;
        remaining_dt -= emitter.countdown;
        emitter.countdown = instValue(def.emit_rate);
        this.emitParticle(remaining_dt, emitter);
      }
      emitter.countdown -= emit_dt;
    }
  }

  tick(dt: number): boolean {
    if (this.kill_hard) {
      return true;
    }
    // tick existing particles
    for (let ii = this.part_sets.length - 1; ii >= 0; --ii) {
      this.tickPartSet(dt, this.part_sets[ii]);
    }
    // advance time and spawn new ones (with partial ticks)
    this.age += dt;
    for (let ii = 0; ii < this.emitters.length; ++ii) {
      this.tickEmitter(dt, this.emitters[ii]);
    }

    return this.age >= this.system_lifespan; // kill if past lifespan
  }

  shift(delta: ROVec3): void {
    if (this.def.no_shift) {
      return;
    }
    this.pos[0] += delta[0];
    this.pos[1] += delta[1];
    this.pos[2] += delta[2];
    for (let ii = 0; ii < this.part_sets.length; ++ii) {
      let parts = this.part_sets[ii].parts;
      for (let jj = 0; jj < parts.length; ++jj) {
        let part = parts[jj];
        part.pos[0] += delta[0];
        part.pos[1] += delta[1];
        part.pos[2] += delta[2];
      }
    }
  }
}
export type { ParticleSystem };

class ParticleManager {
  systems: ParticleSystem[] = [];

  createSystem(def: ParticleSystemDef, pos: ROVec3): ParticleSystem {
    let system = new ParticleSystem(this, def, pos);
    this.systems.push(system);
    return system;
  }

  tick(dt: number): void {
    for (let ii = this.systems.length - 1; ii >= 0; --ii) {
      if (this.systems[ii].tick(dt)) {
        this.systems[ii] = this.systems[this.systems.length - 1];
        this.systems.pop();
      }
    }
  }

  killAll(): void {
    this.systems = [];
  }

  shift(delta: ROVec3): void {
    for (let ii = 0; ii < this.systems.length; ++ii) {
      this.systems[ii].shift(delta);
    }
  }
}

let manager: ParticleManager;
function particlesTick(dt: number): void {
  manager.tick(dt);
}

export function particlesCreateSystem(defs: ParticleSystemDef, pos: ROVec3): ParticleSystem {
  return manager.createSystem(defs, pos);
}

export function particlesStartup(): void {
  manager = new ParticleManager();
  addAppPostTick(particlesTick);
}
