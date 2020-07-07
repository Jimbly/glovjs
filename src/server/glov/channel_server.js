// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const { ackWrapPakStart, ackWrapPakFinish, ackWrapPakPayload } = require('../../common/ack.js');
const assert = require('assert');
const { asyncSeries } = require('../../common/async.js');
const cmd_parse = require('../../common/cmd_parse.js');
const { ChannelWorker } = require('./channel_worker.js');
const client_comm = require('./client_comm.js');
const default_workers = require('./default_workers.js');
const { ERR_NOT_FOUND } = require('./exchange.js');
const log = require('./log.js');
const metrics = require('./metrics.js');
const packet = require('../../common/packet.js');
const { isPacket, packetCreate } = packet;
const { shutdown } = require('./server.js');
const { callEach, clone, logdata } = require('../../common/util.js');
const { inspect } = require('util');

const { max } = Math;

// Rough estimate, if over, will prevent resizing the packet
const PAK_HEADER_SIZE = 1 + // flags
  1+40 + // max channel_id length
  1+9 + // packet index
  1+100 + // source.ids (display_name, etc)
  1+16 + // message id
  1+9; // resp_pak_id


function channelServerSendFinish(pak, err, resp_func) {
  let ack_resp_pkt_id = ackWrapPakFinish(pak, err, resp_func);
  let { source, dest, msg, pkt_idx_offs } = pak.cs_data;
  delete pak.cs_data;
  let pkt_idx = source.send_pkt_idx[dest] = (source.send_pkt_idx[dest] || 0) + 1;
  let saved_offs = pak.getOffset(); // always 0, because we were made readable?
  pak.seek(pkt_idx_offs);
  pak.writeU32(pkt_idx);
  pak.seek(saved_offs);
  assert.equal(Boolean(resp_func && resp_func.expecting_response !== false), Boolean(ack_resp_pkt_id));
  if (!resp_func) {
    resp_func = function (err) {
      if (err) {
        if (err === ERR_NOT_FOUND && (typeof msg === 'number' || dest.startsWith('client.'))) {
          // not found error while acking, happens with unsubscribe, etc, right before shutdown, silently ignore
          // also, generally workers sending to clients, will often get ERR_NOT_FOUND
          //   for any packet in-flight when the client disconnects.
        } else {
          console.error(`Received unhandled error response while handling "${msg}"` +
            ` from ${source.channel_id} to ${dest}:`, err);
        }
      }
    };
  }
  function finalError(err) {
    if (ack_resp_pkt_id) {
      // Callback will never be dispatched through ack.js, remove the callback here
      delete source.resp_cbs[ack_resp_pkt_id];
    }
    pak.pool();
    return resp_func(err);
  }
  let channel_server = source.channel_server;
  let retries = 10;
  function trySend(prev_error) {
    if (!retries--) {
      console.error(`RETRIES_EXHAUSTED attempting to send ${msg} from ${source.channel_id} to ${dest}`);
      return finalError(prev_error || 'RETRIES_EXHAUSTED');
    }
    return channel_server.exchange.publish(dest, pak, function (err) {
      if (!err) {
        // Sent successfully, resp_func called when other side ack's.
        pak.pool();
        return null;
      }
      if (err !== ERR_NOT_FOUND) {
        // Some error other than not finding the destination, should we do a retry?
        return finalError(err);
      }
      // Destination not found, should we create it?
      let [dest_type, dest_id] = dest.split('.');
      let ctor = channel_server.channel_types[dest_type];
      if (!ctor) {
        return finalError('ERR_UNKNOWN_CHANNEL_TYPE');
      }
      if (!ctor.autocreate) {
        return finalError(err); // ERR_NOT_FOUND
      }
      if (ctor.subid_regex && !dest_id.match(ctor.subid_regex)) {
        return finalError('ERR_INVALID_CHANNEL_ID');
      }
      return channel_server.autoCreateChannel(dest_type, dest_id, function (err2) {
        if (err2) {
          console.info(`Error auto-creating channel ${dest}:`, err2, `retries: ${retries}`);
        }
        trySend(err);
      });
    });
  }
  if (!source.registered) {
    console.debug(`Delaying sending "${msg}" from ${source.channel_id} to ${dest}: not yet registered`);
    assert(source.no_datastore); // This must be a local channel, which all have this set
    assert(source.on_register);
    source.on_register.push(function () {
      console.debug(`Executing delayed send "${msg}" from ${source.channel_id} to ${dest}`);
      trySend();
    });
  } else {
    trySend();
  }
}

function channelServerPakSend(err, resp_func) {
  let pak = this; //eslint-disable-line no-invalid-this
  if (typeof err === 'function' && !resp_func) {
    resp_func = err;
    err = null;
  }
  channelServerSendFinish(pak, err, resp_func);
}

// source is a ChannelWorker
// dest is channel_id in the form of `type.id`
export function channelServerPak(source, dest, msg, ref_pak, q, debug_msg) {
  assert(typeof dest === 'string' && dest);
  assert(typeof msg === 'string' || typeof msg === 'number');
  assert(source.channel_id);
  if (!q && typeof msg === 'string') {
    console.debug(`${source.channel_id}->${dest}: ${msg} ${debug_msg || '(pak)'}`);
  }
  assert(source.send_pkt_idx);

  // Assume new packet needs to be comparable to old packet, in flags and size
  let pak = packetCreate(ref_pak ? ref_pak.getInternalFlags() : packet.default_flags,
    ref_pak ? ref_pak.totalSize() + PAK_HEADER_SIZE : 0);
  pak.writeFlags();
  let pkt_idx_offs = pak.getOffset();
  pak.writeU32(0);
  pak.writeAnsiString(source.channel_id);
  pak.writeJSON(source.ids || null);

  ackWrapPakStart(pak, source, msg);

  pak.cs_data = {
    msg,
    source,
    dest,
    pkt_idx_offs,
  };
  pak.send = channelServerPakSend;
  return pak;
}

export function channelServerSend(source, dest, msg, err, data, resp_func, q) {
  let is_packet = isPacket(data);
  let pak = channelServerPak(source, dest, msg, is_packet ? data : null, q || data && data.q,
    !is_packet ? `${err ? `err:${logdata(err)}` : ''} ${logdata(data)}` : null);

  if (!err) {
    ackWrapPakPayload(pak, data);
  }

  pak.send(err, resp_func);
}

class ChannelServer {
  constructor() {
    this.channel_types = {};
    this.local_channels = {};
    this.channels_creating = {}; // id -> list of callbacks
    this.last_worker = null; // For debug logging upon crash
    this.ds_store_bulk = null; // bulkdata store
    this.ds_store_meta = null; // metadata store
  }

  autoCreateChannel(channel_type, subid, cb) {
    const self = this;
    let channel_id = `${channel_type}.${subid}`;
    let cbs = this.channels_creating[channel_id];
    if (cbs) {
      cbs.push(cb);
      return;
    }
    assert(!this.local_channels[channel_id]);
    let Ctor = this.channel_types[channel_type];
    assert(Ctor);
    assert(Ctor.autocreate);

    const store_path = `${channel_type}/${channel_id}`;

    cbs = this.channels_creating[channel_id] = [cb];

    let queued_msgs = [];
    function proxyMessageHandler(message) {
      queued_msgs.push(message);
    }
    let channel_data;
    // This could be in parallel if we added code to cleanup what happens when the
    // data store loads but exchange registration fails.
    asyncSeries([
      function registerOnExchange(next) {
        self.exchange.register(channel_id, proxyMessageHandler, (err) => {
          if (err) {
            console.info(`autoCreateChannel(${channel_id}) exchange register failed:`, err);
            // someone else created an identically named channel at the same time, discard ours
          }
          next(err);
        });
      },
      function loadDataStore(next) {
        if (Ctor.prototype.no_datastore) {
          channel_data = {};
          return void next();
        }
        self.ds_store_meta.getAsync(store_path, {}, function (err, response) {
          if (err) {
            // We do not handle this - any messages sent to us have been lost, no
            // other worker will replace us, and queued_msgs will continuously grow.
            shutdown(`autoCreateChannel(${channel_id}) error loading data store: ${err}`);
            return void next(err);
          }
          channel_data = response;
          next();
        });
      },
      function createWorker(next) {
        assert(channel_data);
        assert(!self.local_channels[channel_id]);
        let channel = new Ctor(self, channel_id, channel_data);
        channel.registered = true; // Pre-registered
        self.local_channels[channel_id] = channel;
        self.exchange.replaceMessageHandler(channel_id, proxyMessageHandler, channel.handleMessage.bind(channel));
        console.log(`Auto-created channel ${channel_id} (${queued_msgs.length} ` +
          `msgs queued, ${cbs.length} cbs waiting)`);

        // Dispatch queued messages
        for (let ii = 0; ii < queued_msgs.length; ++ii) {
          channel.handleMessage(queued_msgs[ii]);
        }
        // Will next notify anyone who called autoCreateChannel (they will
        //   re-send the message that was not delivered)
        next();
      }
    ], function (err) {
      assert.equal(self.channels_creating[channel_id], cbs);
      callEach(self.channels_creating[channel_id], delete self.channels_creating[channel_id], err);
    });
  }

  createChannelLocal(channel_id) {
    assert(!this.local_channels[channel_id]);
    let channel_type = channel_id.split('.')[0];
    let Ctor = this.channel_types[channel_type];
    assert(Ctor);
    // fine whether it's Ctor.autocreate or not

    // These constructors *always* get an empty object for their metadata (nothing persisted)
    let channel = new Ctor(this, channel_id, {});
    assert(channel.no_datastore); // local channels should not be having any data persistance

    this.local_channels[channel_id] = channel;
    channel.on_register = [];
    this.exchange.register(channel.channel_id, channel.handleMessage.bind(channel), (err) => {
      // someone else create an identically named channel, shouldn't be possible to happen!
      assert(!err, `failed to register channel: ${channel.channel_id}`);
      channel.registered = true;
      callEach(channel.on_register, channel.on_register = null);
      if (channel.need_unregister) {
        this.exchange.unregister(channel_id);
      }
    });
    return channel;
  }

  removeChannelLocal(channel_id) {
    let channel = this.local_channels[channel_id];
    assert(channel);
    if (channel.registered) {
      this.exchange.unregister(channel_id);
    } else {
      channel.need_unregister = true;
    }
    delete this.local_channels[channel_id];
    // TODO: Let others know to reset/clear their packet ids going to this worker,
    // to free memory and ease re-creation later?
    this.sendAsChannelServer('channel_server', 'worker_removed', channel_id);
    //this.exchange.publish(this.csworker.channel_id, 'channel_server', ...
  }

  handleWorkerRemoved(removed_channel_id) {
    for (let channel_id in this.local_channels) {
      let channel = this.local_channels[channel_id];
      assert(channel.recv_pkt_idx);
      delete channel.recv_pkt_idx[removed_channel_id];
      assert(channel.send_pkt_idx);
      delete channel.send_pkt_idx[removed_channel_id];
    }
  }

  clientIdFromWSClient(client) {
    return `${this.csuid}-${client.id}`;
  }

  init(params) {
    let { data_stores, ws_server, exchange } = params;
    this.csuid = `${process.env.PODNAME || 'local'}-${process.pid}`;
    this.ws_server = ws_server;

    this.ds_store_bulk = data_stores.bulk;
    this.ds_store_meta = data_stores.meta;
    this.ds_store_image = data_stores.image;
    this.exchange = exchange;

    client_comm.init(this);

    default_workers.init(this);

    this.csworker = this.createChannelLocal(`channel_server.${this.csuid}`);
    // Should this happen for all channels generically?  Do we need a generic "broadcast to all user.* channels"?
    this.exchange.subscribe('channel_server', this.csworker.handleMessageBroadcast.bind(this.csworker));

    this.tick_func = this.doTick.bind(this);
    this.tick_time = 250;
    this.last_tick_timestamp = Date.now();
    this.server_time = 0;
    this.last_server_time_send = 0;
    this.server_time_send_interval = 5000;
    setTimeout(this.tick_func, this.tick_time);
  }

  doTick() {
    setTimeout(this.tick_func, this.tick_time);
    let now = Date.now();
    let dt = max(0, now - this.last_tick_timestamp);
    this.last_tick_timestamp = now;
    let stall = false;
    if (dt > this.tick_time * 2) {
      // large stall, discard extra time
      console.warn(`Late server tick: ${dt}ms elapsed, ${this.tick_time} expected,` +
        ` last tick took ${this.last_tick_time}ms`);
      dt = this.tick_time;
      stall = true;
    }
    this.server_time += dt;
    if (stall || this.server_time > this.last_server_time_send + this.server_time_send_interval) {
      let pak = this.ws_server.wsPak('server_time');
      pak.writeInt(this.server_time);
      this.ws_server.broadcastPacket(pak);
      this.last_server_time_send = this.server_time;
    }
    for (let channel_id in this.local_channels) {
      let channel = this.local_channels[channel_id];
      if (channel.tick) {
        channel.tick(dt, this.server_time);
      }
    }
    this.last_tick_time = Date.now() - now;
  }

  registerChannelWorker(channel_type, ctor, options) {
    options = options || {};
    assert(!this.channel_types[channel_type]);
    this.channel_types[channel_type] = ctor;
    ctor.autocreate = options.autocreate;
    ctor.subid_regex = options.subid_regex;

    // Register handlers
    if (!ctor.prototype.cmd_parse) {
      let cmdparser = ctor.prototype.cmd_parse = cmd_parse.create();
      if (options.cmds) {
        assert(Array.isArray(options.cmds));
        for (let ii = 0; ii < options.cmds.length; ++ii) {
          cmdparser.register(options.cmds[ii]);
        }
      }
    }
    function addUnique(map, msg, cb) {
      assert(!map[msg]);
      map[msg] = cb;
    }
    if (!ctor.prototype.handlers) {
      let allow_client_direct = ctor.prototype.allow_client_direct = clone(ctor.prototype.allow_client_direct || {});
      let handlers = ctor.prototype.handlers = {};
      if (options.handlers) {
        for (let msg in options.handlers) {
          addUnique(handlers, msg, options.handlers[msg]);
        }
      }
      if (options.client_handlers) {
        for (let msg in options.client_handlers) {
          allow_client_direct[msg] = true;
          addUnique(handlers, msg, options.client_handlers[msg]);
        }
      }
      // Built-in and default handlers
      if (!handlers.error) {
        handlers.error = ChannelWorker.prototype.handleError;
      }
      addUnique(handlers, 'subscribe', ChannelWorker.prototype.onSubscribe);
      addUnique(handlers, 'unsubscribe', ChannelWorker.prototype.onUnSubscribe);
      addUnique(handlers, 'client_changed', ChannelWorker.prototype.onClientChanged);
      addUnique(handlers, 'set_channel_data', ChannelWorker.prototype.onSetChannelData);
      allow_client_direct.set_channel_data = true;
      addUnique(handlers, 'set_channel_data_if', ChannelWorker.prototype.onSetChannelDataIf);
      addUnique(handlers, 'set_channel_data_push', ChannelWorker.prototype.onSetChannelDataPush);
      addUnique(handlers, 'get_channel_data', ChannelWorker.prototype.onGetChannelData);

      addUnique(handlers, 'broadcast', ChannelWorker.prototype.onBroadcast);
      allow_client_direct.cmdparse = true;
      addUnique(handlers, 'cmdparse', ChannelWorker.prototype.onCmdParse);
    }
    if (!ctor.prototype.filters) {
      let filters = ctor.prototype.filters = {};

      if (options.filters) {
        for (let msg in options.filters) {
          addUnique(filters, msg, options.filters[msg]);
        }
      }

      // Built-in and default filters
      if (ctor.prototype.maintain_client_list) {
        addUnique(filters, 'channel_data', ChannelWorker.prototype.onChannelData);
        addUnique(filters, 'apply_channel_data', ChannelWorker.prototype.onApplyChannelData);
      }
    }
  }

  pakAsChannelServer(dest, msg) {
    return this.csworker.pak(dest, msg);
  }
  sendAsChannelServer(dest, msg, data, resp_func) {
    this.csworker.sendChannelMessage(dest, msg, data, resp_func);
  }

  getLocalChannelsByType(channel_type) {
    let ret = [];
    for (let channel_id in this.local_channels) {
      let channel = this.local_channels[channel_id];
      if (channel.channel_type === channel_type) {
        ret.push(channel);
      }
    }
    return ret;
  }

  getStatus() {
    let lines = [];
    let num_clients = Object.keys(this.ws_server.clients).length;
    lines.push(`Clients: ${num_clients}`);
    let num_channels = {};
    let channels_verbose = {};
    for (let channel_id in this.local_channels) {
      let channel = this.local_channels[channel_id];
      let channel_type = channel.channel_type;
      channels_verbose[channel_type] = channels_verbose[channel_type] || [];
      channels_verbose[channel_type].push(channel.channel_subid);
      num_channels[channel_type] = (num_channels[channel_type] || 0) + 1;
    }
    let channels = [];
    for (let channel_type in num_channels) {
      channels.push(`${channel_type}: ${num_channels[channel_type]}`);
      metrics.set(`count.${channel_type}`, num_channels[channel_type]);
    }
    lines.push(`Channel Counts: ${channels.join(', ')}`);
    channels = [];
    for (let channel_type in channels_verbose) {
      channels.push(`${channel_type}:${channels_verbose[channel_type].join(',')}`);
    }
    lines.push(`Channels: ${channels.join(', ')}`);
    return lines.join('\n  ');
  }

  handleUncaughtError(e) {
    if (typeof e !== 'object') {
      e = new Error(e);
    }
    console.error('ERROR', new Date().toISOString(), e);
    let crash_dump = {
      err: inspect(e).split('\n'),
    };
    let cw = this.last_worker;
    if (cw) {
      crash_dump.last_channel_id = cw.channel_id;
      crash_dump.data = cw.data;
      if (cw.pkt_log) {
        let pkt_log = [];
        for (let ii = 0; ii < cw.pkt_log.length; ++ii) {
          let idx = (cw.pkt_log_idx - 1 - ii + cw.pkt_log.length) % cw.pkt_log.length;
          let entry = cw.pkt_log[idx];
          if (!entry) {
            continue;
          }
          if (typeof entry.ts === 'number') {
            entry.ts = new Date(entry.ts).toISOString();
          }
          pkt_log.push(entry);
        }
        crash_dump.pkt_log = pkt_log;
      }
    }
    let dump_file = log.dumpJSON('crash', crash_dump, 'json');
    console.error(`  Saving dump to ${dump_file}.`);
    this.csworker.sendChannelMessage('admin.admin', 'broadcast', { msg: 'chat', data: {
      msg: 'Server error occurred - check server logs'
    } });
  }
}

export function create() {
  return new ChannelServer();
}

export function pathEscape(filename) {
  return filename.replace(/\./g, '\\.');
}
