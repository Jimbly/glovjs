const assert = require('assert');
const dot_prop = require('dot-prop');
const EventEmitter = require('../../common/tiny-events.js');
const local_storage = require('./local_storage.js');
const md5 = require('./md5.js');
const util = require('../../common/util.js');

// relevant events:
//   .on('channel_data', cb(data [, mod_key, mod_value]));

function ClientChannelWorker(subs, channel_id) {
  EventEmitter.call(this);
  this.subs = subs;
  this.channel_id = channel_id;
  this.subscriptions = 0;
  this.got_subscribe = false;
  this.handlers = {};
  this.data = {};
  this.onMsg('channel_data', this.handleChannelData.bind(this));
  this.onMsg('apply_channel_data', this.handleApplyChannelData.bind(this));
  this.logged_in = false;
  this.logging_in = false;
}
util.inherits(ClientChannelWorker, EventEmitter);

// cb(data)
ClientChannelWorker.prototype.onSubscribe = function (cb) {
  assert(this.subscriptions);
  this.on('subscribe', cb);
  if (this.got_subscribe) {
    cb(this.data); // eslint-disable-line callback-return
  }
};

// cb(data)
ClientChannelWorker.prototype.onceSubscribe = function (cb) {
  assert(this.subscriptions);
  if (this.got_subscribe) {
    cb(this.data); // eslint-disable-line callback-return
  } else {
    this.once('subscribe', cb);
  }
};


ClientChannelWorker.prototype.handleChannelData = function (data, resp_func) {
  console.log(`got channel_data(${this.channel_id}):  ${JSON.stringify(data)}`);
  this.data = data;
  this.emit('channel_data', this.data);
  this.got_subscribe = true;
  this.emit('subscribe', this.data);
  resp_func();
};

ClientChannelWorker.prototype.handleApplyChannelData = function (data, resp_func) {
  // already logged in handleChannelMessage
  // if (!data.q) {
  //   console.log(`got channel data mod: ${JSON.stringify(data)}`);
  // }
  if (data.value === undefined) {
    dot_prop.delete(this.data, data.key);
  } else {
    dot_prop.set(this.data, data.key, data.value);
  }
  this.emit('channel_data', this.data, data.key, data.value);
  resp_func();
};

ClientChannelWorker.prototype.getChannelData = function (key, default_value) {
  return dot_prop.get(this.data, key, default_value);
};

ClientChannelWorker.prototype.setChannelData = function (key, value, skip_predict, resp_func) {
  if (!skip_predict) {
    dot_prop.set(this.data, key, value);
  }
  let q = value && value.q || undefined;
  this.subs.client.send('set_channel_data', { channel_id: this.channel_id, key, value, q }, resp_func);
};

ClientChannelWorker.prototype.removeMsgHandler = function (msg, cb) {
  assert(this.handlers[msg] === cb);
  delete this.handlers[msg];
};

ClientChannelWorker.prototype.onMsg = function (msg, cb) {
  assert(!this.handlers[msg]);
  this.handlers[msg] = cb;
};

ClientChannelWorker.prototype.send = function (msg, data, opts, resp_func) {
  this.subs.client.send('channel_msg', { channel_id: this.channel_id, msg, data, broadcast: opts.broadcast },
    resp_func);
};

function SubscriptionManager(client) {
  this.client = client;
  this.on_connect = null;
  this.on_login = null;
  this.channels = {};

  this.first_connect = true;
  this.connected = false;
  this.server_time = 0;
  client.onMsg('connect', this.handleConnect.bind(this));
  client.onMsg('channel_msg', this.handleChannelMessage.bind(this));
  client.onMsg('server_time', this.handleServerTime.bind(this));
}

SubscriptionManager.prototype.handleConnect = function () {
  this.connected = true;
  let reconnect = false;
  if (this.first_connect) {
    this.first_connect = false;
  } else {
    reconnect = true;
  }
  if (this.on_connect) {
    this.on_connect(reconnect);
  }
  // (re-)subscribe to all channels
  for (let channel_id in this.channels) {
    let channel = this.channels[channel_id];
    if (channel.subscriptions) {
      this.client.send('subscribe', channel_id);
    }
  }
};

SubscriptionManager.prototype.handleChannelMessage = function (data, resp_func) {
  if (!data.data || !data.data.q) {
    console.log(`got channel_msg(${data.channel_id}) ${data.msg}: ${JSON.stringify(data.data)}`);
  }
  let channel_id = data.channel_id;
  let msg = data.msg;
  data = data.data;
  let channel = this.getChannel(channel_id);
  if (!channel.handlers[msg]) {
    return;
  }
  channel.handlers[msg](data, resp_func);
};

SubscriptionManager.prototype.handleServerTime = function (data) {
  this.server_time = data;
  if (this.server_time < this.server_time_interp && this.server_time > this.server_time_interp - 250) {
    /*jshint noempty:false*/
    // slight time travel backwards, this one packet must have been delayed,
    // since we once got a packet quicker. Just ignore this, interpolate from
    // where we were before
    // TODO: If the server had a short stall (less than 250ms) we might be
    // ahead from now on!  Slowly interp back to the specified time
    // (run speed at 90% until it matches?, same thing for catching up to
    // small jumps ahead)
  } else {
    this.server_time_interp = this.server_time;
  }
};

SubscriptionManager.prototype.getServerTime = function () {
  // Interpolated server time as of start of last tick
  return this.server_time_interp;
};

SubscriptionManager.prototype.tick = function (dt) {
  this.server_time_interp += dt;
};

SubscriptionManager.prototype.subscribe = function (channel_id) {
  this.getChannel(channel_id, true);
};

SubscriptionManager.prototype.getChannel = function (channel_id, do_subscribe) {
  let channel = this.channels[channel_id];
  if (!channel) {
    channel = this.channels[channel_id] = new ClientChannelWorker(this, channel_id);
  }
  if (do_subscribe) {
    channel.subscriptions++;
    if (this.connected && channel.subscriptions === 1) {
      this.client.send('subscribe', channel_id);
    }
  }
  return channel;
};

SubscriptionManager.prototype.getUserId = function () {
  return this.loggedIn();
};

SubscriptionManager.prototype.getMyUserChannel = function () {
  let user_id = this.loggedIn();
  if (!user_id) {
    return null;
  }
  return this.getChannel(`user.${user_id}`);
};

SubscriptionManager.prototype.unsubscribe = function (channel_id) {
  let channel = this.channels[channel_id];
  assert(channel);
  assert(channel.subscriptions);
  channel.subscriptions--;
  if (!channel.subscriptions) {
    channel.got_subscribe = false;
  }
  if (this.connected && !channel.subscriptions) {
    this.client.send('unsubscribe', channel_id);
  }
};

SubscriptionManager.prototype.onConnect = function (cb) {
  assert(!this.on_connect);
  this.on_connect = cb;
};

SubscriptionManager.prototype.onLogin = function (cb) {
  assert(!this.on_login);
  this.on_login = cb;
};

SubscriptionManager.prototype.loggedIn = function () {
  return this.logged_in ? this.logged_in_username : false;
};

SubscriptionManager.prototype.login = function (username, password, resp_func) {
  if (this.logging_in) {
    return resp_func('Login already in progress');
  }
  this.logging_in = true;
  this.logged_in = false;
  // client.send('channel_msg',
  //  { channel_id: room_name, msg: 'emote', data: `is now known as ${name}`, broadcast: true });
  if (password && password.split('$$')[0] === 'prehashed') {
    password = password.split('$$')[1];
  } else if (password) {
    password = md5(md5(username) + password);
    local_storage.set('password', `prehashed$$${password}`);
  } else {
    password = undefined;
  }
  return this.client.send('login', { name: username, password: password }, (err) => {
    this.logging_in = false;
    if (!err) {
      this.logged_in_username = username;
      this.logged_in = true;
      if (this.on_login) {
        this.on_login(username);
      }
    }
    resp_func(err);
  });
};


export function create(client) {
  return new SubscriptionManager(client);
}
