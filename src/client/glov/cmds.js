// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const cmd_parse_mod = require('../../common/cmd_parse.js');
const local_storage = require('./local_storage.js');
export let cmd_parse = cmd_parse_mod.create({ storage: local_storage });

const engine = require('./engine.js');
const textures = require('./textures.js');
const { PI, round } = Math;

window.cmd = function (str) {
  cmd_parse.handle(null, str, cmd_parse_mod.defaultHandler);
};

cmd_parse.registerValue('fov', {
  type: cmd_parse.TYPE_FLOAT,
  label: 'FOV',
  range: [1,179],
  get: () => round(engine.fov_min * 180 / PI),
  set: (v) => engine.setFOV(v * PI / 180),
  store: true,
});

function byteFormat(bytes) {
  if (bytes > 850000) {
    return `${(bytes/(1024*1024)).toFixed(2)}MB`;
  }
  if (bytes > 850) {
    return `${(bytes/1024).toFixed(2)}KB`;
  }
  return `${bytes}B`;
}

cmd_parse.register('texmem', function (str, resp_func) {
  let keys = Object.keys(textures.textures);
  keys = keys.filter((a) => textures.textures[a].gpu_mem > 1024);
  keys.sort((a, b) => textures.textures[a].gpu_mem - textures.textures[b].gpu_mem);
  resp_func(null, keys.map((a) => `${byteFormat(textures.textures[a].gpu_mem)} ${a}`).join('\n'));
});

cmd_parse.register('gpumem', function (str, resp_func) {
  let { gpu_mem } = engine.perf_state;
  resp_func(null, `${byteFormat(gpu_mem.geom)} Geo\n${byteFormat(gpu_mem.tex)} Tex\n${
    byteFormat(gpu_mem.geom + gpu_mem.tex)} Total`);
});

cmd_parse.register('d', function (str, resp_func) {
  str = str.toUpperCase();
  engine.defines[str] = !engine.defines[str];
  resp_func(null, `D=${str} now ${engine.defines[str]?'SET':'unset'}`);
});

cmd_parse.register('renderer', function (str, resp_func) {
  resp_func(null, `Renderer=WebGL${engine.webgl2?2:1}`);
});
