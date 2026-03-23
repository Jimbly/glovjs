const assert = require('assert');
const gb = require('glov-build');
const micromatch = require('micromatch');
const { pngAlloc, pngRead, pngWrite } = require('./png.js');

const { floor } = Math;

exports.tilingExpand = function (param) {
  let { horiz, vert, both, pix } = param;
  pix = pix || 1;
  function imgproc(job, done) {
    let file = job.getFile();
    let tile_horz = Boolean(micromatch(file.relative, horiz).length);
    let tile_vert = Boolean(micromatch(file.relative, vert).length);
    if (!tile_horz && !tile_vert && micromatch(file.relative, both).length) {
      tile_horz = tile_vert = true;
    }
    if (!tile_horz && !tile_vert) {
      job.out(file);
      return void done();
    }
    let { err, img: pngin } = pngRead(file.contents);
    if (err) {
      return void done(err);
    }
    let { width, height, data } = pngin;
    assert.equal(width * height * 4, data.length);
    let dw = (tile_horz ? pix : 0);
    let dh = (tile_vert ? pix : 0);
    let newwidth = width + dw * 2;
    let newheight = height + dh * 2;
    let pngout = pngAlloc({ width: newwidth, height: newheight, byte_depth: 4, comment: 'tilingExpand' });
    let outdata = pngout.data;
    function copy2(target, source, length) {
      data.copy(outdata, target, source, source + length * 4);
    }
    for (let ii = 0; ii < newheight; ++ii) {
      let source_row = ((ii - dh + height) % height) * width * 4;
      let target_row = ii * newwidth * 4;
      copy2(target_row + dw * 4, source_row, width);
      if (dw) {
        copy2(target_row, source_row + (width - dw) * 4, dw);
        copy2(target_row + (dw + width) * 4, source_row, dw);
      }
    }
    let suffix = `-tile-${width}-${height}-${pix}${tile_horz ? 'h' : ''}${tile_vert ? 'v' : ''}.png`;
    let buffer = pngWrite(pngout);
    job.out({
      relative: file.relative.replace('.png', suffix),
      contents: buffer,
    });
    done();
  }
  return {
    type: gb.SINGLE,
    func: imgproc,
    version: [
      imgproc,
      param,
    ],
  };
};

function isInteger(v) {
  return typeof v === 'number' && isFinite(v) && floor(v) === v;
}

exports.tilingContract = function () {
  function imgproc(job, done) {
    let file = job.getFile();
    let m = file.relative.match(/^(.*)-tile-(\d+)-(\d+)-(\d+)([vh]+)(.*)$/);
    if (!m) {
      job.out(file);
      return void done();
    }
    let relative = `${m[1]}${m[6]}`;
    let orig_width = Number(m[2]);
    let orig_height = Number(m[3]);
    let orig_pix = Number(m[4]);
    let flags = m[5];
    let tile_horz = flags.includes('h');
    let tile_vert = flags.includes('v');
    assert(tile_horz || tile_vert);

    let { err, img: pngin } = pngRead(file.contents);
    if (err) {
      return void done(err);
    }
    let { width, height, data } = pngin;
    assert.equal(width * height * 4, data.length);
    let orig_dw = tile_horz ? orig_pix : 0;
    let orig_dh = tile_vert ? orig_pix : 0;
    let scalex = width / (orig_width + orig_dw * 2);
    // if this fires, probably the image triggered alphaborder - in which case
    // we probably do _not_ it tiling, so, exclude it here
    assert(isInteger(scalex), file.relative);
    let scaley = height / (orig_height + orig_dh * 2);
    assert(isInteger(scaley));
    assert.equal(scalex, scaley);

    let dw = orig_dw * scalex;
    let dh = orig_dh * scaley;
    let newwidth = width - dw * 2;
    let newheight = height - dh * 2;
    let pngout = pngAlloc({ width: newwidth, height: newheight, byte_depth: 4, comment: 'tilingContract' });
    let outdata = pngout.data;
    for (let ii = 0; ii < newheight; ++ii) {
      let source_row = (ii + dh) * width * 4 + dw * 4;
      let target_row = ii * newwidth * 4;
      data.copy(outdata, target_row, source_row, source_row + newwidth * 4);
    }
    let buffer = pngWrite(pngout);
    job.out({
      relative,
      contents: buffer,
    });
    done();
  }
  return {
    type: gb.SINGLE,
    func: imgproc,
    version: [
      imgproc,
    ],
  };
};
