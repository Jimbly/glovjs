// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
/* global WebSocket */

const ack = require('glov/common/ack.js');
const { ackInitReceiver } = ack;
const assert = require('assert');
const { errorReportSetDetails, session_uid } = require('./error_report.js');
const { fetch, ERR_CONNECTION } = require('./fetch.js');
const { min, random } = Math;
const { perfCounterAdd } = require('glov/common/perfcounters.js');
const urlhash = require('./urlhash.js');
const walltime = require('./walltime.js');
const wscommon = require('glov/common/wscommon.js');
const { wsHandleMessage } = wscommon;
const { PLATFORM_WEB } = require('glov/client/client_config.js');

// let net_time = 0;
// export function getNetTime() {
//   let r = net_time;
//   net_time = 0;
//   return r;
// }

// Values exposed for `client.connect_error`
export const ERR_CONNECTING = 'ERR_CONNECTING';
export const ERR_APP_VERSION = 'ERR_APP_VERSION';
export const ERR_RESTARTING = 'ERR_RESTARTING';
export const ERR_PROTOCOL_VERSION_NEW = 'ERR_PROTOCOL_VERSION_NEW';
export const ERR_PROTOCOL_VERSION_OLD = 'ERR_PROTOCOL_VERSION_OLD';

export function WSClient(path) {
  this.id = null;
  this.my_ids = {}; // set of all IDs I've been during this session
  this.handlers = {};
  this.socket = null;
  this.net_delayer = null;
  this.connected = false;
  this.disconnected = false;
  this.retry_scheduled = false;
  this.retry_count = 0;
  this.disconnect_time = Date.now();
  this.last_receive_time = Date.now();
  this.idle_counter = 0;
  this.last_send_time = Date.now();
  this.connect_error = ERR_CONNECTING;
  ackInitReceiver(this);

  if (path) {
    this.path = path;
  } else {
    let api_path = urlhash.getAPIPath(); // 'https://foo.com/product/api/'
    this.path = api_path.replace(/^http/, 'ws')
      .replace(/api\/$/, 'ws'); // 'wss://foo.com/product/ws';
  }

  this.connect(false);

  this.onMsg('cack', this.onConnectAck.bind(this));
  this.onMsg('app_ver', this.onAppVer.bind(this));
  this.onMsg('error', this.onError.bind(this));
}

WSClient.prototype.logPacketDispatch = function (source, pak, buf_offs, msg) {
  perfCounterAdd(`ws.${typeof msg === 'number' ? 'ack' : msg}`);
};

WSClient.prototype.timeSinceDisconnect = function () {
  return Date.now() - this.disconnect_time;
};

function whenServerReady(cb) {
  let retry_count = 0;
  function doit() {
    fetch({
      url: `${urlhash.getAPIPath()}ready?pver=${wscommon.PROTOCOL_VERSION}`,
    }, (err, response) => {
      if (err && response !== 'ERR_PROTOCOL_VERSION_OLD') {
        ++retry_count;
        setTimeout(doit, min(retry_count * retry_count * 100, 15000) * (0.75 + random() * 0.5));
      } else {
        cb();
      }
    });
  }
  doit();
}

WSClient.prototype.onAppVer = function (ver) {
  if (ver !== BUILD_TIMESTAMP) {
    if (this.on_app_ver_mismatch) {
      this.on_app_ver_mismatch();
    } else {
      if (PLATFORM_WEB) {
        console.error(`App version mismatch (server: ${ver}, client: ${BUILD_TIMESTAMP}), reloading`);
        whenServerReady(function () {
          if (window.reloadSafe) {
            window.reloadSafe();
          } else {
            document.location.reload();
          }
        });
      } else {
        // Not allowed to reload
        console.warn(`App version mismatch (server: ${ver}, client: ${BUILD_TIMESTAMP}), ignoring`);
      }
    }
  }
};

WSClient.prototype.onConnectAck = function (data, resp_func) {
  let client = this;
  walltime.sync(data.time);
  client.connected = true;
  client.connect_error = null;
  client.disconnected = false;
  client.id = data.id;
  client.my_ids[data.id] = true;
  errorReportSetDetails('client_id', client.id);
  client.secret = data.secret;
  if (data.app_ver) {
    client.onAppVer(data.app_ver);
  }
  // Fire subscription_manager connect handler
  assert(client.handlers.connect);
  client.handlers.connect(client, {
    client_id: client.id,
    restarting: data.restarting,
    app_data: data.app_data,
  });
  resp_func();
};


WSClient.prototype.pak = function (msg) {
  return wscommon.wsPak(msg, null, this);
};

WSClient.prototype.send = function (msg, data, resp_func) {
  wscommon.sendMessage.call(this, msg, data, resp_func);
};

WSClient.prototype.onError = function (e) {
  console.error('WSClient Error');
  console.error(e);
  if (!(e instanceof Error)) {
    e = new Error(e);
  }
  throw e;
};

// cb(client, data, resp_func)
WSClient.prototype.onMsg = function (msg, cb) {
  assert.ok(!this.handlers[msg]);
  this.handlers[msg] = function wrappedCallback(client, data, resp_func) {
    // Client interface does not need a client passed to it!
    return cb(data, resp_func);
  };
};

WSClient.prototype.checkForNewAppVersion = function () {
  if (this.app_ver_check_in_progress) {
    return;
  }
  this.app_ver_check_in_progress = true;
  fetch({
    url: `${urlhash.getURLBase()}app.ver.json`,
    response_type: 'json'
  }, (err, obj) => {
    this.app_ver_check_in_progress = false;
    if (obj && obj.ver) {
      this.onAppVer(obj.ver);
    }
    if (err && err !== ERR_CONNECTION) {
      // If this is not triggered on connection errors, only if we got a (non-parseable) response from the server
      if (!this.delayed_recheck) {
        this.delayed_recheck = true;
        setTimeout(() => {
          this.delayed_recheck = false;
          this.checkForNewAppVersion();
        }, 1000);
      }
    }
  });
};

WSClient.prototype.retryConnection = function () {
  let client = this;
  assert(!client.socket);
  assert(!client.retry_scheduled);
  client.retry_scheduled = true;
  ++client.retry_count;
  this.checkForNewAppVersion();
  setTimeout(function () {
    assert(client.retry_scheduled);
    assert(!client.socket);
    client.retry_scheduled = false;
    client.connect(true);
  }, min(client.retry_count * client.retry_count * 100, 15000) * (0.75 + random() * 0.5));
};

WSClient.prototype.checkDisconnect = function () {
  if (this.connected && this.socket.readyState !== 1) { // WebSocket.OPEN
    // We think we're connected, but we're not, we must have received an
    // animation frame before the close event when phone was locked or something
    this.on_close();
    assert(!this.connected);
  }
};

WSClient.prototype.connect = function (for_reconnect) {
  let client = this;
  client.socket = { readyState: 0 }; // Placeholder so it appears disconnected

  assert(!this.ready_check_in_progress);
  this.ready_check_in_progress = true;
  // retry hitting status endpoint until it says it's okay to make a WebSocket connection
  fetch({
    url: `${urlhash.getAPIPath()}ready?pver=${wscommon.PROTOCOL_VERSION}`,
  }, (err, response) => {
    assert(this.ready_check_in_progress);
    this.ready_check_in_progress = false;
    if (!err) {
      this.connect_error = ERR_CONNECTING;
      return void this.connectAfterReady(for_reconnect);
    }
    console.log(`Server not ready, err=${err}, response=${response}`);
    // Handle known error strings
    if (response === 'ERR_RESTARTING' || response === 'ERR_STARTUP') {
      client.connect_error = ERR_RESTARTING;
    } else if (response === 'ERR_PROTOCOL_VERSION_NEW') {
      client.connect_error = ERR_PROTOCOL_VERSION_NEW;
    } else if (response === 'ERR_PROTOCOL_VERSION_OLD') {
      client.connect_error = ERR_PROTOCOL_VERSION_OLD;
    } else {
      client.connect_error = ERR_CONNECTING;
    }
    client.socket = null;
    client.net_delayer = null;
    this.retryConnection();
  });
};

WSClient.prototype.connectAfterReady = function (for_reconnect) {
  let client = this;

  let path = `${client.path}?pver=${wscommon.PROTOCOL_VERSION}${
    for_reconnect && client.id && client.secret ? `&reconnect=${client.id}&secret=${client.secret}` : ''
  }&sesuid=${session_uid}`;
  let socket = new WebSocket(path);
  socket.binaryType = 'arraybuffer';
  client.socket = socket;

  // Protect callbacks from ever firing if we've already disconnected this socket
  //   from the WSClient
  function guard(fn) {
    return function (...args) {
      if (client.socket !== socket) {
        return;
      }
      fn(...args);
    };
  }

  function abort(skip_close) {
    client.socket = null;
    client.net_delayer = null;
    if (client.connected) {
      client.disconnect_time = Date.now();
      client.disconnected = true;
      errorReportSetDetails('disconnected', 1);
    }
    client.connected = false;
    client.connect_error = ERR_CONNECTING;
    if (!skip_close) {
      try {
        socket.close();
      } catch (e) {
        // ignore
      }
    }
    // Fire subscription_manager disconnect handler
    client.handlers.disconnect();
    ack.failAll(client);
  }

  function retry(skip_close) {
    abort(skip_close);
    client.retryConnection();
  }

  // Local state, for this one connection
  let connected = false;
  client.socket.addEventListener('error', guard(function (err) {
    if (!connected) {
      console.log('WebSocket error during initial connection, retrying...', err);
      retry();
    } else {
      console.error('WebSocket error', err);
      // Disconnect and reconnect here, is this a terminal error? Probably not, we'll get a 'close' event if it is?
      // We some error occasionally on iOS, not sure what error, but it auto-reconnects fine, so let's
      // not do a throw
      // client.onError(err);
    }
  }));

  client.socket.addEventListener('message', guard(function (message) {
    // net_time -= Date.now();
    assert(message.data instanceof ArrayBuffer);
    wsHandleMessage(client, new Uint8Array(message.data));
    // net_time += Date.now();
  }));

  client.socket.addEventListener('open', guard(function () {
    console.log('WebSocket open');
    connected = true;
    // reset retry count so next retry is fast if we get disconnected
    client.retry_count = 0;
  }));

  // This may get called before the close event gets to use
  client.on_close = guard(function () {
    console.log('WebSocket close, retrying connection...');
    retry(true);
  });
  client.socket.addEventListener('close', client.on_close);

  let doPing = guard(function () {
    if (Date.now() - client.last_send_time > wscommon.PING_TIME && client.connected && client.socket.readyState === 1) {
      client.send('ping');
    }
    setTimeout(doPing, wscommon.PING_TIME);
  });
  setTimeout(doPing, wscommon.PING_TIME);

  // For debugging reconnect handling
  // setTimeout(function () {
  //   if (connected) {
  //     socket.close();
  //   }
  // }, 5000);
};
