const assert = require('assert');
const async = require('async');
const bundle = require('./bundle.js');
const gb = require('glov-build');
const uglify = require('./uglify.js');
const path = require('path');
const sourcemap = require('glov-build-sourcemap');

const uglify_options_ext = { compress: true, keep_fnames: false, mangle: true };

const browserify_options_entrypoint = {
  transform: [],
  bundleExternal: false,
  debug: true, // generate sourceMaps
};

const babelify_opts_deps = {
  global: true, // Required because some modules (e.g. dot-prop) have ES6 code in it
  presets: [
    ['@babel/env', {
      'targets': {
        'ie': '10'
      },
      'loose': true,
    }]
  ],
};

const browserify_options_deps = {
  bundleExternal: true,
  builtins: {
    // super-simple replacements, if needed
    assert: './src/client/shims/assert.js',
    buffer: './src/client/shims/buffer.js',
    not_worker: './src/client/shims/not_worker.js',
    // timers: './src/client/shims/timers.js',
    _process: './src/client/shims/empty.js',
  },
  debug: true, // generate sourceMaps
  transform: [
    ['babelify', babelify_opts_deps],
  ],
};

const browserify_options_deps_worker = {
  ...browserify_options_deps,
  builtins: {
    ...browserify_options_deps.builtins,
    not_worker: null, // cause failure if any module does a `require('not_worker')`
  },
};


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

function bundlePair(opts) {
  // entrypoint: 'client/app.js',
  // source: 'client_intermediate',
  // out: 'client/app.bundle.js',
  // deps: 'client/app_deps.js',
  // deps_source: 'source',
  // is_worker: false,
  // target: 'dev:client',
  let { source, entrypoint, out, deps, deps_source, is_worker, target, deps_out, post_bundle_cb } = opts;
  let subtask_name = `bundle_${path.basename(entrypoint)}`;

  let tasks = [];

  let do_final_bundle = is_worker && deps;

  let entrypoint_name = `${subtask_name}_entrypoint`;
  if (!do_final_bundle) {
    tasks.push(entrypoint_name);
  }
  let entrypoint_subbundle_opts = {
    entrypoint,
    source,
    out,
    browserify: browserify_options_entrypoint,
    target: do_final_bundle ? undefined : target,
    post_bundle_cb,
  };
  gb.task({
    name: entrypoint_name,
    ...bundle(entrypoint_subbundle_opts)
  });

  if (deps) {
    if (!deps_out) {
      deps_out = 'deps.bundle.js';
    }
    let deps_name = `${subtask_name}_deps`;
    gb.task({
      name: deps_name,
      ...bundle({
        entrypoint: deps,
        source: deps_source,
        out: deps_out,
        browserify: is_worker ? browserify_options_deps_worker : browserify_options_deps,
        post_bundle_cb,
      }),
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

  // Important: one, final composite task that references each of the final outputs.
  //   This allows other tasks to reference our output files as a single glob
  //   without knowing the internal names of the individual tasks.
  return {
    type: gb.SINGLE,
    deps: tasks,
  };
}


const VERSION_STRING = 'BUILD_TIMESTAMP';
const VERSION_BUFFER = Buffer.from(VERSION_STRING);
function versionReplacer(buf) {
  let idx = buf.indexOf(VERSION_BUFFER);
  if (idx !== -1) {
    let build_timestamp = Date.now();
    // Must be exactly 'BUILD_TIMESTAMP'.length (15) characters long
    build_timestamp = `"${build_timestamp}"`;
    assert.equal(build_timestamp.length, 15);
    // Replace all occurrences in `buf`
    let ver_buf = Buffer.from(build_timestamp);
    while (idx !== -1) {
      ver_buf.copy(buf, idx);
      idx = buf.indexOf(VERSION_BUFFER, idx + 15);
    }
  }
}

module.exports = function appBundle(param) {
  let { task_accum, name, out, do_version } = param;
  if (do_version) {
    param.post_bundle_cb = versionReplacer;
  }
  gb.task({
    name,
    ...bundlePair(param),
  });
  task_accum.push(name);
  if (do_version) {
    let version_writer_name = `${name}_ver`;
    gb.task({
      name: version_writer_name,
      deps: task_accum.slice(0), // all previous bundle tasks
      type: gb.SINGLE,
      input: [`${name}:${out}`],
      target: 'dev',
      func: function (job, done) {
        let file = job.getFile();
        let idx = file.contents.indexOf('glov_build_version="');
        if (idx === -1) {
          return void done('Bundle with `do_version` failed: could not find' +
            ' "window.glov_build_version=BUILD_TIMESTAMP;"');
        }
        let last_build_timestamp = file.contents.slice(idx + 'glov_build_version='.length,
          idx + 'glov_build_version=BUILD_TIMESTAMP'.length).toString();
        assert(isFinite(Number(JSON.parse(last_build_timestamp))));
        job.out({
          relative: do_version,
          contents: `{"ver":${last_build_timestamp}}`,
        });
        done();
      },
    });
    task_accum.push(version_writer_name);
  }
};
