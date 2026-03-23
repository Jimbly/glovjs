const assert = require('assert');
const gb = require('glov-build');
const micromatch = require('micromatch');
const { pngAlloc, pngRead, pngWrite } = require('./png.js');

module.exports = function (globs) {
  function imgproc(job, done) {
    let file = job.getFile();
    if (globs.length && !micromatch(file.relative, globs).length) {
      job.out(file);
      return void done();
    }
    let { err, img: pngin } = pngRead(file.contents);
    if (err) {
      return void done(err);
    }
    let { width, height, data } = pngin;
    assert.equal(width * height * 4, data.length);
    let border_transparent_any = false;
    let border_transparent_all = true;
    for (let ii = 0; ii < width && (!border_transparent_any || border_transparent_all); ++ii) {
      if (!data[ii*4 + 3]) {
        border_transparent_any = true;
      } else {
        border_transparent_all = false;
      }
      if (!data[((height - 1) * width + ii)*4 + 3]) {
        border_transparent_any = true;
      } else {
        border_transparent_all = false;
      }
    }
    for (let ii = 0; ii < height && (!border_transparent_any || border_transparent_all); ++ii) {
      if (!data[ii*width*4 + 3]) {
        border_transparent_any = true;
      } else {
        border_transparent_all = false;
      }
      if (!data[(ii * width + width - 1)*4 + 3]) {
        border_transparent_any = true;
      } else {
        border_transparent_all = false;
      }
    }
    if (!border_transparent_any || border_transparent_all) {
      job.out(file);
      return void done();
    }
    let pngout = pngAlloc({ width: width + 2, height: height + 2, byte_depth: 4, comment: 'alphaborder' });
    let outdata = pngout.data;
    for (let ii = 0; ii < height; ++ii) {
      let target_start = ((ii + 1) * (width + 2) + 1) * 4;
      let source_start = ii * width * 4;
      data.copy(outdata, target_start, source_start, source_start + width * 4);
    }
    let buffer = pngWrite(pngout);
    job.out({
      relative: file.relative,
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
