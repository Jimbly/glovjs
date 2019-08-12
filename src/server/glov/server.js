const assert = require('assert');
const data_store = require('./data_store.js');
const glov_channel_server = require('./channel_server.js');
const glov_wsserver = require('./wsserver.js');

let ds_store;
let ws_server;
export let channel_server;

export function startup(params) {
  assert(params.server);
  ds_store = params.ds || data_store.create('data_store');
  channel_server = glov_channel_server.create();

  ws_server = glov_wsserver.create(params.server);
  ws_server.on('error', function (error) {
    console.error('Unhandled WSServer error:', error);
  });

  channel_server.init(ds_store, ws_server);
}
