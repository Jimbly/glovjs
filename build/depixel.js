const assert = require('assert');
const path = require('path');
const { scaleImage: depixelScale } = require('depixel');
const gb = require('glov-build');
const micromatch = require('micromatch');
const alphafix = require('./alphafix.js');
const asyncHashed = require('./asynchashed.js');
const autoatlas = require('./autoatlas_build.js');
const {
  // drawImageBilinear,
  pngAlloc,
  pngRead,
  pngWrite,
} = require('./png');
const {
  tilingContract,
  tilingExpand,
} = require('./tiling');

const { floor, round } = Math;

const targets = {
  out: path.join(__dirname, '../src/client/atlases-autogen'),
};
const SOURCE_DIR = path.join(__dirname, '../src/client/atlases');
gb.configure({
  source: SOURCE_DIR,
  statedir: path.join(__dirname, '../dist/depixel/.gbstate'),
  targets,
  log_level: gb.LOG_INFO,
});

// eslint-disable-next-line import/order
const config = require('./config.js')(gb, {
  depixel_scales: {
    'demo/*.png': 8,
    'utumno/*.png': 8,
  },
  tiling_expand_pix: 4,
  tiling_expand_rules: [
    // auto rules:
    //   if alpha on all 4 sides, do both alpha (will break with UI frames)
    //   otherwise, if alpha on either vert side, do vert_clamp; same for horiz
    //   otherwise, wrap
    '**/*chest*:balpha',
    '**/*wall*:hwrap,vclamp',
    '**/*solid*:hwrap,vclamp',
    '**/*door*:hwrap,vclamp',
    '**/*stairs*:hwrap,vclamp',
    '**/*arch*:hwrap,vclamp',
    '**/*exit*:hwrap,vclamp',
    '**/*enter*:hwrap,vclamp',
    '**/*return*:hwrap,vclamp',
    '**/*brick_dark*:hwrap,vclamp',
    '**/*lair*:hwrap,vclamp',
  ],
});

const scale_globs = config.depixel_scales;
const depixel_input = Object.keys(scale_globs);

gb.task({
  ...autoatlas({
    name: 'depixel-atlas-prep',
    only_prep: true,
    inputs: depixel_input,
  }),
});

gb.task({
  name: 'depixel-tiling-expand',
  input: ['depixel-atlas-prep:**'],
  ...tilingExpand({
    pix: config.tiling_expand_pix,
    rules: config.tiling_expand_rules,
  }),
});

gb.task({
  name: 'depixel-alphafix',
  input: ['depixel-tiling-expand:**'],
  ...alphafix(depixel_input),
});

function reduceByAverage(dst, src) {
  let ddata = dst.data;
  let dw = dst.width;
  let dh = dst.height;
  let sdata = src.data;
  let sw = src.width;
  let sh = src.height;
  for (let yy = 0; yy < dh; ++yy) {
    let y0 = floor(yy/dh * sh);
    let y1 = floor((yy + 1)/dh * sh);
    for (let xx = 0; xx < dw; ++xx) {
      let x0 = floor(xx/dw * sw);
      let x1 = floor((xx + 1)/dw * sw);
      let c = (y1 - y0) * (x1 - x0);
      for (let channel = 0; channel < 4; ++channel) {
        let v = 0;
        for (let sy = y0; sy < y1; ++sy) {
          for (let sx = x0; sx < x1; ++sx) {
            v += sdata[(sy * sw + sx) * 4 + channel];
          }
        }
        ddata[(yy * dw + xx) * 4 + channel] = round(v / c);
      }
    }
  }
}

gb.task(asyncHashed(8, {
  name: 'depixel-proc',
  input: ['depixel-alphafix:**'],
  type: gb.SINGLE,
  version: [depixelScale, scale_globs, reduceByAverage],
  async: gb.ASYNC_FORK,
  func: function (job, done) {
    let file = job.getFile();
    let { img, err } = pngRead(file.contents);
    if (err) {
      return void done(err);
    }
    let m = file.relative.match(/^([^/]+)\/.*\.png/);
    let new_name = file.relative.replace(`${m[1]}/`, `${m[1]}-depixel/`);
    if (file.relative.endsWith('.9.png')) {
      if (0) { // not doing this: the original will just be used instead
        job.out({
          relative: new_name,
          contents: file.contents,
        });
      }
      return void done();
    }
    let scale = -1;
    for (let key in scale_globs) {
      if (micromatch(file.relative, key).length) {
        scale = scale_globs[key];
      }
    }
    assert(scale !== -1);
    let intermed_scale = scale < 32 ? 4 : 1;
    let scale1 = scale * intermed_scale;
    let intermed = depixelScale(img, {
      height: img.height * scale1,
      threshold: 32,
      borderPx: 1,
    });

    let dst = pngAlloc({ width: img.width * scale, height: img.height * scale, byte_depth: 4,
      comment: 'depixel' });
    if (intermed_scale !== 1) {
      reduceByAverage(dst, intermed);
      // drawImageBilinear(
      //   dst, 4, 0, 0, dst.width, dst.height, intermed, 4, 0, 0, intermed.width, intermed.height, 0xf);
    } else {
      assert.equal(intermed.data.length, dst.data.length);
      intermed.data.copy(dst.data);
    }

    job.out({
      relative: new_name,
      contents: pngWrite(dst),
    });
    done();
  },
}));

gb.task({
  name: 'depixel-tiling-contract',
  input: ['depixel-proc:**'],
  target: 'out',
  ...tilingContract(),
});

// Default task
gb.task({
  name: 'default',
  deps: [
    'depixel-tiling-contract',
  ],
});

gb.go();
