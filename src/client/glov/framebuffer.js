const assert = require('assert');
const { cmd_parse } = require('./cmds.js');
const engine = require('./engine.js');
const perf = require('./perf.js');
const settings = require('./settings.js');

let last_num_passes = 0;
let num_passes = 0;

let cur_tex;
export function framebufferStart(opts) {
  assert(!cur_tex);
  let { width, height, viewport, final, clear, need_depth, clear_all, clear_color } = opts;
  ++num_passes;
  if (!final) {
    cur_tex = engine.captureFramebufferStart(null, width, height, need_depth);
  }
  if (clear_color) {
    gl.clearColor(clear_color[0], clear_color[1], clear_color[2], clear_color[3]);
  }
  if (clear && clear_all) {
    // full clear, before setting viewport
    gl.disable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | (need_depth ? gl.DEPTH_BUFFER_BIT : 0));
  }
  let need_scissor;
  if (viewport) {
    engine.setViewport(viewport);
    need_scissor = viewport[0] || viewport[1] || viewport[2] !== engine.width || viewport[3] !== engine.height;
    if (clear_all) { // not sure this logically follows, but we want this anywhere we're clearing all currently
      need_scissor = false;
    }
  } else {
    engine.setViewport([0, 0, width, height]);
    need_scissor = width !== engine.width;
  }
  if (need_scissor && !settings.use_fbos) {
    gl.enable(gl.SCISSOR_TEST);
    if (viewport) {
      gl.scissor(viewport[0], viewport[1], viewport[2], viewport[3]);
    } else {
      gl.scissor(0, 0, width, height);
    }
  } else {
    gl.disable(gl.SCISSOR_TEST);
  }
  if (clear && !clear_all) {
    gl.clear(gl.COLOR_BUFFER_BIT | (need_depth ? gl.DEPTH_BUFFER_BIT : 0));
  }
}

export function framebufferEnd(opts) {
  assert(cur_tex);
  opts = opts || {};
  let { filter_linear, wrap } = opts;

  cur_tex.captureEnd(filter_linear, wrap);

  let ret = cur_tex;
  cur_tex = null;
  return ret;
}

export function framebufferEndOfFrame() {
  assert(!cur_tex);
  last_num_passes = num_passes;
  num_passes = 0;
}

settings.register({
  show_passes: {
    label: 'Show FPS',
    default_value: 0,
    type: cmd_parse.TYPE_INT,
    range: [0,1],
  },
});

perf.addMetric({
  name: 'passes',
  show_stat: 'show_passes',
  labels: {
    'passes: ': () => last_num_passes.toString(),
  },
});
