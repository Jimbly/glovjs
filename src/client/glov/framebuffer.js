const assert = require('assert');
const { cmd_parse } = require('./cmds.js');
const engine = require('./engine.js');
const perf = require('./perf.js');
const settings = require('./settings.js');

let last_num_passes = 0;
let num_passes = 0;

let cur_tex;
// donotcheckin: move do_filter_linear/do_wrap to End()?  simplifies applyGaussianBlur and other flow?
export function framebufferStart(opts) {
  assert(!cur_tex);
  let { width, height, final, clear, do_filter_linear, do_wrap, need_depth } = opts;
  ++num_passes;
  if (!final) {
    cur_tex = engine.captureFramebufferStart(null, width, height, do_filter_linear, do_wrap, need_depth);
  }
  if (clear && settings.render_scale_clear) {
    // full clear, before setting viewport
    gl.clear(gl.COLOR_BUFFER_BIT | (need_depth ? gl.DEPTH_BUFFER_BIT : 0));
  }
  engine.setViewport([0, 0, width, height]);
  if (width !== engine.width && !settings.use_fbos) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, width, height);
  } else {
    gl.disable(gl.SCISSOR_TEST);
  }
  if (clear && !settings.render_scale_clear) {
    gl.clear(gl.COLOR_BUFFER_BIT | (need_depth ? gl.DEPTH_BUFFER_BIT : 0));
  }
}

export function framebufferEnd() {
  assert(cur_tex);

  cur_tex.captureEnd();

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
