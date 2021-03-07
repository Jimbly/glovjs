//////////////////////////////////////////////////////////////////////////
// Wrapper for gulp-like stream tasks to run as glovjs-build tasks
// Caveats:
//   Dependencies are not tracked, to get a task to re-process something, the
//     referencing source file must be re-saved.
//   All glovjs-build jobs are relative to the bucket root, regardless of where
//     the ** is in the glob, so some tasks may need to be adjusted (e.g.
//     gulp-rename will behave slightly differently)

const assert = require('assert');
const gb = require('glovjs-build');
const { Transform, Writable } = require('stream');
const path = require('path');
const Vinyl = require('vinyl');

module.exports = function (target, streamfunc) {
  // TODO: also monkey-patch require('vinyl-fs').src to detect deps?

  function func(job, done) {
    // Creating a new stream per-file, might need something smarter? Or they should be gb.ALL tasks anyway?
    let source_stream = new Transform({
      objectMode: true,
    });
    let outstream = streamfunc(source_stream);
    outstream.on('error', done);
    let the_file = job.getFile();
    let the_file_vinyl_param = the_file.toVinyl();
    let target_stream = outstream.pipe(new Writable({
      objectMode: true,
      write: function (chunk, encoding, callback) {
        if (target) {

          // If a Vinyl object, re-map to relative to the bucket
          chunk.base = the_file_vinyl_param.base;
          let out_file = {
            relative: chunk.relative.replace(/\\/g,'/'),
            contents: chunk.contents,
          };
          assert.equal(out_file.relative, path.relative(the_file_vinyl_param.base, chunk.path).replace(/\\/g, '/'));

          job.out(out_file);
        }
        callback();
      },
    }));
    target_stream.on('finish', done);
    source_stream.push(new Vinyl(the_file_vinyl_param));
    source_stream.end();
  }

  // Override func.toString for automatic versioning
  func.toString = function () {
    return Function.prototype.toString.call(func) + streamfunc.toString();
  };

  return {
    type: gb.SINGLE,
    func,
    target,
  };
};
