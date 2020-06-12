// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const ack = require('./ack.js');
const assert = require('assert');
const { ackHandleMessage, ackReadHeader, ackWrapPakStart, ackWrapPakPayload, ackWrapPakFinish } = ack;
const packet = require('./packet.js');
const { isPacket, packetCreate, packetFromBuffer } = packet;

export const CONNECTION_TIMEOUT = 60000;
export const PING_TIME = CONNECTION_TIMEOUT / 2;
exports.PROTOCOL_VERSION = '1';

// Rough estimate, if over, will prevent resizing the packet
const PAK_HEADER_SIZE = 1 + // flags
  1+16 + // message id
  1+9; // resp_pak_id

export function wsPakSendDest(client, pak) {
  if (!client.connected || client.socket.readyState !== 1) {
    console.error(`Attempting to send on a disconnected link (client_id:${client.id}), ignoring`);
    pak.pool();
    return;
  }
  let buf = pak.getBuffer(); // a Uint8Array
  let buf_len = pak.getBufferLen();
  if (buf_len !== buf.length) {
    buf = new Uint8Array(buf.buffer, buf.byteOffset, buf_len);
  }
  if (client.ws_server) {
    client.socket.send(buf, function () {
      pak.pool();
    });
  } else {
    client.socket.send(buf);
    pak.pool();
  }
  client.last_send_time = Date.now();
}

function wsPakSendFinish(pak, err, resp_func) {
  let { client, msg } = pak.ws_data;
  delete pak.ws_data;
  let ack_resp_pkt_id = ackWrapPakFinish(pak, err, resp_func);

  if (!client.connected || client.socket.readyState !== 1) { // WebSocket.OPEN
    if (msg === 'channel_msg') { // client -> server channel message, attach additional debugging info
      pak.seek(0);
      pak.readFlags();
      let header = ackReadHeader(pak);
      let is_packet = isPacket(header.data);
      let channel_id;
      let submsg;
      if (is_packet) {
        pak.ref(); // deal with auto-pool of an empty packet
        channel_id = pak.readAnsiString();
        submsg = pak.readAnsiString();
        if (!pak.ended()) {
          pak.pool();
        }
      } else {
        channel_id = header.data.channel_id;
        submsg = header.data.msg;
      }
      msg = `channel_msg:${channel_id}:${submsg}`;
    }
    (client.log ? client : console).log(`Attempting to send msg=${msg} on a disconnected link, ignoring`);
    if (!client.log && client.onError && msg && typeof msg !== 'number') {
      // On the client, if we try to send a new packet while disconnected, this is an application error
      client.onError(`Attempting to send msg=${msg} on a disconnected link`);
    }

    if (ack_resp_pkt_id) {
      // Callback will never be dispatched through ack.js, remove the callback here
      delete client.resp_cbs[ack_resp_pkt_id];
    }
    pak.pool();
    return;
  }

  assert.equal(Boolean(resp_func && resp_func.expecting_response !== false), Boolean(ack_resp_pkt_id));

  wsPakSendDest(client, pak);
}

function wsPakSend(err, resp_func) {
  let pak = this; //eslint-disable-line no-invalid-this
  if (typeof err === 'function' && !resp_func) {
    resp_func = err;
    err = null;
  }
  wsPakSendFinish(pak, err, resp_func);
}

export function wsPak(msg, ref_pak, client) {
  assert(typeof msg === 'string' || typeof msg === 'number');

  // Assume new packet needs to be comparable to old packet, in flags and size
  let pak = packetCreate(ref_pak ? ref_pak.getInternalFlags() : packet.default_flags,
    ref_pak ? ref_pak.totalSize() + PAK_HEADER_SIZE : 0);
  pak.writeFlags();

  ackWrapPakStart(pak, client, msg);

  pak.ws_data = {
    msg,
    client,
  };
  pak.send = wsPakSend;
  return pak;
}

function sendMessageInternal(client, msg, err, data, resp_func) {
  let is_packet = isPacket(data);
  let pak = wsPak(msg, is_packet ? data : null, client);

  if (!err) {
    ackWrapPakPayload(pak, data);
  }

  pak.send(err, resp_func);
}

export function sendMessage(msg, data, resp_func) {
  sendMessageInternal(this, msg, null, data, resp_func); // eslint-disable-line no-invalid-this
}

export function wsHandleMessage(client, buf) {
  let now = Date.now();
  let source = client.id ? `client ${client.id}` : 'server';
  if (!(buf instanceof Uint8Array)) {
    (client.log ? client : console).log(`Received incorrect WebSocket data type from ${source} (${typeof buf})`);
    return client.onError('Invalid data received');
  }
  let pak = packetFromBuffer(buf, buf.length, false);
  pak.readFlags();
  client.last_receive_time = now;

  return ackHandleMessage(client, source, pak, function sendFunc(msg, err, data, resp_func) {
    if (resp_func && !resp_func.expecting_response) {
      resp_func = null;
    }
    sendMessageInternal(client, msg, err, data, resp_func);
  }, function pakFunc(msg, ref_pak) {
    return wsPak(msg, ref_pak, client);
  }, function handleFunc(msg, data, resp_func) {
    let handler = client.handlers[msg];
    if (!handler) {
      let error_msg = `No handler for message ${JSON.stringify(msg)} from ${source}`;
      console.error(error_msg, data);
      if (client.onError) {
        return client.onError(error_msg);
      }
      return resp_func(error_msg);
    }
    return handler(client, data, resp_func);
  });
}
