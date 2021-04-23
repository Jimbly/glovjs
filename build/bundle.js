const assert = require('assert');
const async = require('async');
const gb = require('glov-build');
const { forwardSlashes } = gb;
const path = require('path');
const sourcemap = require('./sourcemap.js');
const uglify = require('./uglify.js');
// const through = require('through2');


const uglify_options_ext = { compress: true, keep_fnames: false, mangle: true };


function concat(opts) {
  let { first_file, output } = opts;
  function cmpFirstFile(a, b) {
    if (a.key === first_file) {
      return -1;
    }
    if (b.key === first_file) {
      return 1;
    }
    return a.key < b.key ? -1 : 1;
  }
  function isJS(file) {
    return file.relative.endsWith('.js');
  }
  return function (job, done) {
    let files = job.getFiles().filter(isJS);
    files.sort(cmpFirstFile);
    let sourcemaps = [];
    let sourcetext = [];
    // TODO: do not re-init sourcemap for unchanged files
    async.eachOf(files, function (file, idx, next) {
      sourcemap.init(job, file, function (err, map, ignored, stripped) {
        if (err) {
          return void next(err);
        }
        sourcetext[idx] = stripped;
        sourcemaps[idx] = map;
        next();
      });
    }, function (err) {
      if (err) {
        return void done(err);
      }
      // Concatenate lines and sourcemaps
      let lines = [];
      let final_map = {
        mappings: [],
        sources: [],
        sourcesContent: [],
      };
      let name_to_idx = Object.create(null);
      let names = [];
      for (let ii = 0; ii < sourcetext.length; ++ii) {
        let code = sourcetext[ii];
        let new_lines = code.toString().split('\n');
        let map = sourcemaps[ii];
        map = sourcemap.decode(map);
        // combine
        assert(final_map.mappings.length <= lines.length);
        while (final_map.mappings.length < lines.length) {
          final_map.mappings.push([]); // [[]] instead?
        }
        assert(map.sources);
        assert(map.sourcesContent);
        assert.equal(map.sources.length, map.sourcesContent.length);
        let start_source_idx = final_map.sources.length;
        final_map.sources = final_map.sources.concat(map.sources);
        final_map.sourcesContent = final_map.sourcesContent.concat(map.sourcesContent);
        for (let line_num = 0; line_num < map.mappings.length; ++line_num) {
          let line_map = map.mappings[line_num];
          let out_line_map = [];
          for (let jj = 0; jj < line_map.length; ++jj) {
            let map_elem = line_map[jj];
            if (map_elem.length <= 1) {
              // just output char offset, meaningless? pass it through
              out_line_map.push(map_elem);
            } else if (map_elem.length === 4 || map_elem.length === 5) {
              let elem = [ // mostly pass-through
                map_elem[0],
                map_elem[1] + start_source_idx, // source file index
                map_elem[2],
                map_elem[3],
              ];
              if (map_elem.length === 5) {
                let name = map.names[map_elem[4]];
                assert(name);
                let name_idx = name_to_idx[name];
                if (name_idx === undefined) {
                  name_idx = name_to_idx[name] = names.length;
                  names.push(name);
                }
                elem.push(name_idx);
              }
              out_line_map.push(elem);
            } else {
              assert(false);
            }
          }
          final_map.mappings.push(out_line_map);
        }
        lines = lines.concat(new_lines);
      }
      if (names.length) {
        final_map.names = names;
      }
      sourcemap.out(job, {
        relative: output,
        contents: Buffer.from(lines.join('\n')),
        map: sourcemap.encode(output, final_map),
        inline: false,
      });
      done();
    });
  };
}

function bundleSub(opts) {
  // entrypoint: 'client/app.js',
  // source: 'client_intermediate',
  // out: 'client/app.bundle.js',
  // sourcemap: false, // defaults true
  // do_version: 'client/app.ver.json',
  // browserify: {}
  // target: 'dev'
  const { source, entrypoint, out, do_version, target } = opts;
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
      browserify_opts.basedir = path.dirname(disk_path);
      b = user_data.b = browserify(disk_path, browserify_opts);
      b.on('log', job.log.bind(job)); // output build logs to terminal
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

      let build_timestamp;
      if (do_version) {
        build_timestamp = Date.now();
        // Must be exactly 'BUILD_TIMESTAMP'.length (15) characters long
        build_timestamp = `"${build_timestamp}"`;
        opts.last_build_timestamp = build_timestamp;
        assert.equal(build_timestamp.length, 15);

        buf = String(buf).replace(/BUILD_TIMESTAMP/g, build_timestamp);
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
    input: `${source}:${entrypoint}`,
    target,
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
  let { source, entrypoint, out, deps, deps_source, is_worker, target, deps_out, do_version } = opts;
  let subtask_name = `bundle_${path.basename(entrypoint)}`;

  let tasks = [];

  function addBundle(name, subbundle_opts) {
    gb.task({
      name,
      ...bundleSub(subbundle_opts)
    });
  }

  let browserify = {
    transform: [],
    bundleExternal: false,
    // want fullPaths, but that includes full working paths for some reason, even with basedir set
  };

  let do_final_bundle = is_worker && deps;

  assert(!(do_version && do_final_bundle)); // app.ver.json would go to wrong place

  let entrypoint_name = `${subtask_name}_entrypoint`;
  let versioned_name = entrypoint_name;
  if (!do_final_bundle) {
    tasks.push(entrypoint_name);
  }
  let entrypoint_subbundle_opts = {
    entrypoint,
    source,
    out,
    browserify,
    do_version,
    target: do_final_bundle ? undefined : target,
  };
  addBundle(entrypoint_name, entrypoint_subbundle_opts);

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

    if (!deps_out) {
      deps_out = 'deps.bundle.js';
    }
    let deps_name = `${subtask_name}_deps`;
    addBundle(deps_name, {
      entrypoint: deps,
      source: deps_source,
      out: deps_out,
      browserify,
    });

    let uglify_name = `${deps_name}_uglify`;
    gb.task({
      name: uglify_name,
      type: gb.SINGLE,
      input: `${deps_name}:${deps_out}`,
      target: do_final_bundle ? undefined : target,
      ...uglify({ inline: Boolean(do_final_bundle) }, uglify_options_ext),
    });
    if (!do_final_bundle) {
      tasks.push(uglify_name);
    } else {

      let final_name = `${subtask_name}_final`;
      versioned_name = final_name;
      tasks.push(final_name);

      gb.task({
        name: final_name,
        type: gb.ALL,
        input: [
          `${uglify_name}:${deps_out}`,
          `${entrypoint_name}:${out}`,
        ],
        target,
        func: concat({
          output: out,
          first_file: `${uglify_name}:${deps_out}`
        }),
      });

    }
  }

  if (do_version) {
    let version_writer_name = `${subtask_name}_ver`;
    gb.task({
      name: version_writer_name,
      deps: tasks.slice(0),
      type: gb.SINGLE,
      input: [`${versioned_name}:${out}`],
      target,
      func: function (job, done) {
        // This would happen if we did not run the bundle in this process, but
        // were running this task for some reason.  Probably need a clean or
        // forcing the bundle to re-run.
        // TODO: Not great!
        assert(entrypoint_subbundle_opts.last_build_timestamp);
        job.out({
          relative: do_version,
          contents: `{"ver":${entrypoint_subbundle_opts.last_build_timestamp}}`,
        });
        done();
      },
    });
    tasks.push(version_writer_name);
  }

  // Important: one, final composite task that references each of the final outputs.
  //   This allows other tasks to reference our output files as a single glob
  //   without knowing the internal names of the individual tasks.
  return {
    type: gb.SINGLE,
    deps: tasks,
  };
};
