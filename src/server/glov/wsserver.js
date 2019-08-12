const assert = require('assert');
const events = require('../../common/tiny-events.js');
const node_util = require('util');
const querystring = require('querystring');
const util = require('../../common/util.js');
const url = require('url');
const wscommon = require('../../common/wscommon.js');
const WebSocket = require('ws');

const regex_ipv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u;
function ipFromRequest(req) {
  // See getRemoteAddressFromRequest() for more implementation details, possibilities, proxying options
  // console.log('Client connection headers ' + JSON.stringify(req.headers));

  // Security note: must check x-forwarded-for *only* if we know this request came from a
  //   reverse proxy, should warn if missing x-forwarded-for.
  let ip = req.headers['x-forwarded-for'] || req.client.remoteAddress ||
    req.client.socket && req.client.socket.remoteAddress;
  let port = req.headers['x-forwarded-port'] || req.client.remotePort ||
    req.client.socket && req.client.socket.remotePort;
  assert(ip);
  let m = ip.match(regex_ipv4);
  if (m) {
    ip = m[1];
  }
  return `${ip}${port ? `:${port}` : ''}`;
}

function WSClient(ws_server, socket) {
  events.EventEmitter.call(this);
  this.ws_server = ws_server;
  this.socket = socket;
  this.id = ++ws_server.last_client_id;
  this.secret = Math.ceil(Math.random() * 1e10).toString();
  this.addr = ipFromRequest(socket.handshake);
  this.last_pak_id = 0;
  this.resp_cbs = {};
  this.handlers = ws_server.handlers; // reference, not copy!
  this.connected = true;
  this.disconnected = false;
  this.responses_waiting = 0;
  this.last_receive_time = Date.now();
  ws_server.clients[this.id] = this;
}
util.inherits(WSClient, events.EventEmitter);

WSClient.prototype.log = function (...args) {
  let client = this;
  let msg = [];
  for (let ii = 0; ii < arguments.length; ++ii) {
    if (typeof args[ii] === 'object') {
      msg.push(node_util.inspect(args[ii]));
    } else {
      msg.push(args[ii]);
    }
  }
  console.log(`WS Client ${client.id} ${msg.join(' ')}`);
};

WSClient.prototype.onError = function (e) {
  this.ws_server.emit('error', e);
};

WSClient.prototype.onClose = function () {
  let client = this;
  if (!client.connected) {
    return;
  }
  let ws_server = client.ws_server;
  client.connected = false;
  client.disconnected = true;
  delete ws_server.clients[client.id];
  console.log(`WS Client ${client.id} disconnected` +
    ` (${Object.keys(ws_server.clients).length} clients connected)`);
  client.emit('disconnect');
  ws_server.emit('disconnect', client);
};

WSClient.prototype.send = wscommon.sendMessage;

function WSServer() {
  events.EventEmitter.call(this);
  this.wss = null;
  this.last_client_id = 0;
  this.clients = Object.create(null);
  this.handlers = {};
  this.restarting = false;
  this.onMsg('ping', util.nop);
}
util.inherits(WSServer, events.EventEmitter);

// cb(client, data, resp_func)
WSServer.prototype.onMsg = function (msg, cb) {
  assert.ok(!this.handlers[msg]);
  this.handlers[msg] = cb;
};

WSServer.prototype.init = function (server) {
  let ws_server = this;
  ws_server.wss = new WebSocket.Server({ server });

  ws_server.wss.on('connection', (socket, req) => {
    socket.handshake = req;
    let client = new WSClient(ws_server, socket);
    console.log(`WS Client ${client.id} connected to ${req.url} from ${client.addr}` +
      ` (${Object.keys(ws_server.clients).length} clients connected)`);

    client.send('internal_client_id', { id: client.id, secret: client.secret });

    socket.on('close', function () {
      // disable this for testing
      client.onClose();
    });
    socket.on('message', function (data) {
      wscommon.handleMessage(client, data);
    });
    socket.on('error', function (e) {
      // Not sure this exists on `ws`
      client.onError(e);
    });
    ws_server.emit('client', client);

    let query = querystring.parse(url.parse(req.url).query);
    let reconnect_id = Number(query.reconnect);
    if (reconnect_id) {
      // we're reconnecting an existing client, immediately disconnect the old one
      let old_client = ws_server.clients[reconnect_id];
      if (old_client) {
        if (old_client.secret === query.secret) {
          console.log(`WS Client ${old_client.id} being replaced by reconnect, disconnecting...`);
          this.disconnectClient(old_client);
        } else {
          console.log(`WS Client ${client.id} requested disconnect of Client ${reconnect_id}` +
            ' with incorrect secret, ignoring');
        }
      }
    }
  });

  setInterval(this.checkTimeouts.bind(this), wscommon.CONNECTION_TIMEOUT / 2);
};

WSServer.prototype.disconnectClient = function (client) {
  try {
    client.socket.close();
  } catch (err) {
    // ignore
  }
  client.onClose();
};

WSServer.prototype.checkTimeouts = function () {
  let expiry = Date.now() - wscommon.CONNECTION_TIMEOUT;
  for (let client_id in this.clients) {
    let client = this.clients[client_id];
    if (client.last_receive_time < expiry) {
      console.log(`WS Client ${client.id} timed out, disconnecting...`);
      this.disconnectClient(client);
    }
  }
};

WSServer.prototype.broadcast = function (msg, data) {
  let ws_server = this;
  let num_sent = 0;
  for (let client_id in ws_server.clients) {
    if (ws_server.clients[client_id]) {
      let client = ws_server.clients[client_id];
      client.send(msg, data);
      ++num_sent;
    }
  }
  return num_sent;
};

export function isClient(obj) {
  return obj instanceof WSClient;
}

WSServer.prototype.isClient = isClient;

export function create(...args) {
  let ret = new WSServer();
  ret.init(...args);
  return ret;
}
