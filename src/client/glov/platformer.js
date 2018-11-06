/* eslint no-bitwise:off */
/*global Z:false */
/*global VMath:false */

const glov_engine = require('./glov/engine.js');

window.Z = window.Z || {};
Z.DEBUG = Z.DEBUG || 10000;

const JUMP_TIME = 0.25;
const CLIMB_UP_SPEED = 3;
const PLATFORM_HEIGHT = 0.5; // assert (1 - PLATFORM_HEIGHT) / CLIMB_UP_SPEED <= CLIMB_TIME - 0.030
const HOLD_DOWN_TO_DROP_TIME = 0.100;
const RUN_SPEED = 6;
const JUMP_SPEED = 9.2;
const CLIMB_SPEED_SCALE = 0.25;
const GRAVITY = 9.8*2.5;
const CLIMB_DOWN_SPEED = 4;
const HORIZ_ACCEL = 60;
const HORIZ_DECEL = 30;
const DEAD_ACCEL = 2;
const RUN_LOOP_SCALE = 0.35;
const RUN_LOOP_REST_SPEED = 1;
const BOTTOM = 1;
const TOP = 2;
const LEFT = 4;
const RIGHT = 8;
const CHAR_H = 1.8;
const CHAR_W_2 = 0.45;
const epsilon = 0.001;

const MASK_HORIZ = LEFT | RIGHT;
const MASK_VERT = TOP | BOTTOM;

function collide(pos, rect, mask) {
  let ret = 0;
  let x0 = pos[0] - CHAR_W_2;
  let x1 = pos[0] + CHAR_W_2;
  let y0 = pos[1] - CHAR_H;
  let y1 = pos[1];
  if ((mask & TOP) && x1 > rect[0] && x0 < rect[2]) {
    if (y0 > rect[1] && y0 < rect[3]) {
      ret |= TOP; // of character
    }
  }
  if ((mask & BOTTOM) && x1 > rect[0] && x0 < rect[2]) {
    if (y1 > rect[1] && y1 < rect[3]) {
      ret |= BOTTOM;
    }
  }
  if ((mask & MASK_HORIZ) && y1 > rect[1] && y0 < rect[3]) {
    if (x0 > rect[0] && x0 < rect[2]) {
      ret |= LEFT;
    }
    if (x1 > rect[0] && x1 < rect[2]) {
      ret |= RIGHT;
    }
  }
  return ret;
}

function playSound() {
  // Not yet implemented
}


class PlatCharacter {
  constructor(pos) {
    this.pos = VMath.v2Copy(pos);
    this.v = [0,0];
    this.dead = false;
    this.on_ground = true;
    this.climbing = false;
    this.jumping = 0;
    this.jumping_released = true;
    this.runloop = 0.5;
    this.facing = 1;
  }

  setPos(pos) {
    this.pos[0] = pos[0];
    this.pos[1] = pos[1];
  }
}

class Platformer {
  constructor(def) {
    this.solids = [];
    this.platforms = [];
    this.characters = [];

    if (def && def.solids) {
      for (let ii = 0; ii < def.solids.length; ++ii) {
        this.addSolid(def.solids[ii]);
      }
    }
    if (def && def.platforms) {
      for (let ii = 0; ii < def.platforms.length; ++ii) {
        this.addPlatform(def.platforms[ii]);
      }
    }
  }

  addSolid(solid) { // [x, y, w, h]
    this.solids.push([solid[0], solid[1], solid[0] + solid[2], solid[1] + solid[3]]);
  }
  addPlatform(platform) { // [x, y, w]
    if (!platform[3]) {
      platform = platform.slice(0);
      // height mostly irrelevant, as long as you can't move that far in one tick; but used for
      // keeping consistent speed going up/down ladders
      platform[3] = PLATFORM_HEIGHT;
    }
    this.platforms.push([platform[0], platform[1], platform[0] + platform[2], platform[1] + platform[3]]);
  }

  addCharacter(pos) { // [x, y]
    let char = new PlatCharacter(pos);
    this.characters.push(char);
    return char;
  }

  clearCharacters() {
    this.characters = [];
  }

  drawDebug(pos, scale) {
    let glov_ui = glov_engine.glov_ui;
    let glov_input = glov_engine.glov_input;
    let p = VMath.v4BuildZero();
    scale = VMath.v4Build(scale[0], scale[1], scale[0], scale[1]);
    pos = VMath.v4Build(pos[0], pos[1], pos[0], pos[1]);
    [this.solids, this.platforms].forEach(function (arr, idx) {
      for (let ii = 0; ii < arr.length; ++ii) {
        let s = arr[ii];
        VMath.v4MulAdd(s, scale, pos, p);
        glov_ui.drawRect(p[0], p[1], p[2], p[3], Z.DEBUG, idx ? [0,1,1,0.5] : [1,0,1,0.5]);
        if (glov_input.isMouseOver({
          x: p[0], y: p[1], w: p[2] - p[0], h: p[3] - p[1],
        })) {
          glov_ui.font.drawSizedAligned(null, p[0], p[1], Z.UI,
            12, 0, 0, 0, `idx=${ii} def=${s[0]},${s[1]},${s[2]-s[0]},${s[3]-s[1]}`);
        }
      }
    });
  }

  doCharacterMotion(character, dt, dx, dy, jump) {
    /* eslint complexity:off */
    if (dt > 30) {
      // timeslice
      while (dt) {
        let t = Math.min(dt, 16);
        this.doCharacterMotion(character, t, dx, dy, jump);
        dt -= t;
      }
      return;
    }

    dt *= 0.001; // seconds

    let movement_scale = 1;
    let jump_scale = 1;

    if (dy > 0) {
      character.time_holding_down += dt;
    } else {
      character.time_holding_down = 0;
    }

    let was_on_ground = character.on_ground;
    if (!was_on_ground) {
      movement_scale = jump_scale;
    }
    let desired_horiz_vel = dx * RUN_SPEED * (character.climbing ? CLIMB_SPEED_SCALE : 1);
    let accel = dt * (character.dead ? DEAD_ACCEL : dx ? HORIZ_ACCEL : HORIZ_DECEL);
    let delta = desired_horiz_vel - character.v[0];
    if (Math.abs(delta) <= accel) {
      character.v[0] = desired_horiz_vel;
    } else {
      character.v[0] += ((delta < 0) ? -1 : 1) * accel;
    }
    if (!jump) {
      character.jumping_released = true;
    }
    if (was_on_ground && jump && character.jumping_released) {
      if (jump) { // jump!
        character.climbing = false;
        character.v[1] = ((dy > 0) ? 1 : -1) * JUMP_SPEED * jump_scale;
        character.jumping = JUMP_TIME;
        character.jumping_released = false;
        //playSound('jump');
      }
    } else if (character.jumping && jump) {
      // mid-jump and still holding "up"
      if (dt >= character.jumping) {
        // out of time, stop
        let leftover = dt - character.jumping;
        character.v[1] += GRAVITY * leftover;
        character.jumping = 0;
        character.climbing = false;
      } else {
        character.jumping -= dt;
        // velocity stays unchanged (climbing or jumping)
      }
    } else {
      if (character.jumping) {
        character.jumping = 0;
        character.climbing = false;
      }
      character.v[1] += GRAVITY * dt;
    }
    let do_platforms = character.v[1] >= 0 && (dy <= 0 || was_on_ground && !jump &&
      character.time_holding_down < HOLD_DOWN_TO_DROP_TIME);
    let horiz_movement = character.v[0] * dt;
    // Update runloop
    let new_facing = (dx > 0) ? 1 : (dx < 0) ? -1 : character.facing;
    if (character.facing !== new_facing) {
      character.facing = new_facing;
      //character.runloop = 0;
    }
    if (was_on_ground && !character.dead) {
      let last_runloop = character.runloop;
      character.runloop += character.facing * horiz_movement * RUN_LOOP_SCALE * movement_scale;
      while (character.runloop < 0) {
        character.runloop += 1;
      }
      while (character.runloop >= 1) {
        character.runloop -= 1;
      }
      if (Math.abs(character.v[0]) < 0.1) {
        if (character.runloop < 0.25) {
          character.runloop = Math.max(0, character.runloop - RUN_LOOP_REST_SPEED * dt);
        } else if (character.runloop < 0.5) {
          character.runloop = Math.min(0.5, character.runloop + RUN_LOOP_REST_SPEED * dt);
        } else if (character.runloop < 0.75) {
          character.runloop = Math.max(0.5, character.runloop - RUN_LOOP_REST_SPEED * dt);
        } else {
          character.runloop = Math.min(1, character.runloop + RUN_LOOP_REST_SPEED * dt);
        }
      }
      if (last_runloop < 0.25 && character.runloop >= 0.25 && character.runloop < 0.5) {
        playSound('footstep');
      } else if (last_runloop > 0.5 && last_runloop < 0.75 && character.runloop >= 0.75) {
        playSound('footstep');
      }
    }
    let last_pos = character.pos.slice(0);
    // horizontal
    character.pos[0] += horiz_movement * movement_scale;
    // check vs solids
    character.on_ground = (Math.abs(character.v[1]) < 0.001) ? was_on_ground : false;
    for (let ii = 0; ii < this.solids.length; ++ii) {
      let s = this.solids[ii];
      let c = collide(character.pos, s, MASK_HORIZ);
      if (c & LEFT) {
        character.v[0] = 0;
        character.pos[0] = s[2] + CHAR_W_2 + epsilon;
      } else if (c & RIGHT) {
        character.v[0] = 0;
        character.pos[0] = s[0] - CHAR_W_2 - epsilon;
      }
    }
    // vertical
    character.pos[1] += character.v[1] * dt;
    for (let ii = 0; ii < this.solids.length; ++ii) {
      let s = this.solids[ii];
      let c = collide(character.pos, s, MASK_VERT);
      if (c & TOP) {
        character.v[1] = 0;
        character.pos[1] = s[3] + CHAR_H + epsilon;
        character.jumping = 0;
        character.climbing = false;
      } else if (c & BOTTOM) {
        character.v[1] = 0;
        character.pos[1] = s[1];
      }
      if (c & BOTTOM) {
        character.on_ground = true;
      }
    }
    let any_platform = false;
    for (let ii = 0; ii < this.platforms.length; ++ii) {
      let s = this.platforms[ii];
      let c = collide(character.pos, s, BOTTOM);
      if (c & BOTTOM) {
        any_platform = true;
        if (do_platforms) { // not holding down
          if (!collide(last_pos, s, BOTTOM)) {
            character.v[1] = 0;
            character.pos[1] = s[1];
            character.on_ground = true;
          }
        } else if (character.v[1] > 0) {
          character.v[1] = Math.min(character.v[1], CLIMB_DOWN_SPEED);
        }
      }
    }
    if (dy < 0) {
      // should we climb?  Is there a platform overlapping us
      for (let ii = 0; ii < this.platforms.length; ++ii) {
        let s = this.platforms[ii];
        let c = collide(character.pos, s, MASK_HORIZ);
        if (c) {
          character.v[1] = -CLIMB_UP_SPEED;
          character.climbing = true;
          any_platform = true;
          break;
        }
      }
      if (!any_platform) {
        character.climbing = false;
      }
    } else {
      character.climbing = false;
    }
    if (character.on_ground && !was_on_ground) {
      playSound(character.dead ? 'dead_land' :'jump_land');
    }
  }
}


export function create(...args) {
  return new Platformer(...args);
}
