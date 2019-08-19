const ack = require('../../common/ack.js');
const assert = require('assert');
const exchange = require('./exchange.js');
const { channelServerSend } = require('./channel_server.js');
const dot_prop = require('dot-prop');

export class ChannelWorker {
  constructor(channel_server, channel_id) {
    this.channel_server = channel_server;
    this.channel_id = channel_id;
    let m = channel_id.match(/^([^.]*)\.(.*)$/); // eslint-disable-line require-unicode-regexp
    assert(m);
    this.channel_type = m[1];
    this.channel_subid = m[2];
    this.ids = null; // Any extra IDs that get send along with every packet
    this.core_ids = {
      type: this.channel_type,
      id: this.channel_subid,
      channel_id,
    };
    this.subscribers = []; // ids of who is subscribed to us
    this.store_path = `${this.channel_type}/${this.channel_id}`;
    this.data = channel_server.ds_store.get(this.store_path, '', {});
    this.data.public = this.data.public || {};
    this.data.private = this.data.private || {};
    this.data.channel_id = channel_id;
    this.subscribe_counts = {}; // refcount of subscriptions to other channels
    this.is_channel_worker = true; // TODO: Remove this?
    this.adding_client = null; // The client we're in the middle of adding, don't send them state updates yet
    ack.initReceiver(this);
    // Handle modes that can be enabled via statics on prototype
    if (this.maintain_client_list) {
      this.data.public.clients = {};
    }
  }

  numSubscribers() {
    return this.subscribers.length;
  }

  onSubscribe(src, data, resp_func) {
    let { channel_id, user_id } = src;
    let is_client = src.type === 'client';

    if (is_client && this.require_login && !user_id) {
      return resp_func('ERR_LOGIN_REQUIRED');
    }

    this.subscribers.push(channel_id);
    this.adding_client = channel_id;

    if (this.handleNewClient && !this.handleNewClient(src)) {
      this.adding_client = null;
      // not allowed, undo
      this.clients.pop();
      return resp_func('ERR_NOT_ALLOWED_BY_WORKER');
    }

    let ids;
    if ((this.emit_join_leave_events || this.maintain_client_list) && is_client) {
      // Clone, not reference, we need to know the old user id for unsubscribing!
      // Also, just need these 3 ids
      ids = {
        user_id,
        client_id: src.id,
        display_name: src.display_name,
      };
    }

    if (this.emit_join_leave_events && is_client) {
      this.channelEmit('join', ids);
    }

    if (this.maintain_client_list && is_client) {
      this.setChannelData(`public.clients.${src.id}.ids`, ids);
      if (user_id) {
        this.subscribeOther(`user.${user_id}`);
      }
    }

    this.adding_client = null;

    this.sendChannelMessage(channel_id, 'channel_data', {
      public: this.data.public,
    });
    return resp_func();
  }

  onUnSubscribe(src, data, resp_func) {
    let { channel_id, user_id } = src;
    let is_client = src.type === 'client';
    let idx = this.subscribers.indexOf(channel_id);
    if (idx === -1) {
      // This can happen if a client is unsubscribing before it got the message
      // back saying its subscription attempt failed
      return void resp_func('ERR_NOT_SUBSCRIBED');
    }
    this.subscribers.splice(idx, 1);
    if (this.handleClientDisconnect) {
      this.handleClientDisconnect(src);
    }
    if (this.emit_join_leave_events && is_client) {
      this.channelEmit('leave', src);
    }

    if (this.maintain_client_list && is_client) {
      this.setChannelData(`public.clients.${src.id}`, undefined);
      if (user_id) {
        this.unsubscribeOther(`user.${user_id}`);
      }
    }
    resp_func();
  }

  isSubscribedTo(other_channel_id) {
    return this.subscribe_counts[other_channel_id];
  }

  subscribeOther(other_channel_id) {
    this.subscribe_counts[other_channel_id] = (this.subscribe_counts[other_channel_id] || 0) + 1;
    if (this.subscribe_counts[other_channel_id] !== 1) {
      console.log(`${this.channel_id}->${other_channel_id}: subscribe - already subscribed`);
      return;
    }
    this.sendChannelMessage(other_channel_id, 'subscribe', undefined, (err, resp_data) => {
      if (err) {
        console.log(`${this.channel_id}->${other_channel_id} subscribe failed: ${err}`);
        this.subscribe_counts[other_channel_id]--;
        this.onError(err);
      } else {
        // succeeded, nothing special
      }
    });
  }
  unsubscribeOther(other_channel_id) {
    assert(this.channel_type === 'client' || this.subscribe_counts[other_channel_id]);
    if (!this.subscribe_counts[other_channel_id]) {
      console.log(`${this.channel_id}->${other_channel_id}: unsubscribe - failed: not subscribed`);
      return;
    }
    --this.subscribe_counts[other_channel_id];
    if (this.subscribe_counts[other_channel_id]) {
      console.log(`${this.channel_id}->${other_channel_id}: unsubscribe - still subscribed (refcount)`);
      return;
    }

    delete this.subscribe_counts[other_channel_id];
    // TODO: Disable autocreate for this call?
    this.sendChannelMessage(other_channel_id, 'unsubscribe', undefined, (err, resp_data) => {
      if (err === exchange.ERR_NOT_FOUND) {
        // This is fine, just ignore
        console.log(`${this.channel_id}->${other_channel_id} unsubscribe (silently) failed: ${err}`);
      } else if (err) {
        console.log(`${this.channel_id}->${other_channel_id} unsubscribe failed: ${err}`);
        this.onError(err);
      } else {
        // succeeded, nothing special
      }
    });
  }
  unsubscribeAll() {
    for (let channel_id in this.subscribe_counts) {
      let count = this.subscribe_counts[channel_id];
      for (let ii = 0; ii < count; ++ii) {
        this.unsubscribeOther(channel_id);
      }
    }
  }
  onClientChanged(src, data, resp_func) {
    let { user_id } = src;
    let client_id = src.id;
    let is_client = src.type === 'client';
    assert(is_client);
    if (this.handleClientChanged) {
      this.handleClientChanged(src);
    }
    if (this.maintain_client_list && is_client && this.data.public.clients[client_id]) {
      let old_ids = this.data.public.clients[client_id].ids || {};
      if (old_ids.user_id !== user_id) {
        if (old_ids.user_id) {
          this.unsubscribeOther(`user.${old_ids.user_id}`);
        }
        if (user_id) {
          this.subscribeOther(`user.${user_id}`);
        }
      }
      this.setChannelData(`public.clients.${client_id}.ids`, {
        user_id,
        client_id,
        display_name: src.display_name,
      });
    }
    resp_func();
  }
  onApplyChannelData(source, data) {
    if (this.maintain_client_list) {
      if (source.type === 'user' && data.key === 'public.display_name') {
        for (let client_id in this.data.public.clients) {
          let client_ids = this.data.public.clients[client_id].ids;
          if (client_ids.user_id === source.id) {
            this.setChannelData(`public.clients.${client_id}.ids.display_name`, data.value);
          }
        }
      }
    }
  }

  onChannelData(source, data) {
    if (this.maintain_client_list) {
      if (source.type === 'user' && data.public.display_name) {
        for (let client_id in this.data.public.clients) {
          let client_ids = this.data.public.clients[client_id].ids;
          if (client_ids.user_id === source.id) {
            this.setChannelData(`public.clients.${client_id}.ids.display_name`, data.public.display_name);
          }
        }
      }
    }
  }

  onBroadcast(source, data, resp_func) {
    // Replicate to all users
    data.data.client_ids = source;
    this.channelEmit(data.msg, data.data);
    resp_func();
  }

  onCmdParse(source, data, resp_func) {
    this.cmd_parse.handle(this, data, (err, resp) => {
      if (err && this.cmd_parse.was_not_found) {
        return resp_func(null, { found: 0, err });
      }
      return resp_func(err, { found: 1, resp });
    });
  }

  channelEmit(msg, data, except_client) {
    for (let ii = 0; ii < this.subscribers.length; ++ii) {
      if (this.subscribers[ii] === except_client) {
        continue;
      }
      this.sendChannelMessage(this.subscribers[ii], msg, data);
    }
  }

  onSetIfChannelData(source, data, resp_func) {
    if (source.type === 'client') {
      // deny
      return resp_func('ERR_NOT_ALLOWED');
    }
    let old_value = dot_prop.get(this.data, data.key);
    if (old_value !== data.set_if) {
      return resp_func('ERR_SETIF_MISMATCH');
    }
    this.setChannelDataInternal(source, data.key, data.value, data.q);
    return resp_func();
  }

  onSetChannelData(source, data) {
    this.setChannelDataInternal(source, data.key, data.value, data.q);
  }
  setChannelData(key, value, q) {
    this.setChannelDataInternal(this.core_ids, key, value, q);
  }

  onGetChannelData(source, data, resp_func) {
    if (source.type === 'client') {
      // deny
      return resp_func('ERR_NOT_ALLOWED');
    }
    return resp_func(null, this.getChannelData(data));
  }

  defaultHandleSetChannelData(source, key, value) { // eslint-disable-line class-methods-use-this
    if (source.type !== 'client') {
      // from another channel, accept it
      return true;
    }
    // Do not allow modifying of other users' client data
    if (key.startsWith('public.clients.')) {
      if (!key.startsWith(`public.clients.${source.id}.`)) {
        return false;
      }
      // Do not allow modifying of clients that do not exist
      if (!this.data.public.clients[source.id]) {
        return false;
      }
    }
    return true;
  }

  setChannelDataInternal(source, key, value, q) {
    assert(typeof key === 'string');
    assert(typeof source === 'object');
    if (this.handleSetChannelData ?
      !this.handleSetChannelData(source, key, value) :
      !this.defaultHandleSetChannelData(source, key, value)
    ) {
      // denied by app_worker
      console.log(' - failed handleSetChannelData() check');
      return;
    }

    if (value === undefined) {
      dot_prop.delete(this.data, key);
    } else {
      dot_prop.set(this.data, key, value);
    }
    // only send public changes
    if (key.startsWith('public')) {
      let data = { key, value };
      if (q) {
        data.q = 1;
      }
      this.channelEmit('apply_channel_data', data, this.adding_client);
    }
    this.channel_server.ds_store.set(this.store_path, '', this.data);
  }
  getChannelData(key, default_vaulue) {
    return dot_prop.get(this.data, key, default_vaulue);
  }

  sendChannelMessage(dest, msg, data, resp_func) {
    channelServerSend(this, dest, msg, null, data, resp_func);
  }

  // source has at least { channel_id, type, id }, possibly also .user_id and .display_name if type === 'client'
  channelMessage(source, msg, data, resp_func) {
    let had_handler = false;
    assert(resp_func);
    if (this.filters[msg]) {
      this.filters[msg].call(this, source, data);
      had_handler = true;
    }
    if (this.handlers[msg]) {
      this.handlers[msg].call(this, source, data, resp_func);
    } else if (this.onUnhandledMessage) {
      this.onUnhandledMessage(source, msg, data, resp_func);
    } else {
      // No use handler for this message
      if (had_handler) {
        // But, we had a filter (probably something internal) that dealt with it, silently continue;
        resp_func();
      } else {
        resp_func(`No handler registered for '${msg}'`);
      }
    }
  }

  onError(msg) {
    console.error(`ChannelWorker(${this.channel_id}) error:`, msg);
  }

  // Default error handler
  handleError(src, data, resp_func) {
    this.onError(`Unhandled error from ${src.type}.${src.id}: ${data}`);
    resp_func();
  }

  // source is a string channel_id
  handleMessage(source, net_data) {
    let channel_worker = this;
    let ids = net_data.ids || {};
    let split = source.split('.');
    assert(split.length === 2);
    ids.type = split[0];
    ids.id = split[1];
    ids.channel_id = source;

    ack.handleMessage(channel_worker, source, net_data, function sendFunc(msg, err, data, resp_func) {
      channelServerSend(channel_worker, source, msg, err, data, resp_func);
    }, function handleFunc(msg, data, resp_func) {
      channel_worker.channelMessage(ids, msg, data, resp_func);
    });
  }
}
// Overrideable by child class's prototype
ChannelWorker.prototype.maintain_client_list = false;
ChannelWorker.prototype.emit_join_leave_events = false;
ChannelWorker.prototype.require_login = false;
