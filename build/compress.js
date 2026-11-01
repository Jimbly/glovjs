const { constants, brotliCompress, gzip } = require('zlib');
const { asyncParallel } = require('glov-async');
const gb = require('glov-build');
const micromatch = require('micromatch');

module.exports = function (opts) {
  let { globs, passthrough, noexistcheck } = opts;
  let do_brotli = opts.brotli ?? true;
  let do_gzip = opts.gzip ?? true;
  let do_minsize = opts.minsize ?? true;
  let min_savings = do_minsize ? 512 : -Infinity; // must be at least this many bytes smaller
  let min_savings_ratio = do_minsize ? 0.95 : Infinity; // must be at least this compression ratio
  let min_size = do_minsize ? 1024 : 0; // source file must be this big or larger to even try
  let do_max = opts.max ?? false;

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
    let initial_size = file.contents.length;
    let tasks = [];
    if (do_brotli && initial_size >= min_size) {
      tasks.push(function (next) {
        function doit() {
          let params = {
            [constants.BROTLI_PARAM_QUALITY]: do_max ? 11 : 6,
          };
          brotliCompress(file.contents, {
            params,
          }, function (err, buffer_br) {
            if (!err) {
              if (
                initial_size - buffer_br.length > min_savings &&
                buffer_br.length / initial_size < min_savings_ratio
              ) {
                job.out({
                  relative: `${file.relative}.br`,
                  contents: buffer_br,
                });
              }
            }
            next(err);
          });
        }
        if (noexistcheck) {
          doit();
        } else {
          job.depAdd(`${file.bucket}:${file.relative}.br`, function (err, brfile) {
            if (!err && brfile) {
              return void next();
            }
            doit();
          });
        }
      });
    }
    if (do_gzip && initial_size >= min_size) {
      tasks.push(function (next) {
        function doit() {
          let params = {};
          if (do_max) {
            params.level = constants.Z_BEST_COMPRESSION;
          }
          gzip(file.contents, params, function (err, buffer_gz) {
            if (!err) {
              if (
                initial_size - buffer_gz.length > min_savings &&
                buffer_gz.length / initial_size < min_savings_ratio
              ) {
                job.out({
                  relative: `${file.relative}.gz`,
                  contents: buffer_gz,
                });
              }
            }
            next(err);
          });
        }
        if (noexistcheck) {
          doit();
        } else {
          job.depAdd(`${file.bucket}:${file.relative}.gz`, function (err, gzfile) {
            if (!err && gzfile) {
              return void next();
            }
            doit();
          });
        }
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
