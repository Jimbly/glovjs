// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const glov_engine = require('./engine.js');
const net = require('./net.js');
const util = require('../../common/util.js');
const { max, min, sqrt } = Math;
const {
  vec2, v2copy, v2distSq, v2lengthSq, v2scale, v2sub,
} = require('./vmath.js');

const valid_options = [
  // Numeric parameters
  'send_time', 'window', 'snap_factor', 'smooth_windows', 'smooth_factor', 'default_pos',
  // Callbacks
  'on_pos_update', 'on_state_update',
];

function NetPositionManager(options) {
  this.on_channel_data = this.onChannelData.bind(this);
  this.on_subscribe = this.onChannelSubscribe.bind(this);
  this.reinit(options);
}
NetPositionManager.prototype.deinit = function () {
  if (this.channel) {
    this.channel.removeListener('channel_data', this.on_channel_data);
    this.channel.removeListener('subscribe', this.on_subscribe);
  }
};

NetPositionManager.prototype.onChannelSubscribe = function (data) {
  // initial connection or reconnect
  this.last_send.sending = false; // ignore send on previous, disconnected link
  this.last_send.time = 0;
  this.client_id = net.client.id;
};

NetPositionManager.prototype.onChannelData = function (data, mod_key/* , mod_value */) {
  if (mod_key) {
    const m = mod_key.match(/public\.clients\.([^.]+)\.pos/u);
    if (m) {
      this.otherClientPosChanged(m[1]);
    }
  } else {
    if (data && data.public && data.public.clients) {
      for (const client_id in data.public.clients) {
        const client_data = data.public.clients[client_id];
        if (client_data.pos) {
          this.otherClientPosChanged(client_id);
        }
      }
    }
  }
};

NetPositionManager.prototype.reinit = function (options) {
  this.deinit();

  options = options || {};
  this.per_client_data = {};
  for (let ii = 0; ii < valid_options.length; ++ii) {
    let field = valid_options[ii];
    if (options[field]) {
      this[field] = options[field];
    }
  }

  this.channel = options.channel; // Never inheriting this over reinit()
  this.last_send = {
    pos: vec2(-1, -1),
    sending: false,
    send_time: 0,
  };
  this.ever_received_character = false;

  if (this.channel) {
    this.channel.on('channel_data', this.on_channel_data);
    this.channel.onSubscribe(this.on_subscribe);
  }
};

// cb(client_id, pos[2])
NetPositionManager.prototype.onPositionUpdate = function (cb) {
  this.on_pos_update = cb;
};

// cb(client_id, new_state)
NetPositionManager.prototype.onStateUpdate = function (cb) {
  this.on_state_update = cb;
};

NetPositionManager.prototype.checkNet = function (on_pos_set_cb) {
  if (!net.client.connected || !this.channel || !this.channel.data.public) {
    // Not yet in room, do nothing
    return true;
  }
  if (net.client.id !== this.client_id) {
    // Haven't yet subscribed to this room under the new client_id
    return true;
  }

  const me = this.channel.getChannelData(`public.clients.${this.client_id}`, {});
  if (!me.pos || !me.pos.cur || typeof me.pos.cur[0] !== 'number') {
    if (this.ever_received_character) {
      // we must be reconnecting, use last replicated position
    } else {
      // fresh connect, use default position
      v2copy(this.last_send.pos, this.default_pos);
      on_pos_set_cb(this.last_send.pos);
    }
    this.channel.setChannelData(`public.clients.${this.client_id}.pos`, {
      cur: [this.last_send.pos[0], this.last_send.pos[1]], // Do not send as F32Array
    });
    this.ever_received_character = true;
  } else if (!this.ever_received_character) {
    v2copy(this.last_send.pos, me.pos.cur);
    on_pos_set_cb(this.last_send.pos);
    this.ever_received_character = true;
  }
  return false;
};

NetPositionManager.prototype.updateMyPos = function (character_pos, anim_state) {
  if (character_pos[0] !== this.last_send.pos[0] || character_pos[1] !== this.last_send.pos[1] ||
    anim_state !== this.last_send.anim_state
  ) {
    // pos changed
    const now = glov_engine.getFrameTimestamp();
    if (!this.last_send.sending && (!this.last_send.time || now - this.last_send.time > this.send_time)) {
      // do send!
      this.last_send.sending = true;
      this.last_send.time = now;
      this.last_send.speed = 0;
      if (this.last_send.send_time) {
        const time = now - this.last_send.send_time;
        this.last_send.speed = sqrt(v2distSq(this.last_send.pos, character_pos)) / time;
        if (this.last_send.speed < 0.001) {
          this.last_send.speed = 0;
        }
      }
      this.last_send.send_time = now;
      this.last_send.pos[0] = character_pos[0];
      this.last_send.pos[1] = character_pos[1];
      this.last_send.anim_state = anim_state;
      this.channel.setChannelData(
        `public.clients.${this.client_id}.pos`, {
          cur: [this.last_send.pos[0], this.last_send.pos[1]], // Do not send as F32Array
          state: this.last_send.anim_state, speed: this.last_send.speed,
          q: true,
        }, false, () => {
          // could avoid needing this response function (and ack packet) if we
          // instead just watch for the apply_channel_data message containing
          // (approximately) what we sent
          this.last_send.sending = false;
          const end = glov_engine.getFrameTimestamp();
          if (end - this.last_send.time > this.send_time) {
            // hiccup, delay next send
            this.last_send.time = end;
          }
        }
      );
    }
  }
};

NetPositionManager.prototype.otherClientPosChanged = function (client_id) {
  const client_pos = this.channel.getChannelData(`public.clients.${client_id}.pos`);
  if (!client_pos || !client_pos.cur || typeof client_pos.cur[0] !== 'number') {
    return;
  }
  // client_pos is { cur, state, speed }
  let pcd = this.per_client_data[client_id];
  if (!pcd) {
    pcd = this.per_client_data[client_id] = {}; // eslint-disable-line no-multi-assign
    pcd.pos = v2copy(vec2(), client_pos.cur);
    pcd.net_speed = 0;
    pcd.net_pos = v2copy(vec2(), client_pos.cur);
    pcd.impulse = vec2();
    pcd.net_state = 'idle_down';
    pcd.anim_state = 'idle_down';
  }
  if (client_pos.state) {
    pcd.net_state = client_pos.state;
  }
  v2copy(pcd.net_pos, client_pos.cur);
  pcd.net_speed = client_pos.speed;

  // This interpolation logic taken from Splody
  // Doesn't do great with physics-based jumps though
  const delta = v2sub(vec2(), pcd.net_pos, pcd.pos);
  const dist = sqrt(v2lengthSq(delta));

  if (dist > 0) {
    const time_to_dest = dist / pcd.net_speed;
    if (time_to_dest < this.send_time + this.window) {
      // Would get there in the expected time, use this speed
      v2scale(pcd.impulse, delta, pcd.net_speed / dist);
    } else if (time_to_dest < this.send_time + this.window * this.smooth_windows) { // 0.5s
      // We'll could be there in under half a second, try to catch up smoothly
      // Using provided speed is too slow, go faster, though no slower than we were going
      // (in case this is the last of multiple delayed updates and the last update was going a tiny distance slowly)
      const old_speed = sqrt(v2lengthSq(pcd.impulse));
      const specified_speed = pcd.net_speed;
      const new_speed = Math.max(specified_speed * this.smooth_factor, old_speed);
      v2scale(pcd.impulse, delta, new_speed / dist);
    } else {
      // We're way far behind using the provided speed, attempt to get all the way there by the next few
      // theoretical updates, this basically snaps if this is particularly small
      v2scale(pcd.impulse, delta, 1 / (this.send_time + this.window * this.snap_factor));
    }
  }
};

NetPositionManager.prototype.updateOtherClient = function (client_id, dt) {
  const pcd = this.per_client_data[client_id];
  if (!pcd) {
    // Never got a position sent to us, ignore
    return [0,0];
  }

  // Apply interpolation (logic from Splody)
  let stopped = true;
  if (pcd.impulse[0]) {
    const delta_old = pcd.net_pos[0] - pcd.pos[0];
    const delta_old_sign = util.sign(delta_old);
    pcd.pos[0] += pcd.impulse[0] * dt;
    const delta_new = pcd.net_pos[0] - pcd.pos[0];
    const delta_new_sign = util.sign(delta_new);
    if (delta_new_sign !== delta_old_sign) {
      // made it or passed it
      pcd.pos[0] = pcd.net_pos[0];
      pcd.impulse[0] = 0;
    } else {
      stopped = false;
    }
  }
  if (pcd.impulse[1]) {
    const delta_old = pcd.net_pos[1] - pcd.pos[1];
    const delta_old_sign = util.sign(delta_old);
    pcd.pos[1] += pcd.impulse[1] * dt;
    const delta_new = pcd.net_pos[1] - pcd.pos[1];
    const delta_new_sign = util.sign(delta_new);
    if (delta_new_sign !== delta_old_sign) {
      // made it or passed it
      pcd.pos[1] = pcd.net_pos[1];
      pcd.impulse[1] = 0;
    } else {
      stopped = false;
    }
  }
  if (this.on_pos_update) {
    this.on_pos_update(client_id, pcd.pos);
  }

  const cur_is_run = pcd.anim_state[0] === 'w';
  const new_is_idle = pcd.net_state[0] === 'i';
  if (cur_is_run && new_is_idle && !stopped) {
    // don't apply yet
  } else {
    pcd.anim_state = pcd.net_state;
    if (this.on_state_update) {
      this.on_state_update(client_id, pcd.net_state);
    }
  }
  return pcd.pos;
};

NetPositionManager.prototype.send_time = 200; // how often to send position updates
NetPositionManager.prototype.window = 200; // maximum expected variation in time between updates; ms
NetPositionManager.prototype.snap_factor = 1.0; // how many windows to snap in when we think we need to snap
NetPositionManager.prototype.smooth_windows = 6.5; // how many windows behind we can be and only accelerate a little
NetPositionManager.prototype.smooth_factor = 1.2; // how much faster to go in the smoothing window
NetPositionManager.prototype.default_pos = vec2();


export function create(...args) {
  return new NetPositionManager(...args);
}


function ScalarInterpolator(tick_time) {
  this.tick_time = tick_time * 1.25;
  this.reset();
}

ScalarInterpolator.prototype.reset = function () {
  this.value = undefined;
  this.target_value = undefined;
  this.vel = 0;
};

// Assume any change happened on the server at frequency tick_time
// Updates state.value and also returns it
ScalarInterpolator.prototype.update = function (dt, new_value) {
  if (this.value === undefined) {
    this.value = new_value;
    this.target_value = new_value;
    return;
  }
  // TODO: Could figure expected velocity and use logic like in updateOtherClient
  if (new_value !== this.target_value) {
    // try to get there in tick_time
    this.vel = (new_value - this.value) / this.tick_time;
    this.target_value = new_value;
  }
  if (this.value !== this.target_value) {
    if (this.vel > 0) {
      this.value = min(this.value + this.vel * dt, this.target_value);
    } else {
      this.value = max(this.value + this.vel * dt, this.target_value);
    }
  }
};

ScalarInterpolator.prototype.getValue = function () {
  return this.value;
};

export function createScalarInterpolator(...args) {
  return new ScalarInterpolator(...args);
}
