const assert = require('assert');
const gb = require('glovjs-build');
const { forwardSlashes } = gb;
const path = require('path');
const sourcemap = require('./sourcemap.js');
// const through = require('through2');

function bundleSub(opts) {
  // entrypoint: 'client/app.js',
  // source: 'client_intermediate',
  // out: 'client/app.bundle.js',
  // sourcemap: false, // defaults true
  // browserify: {}
  const { source, entrypoint, out } = opts;
  let do_sourcemaps = opts.sourcemap !== false;
  let browserify_opts = { ...opts.browserify };
  if (do_sourcemaps) {
    browserify_opts.debug = true;
  }
  let out_name = out || entrypoint.replace('.js', '.bundle.js'); // Or just use entrypoint?

  let browserify;
  function bundleTaskInit(next) {
    browserify = require('browserify'); // eslint-disable-line global-require
    if (browserify_opts.transform) {
      browserify_opts.transform.forEach((row) => {
        if (typeof row[0] === 'string') {
          // pre-load for timing/pipelining purposes
          require(row[0]); // eslint-disable-line global-require
        }
      });
    }
    next();
  }

  // This option is passed to `module-deps`
  // It allows us to source our own files from our job layer instead of requiring
  //   them to exist on-disk relative to any particular path.
  function persistentCache(job,
    file_name, // the path to the file that is loaded
    id,   // the id that is used to reference this file
    pkg,  // the package that this file belongs to fallback
    fallback, // async fallback handler to be called if the cache doesn't hold the given file
    cb    // callback handler that receives the cache data
  ) {
    let user_data = job.getUserData();
    let { base_path, cache } = user_data;
    if (!base_path) {
      base_path = user_data.base_path = job.getFile().getBucketDir();
    }
    let relative = forwardSlashes(path.relative(base_path, file_name));
    // TODO: if outside of our base, or node_modeules, just do simple caching and/or just pass it to `fallback`?
    let key = `${source}:${relative}`;
    if (cache[key]) {
      return void cb(null, cache[key]);
    }
    if (!user_data.job_in_progress) {
      return void cb('Job already completed');
    }
    // TODO: when/how do we reset or remove deps?  Bundle will grow until build task is restarted, otherwise
    job.depAdd(key, function (err, buildfile) {
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
  }

  function bundleTask(job, done) {
    let user_data = job.getUserData();
    let { b, cache } = user_data;
    let the_file = job.getFile();
    if (!b) {
      cache = user_data.cache = {};

      browserify_opts.persistentCache = persistentCache.bind(null, job);

      let disk_path = the_file.getDiskPath();
      b = user_data.b = browserify(disk_path, browserify_opts);
      b.on('log', console.log); // output build logs to terminal
    }

    let updated = job.getFilesUpdated();
    for (let ii = 0; ii < updated.length; ++ii) {
      let file = updated[ii];
      delete cache[file.key];
    }

    // b.pipeline.get('deps').push(through.obj(function (obj, enc, next) {
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


    user_data.job_in_progress = true;
    b.bundle(function (err, buf) {
      if (!user_data.job_in_progress) {
        // already called this!  Probably an error, log this somewhere, though?
        return;
      }
      user_data.job_in_progress = false;
      if (err) {
        return void done(err);
      }
      if (do_sourcemaps) {
        sourcemap.out(job, {
          relative: out_name,
          contents: String(buf),
          inline: false,
        });
      } else {
        job.out({
          relative: out_name,
          contents: buf,
        });
      }

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
}

module.exports = function bundle(opts) {
  // entrypoint: 'client/app.js',
  // source: 'client_intermediate',
  // out: 'client/app.bundle.js',
  // deps: 'client/app_deps.js',
  // deps_source: 'source',
  // is_worker: false,
  // target: 'dev:client',
  let { source, entrypoint, out, deps, deps_source, is_worker, target, deps_out } = opts;
  let subtask_name = `bundle_${path.basename(entrypoint)}`;

  let tasks = [];

  function addBundle(name, subbundle_opts) {
    gb.task({
      name,
      target,
      ...bundleSub(subbundle_opts)
    });
    tasks.push(name);
  }

  let browserify = {
    transform: [],
    bundleExternal: false,
    // want fullPaths, but that includes full working paths for some reason, even with basedir set
  };

  addBundle(`${subtask_name}_entrypoint`, {
    entrypoint,
    source,
    out,
    browserify,
  });

  if (deps) {
    const babelify_opts = {
      global: true, // Required because some modules (e.g. dot-prop) have ES6 code in it
      // For some reason this is not getting picked up from .babelrc for modules!
      presets: [
        ['@babel/env', {
          'targets': {
            'ie': '10'
          },
          'loose': true,
        }]
      ],
    };
    browserify = {
      bundleExternal: true,
      builtins: {
        // super-simple replacements, if needed
        assert: './src/client/shims/assert.js',
        buffer: './src/client/shims/buffer.js',
        not_worker: !is_worker && './src/client/shims/not_worker.js',
        // timers: './src/client/shims/timers.js',
        _process: './src/client/shims/empty.js',
      },
      debug: true, // generate sourceMaps
      transform: [
        ['babelify', babelify_opts],
      ],
    };

    addBundle(`${subtask_name}_deps`, {
      entrypoint: deps,
      source: deps_source,
      out: deps_out,
      browserify,
    });
  }

  return {
    type: gb.SINGLE,
    deps: tasks,
  };
};
