/* eslint global-require:off */
const argv = require('minimist')(process.argv.slice(2));
const assert = require('assert');
const fs = require('fs');
const json5 = require('json5');
const path = require('path');
const { defaults } = require('../../common/util.js');

let server_config;

export function serverConfigStartup(user_defaults) {
  assert(!server_config);
  let config_file = 'config/server.json';
  if (argv.config) {
    config_file = argv.config;
  }
  let user = {};
  let config_path = path.join(process.cwd(), config_file);
  if (fs.existsSync(config_path)) {
    console.log(`Using local server config from ${config_path}`);
    user = json5.parse(fs.readFileSync(config_path, 'utf8'));
  }
  server_config = defaults(user, user_defaults);
}

export function serverConfig() {
  if (!server_config) {
    serverConfigStartup({});
  }
  return server_config;
}
