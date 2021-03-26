const assert = require('assert');
const fs = require('fs');
const gb = require('glovjs-build');
const { forwardSlashes } = gb;
const path = require('path');
const sourcemap = require('./sourcemap.js');
const through = require('through2');

module.exports = function bundle(opts) {
  // entrypoint: 'app.js',
  // source: 'client_intermediate:client/',
  // deps: 'app_deps.js',
  // deps_source: 'client/',
  // is_worker: false,
  // target: 'dev:client',
  let { source, entrypoint, deps, deps_source, is_worker, target } = opts;
  let out_name = entrypoint.replace('.js', '.bundle.js');

  let browserify_opts = {
    debug: true, // generate sourceMaps
    transform: [],
    bundleExternal: false,
    // want fullPaths, but that includes full working paths for some reason, even with basedir set
  };

  let the_job;
  let base_path;
  let cache = {};
  // This option is passed to `module-deps`
  // It allows us to source our own files from our job layer instead of requiring
  //   them to exist on-disk relative to any particular path.
  browserify_opts.persistentCache = function persistentCache(
    file_name, // the path to the file that is loaded
    id,   // the id that is used to reference this file
    pkg,  // the package that this file belongs to fallback
    fallback, // async fallback handler to be called if the cache doesn't hold the given file
    cb    // callback handler that receives the cache data
  ) {
    assert(base_path);
    let relative = forwardSlashes(path.relative(base_path, file_name));
    // TODO: if outside of our base, or node_modeules, just do simple caching and/or just pass it to `fallback`?
    let key = `${source}:${relative}`;
    if (cache[key]) {
      return void cb(null, cache[key]);
    }
    if (!the_job) {
      return void cb('Job already completed');
    }
    // TODO: when/how do we reset or remove deps?
    the_job.depAdd(key, function (err, buildfile) {
      assert.equal(buildfile.key, key);
      if (err) {
        return void cb(err);
      }

      fallback(buildfile.contents.toString(), function (error, cacheableEntry) {
        if (error) {
          return void cb(error);
        }
        // cacheableEntry = {
        //   source: buildfile.contents.toString(),
        //   package: pkg, // The package for housekeeping
        //   deps: {
        //       'id':  // id that is used to reference a required file
        //       'file' // file path to the required file
        //   }
        // }
        cache[key] = cacheableEntry;
        cb(null, cacheableEntry);
      });
    });
  };

  let browserify;
  let b;
  function bundleTaskInit(next) {
    // eslint-disable-next-line global-require
    browserify = require('browserify');
    b = browserify(browserify_opts);
    next();
  }

  function bundleTask(job, done) {
    assert(!the_job);
    the_job = job;
    let the_file = job.getFile();
    let disk_path = the_file.getDiskPath();
    base_path = the_file.getBucketDir();

    let updated = job.getFilesUpdated();
    for (let ii = 0; ii < updated.length; ++ii) {
      let file = updated[ii];
      delete cache[file.key];
    }

    b.add(disk_path);
    b.on('log', console.log); // output build logs to terminal
    // b.pipeline.get('deps').unshift(through.obj(function (obj, enc, next) {
    //   let log = {};
    //   for (let key in obj) {
    //     let v = obj[key];
    //     if (v && v.length && v.length > 80) {
    //       v = `${v.slice(0,40)}...${v.slice(-37)}`;
    //     }
    //     log[key] = v;
    //   }
    //   console.log(log);
    //   this.push(obj);
    //   next();
    // }));



    b.bundle(function (err, buf) {
      if (!the_job) {
        // already called this!  Probably an error, log this somewhere, though?
        return;
      }
      the_job = null;
      if (err) {
        return void done(err);
      }
      sourcemap.out(job, {
        relative: out_name,
        contents: String(buf),
        inline: false,
      });


      done();
    });
  }

  return {
    type: gb.SINGLE,
    init: bundleTaskInit,
    func: bundleTask,
    // finish: bundleTaskEnd,
    input: `${source}:${entrypoint}`,
  };
};
