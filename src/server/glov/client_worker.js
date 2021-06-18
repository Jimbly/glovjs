// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const { ChannelWorker } = require('./channel_worker.js');
const { chunkedSend } = require('glov/chunked_send.js');
const { canonical } = require('glov/cmd_parse.js');
const { logEx } = require('./log.js');
const { isPacket } = require('glov/packet.js');

let cmd_parse_routes = {}; // cmd string -> worker type

let repeated_disconnect = 0;

class ClientWorker extends ChannelWorker {
  constructor(channel_server, channel_id, channel_data) {
    super(channel_server, channel_id, channel_data);
    this.client_id = this.channel_subid; // 1234
    this.client = null; // WSClient filled in by channel_server
    this.log_user_id = null;
    this.ids_base = {
      user_id: undefined,
      display_name: channel_id,
      direct: undefined, // so it is iterated
    };
    this.ids_direct = new Proxy(this.ids_base, {
      get: function (target, prop) {
        if (prop === 'direct') {
          return true;
        }
        return target[prop];
      }
    });
    this.ids = this.ids_base;

    if (repeated_disconnect) {
      setTimeout(() => {
        if (this.client.connected && repeated_disconnect) {
          this.logCtx('warn', `Disconnecting client ${this.client_id} due to /ws_disconnect_repeated`);
          this.client.ws_server.disconnectClient(this.client);
        }
      }, repeated_disconnect * 1000);
    }
  }

  onApplyChannelData(source, data) {
    if (!this.ids.user_id) {
      // not logged in yet
      return;
    }
    if (source.type !== 'user' || source.id !== this.ids.user_id) {
      // not about our user
      return;
    }
    if (data.key === 'public.display_name') {
      this.ids_base.display_name = data.value;
    }
  }

  onForceKick(source, data) {
    assert(this.client.connected);
    this.logCtx('debug', `Disconnecting client ${this.client_id} due to force_kick message`);
    this.client.ws_server.disconnectClient(this.client);
  }

  onUpload(source, pak, resp_func) {
    pak.ref();
    let mime_type = pak.readAnsiString();
    let max_in_flight = pak.readInt();
    let buffer = pak.readBuffer();
    this.logCtx('debug', `sending chunked upload (${mime_type}, ` +
      `${buffer.length} bytes) from ${source.channel_id}`);
    chunkedSend({
      client: this.client,
      mime_type,
      buffer,
      max_in_flight,
    }, (err, id) => {
      pak.pool();
      if (err === 'ERR_FAILALL_DISCONNECT') {
        // client disconnected while in progress, nothing unusual
        this.logCtx('info', `${err} sending chunked upload (${mime_type})` +
          ` data as file#${id} from ${source.channel_id}`);
      } else if (err) {
        // any other errors we might need to investigate
        this.logCtx('warn', `error ${err} sending chunked upload (${mime_type})` +
          ` data as file#${id} from ${source.channel_id}`);
      } else {
        this.logCtx('debug', `sent chunked upload (${mime_type})` +
          ` data as file#${id} from ${source.channel_id}`);
      }

      resp_func(err, id);
    });
  }

  onCSRUserToClientWorker(source, pak, resp_func) {
    let cmd = pak.readString();
    let access = pak.readJSON(); // also has original source info in it, but that's fine?
    // first try to run on connected client
    if (!this.client.connected) {
      return void resp_func('ERR_CLIENT_DISCONNECTED');
    }
    pak = this.client.pak('csr_to_client');
    pak.writeString(cmd);
    pak.writeJSON(access);
    pak.send((err, resp) => {
      if (err || resp && resp.found) {
        return void resp_func(err, resp ? resp.resp : null);
      }
      if (!this.client.connected) {
        return void resp_func('ERR_CLIENT_DISCONNECTED');
      }
      this.cmdParseAuto({
        cmd,
        access,
      }, (err, resp2) => {
        resp_func(err, resp2 ? resp2.resp : null);
      });
    });
  }

  onUnhandledMessage(source, msg, data, resp_func) {
    assert(this.client);
    if (!resp_func.expecting_response) {
      resp_func = null;
    }

    if (!this.client.connected) {
      if (resp_func) {
        console.debug(`ClientWorker(${this.channel_id}) received message for disconnected client:`, msg);
        return void resp_func('ERR_CLIENT_DISCONNECTED');
      }
    }

    let is_packet = isPacket(data);
    let pak = this.client.pak('channel_msg', is_packet ? data : null);
    pak.writeAnsiString(source.channel_id);
    pak.writeAnsiString(msg);
    pak.writeBool(is_packet);
    if (is_packet) {
      pak.appendRemaining(data);
    } else {
      pak.writeJSON(data);
    }
    pak.send(resp_func);
  }

  onError(msg) {
    if (this.client.connected) {
      console.error(`ClientWorker(${this.channel_id}) error:`, msg);
      this.client.send('error', msg);
    } else {
      console.debug(`ClientWorker(${this.channel_id}) error(disconnected,ignored):`, msg);
    }
  }

  cmdParseAuto(opts, resp_func) {
    let { cmd, access } = opts;
    let space_idx = cmd.indexOf(' ');
    let cmd_base = canonical(space_idx === -1 ? cmd : cmd.slice(0, space_idx));
    let { user_id } = this.ids;
    let route = cmd_parse_routes[cmd_base];
    let channel_ids = Object.keys(this.subscribe_counts);
    if (!channel_ids.length) {
      return void resp_func('ERR_NO_SUBSCRIPTIONS');
    }
    channel_ids = channel_ids.filter((channel_id) => {
      if (channel_id.startsWith('user.') && channel_id !== `user.${user_id}`) {
        return false;
      }
      if (route && !channel_id.startsWith(route)) {
        return false;
      }
      return true;
    });
    channel_ids.push(this.channel_id);
    if (!channel_ids.length) {
      // Not subscribed to any worker that can handle this command
      return void resp_func(`Unknown command: "${cmd_base}"`);
    }
    let self = this;
    let idx = 0;
    let last_err;
    function tryNext() {
      if (!self.client.connected) {
        // Disconnected while routing, silently fail; probably already had a failall_disconnect error triggered
        return void resp_func();
      }
      if (idx === channel_ids.length) {
        self.logCtx('info', 'cmd_parse_unknown', {
          cmd,
          display_name: self.ids.display_name,
        });
        return void resp_func(last_err);
      }
      let channel_id = channel_ids[idx++];
      let pak = self.pak(channel_id, 'cmdparse_auto');
      pak.writeString(cmd);
      pak.writeJSON(access);
      pak.send(function (err, resp) {
        if (!route && !cmd_parse_routes[cmd_base] && resp && resp.found) {
          let target = channel_id.split('.')[0];
          cmd_parse_routes[cmd_base] = target;
          self.debug(`Added cmdParseAuto route for ${cmd_base} to ${target}`);
        }
        if (err || resp && resp.found) {
          return void resp_func(err, resp);
        }
        // otherwise, was not found
        if (resp && resp.err) {
          last_err = resp.err;
        }
        tryNext();
      });
    }
    tryNext();
  }

  cmdWSDisconnect(str, resp_func) {
    let time = Number(str) || 0;
    if (resp_func) {
      resp_func(null, `Disconnecting in ${time}s...`);
    }
    setTimeout(() => {
      if (this.client.connected) {
        this.logCtx('warn', `Disconnecting client ${this.client_id} due to /ws_disconnect`);
        this.client.ws_server.disconnectClient(this.client);
      }
    }, time * 1000);
  }
  cmdWSDisconnectRepeated(str, resp_func) {
    let time = Number(str);
    if (!isFinite(time)) {
      return void resp_func('Usage: /ws_disconnect_repeated SECONDS');
    }
    repeated_disconnect = time;
    if (!time) {
      return void resp_func(null, 'Repeated disconnect cleared');
    }
    this.cmdWSDisconnect(str);
    return void resp_func(`Will repeatedly disconnect all future clients after ${time}s,`+
      ' run /ws_disconnect_repeated 0 to clear');
  }

  logDest(channel_id, level, ...args) {
    let ctx = {
      client: this.client_id,
    };
    let ids = channel_id.split('.');
    ctx[ids[0]] = ids[1]; // set ctx.world: 1234, etc
    if (this.log_user_id) {
      ctx.user_id = this.log_user_id;
    }
    logEx(ctx, level, `${this.client_id}->${channel_id}:`, ...args);
  }
  logCtx(level, ...args) {
    let ctx = {
      client: this.client_id,
    };
    if (this.log_user_id) {
      ctx.user_id = this.log_user_id;
    }
    logEx(ctx, level, `${this.client_id}:`, ...args);
  }
}

ClientWorker.prototype.no_datastore = true; // No datastore instances created here as no persistence is needed

export function init(channel_server) {
  channel_server.registerChannelWorker('client', ClientWorker, {
    autocreate: false,
    subid_regex: /^[a-zA-Z0-9-]+$/,
    filters: {
      apply_channel_data: ClientWorker.prototype.onApplyChannelData,
    },
    handlers: {
      force_kick: ClientWorker.prototype.onForceKick,
      upload: ClientWorker.prototype.onUpload,
      csr_user_to_clientworker: ClientWorker.prototype.onCSRUserToClientWorker,
    },
    cmds: [{
      cmd: 'ws_disconnect',
      help: '(Admin) Forcibly disconnect our WebSocket connection',
      access_run: ['sysadmin'],
      func: ClientWorker.prototype.cmdWSDisconnect,
    }, {
      cmd: 'ws_disconnect_repeated',
      help: '(Admin) Forcibly disconnect all WebSocket connections on a timer',
      access_run: ['sysadmin'],
      func: ClientWorker.prototype.cmdWSDisconnectRepeated,
    }],
  });
}
