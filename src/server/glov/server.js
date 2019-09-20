// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const data_store = require('./data_store.js');
const glov_channel_server = require('./channel_server.js');
const glov_wsserver = require('./wsserver.js');
const glov_wscommon = require('../../common/wscommon.js');

const STATUS_TIME = 5000;
let ds_store;
export let ws_server;
export let channel_server;

let last_status = '';
function displayStatus() {
  setTimeout(displayStatus, STATUS_TIME);
  let status = channel_server.getStatus();
  if (status !== last_status) {
    console.log('STATUS', new Date(), status);
    last_status = status;
  }
}

export function startup(params) {
  assert(params.server);
  if (params.pver) {
    glov_wscommon.PROTOCOL_VERSION = params.pver;
  }
  ds_store = params.ds || data_store.create('data_store');
  channel_server = glov_channel_server.create();

  ws_server = glov_wsserver.create(params.server);
  ws_server.on('error', function (error) {
    console.error('Unhandled WSServer error:', error);
    channel_server.handleUncaughtError(error);
  });

  channel_server.init(ds_store, ws_server);

  process.on('uncaughtException', channel_server.handleUncaughtError.bind(channel_server));
  setTimeout(displayStatus, STATUS_TIME);
}
