// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

export const LOAD_REPORT_INTERVAL = 15000;
const EXCHANGE_PING_INTERVAL = 1000; // Affects `exchange_pings`, should be 1s
export const PAK_HINT_NEWSEQ = 0x80000000;
export const PAK_ID_MASK = ~PAK_HINT_NEWSEQ;

const { ackWrapPakStart, ackWrapPakFinish, ackWrapPakPayload } = require('../../common/ack.js');
const assert = require('assert');
const { asyncSeries } = require('../../common/async.js');
const cmd_parse = require('../../common/cmd_parse.js');
const { cwstats, ChannelWorker, UNACKED_PACKET_ASSUME_GOOD } = require('./channel_worker.js');
const client_comm = require('./client_comm.js');
const { ds_stats, dataStoreMonitorFlush } = require('./data_store.js');
const { dss_stats } = require('./data_store_shield.js');
const default_workers = require('./default_workers.js');
const { ERR_NOT_FOUND } = require('./exchange.js');
const log = require('./log.js');
const { logEx } = log;
const { min, round } = Math;
const metrics = require('./metrics.js');
const os = require('os');
const packet = require('../../common/packet.js');
const { isPacket, packetCreate } = packet;
const { panic } = require('./server.js');
const { processUID } = require('./server_config.js');
const { callEach, clone, cloneShallow, logdata, once } = require('../../common/util.js');
const { inspect } = require('util');
const { wsstats } = require('../../common/wscommon.js');

const { max } = Math;

// Rough estimate, if over, will prevent resizing the packet
const PAK_HEADER_SIZE = 1 + // flags
  1+40 + // max channel_id length
  1+9 + // packet index
  1+100 + // source.ids (display_name, etc)
  1+16 + // message id
  1+9; // resp_pak_id

function getDebugAddr() {
  let ret = {};
  if (process.env.PODIP) {
    ret.podip = process.env.PODIP;
  }
  if (process.env.PODNAME) {
    ret.podname = process.env.PODNAME;
  }
  ret.pid = process.pid;
  let ifaces = os.networkInterfaces();
  ret.ips = [];
  for (let key in ifaces) {
    let values = ifaces[key];
    let best = null;
    for (let ii = 0; ii < values.length; ++ii) {
      let v = values[ii];
      if (v.internal) {
        continue;
      }
      if (!best || v.family === 'IPv4' && best.family !== 'IPv4') {
        best = v;
      }
    }
    if (best) {
      ret.ips.push(best.address);
    }
  }
  return ret;
}

function channelServerSendFinish(pak, err, resp_func) {
  if (resp_func) {
    // This function will get called twice if we have a network disconnect
    //   (ERR_FAILALL_DISCONNECT triggered by ack.js) *and* a low-level failure
    //   (e.g. ERR_NOT_FOUND trying to send the message).
    resp_func = once(resp_func);
  }
  let ack_resp_pkt_id = ackWrapPakFinish(pak, err, resp_func);
  let { source, dest, msg, pkt_idx_offs, no_create } = pak.cs_data;
  delete pak.cs_data;
  let channel_server = source.channel_server;
  source.pkt_idx_timestamp[dest] = channel_server.server_time;
  let pkt_idx = source.send_pkt_idx[dest] = (source.send_pkt_idx[dest] || 0) + 1;
  // Was the last packet we sent ack'd (should this packet be processed immediately upon receipt)?
  let pair;
  let pak_new_seq = pkt_idx === 1 || source.send_pkt_ackd[dest] === pkt_idx - 1 ||
    // Or, was the last packet we sent something that does not need to be ack'd,
    //   but it's been long enough to assume it's been delivered?
    (pair = source.send_pkt_unackd[dest]) && pair[0] === pkt_idx - 1 &&
    channel_server.server_time - pair[1] > UNACKED_PACKET_ASSUME_GOOD;
  let saved_offs = pak.getOffset(); // always 0, because we were made readable?
  pak.seek(pkt_idx_offs);
  pak.writeU32((pkt_idx & PAK_ID_MASK) | (pak_new_seq ? PAK_HINT_NEWSEQ : 0));
  pak.seek(saved_offs);
  let expecting_response = Boolean(resp_func && resp_func.expecting_response !== false);
  assert.equal(expecting_response, Boolean(ack_resp_pkt_id));
  if (expecting_response) {
    // Wrap this so we track if it was ack'd
    assert(source.resp_cbs[ack_resp_pkt_id]);
    assert.equal(source.resp_cbs[ack_resp_pkt_id], resp_func);
    source.resp_cbs[ack_resp_pkt_id] = function (err, resp) {
      // Acks may not be in order, so we just care about the highest id,
      // everything sent before that *must* have been dispatched, even if not
      // yet ack'd.  Similarly, don't reset to a lower id when a slow operation's
      // ack comes back.
      if (!source.send_pkt_ackd[dest] || pkt_idx > source.send_pkt_ackd[dest]) {
        source.send_pkt_ackd[dest] = pkt_idx;
      }
      resp_func(err, resp);
    };
  } else {
    source.send_pkt_unackd[dest] = [pkt_idx, channel_server.server_time];
  }
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
  const MAX_RETRIES = 10;
  let retries = 0;
  function trySend(prev_error) {
    if (retries++ === MAX_RETRIES) {
      console.error(`RETRIES_EXHAUSTED attempting to send ${msg} from ${source.channel_id} to ${dest}`);
      return finalError(prev_error || 'RETRIES_EXHAUSTED');
    }
    return channel_server.exchange.publish(dest, pak, function (err) {
      if (!err) {
        // Sent successfully, resp_func called when other side ack's.
        pak.pool();
        return null;
      }
      if (err !== ERR_NOT_FOUND || no_create) {
        // Some error other than not finding the destination, should we do a retry?
        return finalError(err);
      }
      // Destination not found, should we create it?
      let [dest_type, dest_id] = dest.split('.');
      let ctor = channel_server.channel_types[dest_type];
      if (!ctor) {
        return finalError('ERR_UNKNOWN_CHANNEL_TYPE');
      }
      if (ctor.subid_regex && !dest_id.match(ctor.subid_regex)) {
        return finalError('ERR_INVALID_CHANNEL_ID');
      }
      if (dest_type === 'master') {
        // Only kind that is not "autocreate" but should eventually exist?
        return setTimeout(trySend.bind(null, err), 100 + min(retries * retries * 100, 5000));
      }
      if (!ctor.autocreate) {
        return finalError(err); // ERR_NOT_FOUND
      }
      return channel_server.autoCreateChannelSomewhere(dest_type, dest_id, function (err2) {
        if (err2) {
          console.info(`Error auto-creating channel ${dest}:`, err2, `retries: ${retries}`);
        }
        // Maybe panic if retries exhausted and error is ERR_NOT_FOUND?
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

export function quietMessage(msg, payload) {
  // FRVR - maybe generalize this?
  return msg === 'set_user' && payload && payload.key === 'pos' ||
    msg === 'vd_get' || msg === 'claim' || msg === 'dig';
}

// source is a ChannelWorker
// dest is channel_id in the form of `type.id`
export function channelServerPak(source, dest, msg, ref_pak, q, debug_msg) {
  assert(typeof dest === 'string' && dest);
  assert(typeof msg === 'string' || typeof msg === 'number');
  assert(source.channel_id);
  assert(!source.shutting_down); // or already shut down - will be OOO and will not get responses!
  if (!q && typeof msg === 'string' && !quietMessage(msg)) {
    let ctx = {};
    let ids = source.channel_id.split('.');
    ctx[ids[0]] = ids[1];
    ids = dest.split('.');
    ctx[ids[0]] = ids[1];
    if (source.log_user_id) {
      // Log user_id of the initiating user, if applicable
      ctx.user_id = source.log_user_id;
    }
    logEx(ctx, 'debug', `${source.channel_id}->${dest}: ${msg} ${debug_msg || '(pak)'}`);
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

export function channelServerSendNoCreate(source, dest, msg, err, data, resp_func, q) {
  let is_packet = isPacket(data);
  let pak = channelServerPak(source, dest, msg, is_packet ? data : null, q || data && data.q,
    !is_packet ? `${err ? `err:${logdata(err)}` : ''} ${logdata(data)}` : null);
  pak.cs_data.no_create = true;

  if (!err) {
    ackWrapPakPayload(pak, data);
  }

  pak.send(err, resp_func);
}

function osCPUusage() {
  let cpus = os.cpus();
  let total = { used: 0, idle: 0 };
  for (let ii = 0; ii < cpus.length; ++ii) {
    let cpu = cpus[ii].times;
    total.used += cpu.user + cpu.nice + cpu.sys + cpu.irq;
    total.idle += cpu.idle;
  }
  return total;
}

class ChannelServer {
  constructor() {
    this.channel_types = {};
    this.local_channels = {};
    this.channels_creating = {}; // id -> list of callbacks
    this.channels_creating_here = {}; // id -> true
    this.last_worker = null; // For debug logging upon crash
    this.ds_store_bulk = null; // bulkdata store
    this.ds_store_meta = null; // metadata store
    this.master_stats = { num_channels: {} };
    this.load_log = false;
    this.restarting = false;
  }

  // The master requested that we create a worker
  handleWorkerCreate(pak, resp_func) {
    let channel_type = pak.readAnsiString();
    let subid = pak.readAnsiString();
    this.autoCreateChannelHere(channel_type, subid, resp_func);
  }

  // auto create channel that can make use of cloud store
  autoCreateChannelHere(channel_type, subid, cb) {
    const self = this;
    let channel_id = `${channel_type}.${subid}`;
    if (this.local_channels[channel_id] || this.channels_creating_here[channel_id]) {
      // Already exists, and it exists here!
      // Happens if this server received an earlier create request, then it timed
      //   out on the master worker, then the master sent a new create request
      //   to us again.
      return void cb('ERR_ALREADY_EXISTS');
    }
    let Ctor = this.channel_types[channel_type];
    assert(Ctor);
    assert(Ctor.autocreate);
    this.channels_creating_here[channel_id] = true;

    const store_path = `${channel_type}/${channel_id}`;

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
            console.info(`autoCreateChannelHere(${channel_id}) exchange register failed:`, err);
            // someone else created an identically named channel at the same time, discard ours
          }
          // Call callback as soon as the exchange is registered, others can start sending packets
          cb(err);
          cb = null;
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
            panic(`autoCreateChannelHere(${channel_id}) error loading data store: ${err}`);
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
        console.log(`Auto-created channel ${channel_id} (${queued_msgs.length} msgs queued)`);

        // Dispatch queued messages
        for (let ii = 0; ii < queued_msgs.length; ++ii) {
          channel.handleMessage(queued_msgs[ii]);
        }
        // Will next notify anyone who called autoCreateChannel (they will
        //   re-send the message that was not delivered)
        next();
      }
    ], function (err) {
      delete self.channels_creating_here[channel_id];
      if (cb) {
        cb(err);
      }
    });
  }

  // ask the master to create a channel for us
  autoCreateChannelSomewhere(channel_type, subid, cb) {
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

    cbs = this.channels_creating[channel_id] = [cb];

    let pak = this.csworker.pak('master.master', 'worker_create_req');
    pak.writeAnsiString(channel_type);
    pak.writeAnsiString(subid);
    pak.send(function (err) {
      if (err === 'ERR_NOT_FOUND') {
        // This might be that the master was not found (bad), but could also just be
        //   that the master tried to spawn the worker on a ChannelServer that is not
        //   found (just restarted), and returned the error.  Retrying should resolve.
        console.warn(`Error asking master worker to start ${channel_type}.${subid}`);
        // Callers should retry
      }
      assert.equal(self.channels_creating[channel_id], cbs);
      callEach(self.channels_creating[channel_id], delete self.channels_creating[channel_id], err);
    });
  }

  createChannelLocal(channel_id) {
    assert(!this.local_channels[channel_id]);
    let channel_type = channel_id.split('.')[0];
    let subid = channel_id.split('.')[1];
    let Ctor = this.channel_types[channel_type];
    assert(Ctor);
    // fine whether it's Ctor.autocreate or not

    if (Ctor.subid_regex && !subid.match(Ctor.subid_regex)) {
      assert(false, `Channel ${channel_type}.${subid} does not match subid_regex`);
    }

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
        // `client` type channel self-destructed before we finished registering
        this.exchange.unregister(channel_id);
      }
    });
    return channel;
  }

  removeChannelLocal(channel_id, do_unregister) {
    let channel = this.local_channels[channel_id];
    assert(channel);
    if (do_unregister) {
      if (channel.registered) {
        this.exchange.unregister(channel_id);
      } else {
        channel.need_unregister = true;
      }
    }
    delete this.local_channels[channel_id];
    // No longer broadcasting worker_removed, the PAK_HINT_NEWSEQ logic should
    //   handle this:
    // // Let others know to reset/clear their packet ids going to this worker,
    // // to free memory and ease re-creation later?
    // this.sendAsChannelServer('channel_server', 'worker_removed', channel_id);
  }

  handleMasterStartup() {
    this.csworker.debug('received master_startup');
    this.load_report_time = 1; // report immediately
  }

  handleMasterStats(data) {
    this.master_stats = data;
  }

  monitorRestart() {
    if (!this.restarting) {
      this.monitor_restart_scheduled = false;
      return;
    }

    let stats = {
      get: ds_stats.get + dss_stats.get,
      set: ds_stats.set + dss_stats.set,
    };
    let send_stats = {
      get: stats.get - this.restart_last_stats.get,
      set: stats.set - this.restart_last_stats.set,
      inflight_set: ds_stats.inflight_set + dss_stats.inflight_set + (this.waiting_to_monitor_flush ? 1 : 0),
    };
    let is_zeroes = !send_stats.get && !send_stats.set && !send_stats.inflight_set;
    if (this.force_shutdown) {
      // no longer reporting to master
      if (!send_stats.set && !send_stats.inflight_set) {
        process.stdout.write('Shutting down!\n', () => {
          process.exit(0);
        });
      } else {
        setTimeout(this.monitorRestart.bind(this), 1000);
      }
    } else if (is_zeroes && this.restart_last_was_zeroes) {
      // we're idle; send nothing
      setTimeout(this.monitorRestart.bind(this), 1000);
    } else {
      this.csworker.debug(`sending monitor_restart: ${JSON.stringify(send_stats)}`);
      this.csworker.sendChannelMessage('master.master', 'monitor_restart', send_stats, () => {
        setTimeout(this.monitorRestart.bind(this), 1000);
      });
    }
    this.restart_last_stats = stats;
    this.restart_last_was_zeroes = is_zeroes;
  }

  handleRestarting(data) {
    let was_restarting = this.restarting;
    this.csworker.log(`restarting = ${data}`);
    this.ws_server.restarting = this.restarting = data;
    this.ws_server.broadcast('restarting', data);
    if (this.restarting && !was_restarting) {
      this.waiting_to_monitor_flush = true;
      this.restart_last_stats = {
        get: ds_stats.get + dss_stats.get,
        set: ds_stats.set + dss_stats.set,
      };
      // Delay monitoring the data store flush until async and rate-limited writes (e.g. metadata) have been queued
      setTimeout(() => {
        this.waiting_to_monitor_flush = false;
        dataStoreMonitorFlush();
      }, 2000);
      if (!this.monitor_restart_scheduled) {
        this.monitor_restart_scheduled = true;
        this.monitorRestart();
      }
    }
  }
  forceShutdown() {
    this.force_shutdown = true;
    this.handleRestarting(true);
    this.ws_server.close();
  }

  handleChatBroadcast(data) {
    let { ws_server } = this;
    for (let client_id in ws_server.clients) {
      let client = ws_server.clients[client_id];
      if (client) {
        if (data.sysadmin) { // Send to system admins only
          let { client_channel } = client;
          if (!client_channel || !client_channel.ids || !client_channel.ids.sysadmin) {
            continue;
          }
        }
        client.send('chat_broadcast', data);
      }
    }
  }

  clientIdFromWSClient(client) {
    return `${this.csuid}-${client.id}`;
  }

  init(params) {
    let { data_stores, ws_server, exchange, is_master } = params;
    this.csuid = processUID();
    this.ws_server = ws_server;

    this.debug_addr = getDebugAddr();

    this.ds_store_bulk = data_stores.bulk;
    this.ds_store_meta = data_stores.meta;
    this.ds_store_image = data_stores.image;
    this.exchange = exchange;

    client_comm.init(this);

    default_workers.init(this);

    if (is_master) {
      this.createChannelLocal('master.master');
    }

    this.csworker = this.createChannelLocal(`channel_server.${this.csuid}`);
    // Should this happen for all channels generically?  Do we need a generic "broadcast to all user.* channels"?
    this.exchange.subscribe('channel_server', this.csworker.handleMessageBroadcast.bind(this.csworker));

    this.tick_func = this.doTick.bind(this);
    this.tick_time = 250;
    this.last_tick_timestamp = Date.now();
    this.server_time = 0;
    this.last_server_time_send = 0;
    this.server_time_send_interval = 5000;
    this.load_report_time = 1; // report immediately
    this.load_last_time = Date.now();
    this.load_last_usage = process.resourceUsage();
    this.load_last_cpu = osCPUusage();
    this.load_last_packet_stats = { msgs: 0, bytes: 0 };
    this.exchange_ping = {
      min: Infinity,
      max: 0,
      total: 0,
      count: 0,
      countdown: 1, // ping immediately
    };
    // Monotonicly increasing count of exchange pings. Can be used as a counter
    //   for exchange-dependent operations (such as timeouts waiting for a response)
    //   that increases directly proportionally to communication latency.
    this.exchange_pings = 0;
    setTimeout(this.tick_func, this.tick_time);
    this.csworker.log('Channel server started');
  }

  reportLoad(dt) {
    if (!this.load_report_time) {
      // report in progress
      return;
    }
    this.load_report_time -= dt;
    if (this.load_report_time > 0) {
      return;
    }
    this.load_report_time = 0;
    let now = Date.now();
    let ru = process.resourceUsage();
    let mu = process.memoryUsage();
    let cpu = osCPUusage();
    dt = now - this.load_last_time;
    let last = this.load_last_usage;
    let last_cpu = this.load_last_cpu;
    // percentage, serialized as 0 - 1000
    function perc(v) {
      return round(1000 * v);
    }
    function mb(v) {
      return (v/(1024*1024)).toFixed(1);
    }
    function us(v) { // display as milliseconds
      return (v/1000).toFixed(1);
    }
    let load_cpu = perc((ru.userCPUTime + ru.systemCPUTime - last.userCPUTime - last.systemCPUTime) / (dt * 1000));
    let load_host_cpu = perc((cpu.used - last_cpu.used) / ((cpu.used + cpu.idle - last_cpu.used - last_cpu.idle) || 1));
    // percentage, serialized as 0 - 1000
    let free_mem = perc(os.freemem() / os.totalmem());
    // in MB
    let load_mem = round(mu.rss/1024/1024);
    let last_packet = this.load_last_packet_stats;
    let packet_stats = {
      msgs_cw: cwstats.msgs,
      msgs_ws: wsstats.msgs,
      msgs: cwstats.msgs + wsstats.msgs,
      bytes_cw: cwstats.bytes,
      bytes_ws: wsstats.bytes,
      bytes: cwstats.bytes + wsstats.bytes,
    };
    let msgs_per_s_cw = round((packet_stats.msgs_cw - last_packet.msgs_cw) * 1000 / dt);
    let msgs_per_s_ws = round((packet_stats.msgs_ws - last_packet.msgs_ws) * 1000 / dt);
    let msgs_per_s = round((packet_stats.msgs - last_packet.msgs) * 1000 / dt);
    let kbytes_per_s_cw = round((packet_stats.bytes_cw - last_packet.bytes_cw) / 1024 * 1000 / dt);
    let kbytes_per_s_ws = round((packet_stats.bytes_ws - last_packet.bytes_ws) / 1024 * 1000 / dt);
    let kbytes_per_s = round((packet_stats.bytes - last_packet.bytes) / 1024 * 1000 / dt);
    this.load_last_time = now;
    this.load_last_usage = ru;
    this.load_last_cpu = cpu;
    this.load_last_packet_stats = packet_stats;
    // Ping in microseconds
    let ping_min = isFinite(this.exchange_ping.min) ? this.exchange_ping.min : 9999900;
    let ping_max = this.exchange_ping.max;
    let ping_avg = round(this.exchange_ping.total / (this.exchange_ping.count||1));
    this.exchange_ping.min = Infinity;
    this.exchange_ping.count = this.exchange_ping.total = this.exchange_ping.max = 0;
    // Report to metrics
    metrics.set('load.cpu', load_cpu / 1000);
    metrics.set('load.host_cpu', load_host_cpu / 1000);
    metrics.set('load.mem', load_mem);
    metrics.set('load.free_mem', free_mem / 1000);
    metrics.set('load.msgps.cw', msgs_per_s_cw);
    metrics.set('load.msgps.ws', msgs_per_s_ws);
    metrics.set('load.msgps.total', msgs_per_s);
    metrics.set('load.kbps.cw', kbytes_per_s_cw);
    metrics.set('load.kbps.ws', kbytes_per_s_ws);
    metrics.set('load.kbps.total', kbytes_per_s);
    metrics.set('load.exchange', ping_max);
    // Log
    if (this.load_log) {
      this.csworker.log(`load: cpu=${load_cpu/10}%, hostcpu=${load_host_cpu/10}%,` +
        ` mem=${load_mem}MB, osfree=${free_mem/10}%` +
        // Maybe useful: packets and bytes per second (both websocket + exchange)
        `; msgs/s=${msgs_per_s}, kb/s=${kbytes_per_s}` +
        // Also maybe useful: mu.heapTotal/heapUsed (JS heap); mu.external/arrayBuffers (Buffers and ArrayBuffers)
        `; heap=${mb(mu.heapUsed)}/${mb(mu.heapTotal)}MB, external=${mb(mu.external + mu.arrayBuffers)}MB` +
        `; exchange ping=${us(ping_min)}/${us(ping_avg)}/${us(ping_max)}`);
    }

    // Report to master worker
    let pak = this.csworker.pak('master.master', 'load', null, 1);
    pak.writeInt(load_cpu);
    pak.writeInt(load_host_cpu);
    pak.writeInt(load_mem);
    pak.writeInt(free_mem);
    pak.writeInt(msgs_per_s);
    // Also calculate count of and report each channel type
    let num_channels = {};
    for (let channel_id in this.local_channels) {
      let channel = this.local_channels[channel_id];
      let channel_type = channel.channel_type;
      num_channels[channel_type] = (num_channels[channel_type] || 0) + 1;
    }
    pak.writeJSON(num_channels);
    // Send our network location for tracking/debugging
    // Really only need this once (per master_startup), could send null otherwise
    pak.writeJSON(this.debug_addr);

    pak.send((err) => {
      if (err) {
        console.error(`Error reporting load to master worker: ${err}`);
      }
      this.load_report_time = LOAD_REPORT_INTERVAL;
    });
  }

  exchangePing(dt) {
    if (!this.exchange_ping.countdown) {
      // in-progress
      return;
    }
    this.exchange_ping.countdown -= dt;
    if (this.exchange_ping.countdown > 0) {
      return;
    }
    this.exchange_ping.countdown = 0;
    let pak = this.csworker.pak(this.csworker.channel_id, 'ping', null, true);
    let time = process.hrtime();
    pak.writeU32(time[0]);
    pak.writeU32(time[1]);
    pak.send();
  }
  handlePing(pak) {
    let send_time = [pak.readU32(), pak.readU32()];
    let now = process.hrtime();
    let dt = round((now[0] - send_time[0]) * 1000000 + (now[1] - send_time[1]) / 1000);
    assert(!this.exchange_ping.countdown);
    this.exchange_ping.countdown = EXCHANGE_PING_INTERVAL;
    this.exchange_ping.min = min(this.exchange_ping.min, dt);
    this.exchange_ping.max = max(this.exchange_ping.max, dt);
    this.exchange_ping.total += dt;
    this.exchange_ping.count++;
    this.exchange_pings++;
    // this.csworker.log(`exchange ping: ${(dt/1000).toFixed(1)}ms`);
  }
  eatCPU() {
    this.eat_cpu_tick = null;
    if (!this.eat_cpu) {
      return;
    }
    let start = Date.now();
    while (Date.now() < start + this.eat_cpu) {
      // eat cpu
    }
    this.eat_cpu_tick = setTimeout(this.eatCPU.bind(this), 100 - this.eat_cpu);
  }
  handleEatCPU(data, resp_func) {
    this.eat_cpu = data.percent;
    this.csworker.log(`eat_cpu = ${this.eat_cpu}`);
    resp_func(null, `Eating CPU at ${this.eat_cpu} percent`);
    if (!this.eat_cpu_tick) {
      this.eat_cpu_tick = setTimeout(this.eatCPU.bind(this), 100);
    }
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
      let pak = this.ws_server.pak('server_time');
      pak.writeInt(this.server_time);
      this.ws_server.broadcastPacket(pak);
      this.last_server_time_send = this.server_time;
    }
    this.exchangePing(dt);
    this.reportLoad(dt);
    for (let channel_id in this.local_channels) {
      let channel = this.local_channels[channel_id];
      if (channel.tick) {
        channel.tick(dt, this.server_time);
      }
      channel.cleanupPktIndices();
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
      addUnique(handlers, 'where', ChannelWorker.prototype.onWhere);

      addUnique(handlers, 'broadcast', ChannelWorker.prototype.onBroadcast);
      addUnique(handlers, 'cmdparse_auto', ChannelWorker.prototype.onCmdParseAuto);
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
    function addPacketLog(receiver, key) {
      if (receiver.pkt_log) {
        let pkt_log = [];
        for (let ii = 0; ii < receiver.pkt_log.length; ++ii) {
          let idx = (receiver.pkt_log_idx - 1 - ii + receiver.pkt_log.length) % receiver.pkt_log.length;
          let entry = receiver.pkt_log[idx];
          if (!entry) {
            continue;
          }
          entry = cloneShallow(entry);
          if (Buffer.isBuffer(entry.data)) {
            // Winston doesn't call toJSON ?!
            entry.data = entry.data.toJSON();
            if (entry.data.data) {
              entry.data = entry.data.data;
            }
          }
          if (typeof entry.ts === 'number') {
            entry.ts = new Date(entry.ts).toISOString();
          }
          pkt_log.push(entry);
        }
        crash_dump[key] = pkt_log;
      }
    }
    let cw = this.last_worker;
    if (cw) {
      crash_dump.last_channel_id = cw.channel_id;
      crash_dump.data = cw.data;
      addPacketLog(cw, 'cw_pkt_log');
    }
    let client = this.ws_server.last_client;
    if (client) {
      crash_dump.last_client_id = client.id;
    }
    addPacketLog(this.ws_server, 'ws_pkt_log');
    let dump_file = log.dumpJSON('crash', crash_dump, 'json');
    console.error(`  Saving dump to ${dump_file}.`);
    this.csworker.sendChannelMessage('channel_server', 'chat_broadcast', {
      sysadmin: true,
      src: 'ADMIN',
      msg: 'Server error occurred - check server logs'
    });
    metrics.add('server_error', 1);
  }
}

export function create() {
  return new ChannelServer();
}

export function pathEscape(filename) {
  return filename.replace(/\./g, '\\.');
}
