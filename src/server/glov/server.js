// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const argv = require('minimist')(process.argv.slice(2));
const assert = require('assert');
const data_store = require('./data_store.js');
const data_store_limited = require('./data_store_limited.js');
const data_store_image = require('./data_store_image.js');
const glov_exchange = require('./exchange.js');
const glov_channel_server = require('./channel_server.js');
const fs = require('fs');
const log = require('./log.js');
const path = require('path');
const packet = require('../../common/packet.js');
const glov_wsserver = require('./wsserver.js');
const glov_wscommon = require('../../common/wscommon.js');

const STATUS_TIME = 5000;
const FILE_CHANGE_PAD = 100;
export let ws_server;
export let channel_server;

let last_status = '';
function displayStatus() {
  setTimeout(displayStatus, STATUS_TIME);
  let status = channel_server.getStatus();
  if (status !== last_status) {
    console.info('STATUS', new Date().toISOString(), status);
    last_status = status;
  }
}

let last_version = {};
function updateVersion(base_name, is_startup) {
  let version_file_name = path.join(__dirname, `../../client/${base_name}.ver.json`);
  fs.readFile(version_file_name, function (err, data) {
    if (err) {
      // ignore, probably being written to
      return;
    }
    let obj;
    try {
      obj = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (!obj || !obj.ver) {
      return;
    }
    let old_version = last_version[base_name];
    if (old_version === obj.ver) {
      return;
    }
    console.info(`Version for "${base_name}"${old_version ? ' changed to' : ''}: ${obj.ver}`);
    last_version[base_name] = obj.ver;
    if (base_name === 'app') {
      ws_server.setAppVer(obj.ver);
      if (!is_startup) {
        // Do a broadcast message so people get a few seconds of warning
        ws_server.broadcast('admin_msg', 'New client version deployed, reloading momentarily...');
        if (argv.dev) {
          // immediate
          ws_server.broadcast('app_ver', last_version.app);
        } else {
          // delay by 15 seconds, the server may also be about to be restarted
          setTimeout(function () {
            ws_server.broadcast('app_ver', last_version.app);
          }, 15000);
        }
      }
    }
  });
}

let deferred_file_changes = {};
function onFileChange(filename) {
  delete deferred_file_changes[filename];
  ws_server.broadcast('filewatch', filename);
}

export function startup(params) {
  log.startup(argv);
  assert(params.server);
  if (params.pver) {
    glov_wscommon.PROTOCOL_VERSION = params.pver;
  }

  let { data_stores, exchange } = params;
  if (!data_stores) {
    data_stores = {};
  }
  if (!data_stores.meta) {
    data_stores.meta = data_store.create('data_store');
  }
  if (!data_stores.bulk) {
    if (argv.dev) {
      data_stores.bulk = data_store_limited.create(data_stores.meta, 1000, 1000, 250);
    } else {
      data_stores.bulk = data_stores.meta;
    }
  }
  if (!data_stores.image) {
    data_stores.image = data_store_image.create('data_store/public', 'upload');
  }

  if (!exchange) {
    exchange = glov_exchange.create();
  }
  channel_server = glov_channel_server.create();
  if (argv.dev) {
    console.log('PacketDebug: ON');
    packet.default_flags = packet.PACKET_DEBUG;
  }

  ws_server = glov_wsserver.create(params.server, params.server_https);
  ws_server.on('error', function (error) {
    console.error('Unhandled WSServer error:', error);
    let text = String(error);
    if (text.indexOf('Invalid WebSocket frame: RSV1 must be clear') !== -1) {
      // Log, but don't broadcast or write crash dump
      console.error('ERROR (no dump)', new Date().toISOString(), error);
    } else {
      channel_server.handleUncaughtError(error);
    }
  });

  channel_server.init({
    exchange,
    data_stores,
    ws_server,
  });

  process.on('uncaughtException', channel_server.handleUncaughtError.bind(channel_server));
  setTimeout(displayStatus, STATUS_TIME);

  fs.watch(path.join(__dirname, '../../client/'), { recursive: true }, function (eventType, filename) {
    if (!filename) {
      return;
    }
    filename = filename.replace(/\\/g, '/');
    let m = filename.match(/(.*)\.ver\.json$/);
    if (!m) {
      // not a version file
      if (argv.dev) {
        // send a dynamic reload message
        console.log(`File changed: ${filename}`);
        if (deferred_file_changes[filename]) {
          clearTimeout(deferred_file_changes[filename]);
        }
        deferred_file_changes[filename] = setTimeout(onFileChange.bind(null, filename), FILE_CHANGE_PAD);
      }
      return;
    }
    let file_base_name = m[1]; // e.g. 'app' or 'worker'
    updateVersion(file_base_name);
  });
  updateVersion('app', true);
}

export function shutdown(...message) {
  console.error(...message);
  process.exit(1);
}
