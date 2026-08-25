const assert = require('assert');
const alphafix = require('alphafix');
const gb = require('glov-build');
const micromatch = require('micromatch');
const { pngRead, pngWrite } = require('./png.js');

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

    alphafix({
      alpha_channel,
      image: pngin,
    });

    let buffer = pngWrite(pngin);
    job.out({
      relative: file.relative,
      contents: buffer,
    });
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
