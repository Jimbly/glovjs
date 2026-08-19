const assert = require('assert');
const gb = require('glov-build');
const micromatch = require('micromatch');
const { pngRead, pngWrite } = require('./png.js');

const { floor, round } = Math;

// Photoshop writes pixels with 0 alpha but a bright white color, which causes
// interpolation errors - instead spread the nearest non-alpha color.
// In this extended version, continue spreading until all alpha pixels are full

function gbif(globs, fn) {
  return function (job, done) {
    let file = job.getFile();
    if (micromatch(file.relative, globs).length) {
      fn(job, done);
    } else {
      job.out(file);
      done();
    }
  };
}

module.exports = function (config) {
  assert(!Array.isArray(config)); // old style
  let { globs, rules } = config;
  rules = rules || {};
  function imgproc(job, done) {
    let file = job.getFile();
    let { err, img: pngin } = pngRead(file.contents);
    if (err) {
      return void done(err);
    }
    let alpha_channel = 8; // bitmask
    for (let key in rules) {
      if (micromatch(file.relative, [key]).length) {
        alpha_channel = rules[key];
      }
    }
    let alpha_channels = [];
    for (let ii = 0; ii < 4; ++ii) {
      if (alpha_channel & (1 << ii)) {
        alpha_channels.push(ii);
      }
    }

    let { width, height, data } = pngin;
    assert.equal(width * height * 4, data.length);
    let dim = width * height;
    let is_solid = new Uint8Array(dim);
    let queued = new Uint8Array(dim);
    let todo_buf = new Uint32Array(dim);
    let todo_start = 0;
    let todo_end = 0;
    function addNeighbors(idx) {
      let x = idx % width;
      if (x > 0 && !queued[idx - 1]) {
        todo_buf[todo_end++] = idx - 1;
        queued[idx - 1] = 1;
      }
      if (x + 1 < width && !queued[idx + 1]) {
        todo_buf[todo_end++] = idx + 1;
        queued[idx + 1] = 1;
      }
      if (idx > width && !queued[idx - width]) {
        todo_buf[todo_end++] = idx - width;
        queued[idx - width] = 1;
      }
      if (idx + width < dim && !queued[idx + width]) {
        todo_buf[todo_end++] = idx + width;
        queued[idx + width] = 1;
      }
    }
    for (let idx = 0; idx < dim; ++idx) {
      let solid = false;
      for (let ii = 0; ii < alpha_channels.length; ++ii) {
        let offs = alpha_channels[ii];
        if (data[idx*4 + offs]) {
          solid = true;
          break;
        }
      }
      if (solid) {
        queued[idx] = 1;
        is_solid[idx] = 1;
        addNeighbors(idx);
      }
    }
    if (!todo_end) {
      job.out(file);
      return void done();
    }
    let diff = false;
    let solid_mark = [];
    let loop_end = todo_end;
    while (todo_start < todo_end) {
      if (todo_start === loop_end) {
        for (let ii = 0; ii < solid_mark.length; ++ii) {
          is_solid[solid_mark[ii]] = 1;
        }
        solid_mark.length = 0;
        loop_end = todo_end;
      }
      let idx = todo_buf[todo_start++];
      if (is_solid[idx]) {
        continue;
      }
      let y = floor(idx / width);
      let x = idx - y * width;
      let c = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (x > 0 && is_solid[idx - 1]) {
        r += data[idx*4-4];
        g += data[idx*4-3];
        b += data[idx*4-2];
        a += data[idx*4-1];
        c++;
      }
      if (x < width-1 && is_solid[idx + 1]) {
        r += data[idx*4+4];
        g += data[idx*4+5];
        b += data[idx*4+6];
        a += data[idx*4+7];
        c++;
      }
      if (y > 0 && is_solid[idx - width]) {
        r += data[(idx-width)*4];
        g += data[(idx-width)*4+1];
        b += data[(idx-width)*4+2];
        a += data[(idx-width)*4+3];
        c++;
      }
      if (y < height-1 && is_solid[idx + width]) {
        r += data[(idx+width)*4];
        g += data[(idx+width)*4+1];
        b += data[(idx+width)*4+2];
        a += data[(idx+width)*4+3];
        c++;
      }
      assert(c);
      r = round(r/c);
      g = round(g/c);
      b = round(b/c);
      a = round(a/c);
      if (!(alpha_channel & 1)) {
        diff ||= data[idx*4] !== r;
        data[idx*4] = r;
      }
      if (!(alpha_channel & 2)) {
        diff ||= data[idx*4+1] !== g;
        data[idx*4+1] = g;
      }
      if (!(alpha_channel & 4)) {
        diff ||= data[idx*4+2] !== b;
        data[idx*4+2] = b;
      }
      if (!(alpha_channel & 8)) {
        diff ||= data[idx*4+3] !== a;
        data[idx*4+3] = a;
      }
      addNeighbors(idx);
      solid_mark.push(idx);
    }

    let buffer = pngWrite(pngin);
    if (!diff && buffer.length > file.contents.length) {
      // No change, and output is larger, output original
      job.out(file);
    } else {
      job.out({
        relative: file.relative,
        contents: buffer,
      });
    }
    done();
  }
  return {
    type: gb.SINGLE,
    func: gbif(globs, imgproc),
    version: [
      globs,
      rules,
      imgproc,
    ],
  };
};
