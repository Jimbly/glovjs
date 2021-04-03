//////////////////////////////////////////////////////////////////////////
// Migration TODO:
//   parallel running of eslint
//

const assert = require('assert');
const bundle = require('./bundle.js');
const gb = require('glovjs-build');
const eslint = require('./eslint.js');
const json5 = require('./json5.js');
const gulpish_bundle = require('./gulpish-bundle.js');
const gulpish_tasks = require('./gulpish-tasks.js');
const path = require('path');
const Replacer = require('regexp-sourcemaps');
const sourcemap = require('./sourcemap.js');
const uglify = require('./uglify.js');
const warnMatch = require('./warn-match.js');
const webfs = require('./webfs_build.js');

require('./checks.js')(__filename);

const targets = {
  dev: path.join(__dirname, '../dist3/game/build.dev'),
};
const SOURCE_DIR = path.join(__dirname, '../src/');
gb.configure({
  source: SOURCE_DIR,
  statedir: path.join(__dirname, '../dist3/game/.gbstate'),
  targets,
  log_level: gb.LOG_INFO,
});

const config = {
  server_js_files: ['**/*.js', '!client/**/*.js'],
  server_static: ['**/common/words/*.gkg'],
  all_js_files: ['**/*.js', '!client/vendor/**/*.js'],
  client_js_files: ['**/*.js', '!server/**/*.js', '!client/vendor/**/*.js'],
  client_json_files: ['client/**/*.json', 'client/**/*.json5', '!client/vendor/**/*.json'],
  server_json_files: ['server/**/*.json', 'server/**/*.json5'],
  client_html: ['client/**/*.html'],
  client_html_index: ['**/client/index.html'],
  client_css: ['client/**/*.css', '!client/sounds/Bfxr/**'],
  client_static: [
    'client/**/*.webm',
    'client/**/*.mp3',
    'client/**/*.wav',
    'client/**/*.ogg',
    'client/**/*.png',
    'client/**/*.jpg',
    'client/**/*.glb',
    'client/**/*.ico',
    '!**/unused/**',
    '!client/sounds/Bfxr/**',
    // 'client/**/vendor/**',
    // 'client/manifest.json',
  ],
  client_vendor: ['client/**/vendor/**'],
  compress_files: [
    'client/**/*.js',
    'client/**/*.html',
    'client/**/*.css',
    'client/**/*.glb',
    'client/**/manifest.json',
  ],
  client_fsdata: [
    'client/autogen/**',
    'client/shaders/**',
    'client/glov/shaders/**',
    'client/glov/models/box_textured_embed.glb',
    'client/glov/words/*.txt',
    'common/words/*.gkg',
    '!client/autogen/placeholder.txt',
    '!client/autogen/*.js',
  ],
};


function copy(job, done) {
  job.out(job.getFile());
  done();
}

function babelTask(opts) {
  opts = opts || {};
  let babel_opts = {
    sourceMap: true,
  };
  if (opts.plugins) {
    babel_opts.plugins = opts.plugins;
  }
  // BUILDTODO: server_js babel need not target ie 10!
  let babel;
  function babelInit(next) {
    if (!babel) {
      // eslint-disable-next-line global-require
      babel = require('@babel/core');
      // prime it for timing purposes
      babel.transformSync('', {
        filename: path.join(gb.getSourceRoot(), 'foo.js'),
        filenameRelative: 'foo.js',
        sourceFileName: 'foo.js',
        ...babel_opts
      });
    }
    next();
  }
  function babelTaskFunc(job, done) {
    let source_file = job.getFile();
    let source_code = source_file.contents.toString();
    let result;
    try {
      // BUILDTODO: set `babelrc:false` and explicitly reference a config file for slightly better perf?
      result = babel.transformSync(source_code, {
        // even if the file does not actually live in the source dir, treat it as such, for finding .babelrc files
        filename: path.join(gb.getSourceRoot(), source_file.relative),
        filenameRelative: source_file.relative,
        sourceFileName: source_file.relative,
        ...babel_opts
      });
    } catch (err) {
      return void done(err);
    }
    assert.equal(typeof result.code, 'string');
    assert(result.map);
    result.map.file = path.basename(source_file.relative);
    sourcemap.out(job, {
      relative: source_file.relative,
      contents: result.code,
      map: result.map,
      ...opts.sourcemap,
    });
    done();
  }
  return {
    type: gb.SINGLE,
    init: babelInit,
    func: babelTaskFunc,
  };
}


gb.task({
  name: 'client_static',
  input: config.client_static,
  type: gb.SINGLE,
  target: 'dev',
  func: copy,
});

gb.task({
  name: 'client_css',
  input: config.client_css,
  type: gb.SINGLE,
  target: 'dev',
  func: copy,
  // BUILDTODO: Also trigger browser_sync reload or something similar?
});

gb.task({
  name: 'server_static',
  input: config.server_static,
  type: gb.SINGLE,
  target: 'dev',
  func: copy,
});

gb.task({
  name: 'server_js',
  input: config.server_js_files,
  target: 'dev',
  ...babelTask(),
});

gb.task({
  name: 'eslint',
  input: config.all_js_files,
  ...eslint()
});

// example, superseded by `eslint`
gb.task({
  name: 'gulpish-eslint',
  input: ['common/*.js'],
  ...gulpish_tasks.eslint()
});

const default_defines = {
  FACEBOOK: false,
  ENV: 'default',
};
const extra_index = [
  {
    name: 'multiplayer',
    defines: {
      FACEBOOK: false,
      ENV: 'multiplayer',
    },
    zip: false,
  },
];

gb.task({
  name: 'gulpish-client_html_default',
  input: config.client_html,
  ...gulpish_tasks.client_html_default('dev', default_defines)
});

let gulpish_client_html_tasks = ['gulpish-client_html_default'];
extra_index.forEach(function (elem) {
  let name = `gulpish-client_html_${elem.name}`;
  gulpish_client_html_tasks.push(name);
  gb.task({
    name,
    input: config.client_html_index,
    ...gulpish_tasks.client_html_custom('dev', elem)
  });
});

gb.task({
  name: 'gulpish-client_html',
  deps: gulpish_client_html_tasks,
});

gb.task({
  name: 'client_fsdata',
  input: config.client_fsdata,
  target: 'dev',
  ...webfs({
    base: 'client',
    output: 'client/fsdata.js',
  })
});

gb.task({
  name: 'client_json',
  input: config.client_json_files,
  ...json5({ beautify: false })
});

gb.task({
  name: 'server_json',
  input: config.server_json_files,
  target: 'dev',
  ...json5({ beautify: true })
});

gb.task({
  name: 'client_js_babel_files',
  input: config.client_js_files,
  ...babelTask({
    sourcemap: {
      inline: true,
    },
    plugins: [
      // Note: Dependencies are not tracked from babel plugins, so use
      //   `webfs` instead of `static-fs` where possible
      ['static-fs', {}], // generates good code, but does not allow reloading/watchify
    ]
  })
});

const regex_code_strip = /_classCallCheck\([^)]+\);\n|exports\.__esModule = true;|function _classCallCheck\((?:[^}]*\}){2}\n/g;
gb.task({
  name: 'client_js_babel_cleanup_bad',
  input: ['client_js_babel_files:**.js'],
  type: gb.SINGLE,
  func: function (job, done) {
    let file = job.getFile();
    job.depReset();
    sourcemap.init(job, file, function (err, map, raw_map_file) {
      if (err) {
        return void done(err);
      }
      let code = file.contents.toString();
      if (!code.match(regex_code_strip)) {
        job.out(file);
        if (raw_map_file) {
          job.out(raw_map_file);
        }
        return void done();
      }
      // replace while updating sourcemap
      // This doesn't work because `source-map`::applySourceMap() just doesn't
      // work for anything non-trivial, and the babel-generated sourcemap is far from trivial
      let replacer = new Replacer(regex_code_strip, '');
      let result = replacer.replace(code, file.relative);
      map = sourcemap.apply(map, result.map);
      let result_code = result.code;

      sourcemap.out({
        relative: file.relative,
        contents: result_code,
        map,
      });
      done();
    });
  }
});

// much simpler version of above that simply passes through existing .map files
gb.task({
  name: 'client_js_babel_cleanup',
  input: ['client_js_babel_files:**'],
  type: gb.SINGLE,
  func: function (job, done) {
    let file = job.getFile();
    if (path.extname(file.relative) === '.js') {
      job.out({
        relative: file.relative,
        contents: file.contents.toString().replace(regex_code_strip, ''),
      });
    } else {
      job.out(file);
    }
    done();
  }
});


gb.task({
  name: 'client_js_warnings',
  input: ['client_js_babel_cleanup:**.js'],
  ...warnMatch({
    'Spread constructor param': /isNativeReflectConstruct/,
    'Bad babel': /__esModule/,
  })
});

gb.task({
  name: 'client_js_uglify',
  input: ['client_js_babel_cleanup:**.js'],
  ...uglify({ inline: true }, {
    compress: false,
    keep_fnames: true,
    mangle: false,
  }),
});

gb.task({
  name: 'client_js_babel',
  deps: [
    'client_js_uglify',
    'client_js_warnings',
  ]
});

// Pull from multiple tasks into one (on-disk) folder for another tasks to reference
// TODO: for non-gulpish tasks, should be able to pull from multiple sources (automatically?) without this step?
gb.task({
  name: 'client_intermediate',
  input: [
    'client_json:**',
    'client_js_uglify:**',
  ],
  type: gb.SINGLE,
  func: copy,
});

gb.task({
  name: 'client_bundle_app.js',
  ...bundle({
    source: 'client_intermediate',
    entrypoint: 'client/app.js',
    out: 'client/app.bundle.js',
    deps_source: 'source',
    deps: 'client/app_deps.js',
    deps_out: 'client/app_deps.bundle.js',
    is_worker: false,
    target: 'dev',
  })
});
gb.task({
  name: 'client_bundle_worker.js',
  ...bundle({
    source: 'client_intermediate',
    entrypoint: 'client/worker.js',
    out: 'client/worker.bundle.js',
    deps_source: 'source',
    deps: 'client/worker_deps.js',
    is_worker: true,
    target: 'dev',
  })
});

// gb.task({
//   name: 'client_bundle_app.js',
//   ...gulpish_bundle.bundle({
//     entrypoint: 'app.js',
//     source: 'client_intermediate:client/',
//     deps: 'app_deps.js',
//     deps_source: 'client/',
//     is_worker: false,
//     target: 'dev:client',
//   })
// });
// gb.task({
//   name: 'client_bundle_worker.js',
//   ...gulpish_bundle.bundle({
//     entrypoint: 'worker.js',
//     source: 'client_intermediate:client/',
//     deps: 'worker_deps.js',
//     deps_source: 'client/',
//     is_worker: true,
//     target: 'dev:client',
//   })
// });


// prod tasks for later: build.prod.compress, build.zip, build.prod.*
gb.task({
  name: 'default',
  deps: [
    // 'client_json', // dep'd fromclient_bundle*
    // 'client_js_babel', // dep'd fromclient_bundle*

    'server_static',
    'server_js',
    'server_json',
    'client_static',
    'client_css',
    'client_fsdata',
    'eslint',
    // 'gulpish-eslint', // example, superseded by `eslint`
    'gulpish-client_html',
    'client_js_warnings',
    'client_bundle_app.js',
    'client_bundle_worker.js',
  ],
});

gb.go();
