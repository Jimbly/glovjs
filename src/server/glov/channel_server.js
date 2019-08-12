const assert = require('assert');
const cmd_parse = require('../../common/cmd_parse.js');
const default_workers = require('./default_workers.js');
const dot_prop = require('dot-prop');

const { max } = Math;

let cmd_parse_system = cmd_parse.create(); // always empty?

function noop() {
  // do nothing
}

function logdata(data) {
  if (data === undefined) {
    return '';
  }
  let r = JSON.stringify(data);
  if (r.length < 80) {
    return r;
  }
  return `${r.slice(0, 77)}...`;
}

function onClientDisconnect(channel_server, client) {
  for (let channel_id in client.channels) {
    client.channels[channel_id].removeClient(client);
  }
}

function onSubscribe(channel_server, client, channel_id) {
  console.log(`client_id:${client.id}->${channel_id}: subscribe `);
  let channel = channel_server.getChannel(channel_id);
  if (!channel) {
    console.log(' - failed channel creation');
    return;
  }

  if (!channel.addClient(client)) {
    console.log(' - failed app_worker check');
  }
}

function onUnSubscribe(channel_server, client, channel_id) {
  console.log(`client_id:${client.id}->${channel_id}: unsubscribe `);
  if (!client.channels[channel_id]) {
    console.log(' - failed not subscribed');
    return;
  }
  let channel = channel_server.getChannel(channel_id);
  if (!channel) {
    console.log(' - failed getting channel');
    return;
  }

  channel.removeClient(client);
}


function onSetChannelData(channel_server, client, data, resp_func) {
  if (!data.q) {
    console.log(`client_id:${client.id}->${data.channel_id}: set_channel_data ${logdata(data)}`);
  }
  data.key = String(data.key);
  let channel_id = data.channel_id;
  assert(channel_id);
  let channel = client.channels[channel_id];
  if (!channel) {
    console.log(' - failed, channel does not exist');
    resp_func('failed: channel does not exist');
    return;
  }
  let key = data.key.split('.');
  if (key[0] !== 'public' && key[0] !== 'private') {
    console.log(` - failed, invalid scope: ${key[0]}`);
    resp_func('failed: invalid scope');
    return;
  }
  if (!key[1]) {
    console.log(' - failed, missing member name');
    resp_func('failed: missing member name');
    return;
  }

  channel.setChannelDataInternal(client, data.key, data.value, data.q);
  resp_func();
}

function onChannelMsg(channel_server, client, data, resp_func) {
  // Messages to everyone subscribed to the channel, e.g. chat
  console.log(`client_id:${client.id}->${data.channel_id}: channel_msg ${logdata(data)}`);
  let channel_id = data.channel_id;
  assert(channel_id);
  let channel = client.channels[channel_id];
  if (!channel) {
    return void resp_func(`Client is not on channel ${channel_id}`);
  }
  // TODO: Also query app_worker if this is okay?
  if (data.broadcast) {
    assert(typeof data.data === 'object');
    // Replicate to all users
    data.data.client_ids = client.ids;
    // if (data.persist) {
    //   channel.msgs.push(msg);
    // }
    channel.channelEmit(data.msg, data.data);
  } else {
    channel.channelMessage(client, data.msg, data.data, resp_func);
  }
}

function onLogin(channel_server, client, data, resp_func) {
  console.log(`client_id:${client.id}->server login ${logdata(data)}`);
  if (!data.name) {
    return resp_func('invalid username');
  }
  if ({}[data.name]) {
    // hasOwnProperty, etc
    return resp_func('invalid username');
  }
  if (!data.password) {
    return resp_func('missing password');
  }

  let user_channel = channel_server.getChannel(`user.${data.name}`);

  if (!user_channel.getChannelData('private.password')) {
    user_channel.setChannelData('private.password', data.password);
    user_channel.setChannelData('public.display_name', data.name);
  }
  if (user_channel.getChannelData('private.password') === data.password) {
    client.ids.user_id = data.name;
    client.ids.display_name = user_channel.getChannelData('public.display_name');
    // Tell channels we have a new user id/display name
    for (let channel_id in client.channels) {
      client.channels[channel_id].clientChanged(client);
    }
    // Always subscribe client to own user
    onSubscribe(channel_server, client, `user.${data.name}`);
    return resp_func(null, 'success');
  } else {
    return resp_func('invalid password');
  }
}

function onCmdParse(channel_server, client, data, resp_func) {
  let channel;
  function handleCmdResult(err, resp) {
    if (err && channel.cmd_parse.was_not_found) {
      // handled must be returning false
      // silently continue
      return;
    }
    // handled must have returned/will return true, so we'll break out
    resp_func(err, resp);
  }
  for (let channel_id in client.channels) {
    channel = client.channels[channel_id];
    let handled = channel.cmd_parse.handle(data, handleCmdResult);
    if (handled) {
      return;
    }
  }
  cmd_parse_system.handle(data, resp_func);
}

function channelServerSend(source, dest, msg, data, resp_func) {
  if (!data || !data.q) {
    console.log(`${source.is_channel_worker ? source.channel_id : `client_id:${source.id}`}->` +
      `${dest.is_channel_worker ? dest.channel_id : `client_id:${dest.id}`}: ${msg} ${logdata(data)}`);
  }
  if (dest.is_channel_worker) {
    dest.channelMessage(source, msg, data, resp_func);
  } else {
    if (source.is_channel_worker) {
      dest.send('channel_msg', {
        channel_id: source.channel_id,
        msg: msg,
        data: data,
      }, resp_func);
    } else {
      // client to client?
      assert(0);
    }
  }
}

class ChannelWorker {
  constructor(channel_server, channel_id) {
    this.channel_server = channel_server;
    this.channel_id = channel_id;
    let m = channel_id.match(/^([^.]*)\.(.*)$/u);
    assert(m);
    this.channel_type = m[1];
    this.channel_subid = m[2];
    this.clients = [];
    //this.msgs = [];
    this.app_worker = null;
    this.store_path = `${this.channel_type}/${this.channel_id}`;
    this.data = channel_server.ds_store.get(this.store_path, '', {});
    this.data.public = this.data.public || {};
    this.data.private = this.data.private || {};
    this.data.channel_id = channel_id;
    this.channels = {}; // channels we're subscribed to
    this.subscribe_counts = {}; // refcount of subscriptions to other channels
    this.handlers = {}; // for handling messages from other channels
    this.internal_handlers = {}; // internal handlers for handling messages from other channels (no resp_func)
    this.is_channel_worker = true;
    this.adding_client = null; // The client we're in the middle of adding, don't send them state updates yet
    this.cmd_parse = cmd_parse.create();
    // Modes that can be enabled
    this.maintain_client_list = false;
    this.emit_join_leave_events = false;
  }
  doMaintainClientList() {
    this.maintain_client_list = true;
    this.data.public.clients = {};
    this.onChannelMsgInternal('apply_channel_data', this.onApplyChannelData.bind(this));
  }
  doEmitJoinLeaveEvents() {
    this.emit_join_leave_events = true;
  }
  cmdRegister(cmd, func) {
    this.cmd_parse.register(cmd, func);
  }
  onChannelMsg(msg, handler) {
    assert(!this.handlers[msg]);
    this.handlers[msg] = handler;
  }
  onChannelMsgInternal(msg, handler) {
    assert(!this.internal_handlers[msg]);
    this.internal_handlers[msg] = handler;
  }
  setAppWorker(app_worker) {
    this.app_worker = app_worker;
  }
  addClient(client) {
    this.clients.push(client);
    client.channels[this.channel_id] = this;
    this.adding_client = client;

    if (this.app_worker && this.app_worker.handleNewClient && !this.app_worker.handleNewClient(client)) {
      this.adding_client = null;
      // not allowed, undo
      this.clients.pop();
      delete client.channels[this.channel_id];
      return false;
    }

    if (this.emit_join_leave_events && !client.is_channel_worker) {
      this.channelEmit('join', client.ids);
    }

    if (this.maintain_client_list && !client.is_channel_worker) {
      // Clone, not reference, we need to know the old user id for unsubscribing!
      this.setChannelData(`public.clients.${client.id}.ids`, {
        user_id: client.ids.user_id,
        client_id: client.ids.client_id,
        display_name: client.ids.display_name,
      });
      if (client.ids.user_id) {
        this.subscribe(`user.${client.ids.user_id}`);
      }
    }

    this.adding_client = null;

    this.sendChannelMessage(client, 'channel_data', {
      public: this.data.public,
    });
    //client.send('channel_msgs', this.msgs);

    return true;
  }
  subscribe(other_channel_id) {
    console.log(`${this.channel_id}->${other_channel_id}: subscribe`);
    let channel = this.channel_server.getChannel(other_channel_id);
    if (!channel) {
      console.log(' - failed channel creation');
      return;
    }
    this.subscribe_counts[other_channel_id] = (this.subscribe_counts[other_channel_id] || 0) + 1;
    if (this.subscribe_counts[other_channel_id] === 1) {
      if (!channel.addClient(this)) {
        console.log(' - failed app_worker check');
        this.subscribe_counts[other_channel_id]--;
      }
    } else {
      console.log(' - already subscribed');
    }
  }
  unsubscribe(other_channel_id) {
    console.log(`${this.channel_id}->${other_channel_id}: unsubscribe`);
    assert(this.subscribe_counts[other_channel_id]);
    --this.subscribe_counts[other_channel_id];
    if (this.subscribe_counts[other_channel_id]) {
      console.log(' - still subscribed (refcount)');
      return;
    }
    delete this.subscribe_counts[other_channel_id];
    let channel = this.channel_server.getChannel(other_channel_id);
    channel.removeClient(this);
  }
  removeClient(client) {
    let idx = this.clients.indexOf(client);
    assert(idx !== -1);
    this.clients.splice(idx, 1);
    delete client.channels[this.channel_id];
    if (this.app_worker && this.app_worker.handleClientDisconnect) {
      this.app_worker.handleClientDisconnect(client);
    }
    if (this.emit_join_leave_events && !client.is_channel_worker) {
      this.channelEmit('leave', client.ids);
    }

    if (this.maintain_client_list && !client.is_channel_worker) {
      this.setChannelData(`public.clients.${client.id}`, undefined);
      if (client.ids.user_id) {
        this.unsubscribe(`user.${client.ids.user_id}`);
      }
    }
  }
  clientChanged(client) {
    if (this.app_worker && this.app_worker.handleClientChanged) {
      this.app_worker.handleClientChanged(client);
    }
    if (this.maintain_client_list && !client.is_channel_worker) {
      let old_ids = this.data.public.clients[client.id] && this.data.public.clients[client.id].ids || {};
      if (old_ids.user_id !== client.ids.user_id) {
        if (old_ids.user_id) {
          this.unsubscribe(`user.${old_ids.user_id}`);
        }
        if (client.ids.user_id) {
          this.subscribe(`user.${client.ids.user_id}`);
        }
      }
      this.setChannelData(`public.clients.${client.id}.ids`, {
        user_id: client.ids.user_id,
        client_id: client.ids.client_id,
        display_name: client.ids.display_name,
      });
    }
  }
  onApplyChannelData(source, data) {
    if (this.maintain_client_list) {
      if (source.channel_type === 'user' && data.key === 'public.display_name') {
        for (let client_id in this.data.public.clients) {
          let client_ids = this.data.public.clients[client_id].ids;
          if (client_ids.user_id === source.channel_subid) {
            this.setChannelData(`public.clients.${client_id}.ids.display_name`, data.value);
          }
        }
      }
    }
  }
  channelEmit(msg, data, except_client) {
    for (let ii = 0; ii < this.clients.length; ++ii) {
      if (this.clients[ii] === except_client) {
        continue;
      }
      channelServerSend(this, this.clients[ii], msg, data);
    }
  }
  setChannelData(key, value, q) {
    this.setChannelDataInternal(this, key, value, q);
  }

  setChannelDataInternal(client, key, value, q) {
    assert(typeof key === 'string');
    assert(typeof client === 'object');
    if (this.app_worker && this.app_worker.handleSetChannelData &&
      !this.app_worker.handleSetChannelData(client, key, value)
    ) {
      // denied by app_worker
      console.log(' - failed app_worker check');
      return;
    }

    if (value === undefined) {
      dot_prop.delete(this.data, key);
    } else {
      dot_prop.set(this.data, key, value);
    }
    // only send public changes
    if (key.startsWith('public')) {
      this.channelEmit('apply_channel_data', { key, value, q }, this.adding_client);
    }
    this.channel_server.ds_store.set(this.store_path, '', this.data);
  }
  getChannelData(key, default_vaulue) {
    return dot_prop.get(this.data, key, default_vaulue);
  }
  channelMessage(source, msg, data, resp_func) {
    if (!resp_func) {
      resp_func = noop;
    }
    if (this.internal_handlers[msg]) {
      this.internal_handlers[msg](source, data);
    }
    if (this.handlers[msg]) {
      this.handlers[msg](source, data, resp_func);
    } else {
      resp_func();
    }
  }
  sendChannelMessage(dest, msg, data, resp_func) {
    channelServerSend(this, dest, msg, data, resp_func);
  }
}

class ChannelServer {
  constructor() {
    this.last_client_id = 0;
    this.channel_types = {};
    this.channels = {};
    this.addChannelWorker('user', default_workers.createDefaultUserWorker);
  }

  getChannel(channel_id) {
    if (this.channels[channel_id]) {
      return this.channels[channel_id];
    }
    let channel_type = channel_id.split('.')[0];
    let channel = new ChannelWorker(this, channel_id);
    this.channels[channel_id] = channel;
    if (this.channel_types[channel_type]) {
      channel.setAppWorker(this.channel_types[channel_type](channel, channel_id));
    }
    return channel;
  }

  init(ds_store, ws_server) {
    this.ds_store = ds_store;
    this.ws_server = ws_server;
    ws_server.on('client', function (client) {
      assert(!client.channels);
      client.channels = {}; // channel_id -> channel_object reference
      assert(!client.ids);
      client.ids = {
        client_id: client.id,
        user_id: null,
        display_name: null,
      };
    });
    ws_server.on('disconnect', onClientDisconnect.bind(this, this));
    ws_server.onMsg('subscribe', onSubscribe.bind(this, this));
    ws_server.onMsg('unsubscribe', onUnSubscribe.bind(this, this));
    ws_server.onMsg('set_channel_data', onSetChannelData.bind(this, this));
    ws_server.onMsg('channel_msg', onChannelMsg.bind(this, this));
    ws_server.onMsg('login', onLogin.bind(this, this));
    ws_server.onMsg('cmdparse', onCmdParse.bind(this, this));

    this.tick_func = this.doTick.bind(this);
    this.tick_time = 250;
    this.last_tick_timestamp = Date.now();
    this.server_time = 0;
    setTimeout(this.tick_func, this.tick_time);
  }

  doTick() {
    setTimeout(this.tick_func, this.tick_time);
    let now = Date.now();
    let dt = max(0, now - this.last_tick_timestamp);
    this.last_tick_timestamp = now;
    if (dt > this.tick_time * 2) {
      // large stall, discard extra time
      dt = this.tick_time;
    }
    this.server_time += dt;
    this.ws_server.broadcast('server_time', this.server_time);
    for (let channel_id in this.channels) {
      let channel = this.channels[channel_id];
      if (channel.app_worker && channel.app_worker.tick) {
        channel.app_worker.tick(dt, this.server_time);
      }
    }
  }

  addChannelWorker(channel_type, factory) {
    this.channel_types[channel_type] = factory;
  }

  getChannelsByType(channel_type) {
    let ret = [];
    for (let channel_id in this.channels) {
      let channel_type_test = channel_id.split('.')[0];
      if (channel_type_test === channel_type) {
        ret.push(this.channels[channel_id]);
      }
    }
    return ret;
  }
}

export function create(...args) {
  return new ChannelServer(...args);
}

export function pathEscape(filename) {
  return filename.replace(/\./gu, '\\.');
}
