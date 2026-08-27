const { brotliCompress, gzip } = require('zlib');
const { asyncParallel } = require('glov-async');
const gb = require('glov-build');
const micromatch = require('micromatch');

module.exports = function (opts) {
  let { globs, passthrough } = opts;
  let do_brotli = opts.brotli ?? true;
  let do_gzip = opts.gzip ?? true;

  function gbif(fn) {
    return function (job, done) {
      let file = job.getFile();
      if (micromatch(file.relative, globs).length) {
        fn(job, done);
      } else {
        if (passthrough) {
          job.out(file);
        }
        done();
      }
    };
  }

  function compressFunc(job, done) {
    let file = job.getFile();
    if (passthrough) {
      job.out(file); // pass through uncompressed file
    }
    let tasks = [];
    if (do_brotli) {
      tasks.push(function (next) {
        job.depAdd(`${file.bucket}:${file.relative}.br`, function (err, brfile) {
          if (!err && brfile) {
            return void next();
          }
          brotliCompress(file.contents, function (err, buffer_br) {
            if (!err) {
              job.out({
                relative: `${file.relative}.br`,
                contents: buffer_br,
              });
            }
            next(err);
          });
        });
      });
    }
    if (do_gzip) {
      tasks.push(function (next) {
        job.depAdd(`${file.bucket}:${file.relative}.gz`, function (err, gzfile) {
          if (!err && gzfile) {
            return void next();
          }
          gzip(file.contents, function (err, buffer_gz) {
            if (!err) {
              job.out({
                relative: `${file.relative}.gz`,
                contents: buffer_gz,
              });
            }
            next(err);
          });
        });
      });
    }
    asyncParallel(tasks, done);
  }

  return {
    type: gb.SINGLE,
    func: gbif(compressFunc),
    version: [
      opts,
      module.exports,
    ],
  };
};
