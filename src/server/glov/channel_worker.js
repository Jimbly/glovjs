// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const ack = require('../../common/ack.js');
const { ackHandleMessage, ackInitReceiver } = ack;
const assert = require('assert');
const { channelServerPak, channelServerSend } = require('./channel_server.js');
const dot_prop = require('dot-prop');
const { ERR_NOT_FOUND } = require('./exchange.js');
const { min } = Math;
const { empty, logdata } = require('../../common/util.js');

// How long to wait before failing an out of order packet and running it anyway
const OOO_PACKET_FAIL = 10000; // For testing this, disable channel_server.js:handleWorkerRemoved
const AUTO_DESTROY_TIME = 90000;

// Delay subsequent writes by at least 1.5 seconds
const METADATA_COMMIT_RATELIMIT = 1500;

function throwErr(err) {
  if (err) {
    throw err;
  }
}

const PKT_LOG_SIZE = 16;
const PKT_LOG_BUF_SIZE = 32;

// We lose all undefineds when going to and from JSON, so strip them from in-memory
// representation.
function filterUndefineds(v) {
  assert(v !== undefined);
  if (Array.isArray(v)) {
    for (let ii = 0; ii < v.length; ++ii) {
      filterUndefineds(v[ii]);
    }
  } else if (typeof v === 'object') {
    for (let key in v) {
      let subv = v[key];
      if (subv === undefined) {
        delete v[key];
      } else {
        filterUndefineds(subv);
      }
    }
  }
}

// Some data stores (FireStore) cannot handle any undefined values
function anyUndefined(walk) {
  if (walk === undefined) {
    return true;
  }
  if (Array.isArray(walk)) {
    for (let ii = 0; ii < walk.length; ++ii) {
      if (anyUndefined(walk[ii])) {
        return true;
      }
    }
  } else if (typeof walk === 'object') {
    for (let key in walk) {
      if (anyUndefined(walk[key])) {
        return true;
      }
    }
  }
  return false;
}

export class ChannelWorker {
  constructor(channel_server, channel_id, channel_data) {
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
    this.send_pkt_idx = {}; // for each destination, the last ordering ID we sent
    this.recv_pkt_idx = {}; // for each source, the last ordering ID we received
    this.pkt_queue = {}; // for each source, any queued packets that need to be dispatched in order
    this.subscribers = []; // ids of who is subscribed to us
    this.store_path = `${this.channel_type}/${this.channel_id}`;
    this.bulk_store_path = `bulk/${this.channel_type}/${this.channel_id}`;
    this.bulk_store_paths = {};
    this.shutting_down = false;

    // This will always be an empty object with creating local channel
    assert(channel_data);
    this.data = channel_data;
    this.data.public = this.data.public || {};
    this.data.private = this.data.private || {};

    this.subscribe_counts = Object.create(null); // refcount of subscriptions to other channels
    this.is_channel_worker = true; // TODO: Remove this?
    this.registered = false;
    this.need_unregister = false;
    this.adding_client = null; // The client we're in the middle of adding, don't send them state updates yet
    this.last_msg_time = Date.now();
    ackInitReceiver(this);
    // Handle modes that can be enabled via statics on prototype
    if (this.maintain_client_list) {
      this.data.public.clients = {};
    }

    this.pkt_log_idx = 0;
    this.pkt_log = new Array(PKT_LOG_SIZE);

    // Data store optimisation checks
    this.set_in_flight = false;
    this.data_awaiting_set = null;
    this.last_saved_data = '';
  }

  shutdown() {
    this.shutting_down = true;
    ack.failAll(this);
    assert(!this.numSubscribers());
    assert(empty(this.subscribe_counts));
    if (this.onShutdown) {
      this.onShutdown();
    }
    // TODO: this unloading should be automatic / in lower layer, as it doesn't
    // make sense when the datastore is a database?
    if (!this.no_datastore) {
      this.channel_server.ds_store_meta.unload(this.store_path);
    }

    for (let path in this.bulk_store_paths) {
      this.channel_server.ds_store_bulk.unload(path);
    }

    this.channel_server.removeChannelLocal(this.channel_id);
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

    let err = this.handleNewClient && this.handleNewClient(src);
    if (err) {
      this.adding_client = null;
      // not allowed, undo
      this.subscribers.pop();
      return resp_func(typeof err === 'string' ? err : 'ERR_NOT_ALLOWED_BY_WORKER');
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
      if (this.getRoles) {
        let roles = {};
        if (src.admin) {
          roles.admin = 1;
        }
        this.getRoles(src, roles);
        ids.roles = roles;
      }
      this.setChannelData(`public.clients.${src.id}.ids`, ids);
      if (user_id) {
        this.subscribeOther(`user.${user_id}`);
      }
    }

    this.adding_client = null;

    // 'channel_data' is really an ack for 'subscribe' - sent exactly once
    this.sendChannelMessage(channel_id, 'channel_data', {
      public: this.data.public,
    });
    return resp_func();
  }

  isEmpty() {
    return !this.subscribers.length && empty(this.pkt_queue);
  }

  autoDestroyCheck() {
    assert(this.auto_destroy_check);
    if (!this.isEmpty()) {
      this.auto_destroy_check = false;
      // have a subscriber now, forget about it
      return;
    }
    if (Date.now() - this.last_msg_time > AUTO_DESTROY_TIME && !this.set_in_flight) {
      this.auto_destroy_check = false;
      console.info(`${this.channel_id}: Empty time expired, auto-destroying...`);
      this.shutdown();
      return;
    }
    // Continue checking
    setTimeout(this.autoDestroyCheck.bind(this), AUTO_DESTROY_TIME);
  }

  checkAutoDestroy() {
    this.last_msg_time = Date.now();
    if (this.auto_destroy && !this.auto_destroy_check && this.isEmpty()) {
      this.auto_destroy_check = true;
      setTimeout(this.autoDestroyCheck.bind(this), AUTO_DESTROY_TIME);
    }
  }

  onUnSubscribe(src, data, resp_func) {
    let { channel_id } = src;
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
      let user_id = this.getChannelData(`public.clients.${src.id}.ids.user_id`);
      this.setChannelData(`public.clients.${src.id}`, undefined);
      if (user_id) {
        this.unsubscribeOther(`user.${user_id}`);
      }
    }
    resp_func();
    this.checkAutoDestroy();
  }

  isSubscribedTo(other_channel_id) {
    return this.subscribe_counts[other_channel_id];
  }

  subscribeOther(other_channel_id, resp_func) {
    this.subscribe_counts[other_channel_id] = (this.subscribe_counts[other_channel_id] || 0) + 1;
    if (this.subscribe_counts[other_channel_id] !== 1) {
      console.debug(`${this.channel_id}->${other_channel_id}: subscribe - already subscribed`);
      return;
    }
    this.sendChannelMessage(other_channel_id, 'subscribe', undefined, (err, resp_data) => {
      if (err) {
        console.log(`${this.channel_id}->${other_channel_id} subscribe failed: ${err}`);
        this.subscribe_counts[other_channel_id]--;
        if (!this.subscribe_counts[other_channel_id]) {
          delete this.subscribe_counts[other_channel_id];
        }
        if (resp_func) {
          resp_func(err);
        } else {
          this.onError(err);
        }
      } else {
        // succeeded, nothing special
        if (resp_func) {
          resp_func();
        }
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
      console.debug(`${this.channel_id}->${other_channel_id}: unsubscribe - still subscribed (refcount)`);
      return;
    }

    delete this.subscribe_counts[other_channel_id];
    // TODO: Disable autocreate for this call?
    this.sendChannelMessage(other_channel_id, 'unsubscribe', undefined, (err, resp_data) => {
      if (err === ERR_NOT_FOUND || err && this.shutting_down) {
        // This is fine, just ignore
        console.debug(`${this.channel_id}->${other_channel_id} unsubscribe (silently) failed: ${err}`);
      } else if (err) {
        console.error(`${this.channel_id}->${other_channel_id} unsubscribe failed: ${err}`);
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
  pak(dest, msg, ref_pak) {
    return channelServerPak(this, dest, msg, ref_pak);
  }
  setChannelDataOnOther(channel_id, key, value, resp_func) {
    let pak = this.pak(channel_id, 'set_channel_data');
    pak.writeBool(false);
    pak.writeAnsiString(key);
    pak.writeJSON(value);
    pak.send(resp_func);
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

  // data is a { key, value } pair of what has changed
  onApplyChannelData(source, data) {
    if (this.maintain_client_list) {
      if (source.type === 'user' && data.key === 'public.display_name') {
        for (let client_id in this.data.public.clients) {
          let client_ids = this.data.public.clients[client_id].ids;
          if (client_ids && client_ids.user_id === source.id) {
            this.setChannelData(`public.clients.${client_id}.ids.display_name`, data.value);
          }
        }
      }
    }
  }

  // data is the channel's entire (public) data sent in response to a subscribe
  onChannelData(source, data) {
    if (this.maintain_client_list) {
      if (source.type === 'user' && data.public.display_name) {
        for (let client_id in this.data.public.clients) {
          let client_ids = this.data.public.clients[client_id].ids;
          if (client_ids && client_ids.user_id === source.id) {
            this.setChannelData(`public.clients.${client_id}.ids.display_name`, data.public.display_name);
          }
        }
      }
    }
  }

  onBroadcast(source, data, resp_func) {
    if (typeof data !== 'object' || typeof data.data !== 'object' || typeof data.msg !== 'string') {
      return resp_func('ERR_INVALID_DATA');
    }
    if (source.type === 'client') {
      if (this.allow_client_broadcast[data.msg] !== true) {
        return resp_func('ERR_NOT_ALLOWED');
      }
    }
    if (data.err) { // From a filter
      return resp_func(data.err);
    }
    // Replicate to all users
    data.data.client_ids = source;
    this.channelEmit(data.msg, data.data);
    return resp_func();
  }

  onCmdParse(source, data, resp_func) {
    this.cmd_parse_source = source;
    if (this.getRoles) {
      let client_id = source.id;
      this.access = this.getChannelData(`public.clients.${client_id}.ids.roles`, {});
    } else {
      this.access = source; // for cmd_parse access checking rules
    }
    this.cmd_parse.handle(this, data, (err, resp) => {
      if (err && this.cmd_parse.was_not_found) {
        return resp_func(null, { found: 0, err });
      }
      return resp_func(err, { found: 1, resp });
    });
  }

  channelEmit(msg, data, except_client) {
    let count = 0;
    let was_q = false;
    if (typeof data === 'object') {
      was_q = data.q;
      data.q = 1;
    }
    for (let ii = 0; ii < this.subscribers.length; ++ii) {
      if (this.subscribers[ii] === except_client) {
        continue;
      }
      ++count;
      this.sendChannelMessage(this.subscribers[ii], msg, data);
    }
    if (count && !was_q) {
      console.debug(`${this.channel_id}->broadcast(${count}): ${msg} ${logdata(data)}`);
    }
  }

  onSetChannelDataIf(source, pak, resp_func) {
    if (source.type === 'client') {
      // deny
      return resp_func('ERR_NOT_ALLOWED');
    }
    let q = false;
    let key = pak.readAnsiString();
    let value = pak.readJSON();
    let set_if = pak.readJSON();
    let old_value = dot_prop.get(this.data, key);
    if (old_value !== set_if) {
      return resp_func('ERR_SETIF_MISMATCH');
    }
    this.setChannelDataInternal(source, key, value, q);
    return resp_func();
  }

  commitData() {
    const self = this;
    let data = this.data;

    if (this.maintain_client_list) {
      data = {};
      for (let key in this.data) {
        data[key] = this.data[key];
      }
      let public_data = data.public;
      assert(public_data);
      let pd = {};
      for (let key in public_data) {
        if (key !== 'clients') {
          pd[key] = public_data[key];
        }
      }
      data.public = pd;
    }

    if (anyUndefined(data)) {
      console.log('Undefined value found in channel data:', data);
      assert(false, 'Undefined value found in channel data');
    }

    // Mark this data as awaiting to be set
    this.data_awaiting_set = data;

    // Make sure no more than one write is in flight to avoid corrupted/overlapped data
    if (this.set_in_flight) {
      return;
    }

    // Set data to store along with setting checks to make sure no more than one sets are in flight
    function safeSet() {
      const incoming_data = self.data_awaiting_set;
      const data_to_compare = JSON.stringify(incoming_data);
      self.data_awaiting_set = null;

      // Do not write to datastore if nothing has changed
      if (data_to_compare === self.last_saved_data) {
        return;
      }

      self.last_saved_data = data_to_compare;
      self.set_in_flight = true;

      self.channel_server.ds_store_meta.setAsync(self.store_path, '', incoming_data, function (err) {
        if (err) {
          throw err;
        }
        // Delay the next write
        setTimeout(function () {
          self.set_in_flight = false;

          // data in memory was updated again in mid flight so we need to set to store again with the new data
          if (self.data_awaiting_set) {
            safeSet();
          }
        }, METADATA_COMMIT_RATELIMIT);
      });
    }

    safeSet();
  }

  onSetChannelDataPush(source, pak, resp_func) {
    let q = false;
    let key = pak.readAnsiString();
    let value = pak.readJSON();
    if (this.handleSetChannelData ?
      !this.handleSetChannelData(source, key, value) :
      !this.defaultHandleSetChannelData(source, key, value)
    ) {
      // denied by app_worker
      console.log(`set_channel_data_push on ${key} from ${source.channel_id} failed handleSetChannelData() check`);
      return resp_func('ERR_APP_WORKER');
    }
    assert(value);
    filterUndefineds(value);
    let arr = dot_prop.get(this.data, key);
    let need_create = !arr;
    if (need_create) {
      arr = [];
    }
    if (!Array.isArray(arr)) {
      return resp_func('ERR_NOT_ARRAY');
    }

    let idx = arr.push(value) - 1;
    if (need_create) {
      dot_prop.set(this.data, key, arr);
    } else {
      // array was modified in-place
    }
    // only send public changes
    if (key.startsWith('public')) {
      let mod_data;
      if (need_create) {
        mod_data = { key, value: arr, q };
      } else {
        mod_data = { key: `${key}.${idx}`, value, q };
      }
      this.channelEmit('apply_channel_data', mod_data, this.adding_client);
    }
    this.commitData();
    return resp_func();
  }

  onSetChannelData(source, pak, resp_func) {
    let q = pak.readBool();
    let key = pak.readAnsiString();
    let value = pak.readJSON();
    this.setChannelDataInternal(source, key, value, q, resp_func);
  }
  setChannelData(key, value, q) {
    this.setChannelDataInternal(this.core_ids, key, value, q);
  }

  onGetChannelData(source, data, resp_func) {
    // Do not deny this here, this is handled by RESERVED in client_comm.js
    // We want the client_comm functions to send this message if needed.
    // if (source.type === 'client') {
    //   // deny
    //   return resp_func('ERR_NOT_ALLOWED');
    // }
    return resp_func(null, this.getChannelData(data));
  }

  defaultHandleSetChannelData(source, key, value) { // eslint-disable-line class-methods-use-this
    if (source.type !== 'client' || !source.direct) {
      // from another channel, or not directly from the user, accept it
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
      return true;
    }
    return this.permissive_client_set; // default false - don't let clients change anything other than their own data
  }

  setChannelDataInternal(source, key, value, q, resp_func) {
    assert(typeof key === 'string');
    assert(typeof source === 'object');
    if (this.handleSetChannelData ?
      !this.handleSetChannelData(source, key, value) :
      !this.defaultHandleSetChannelData(source, key, value)
    ) {
      // denied by app_worker
      console.log(`setChannelData on ${key} from ${source.channel_id} failed handleSetChannelData() check`);
      if (resp_func) {
        resp_func('ERR_INTERNAL');
      }
      return;
    }

    if (value === undefined) {
      dot_prop.delete(this.data, key);
    } else {
      filterUndefineds(value);
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
    if (!this.maintain_client_list || !key.startsWith('public.clients.')) {
      this.commitData();
    }
    if (resp_func) {
      resp_func();
    }
  }
  getChannelData(key, default_value) {
    return dot_prop.get(this.data, key, default_value);
  }

  getBulkChannelData(obj_name, default_value, cb) {
    let bulk_obj_name = `${this.bulk_store_path}/${obj_name}`;
    this.bulk_store_paths[bulk_obj_name] = true;
    this.channel_server.ds_store_bulk.getAsync(bulk_obj_name, '', default_value, cb);
  }
  getBulkChannelBuffer(obj_name, cb) {
    let bulk_obj_name = `${this.bulk_store_path}/${obj_name}`;
    this.bulk_store_paths[bulk_obj_name] = true;
    this.channel_server.ds_store_bulk.getAsyncBuffer(bulk_obj_name, cb);
  }
  setBulkChannelData(obj_name, value, cb) {
    let bulk_obj_name = `${this.bulk_store_path}/${obj_name}`;
    this.bulk_store_paths[bulk_obj_name] = true;
    this.channel_server.ds_store_bulk.setAsync(bulk_obj_name, '', value, cb || throwErr);
  }
  setBulkChannelBuffer(obj_name, value, cb) {
    assert(Buffer.isBuffer(value));
    let bulk_obj_name = `${this.bulk_store_path}/${obj_name}`;
    this.bulk_store_paths[bulk_obj_name] = true;
    this.channel_server.ds_store_bulk.setAsync(bulk_obj_name, '', value, cb || throwErr);
  }

  sendChannelMessage(dest, msg, data, resp_func) {
    channelServerSend(this, dest, msg, null, data, resp_func);
  }

  // source has at least { channel_id, type, id }, possibly also .user_id and .display_name if type === 'client'
  channelMessage(source, msg, data, resp_func) {
    if (source.direct) {
      // Ensure this is allowed directly from clients
      if (!this.allow_client_direct[msg]) {
        return void resp_func(`ERR_CLIENT_DIRECT (${msg})`);
      }
    }
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

  checkPacketQueue(source) {
    let q_data = this.pkt_queue[source];
    if (!q_data) {
      return;
    }
    let q = q_data.pkts;
    let next_idx = (this.recv_pkt_idx[source] || 0) + 1;
    let next = q[next_idx];
    if (next) {
      // Next one is ready to go now!
      console.error(`${this.channel_id}: Delayed dispatching OOO packet with ID ${next_idx} from ${source}.`);
      delete q[next_idx];
      if (empty(q)) {
        if (q_data.tid) {
          clearTimeout(q_data.tid);
        }
        delete this.pkt_queue[source];
      }
      // TODO: Make this not deeply recursive?
      this.dispatchPacket(next_idx, next.source, next.pak);
    }
  }

  startPacketQueueCheck(source) {
    let q_data = this.pkt_queue[source];
    assert(q_data);
    assert(!q_data.tid);
    q_data.tid = setTimeout(this.checkPacketQueueTimeout.bind(this, source), OOO_PACKET_FAIL);
    // Could also send a ping here and fulfill this timeout when it comes back, but
    // a ping is not guaranteed to arrive after all packets, since if there
    // are multiple sources sending packets, one (that does not do the create)
    // may still be trying to resend the initial packet (waiting on their (going
    // to fail) create to finish) when the ping makes it. Could send a more
    // complicated "request for flush to target" that doesn't return until all
    // retries are sent, and that would do it.
  }

  checkPacketQueueTimeout(source) {
    let q_data = this.pkt_queue[source];
    q_data.tid = null;
    let q = q_data.pkts;
    assert(!empty(q));
    let oldest_pkt_id = Infinity;
    for (let pkt_id in q) {
      oldest_pkt_id = min(oldest_pkt_id, Number(pkt_id));
    }
    let next_idx = oldest_pkt_id;
    let expected_idx = (this.recv_pkt_idx[source] || 0) + 1;
    let next = q[next_idx];
    console.error(`${this.channel_id}: Time expired. Running queued OOO packet with ID ${
      next_idx} (expected ${expected_idx}) from ${source}.`);
    delete q[next_idx];
    if (empty(q)) {
      delete this.pkt_queue[source];
    }
    this.dispatchPacket(next_idx, next.source, next.pak);
    // also dispatches any sequential queued up, and may clear/invalidate q_data
    if (this.pkt_queue[source]) {
      // still have remaining, non-sequential packets (untested, unexpected)
      console.error(`${this.channel_id}: Still remaining packets from ${source}. Queuing...`);
      this.startPacketQueueCheck(source);
    }
  }

  dispatchPacket(pkt_idx, source, pak) {
    let ids = pak.readJSON() || {};
    let split = source.split('.');
    assert.equal(split.length, 2);
    ids.type = split[0];
    ids.id = split[1];
    ids.channel_id = source;

    let channel_worker = this;
    channel_worker.logPacketDispatch(source, pak);
    channel_worker.channel_server.last_worker = channel_worker;
    channel_worker.recv_pkt_idx[source] = pkt_idx;
    try {
      ackHandleMessage(channel_worker, source, pak, function sendFunc(msg, err, data, resp_func) {
        channelServerSend(channel_worker, source, msg, err, data, resp_func);
      }, function packFunc(msg, ref_pak) {
        return channelServerPak(channel_worker, source, msg, ref_pak);
      }, function handleFunc(msg, data, resp_func) {
        channel_worker.channelMessage(ids, msg, data, resp_func);
      });
    } catch (e) {
      e.source = source;
      console.error(`Exception while handling packet from "${source}"`);
      channel_worker.channel_server.handleUncaughtError(e);
    }
    this.checkPacketQueue(source);
  }

  handleMessage(pak) {
    let channel_worker = this;
    pak.readFlags();
    // source is a string channel_id
    let pkt_idx = pak.readU32();
    let source = pak.readAnsiString();
    assert(pkt_idx);
    let expected_idx = (this.recv_pkt_idx[source] || 0) + 1;
    function dispatch() {
      channel_worker.dispatchPacket(pkt_idx, source, pak);
    }
    if (pkt_idx === expected_idx) {
      dispatch();
    } else if (pkt_idx === 1) {
      console.error(`${channel_worker.channel_id}: Received new initial packet with ID ${pkt_idx
      } (expected >=${expected_idx}) from ${source}. Dispatching...`);
      dispatch();
    } else {
      console.error(`${channel_worker.channel_id}: Received OOO packet with ID ${pkt_idx
      } (expected ${expected_idx}) from ${source}. Queuing...`);
      let q_data = channel_worker.pkt_queue[source] = channel_worker.pkt_queue[source] || { pkts: {} };
      q_data.pkts[pkt_idx] = { source, pak };
      if (!q_data.tid) {
        this.startPacketQueueCheck(source);
      }
    }
    this.checkAutoDestroy();
  }

  logPacketDispatch(source, pak) {
    let ple = this.pkt_log[this.pkt_log_idx];
    if (!ple) {
      ple = this.pkt_log[this.pkt_log_idx] = { data: Buffer.alloc(PKT_LOG_BUF_SIZE) };
    }
    // Copy first PKT_LOG_BUF_SIZE bytes for logging
    let buf = pak.getBuffer();
    let buf_len = pak.getBufferLen();
    let buf_offs = pak.getOffset();
    let data_len = min(PKT_LOG_BUF_SIZE, buf_len - buf_offs);
    ple.ts = Date.now();
    ple.source = source;
    Buffer.prototype.copy.call(buf, ple.data, 0, buf_offs, buf_offs + data_len);
    ple.data_len = data_len;
    this.pkt_log_idx = (this.pkt_log_idx + 1) % PKT_LOG_SIZE;
  }
}
// Overrideable by child class's prototype
ChannelWorker.prototype.maintain_client_list = false;
ChannelWorker.prototype.emit_join_leave_events = false;
ChannelWorker.prototype.require_login = false;
ChannelWorker.prototype.auto_destroy = false;
ChannelWorker.prototype.permissive_client_set = false; // allow clients to set arbitrary data
ChannelWorker.prototype.allow_client_broadcast = {}; // default: none
ChannelWorker.prototype.allow_client_direct = {}; // default: none; but use client_handlers to more easily fill this
ChannelWorker.prototype.no_datastore = false; // always assume datastore usage
