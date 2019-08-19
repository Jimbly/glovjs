// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const subscription_manager = require('./subscription_manager.js');
const WSClient = require('./wsclient.js').WSClient;

let client;
let subs;

export function init(glov_engine) {
  client = new WSClient();
  subs = subscription_manager.create(client);
  window.subs = subs; // for debugging
  exports.subs = subs;
  exports.client = client;

  if (glov_engine) {
    glov_engine.addTickFunc((dt) => {
      subs.tick(dt);
    });
  }
}
