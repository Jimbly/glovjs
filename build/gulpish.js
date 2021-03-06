const assert = require('assert');
const gb = require('glovjs-build');
const { Transform, Writable } = require('stream');
const path = require('path');

module.exports = function (target, streamfunc) {
  function func(job, done) {
    // Creating a new stream per-file, might need something smarter? Or they should be gb.ALL tasks anyway?
    let source_stream = new Transform({
      objectMode: true,
    });
    let outstream = streamfunc(source_stream);
    outstream.on('error', done);
    let the_file = job.getFile();
    let target_stream = outstream.pipe(new Writable({
      objectMode: true,
      write: function (chunk, encoding, callback) {
        if (target) {

          // If a Vinyl object, re-map to relative to the bucket
          chunk.base = the_file.base;
          // Probably not strictly necessary, but let's check expected relative path
          assert.equal(chunk.relative.replace(/\\/g, '/'), path.relative(the_file.base, chunk.path).replace(/\\/g, '/'));

          job.out(chunk);
        }
        callback();
      },
    }));
    target_stream.on('finish', done);
    source_stream.push(the_file);
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
