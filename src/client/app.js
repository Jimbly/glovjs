/* eslint-disable n/global-require */

// For debug and used internally in the build/bundling pipeline
window.glov_build_version=BUILD_TIMESTAMP;

// Startup code.

let called_once = false;
function onLoad() {
  if (called_once) {
    return;
  }
  called_once = true;
  window.time_load_onload = Date.now();

  const { locateAssetSetProxyPath } = require('glov/client/locate_asset');
  if (window.conf_platform === 'discord') {
    locateAssetSetProxyPath('.proxy/');
  }

  require('glov/client/bootstrap.js');
  require('./main.js').main();
  window.time_load_init = Date.now();
}

window.addEventListener('DOMContentLoaded', onLoad);

window.onload = onLoad;
