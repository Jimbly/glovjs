
import assert from 'assert';
import * as engine from 'glov/client/engine';
import { getFrameTimestamp } from 'glov/client/engine';
import { EntityID } from 'glov/common/entity_base_common';
import { sign } from 'glov/common/util';
import { ClientEntityManagerInterface } from './entity_manager_client';

const { abs, floor, max, PI, sqrt } = Math;

const TWO_PI = PI * 2;
const EPSILON = 0.01;

type Vector = Float64Array;

interface EntityPositionManagerOpts {
  // These are applied directly from incoming options onto the entity position manager itself

  dim_pos?: number; // number of components to be interpolated as-is
  dim_rot?: number; // number of components to be interpolated with 2PI wrapping
  send_time?: number; // how often to send position updates
  entless_send_time?: number; // if applicable, if we are entityless, how often to send position updates
  window?: number; // maximum expected variation in time between updates; ms
  snap_factor?: number; // how many windows to snap in when we think we need to snap
  smooth_windows?: number; // how many windows behind we can be and only accelerate a little
  smooth_factor?: number; // how much faster to go in the smoothing window

  entity_manager: ClientEntityManagerInterface;
}

export class PerEntData {
  pos: Vector;
  net_speed: number;
  net_pos: Vector;
  impulse: Vector;
  net_state: string;
  anim_state: string;

  constructor(ent_pos_manager: EntityPositionManager) {
    this.pos = ent_pos_manager.vec();
    this.net_speed = 1;
    this.net_pos = ent_pos_manager.vec();
    this.impulse = ent_pos_manager.vec();
    this.net_state = 'idle';
    this.anim_state = 'idle';
  }
}

export type EntityPositionManager = EntityPositionManagerImpl;
class EntityPositionManagerImpl implements Required<EntityPositionManagerOpts> {
  per_ent_data!: Partial<Record<EntityID, PerEntData>>;
  entity_manager: ClientEntityManagerInterface;

  dim_pos: number;
  dim_rot: number;
  n: number;

  send_time: number;
  entless_send_time: number;
  window: number;
  snap_factor: number;
  smooth_windows: number;
  smooth_factor: number;

  temp_vec: Vector;
  temp_delta: Vector;

  last_send!: {
    pos: Vector;
    anim_state: string;
    sending: boolean;
    send_time: number;
    time: number;
    hrtime: number;
  };

  constructor(options: EntityPositionManagerOpts) {
    this.dim_pos = options.dim_pos || 2;
    this.dim_rot = options.dim_rot || 0;
    this.n = this.dim_pos + this.dim_rot;
    this.send_time = options.send_time || 200;
    this.entless_send_time = options.entless_send_time || 1000;
    this.window = options.window || 200;
    this.snap_factor = options.snap_factor || 1.0;
    this.smooth_windows = options.smooth_windows || 6.5;
    this.smooth_factor = options.smooth_factor || 1.2;
    this.entity_manager = options.entity_manager;
    this.entity_manager.on('ent_delete', this.handleEntDelete.bind(this));
    this.entity_manager.on('subscribe', this.handleSubscribe.bind(this));
    this.entity_manager.on('ent_update', this.otherEntityPosChanged.bind(this));

    this.reinit();

    // After setting this.n
    this.temp_vec = this.vec();
    this.temp_delta = this.vec();
  }

  reinit(): void {
    this.per_ent_data = {};

    this.last_send = {
      pos: this.vec(-1),
      anim_state: 'idle',
      sending: false,
      send_time: 0,
      time: 0,
      hrtime: 0,
    };
  }

  private handleEntDelete(ent_id: EntityID): void {
    delete this.per_ent_data[ent_id];
  }

  private handleSubscribe(): void {
    // initial connection or reconnect
    this.reinit();
  }

  getPos(ent_id: EntityID): Vector | null {
    let ped = this.per_ent_data[ent_id];
    if (!ped) {
      return null;
    }
    return ped.pos;
  }

  getPED(ent_id: EntityID): PerEntData | undefined {
    return this.per_ent_data[ent_id];
  }

  vec(fill?: number): Vector {
    let r = new Float64Array(this.n);
    if (fill) {
      for (let ii = 0; ii < this.n; ++ii) {
        r[ii] = fill;
      }
    }
    return r;
  }
  vcopy(dst: Vector, src: Readonly<Vector> | Readonly<number[]>): Vector {
    for (let ii = 0; ii < this.n; ++ii) {
      dst[ii] = src[ii];
    }
    return dst;
  }
  arr(vec: Readonly<Vector>): number[] {
    let arr = new Array(this.n);
    for (let ii = 0; ii < this.n; ++ii) {
      arr[ii] = vec[ii];
    }
    return arr;
  }
  vsame(a: Readonly<Vector>, b: Readonly<Vector>): boolean {
    for (let ii = 0; ii < this.n; ++ii) {
      if (abs(a[ii] - b[ii]) > EPSILON) {
        return false;
      }
    }
    return true;
  }
  vsamePos(a: Readonly<Vector> | Readonly<number[]>, b: Readonly<Vector> | Readonly<number[]>): boolean {
    for (let ii = 0; ii < this.dim_pos; ++ii) {
      if (abs(a[ii] - b[ii]) > EPSILON) {
        return false;
      }
    }
    return true;
  }
  vlength(a: Readonly<Vector>): number {
    let r = 0;
    for (let ii = 0; ii < this.n; ++ii) {
      let d = a[ii];
      r += d * d;
    }
    return sqrt(r);
  }
  vdist(a: Readonly<Vector>, b: Readonly<Vector>): number {
    this.vsub(this.temp_vec, a, b);
    for (let ii = 0; ii < this.dim_rot; ++ii) {
      let jj = this.dim_pos + ii;
      let d = abs(this.temp_vec[jj]);
      if (d > PI) {
        this.temp_vec[jj] = d - floor((d + PI) / TWO_PI) * TWO_PI;
      }
    }
    return this.vlength(this.temp_vec);
  }
  vsub(dst: Vector, a: Readonly<Vector>, b: Readonly<Vector>): Vector {
    for (let ii = 0; ii < this.n; ++ii) {
      dst[ii] = a[ii] - b[ii];
    }
    return dst;
  }
  vscale(dst: Vector, a: Readonly<Vector>, scalar: number): Vector {
    for (let ii = 0; ii < this.n; ++ii) {
      dst[ii] = a[ii] * scalar;
    }
    return dst;
  }

  updateMyPos(character_pos: Vector, anim_state: string): void {
    let pos_diff = !this.vsame(character_pos, this.last_send.pos);
    let entless = !this.entity_manager.hasMyEnt();
    let state_diff = !entless && (anim_state !== this.last_send.anim_state);
    if (pos_diff || state_diff) {
      // pos or anim_state changed
      const now = getFrameTimestamp();
      let send_time = entless ? this.entless_send_time : this.send_time;
      if (!this.last_send.sending && (!this.last_send.time || now - this.last_send.time > send_time)) {
        // do send!
        this.last_send.sending = true;
        this.last_send.time = now;
        this.last_send.hrtime = engine.hrnow();
        let speed = 0;
        if (this.last_send.send_time) {
          const time = now - this.last_send.send_time;
          speed = this.vdist(this.last_send.pos, character_pos) / time;
          if (speed < 0.001) {
            speed = 0;
          }
        }
        this.last_send.send_time = now;
        this.vcopy(this.last_send.pos, character_pos);
        this.last_send.anim_state = anim_state;
        let data_assignments: {
          pos?: number[];
          state?: string;
          speed?: number;
        } = {};
        if (pos_diff) {
          data_assignments.pos = this.arr(this.last_send.pos);
          data_assignments.speed = speed;
        }
        if (state_diff) {
          data_assignments.state = this.last_send.anim_state;
        }
        let handle_resp = (err: string | null): void => {
          if (err) {
            throw err;
          }
          this.last_send.sending = false;
          let end = getFrameTimestamp();
          let hrend = engine.hrnow();
          let round_trip = hrend - this.last_send.hrtime;
          if (round_trip > send_time) {
            // hiccup, delay next send
            this.last_send.time = end;
          }
        };
        if (this.entity_manager.hasMyEnt()) {
          // send via entity
          let my_ent = this.entity_manager.getMyEnt();
          my_ent.actionSend({
            action_id: 'move',
            data_assignments,
          }, handle_resp);
        } else {
          assert(this.entity_manager.channel);
          this.entity_manager.channel.send('move', data_assignments, handle_resp);
        }
      }
    }
  }

  private otherEntityPosChanged(ent_id: EntityID): void {
    let ent = this.entity_manager.getEnt(ent_id);
    assert(ent);
    let ent_data = ent.data;
    // Relevant fields on ent_data: pos, state
    let ped = this.per_ent_data[ent_id];
    if (!ped) {
      ped = this.per_ent_data[ent_id] = new PerEntData(this);
      this.vcopy(ped.pos, ent_data.pos as number[]);
    }
    if (ent_data.state) {
      ped.net_state = ent_data.state as string;
    }
    this.vcopy(ped.net_pos, ent_data.pos as number[]);
    ped.net_speed = ent_data.speed;

    // Keep ped.pos[rot] within PI of ped.net_pos, so interpolation always goes the right way
    for (let ii = 0; ii < this.dim_rot; ++ii) {
      let jj = this.dim_pos + ii;
      while (ped.pos[jj] > ped.net_pos[jj] + PI) {
        ped.pos[jj] -= TWO_PI;
      }
      while (ped.pos[jj] < ped.net_pos[jj] - PI) {
        ped.pos[jj] += TWO_PI;
      }
    }

    // This interpolation logic taken from Splody
    // Doesn't do great with physics-based jumps though
    const delta = this.vsub(this.temp_delta, ped.net_pos, ped.pos);
    const dist = this.vlength(delta);

    if (dist > 0) {
      const time_to_dest = dist / ped.net_speed;
      if (time_to_dest < this.send_time + this.window) {
        // Would get there in the expected time, use this speed
        this.vscale(ped.impulse, delta, ped.net_speed / dist);
      } else if (time_to_dest < this.send_time + this.window * this.smooth_windows) { // 0.5s
        // We'll could be there in under half a second, try to catch up smoothly
        // Using provided speed is too slow, go faster, though no slower than we were going
        // (in case this is the last of multiple delayed updates and the last update was going a tiny distance slowly)
        const old_speed = this.vlength(ped.impulse);
        const specified_speed = ped.net_speed;
        const new_speed = max(specified_speed * this.smooth_factor, old_speed);
        this.vscale(ped.impulse, delta, new_speed / dist);
      } else {
        // We're way far behind using the provided speed, attempt to get all the way there by the next few
        // theoretical updates, this basically snaps if this is particularly small
        this.vscale(ped.impulse, delta, 1 / (this.send_time + this.window * this.snap_factor));
      }
    }
  }

  updateOtherEntity(ent_id: EntityID, dt: number): PerEntData | null {
    const ped = this.per_ent_data[ent_id];
    if (!ped) {
      // Never got a position sent to us, ignore
      return null;
    }

    // Apply interpolation (logic from Splody)
    let stopped = true;
    for (let ii = 0; ii < this.n; ++ii) {
      if (ped.impulse[ii]) {
        const delta_old = ped.net_pos[ii] - ped.pos[ii];
        const delta_old_sign = sign(delta_old);
        ped.pos[ii] += ped.impulse[ii] * dt;
        const delta_new = ped.net_pos[ii] - ped.pos[ii];
        const delta_new_sign = sign(delta_new);
        if (delta_new_sign !== delta_old_sign) {
          // made it or passed it
          ped.pos[ii] = ped.net_pos[ii];
          ped.impulse[ii] = 0;
        } else if (ii < this.dim_pos && ped.impulse[ii] > 0.01) {
          // If positional (not rotation), we're not stopped
          stopped = false;
        }
      }
    }

    const cur_is_run = ped.anim_state[0] === 'f' || ped.anim_state[0] === 'w';
    const new_is_idle = ped.net_state[0] === 'i';
    if (cur_is_run && new_is_idle && !stopped) {
      // don't apply yet
    } else {
      ped.anim_state = ped.net_state;
      // if (this.on_state_update) {
      //   this.on_state_update(ent_id, ped.net_state);
      // }
    }
    return ped;
  }

}

export function entityPositionManagerCreate(options: EntityPositionManagerOpts): EntityPositionManager {
  return new EntityPositionManagerImpl(options);
}
