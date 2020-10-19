const assert = require('assert');
const { cmd_parse } = require('./cmds.js');
const engine = require('./engine.js');
const perf = require('./perf.js');
const settings = require('./settings.js');
const textures = require('./textures.js');

let last_num_passes = 0;
let num_passes = 0;

let temporary_textures = {};

let reset_fbos = false;
export function resetFBOs() {
  reset_fbos = true;
}

let last_temp_idx = 0;
function getTemporaryTexture(w, h, possibly_fbo, need_depth) {
  let key = `${w}_${h}`;
  let is_fbo = possibly_fbo && settings.use_fbos;
  if (is_fbo) {
    key += '_fbo';
    if (need_depth) {
      key += '_d';
    }
  }
  let temp = temporary_textures[key];
  if (!temp) {
    temp = temporary_textures[key] = { list: [], idx: 0 };
  }
  if (temp.idx >= temp.list.length) {
    let tex = textures.createForCapture(`temp_${key}_${++last_temp_idx}`);
    if (is_fbo) {
      tex.allocFBO(w, h, need_depth);
    }
    temp.list.push(tex);
  }
  let tex = temp.list[temp.idx++];
  return tex;
}

export function temporaryTextureClaim(tex) {
  for (let key in temporary_textures) {
    let temp = temporary_textures[key];
    let idx = temp.list.indexOf(tex);
    if (idx !== -1) {
      temp.list.splice(idx, 1);
      if (temp.idx > idx) {
        --temp.idx;
      }
      return;
    }
  }
  assert(false);
}

// Call tex.captureEnd when done
function framebufferCaptureStart(tex, w, h, need_depth) {
  assert.equal(engine.viewport[0], 0); // maybe allow/require setting viewport *after* starting capture instead?
  assert.equal(engine.viewport[1], 0);
  if (!w) {
    if (engine.render_width) {
      w = engine.render_width;
      h = engine.render_height;
    } else {
      w = engine.width;
      h = engine.height;
    }
  }
  if (!tex) {
    tex = getTemporaryTexture(w, h, true, need_depth);
  }
  tex.captureStart(w, h);
  return tex;
}

// Does a capture directly from the framebuffer regardless of current use_fbos setting
// Warning: Slow on iOS
export function framebufferCapture(tex, w, h, filter_linear, wrap) {
  tex = framebufferCaptureStart(tex, w, h, false);
  tex.captureEnd(filter_linear, wrap);
  return tex;
}


let cur_tex;
export function framebufferStart(opts) {
  assert(!cur_tex);
  let { width, height, viewport, final, clear, need_depth, clear_all, clear_color } = opts;
  ++num_passes;
  if (!final) {
    cur_tex = framebufferCaptureStart(null, width, height, need_depth);
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

  for (let key in temporary_textures) {
    let temp = temporary_textures[key];
    if (reset_fbos) {
      // Release all textures
      temp.idx = 0;
    }
    // Release unused textures
    while (temp.list.length > temp.idx) {
      temp.list.pop().destroy();
    }
    if (!temp.idx) {
      delete temporary_textures[key];
    } else {
      temp.idx = 0;
    }
  }
  reset_fbos = false;
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
