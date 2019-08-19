// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const client_worker = require('./client_worker.js');
const { channelServerSend } = require('./channel_server.js');
const { logdata } = require('../../common/util.js');

// Messages not allowed to be forwarded from client to arbitrary worker
const RESERVED = {
  'subscribe': 1, 'unsubscribe': 1,
  'client_changed': 1,
  'apply_channel_data': 1, 'set_channel_data': 1,
};

function onUnSubscribe(channel_server, client, channel_id) {
  client.client_channel.unsubscribeOther(channel_id);
}

function onClientDisconnect(channel_server, client) {
  client.client_channel.unsubscribeAll();
}

function onSubscribe(channel_server, client, channel_id) {
  client.client_channel.subscribeOther(channel_id);
}

function onSetChannelData(channel_server, client, data, resp_func) {
  data.key = String(data.key);
  let channel_id = data.channel_id;
  assert(channel_id);

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

  // TODO: Disable autocreate for this call?
  // TODO: Error if channel does not exist, but do not require an ack? channelServerSend needs a simple "sent" ack?
  channelServerSend(client.client_channel, channel_id, 'set_channel_data', null, data);
  resp_func();
}

function onChannelMsg(channel_server, client, data, resp_func) {
  // Messages to everyone subscribed to the channel, e.g. chat
  console.log(`client_id:${client.id}->${data.channel_id}: channel_msg ${logdata(data)}`);
  if (RESERVED[data.msg]) {
    return void resp_func(`Not allowed to send internal message ${data.msg}`);
  }
  let channel_id = data.channel_id;
  assert(channel_id);
  let client_channel = client.client_channel;

  if (!client_channel.isSubscribedTo(channel_id)) {
    return void resp_func(`Client is not on channel ${channel_id}`);
  }
  if (data.broadcast && typeof data.data !== 'object') {
    return void resp_func('Broadcast requires data object');
  }
  if (!resp_func.expecting_response) {
    resp_func = null;
  }
  if (data.broadcast) {
    delete data.broadcast;
    channelServerSend(client_channel, channel_id, 'broadcast', null, data, resp_func);
  } else {
    channelServerSend(client_channel, channel_id, data.msg, null, data.data, resp_func);
  }
}

const regex_valid_username = /^[a-zA-Z0-9_]+$/u;
function onLogin(channel_server, client, data, resp_func) {
  console.log(`client_id:${client.id}->server login ${logdata(data)}`);
  if (!data.name) {
    return resp_func('invalid username');
  }
  if ({}[data.name]) {
    // hasOwnProperty, etc
    return resp_func('invalid username');
  }
  if (!data.name.match(regex_valid_username)) {
    // has a "." or other invalid character
    return resp_func('invalid username');
  }

  let client_channel = client.client_channel;
  assert(client_channel);

  return channelServerSend(client_channel, `user.${data.name}`, 'login', null, {
    password: data.password,
  }, function (err, resp_data) {
    if (!err) {
      client_channel.ids.user_id = data.name;
      client.ids.user_id = data.name;
      client_channel.ids.display_name = resp_data.display_name;
      client.ids.display_name = resp_data.display_name;

      // Tell channels we have a new user id/display name
      for (let channel_id in client_channel.subscribe_counts) {
        channelServerSend(client_channel, channel_id, 'client_changed');
      }

      // Always subscribe client to own user
      onSubscribe(channel_server, client, `user.${data.name}`);
    }
    resp_func(err);
  });
}

export function init(channel_server) {
  let ws_server = channel_server.ws_server;
  ws_server.on('client', (client) => {
    assert(!client.ids);
    client.ids = {
      type: 'client',
      id: channel_server.clientIdFromWSClient(client),
      // ws_client_id: client.id // not needed anymore?
      user_id: null,
      display_name: null,
    };
    client.client_channel = channel_server.createChannelLocal(`client.${client.ids.id}`);
    client.client_channel.client = client;
    client.ids.channel_id = client.client_channel.channel_id;
  });
  ws_server.on('disconnect', onClientDisconnect.bind(null, channel_server));
  ws_server.onMsg('subscribe', onSubscribe.bind(null, channel_server));
  ws_server.onMsg('unsubscribe', onUnSubscribe.bind(null, channel_server));
  ws_server.onMsg('set_channel_data', onSetChannelData.bind(null, channel_server));
  ws_server.onMsg('channel_msg', onChannelMsg.bind(null, channel_server));
  ws_server.onMsg('login', onLogin.bind(null, channel_server));

  client_worker.init(channel_server);
}
