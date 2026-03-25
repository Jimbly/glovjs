const path = require('path');
const { scaleImage: depixelScale } = require('depixel');
const gb = require('glov-build');
const alphafix = require('./alphafix.js');
const asyncHashed = require('./asynchashed.js');
const autoatlas = require('./autoatlas_build.js');
const {
  drawImageBilinear,
  pngAlloc,
  pngRead,
  pngWrite,
} = require('./png');
const {
  tilingContract,
  tilingExpand,
} = require('./tiling');

const scale = 8;
const depixel_input = [
  'demo/*.png',
  'utumno/*.png',
];

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
    pix: 4,
    // auto rules:
    //   if alpha on all 4 sides, do both alpha (will break with UI frames)
    //   otherwise, if alpha on either vert side, do vert_clamp; same for horiz
    //   otherwise, repeat
    rules: [
      '**/*chest*:balpha',
      '**/*wall*:hwrap,vclamp',
      '**/*door*:hwrap,vclamp',
      '**/*stairs*:hwrap,vclamp',
      '**/*arch*:hwrap,vclamp',
      '**/*exit*:hwrap,vclamp',
      '**/*enter*:hwrap,vclamp',
      '**/*return*:hwrap,vclamp',
      '**/*brick_dark*:hwrap,vclamp',
      '**/*lair*:hwrap,vclamp',
    ],
  }),
});

gb.task({
  name: 'depixel-alphafix',
  input: ['depixel-tiling-expand:**'],
  ...alphafix(depixel_input),
});

gb.task(asyncHashed(8, {
  name: 'depixel-proc',
  input: ['depixel-alphafix:**'],
  type: gb.SINGLE,
  version: [depixelScale, scale],
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
    let scale1 = scale * 2;
    let intermed = depixelScale(img, {
      height: img.height * scale1,
      threshold: 32,
      borderPx: 1,
    });

    let dst = pngAlloc({ width: img.width * scale, height: img.height * scale, byte_depth: 4,
      comment: 'depixel' });
    drawImageBilinear(
      dst, 4, 0, 0, dst.width, dst.height, intermed, 4, 0, 0, intermed.width, intermed.height, 0xf);

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
