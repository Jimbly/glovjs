// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const { titleCase } = require('../../common/util.js');
const { cmd_parse } = require('./cmds.js');

exports.true = true; // for perf.js

export function get(key) {
  return exports[key];
}

export function set(key, value) {
  if (exports[key] !== value) {
    cmd_parse.handle(null, `${key} ${value}`, null); // uses default cmd_parse handler
  }
}

export function register(defs) {
  Object.keys(defs).forEach(function (key) {
    let def = defs[key];
    exports[key] = def.default_value;
    cmd_parse.registerValue(key, {
      type: def.type,
      label: def.label || titleCase(key.replace(/_/g, ' ')),
      range: def.range,
      get: () => exports[key],
      set: (v) => (exports[key] = v),
      store: true,
      ver: def.ver,
      help: def.help,
      usage: def.usage,
    });
  });
}

register({
  show_metrics: {
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0,1],
  },
  max_fps: {
    label: 'Max FPS',
    default_value: 0,
    type: cmd_parse.TYPE_FLOAT,
  },
  render_scale: {
    label: 'Render Scale',
    default_value: 1,
    type: cmd_parse.TYPE_FLOAT,
    range: [0.1,4],
  },
});
