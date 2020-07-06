// TODO:
//   things imported from node_modules are not getting minified
//     kind of want these as separate deps anyway, except for the worker js file that needs them combined?
//     maybe just concat those two for the worker explicitly?  worker will have it's own deps though anyway?
//   Cannot figure out any way to reliably get external dependency list
//     So, add a deps.js and worker_deps.js that build separately and just look like:
//       global.require = (a) => deps[a];
//       deps['assert'] = require('assert'));
//     And then worker build needs to concat this before the body (and have tasks intertwined).
//       Non-workers require it separately
//       Maybe we later also don't use browserify/watchify on app or worker code, but just this simple deps system?

/* eslint no-invalid-this:off */
const args = require('yargs').argv;
const assert = require('assert');
const babel = require('gulp-babel');
const browserify = require('browserify');
const browser_sync = require('browser-sync');
const clean = require('gulp-clean');
const eslint = require('gulp-eslint');
const fs = require('fs');
const gulp = require('gulp');
const gulpif = require('gulp-if');
const ifdef = require('gulp-ifdef');
const ignore = require('gulp-ignore');
const json5 = require('./gulp/json5.js');
const lazypipe = require('lazypipe');
const ll = require('./gulp/ll.js');
const log = require('fancy-log');
const useref = require('gulp-useref');
const uglify = require('@jimbly/gulp-uglify');
const newer = require('gulp-newer');
const nodemon = require('gulp-nodemon');
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const sourcemaps = require('gulp-sourcemaps');
const through2 = require('through2');
const web_compress = require('gulp-web-compress');
const vinyl_buffer = require('vinyl-buffer');
const vinyl_source_stream = require('vinyl-source-stream');
const warn_match = require('./gulp/warn-match.js');
const watchify = require('watchify');
const webfs = require('./gulp/webfs_build.js');
const zip = require('gulp-zip');

ll.tasks(['eslint']);

if (args.ll === false && !args.noserial) {
  // With --no-ll, absolutely no parallelism, for profiling
  gulp.reallyparallel = gulp.series;
} else {
  gulp.reallyparallel = gulp.parallel;
}
if (!args.noserial) {
  // Since this process is primarily parsing/CPU-bound, using gulp.parallel only confuses
  //   the output without any speed increase (possibly speed decrease)
  gulp.parallel = gulp.series;
}

//////////////////////////////////////////////////////////////////////////
// Server tasks
const config = {
  server_js_files: ['src/**/*.js', '!src/client/**/*.js'],
  server_static: ['src/**/common/words/*.gkg'],
  all_js_files: ['src/**/*.js', '!src/client/vendor/**/*.js'],
  client_js_files: ['src/**/*.js', '!src/server/**/*.js', '!src/client/vendor/**/*.js'],
  client_json_files: ['src/**/*.json', '!src/server/**/*.json', '!src/client/vendor/**/*.json'],
  client_html: ['src/client/**/*.html'],
  client_html_index: ['src/client/**/index.html'],
  client_css: ['src/client/**/*.css', '!src/client/sounds/Bfxr/**'],
  client_static: [
    'src/client/**/*.webm',
    'src/client/**/*.mp3',
    'src/client/**/*.wav',
    'src/client/**/*.ogg',
    'src/client/**/*.png',
    'src/client/**/*.jpg',
    'src/client/**/*.glb',
    '!**/unused/**',
    '!src/client/sounds/Bfxr/**',
    // 'src/client/**/vendor/**',
    // 'src/client/manifest.json',
  ],
  client_vendor: ['src/client/**/vendor/**'],
  compress_files: [
    'client/**/*.js',
    'client/**/*.html',
    'client/**/*.css',
    'client/**/*.glb',
    'client/**/manifest.json',
  ],
  client_fsdata: [
    'src/client/autogen/**',
    'src/client/shaders/**',
    'src/client/glov/shaders/**',
    'src/client/glov/models/**.glb',
    'src/client/glov/words/*.txt',
    'src/common/words/*.gkg',
    '!src/client/autogen/placeholder.txt',
    '!src/client/autogen/*.js',
  ],
};

// Currently, do no significant minification to make debugging easier, better error reports
// But, at least keep function names to get good callstacks
// TODO: One, global-scoped uglify pass on bundled file just for prod builds?
const uglify_options = { compress: false, keep_fnames: true, mangle: false };

// if (args.debug) {
//   const node_inspector = require('gulp-node-inspector'); // eslint-disable-line global-require
//   gulp.task('inspect', function () {
//     gulp.src([]).pipe(node_inspector({
//       debugPort: 5858,
//       webHost: '0.0.0.0',
//       webPort: '8080',
//       preload: false
//     }));
//   });
// }

gulp.task('server_static', function () {
  return gulp.src(config.server_static)
    .pipe(newer('./dist/game/build.dev'))
    .pipe(gulp.dest('./dist/game/build.dev'));
});
gulp.task('server_js', function () {
  return gulp.src(config.server_js_files)
    .pipe(sourcemaps.init())
    .pipe(newer('./dist/game/build.dev'))
    .pipe(babel())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('./dist/game/build.dev'));
});

function eslintTask() {
  // I'm not completely sure this `since` is a good idea, since you will miss
  // seeing previously saved (yet un-fixed) files
  return gulp.src(['src/**/*.js', '!src/client/vendor/**/*.js'], { since: gulp.lastRun('eslint') })
    .pipe(eslint())
    .pipe(eslint.format());
}

// This one runs in a parallel process
gulp.task('eslint', eslintTask);
// This one runs in-process, and takes advantage of gulp.lastRun
gulp.task('eslint_watch', eslintTask);

//////////////////////////////////////////////////////////////////////////
// client tasks
const default_defines = {
  ENV: 'default',
};
gulp.task('client_html_default', function () {
  return gulp.src(config.client_html)
    .pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))
    .on('error', log.error.bind(log, 'client_html Error'))
    .pipe(ifdef(default_defines, { extname: ['html'] }))
    .pipe(sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('./dist/game/build.dev/client'));
});

const extra_index = [
//  {
//    name: 'staging',
//    defines: {
//      ENV: 'staging',
//    },
//    zip: true,
//  },
];

let client_html_tasks = ['client_html_default'];
extra_index.forEach(function (elem) {
  let name = `client_html_${elem.name}`;
  client_html_tasks.push(name);
  gulp.task(name, function () {
    return gulp.src(config.client_html_index)
      //.pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))
      .on('error', log.error.bind(log, 'client_html Error'))
      .pipe(ifdef(elem.defines, { extname: ['html'] }))
      .pipe(rename(`index_${elem.name}.html`))
      .pipe(replace(/<!-- build:js ([^.]+\.js) -->[^!]+<!-- endbuild -->/g, function (a, b) {
        // already bundled in client_html_default, just export filename reference
        return `<script src="${b}"></script>`;
      }))
      //.pipe(sourcemaps.write('./')) // writes .map file
      .pipe(gulp.dest('./dist/game/build.dev/client'));
  });
});

gulp.task('client_html', gulp.parallel(...client_html_tasks));

gulp.task('client_css', function () {
  return gulp.src(config.client_css)
    .pipe(gulp.dest('./dist/game/build.dev/client'))
    .pipe(browser_sync.reload({ stream: true }));
});

gulp.task('client_static', function () {
  return gulp.src(config.client_static)
    .pipe(newer('./dist/game/build.dev/client'))
    .pipe(gulp.dest('./dist/game/build.dev/client'));
});

gulp.task('client_fsdata', function () {
  return gulp.src(config.client_fsdata, { base: 'src/client' })
    .pipe(webfs())
    .pipe(gulp.dest('./dist/game/build.dev/client'));
});

let client_js_deps = ['client_json', 'client_js_babel'];
let client_js_watch_deps = client_js_deps.slice(0);

function bundleJS(filename, is_worker, pre_task) {
  let bundle_name = filename.replace('.js', '.bundle.js');
  const browserify_opts = {
    entries: [
      `./dist/game/build.intermediate/client/${filename}`,
    ],
    cache: {}, // required for watchify
    packageCache: {}, // required for watchify
    builtins: {
      // super-simple replacements, if needed
      assert: './dist/game/build.intermediate/client/shims/assert.js',
      buffer: './dist/game/build.intermediate/client/shims/buffer.js',
      not_worker: !is_worker && './dist/game/build.intermediate/client/shims/not_worker.js',
      // timers: './dist/game/build.intermediate/client/shims/timers.js',
      _process: './dist/game/build.intermediate/client/shims/empty.js',
    },
    debug: true,
    transform: [],
    // bundleExternal: false, // disables grabbing things from node_modules, but *also* from builtins :(
  };

  let build_timestamp = Date.now();
  function buildTimestampReplace() {
    // Must be exactly 'BUILD_TIMESTAMP'.length (15) characters long
    let ret = `'${build_timestamp}'`;
    assert.equal(ret.length, 15);
    return ret;
  }
  function dobundle(b) {
    build_timestamp = Date.now();
    log(`Using BUILD_TIMESTAMP=${build_timestamp} for ${filename}`);
    // These only log anything useful on the first run, do not catch newly added dependencies:
    // let external_deps = {};
    // b.pipeline.get('deps').push(through2.obj(function (entry, enc, next) {
    //   console.log(entry.deps);
    //   for (let key in entry.deps) {
    //     if (key[0] !== '.') {
    //       external_deps[key] = true;
    //       entry.deps[key] = false;
    //     }
    //   }
    //   next(null, entry);
    // }, function (next) {
    //   console.log('External deps', external_deps);
    //   next();
    // }));
    // b.pipeline.get('emit-deps').push(through2.obj(function (entry, enc, next) {
    //   console.log(entry.file, entry.deps);
    //   next(null, entry);
    // }, function (next) {
    //   next();
    // }));
    return b
      .bundle()
      // log errors if they happen
      .on('error', log.error.bind(log, 'Browserify Error'))
      .pipe(vinyl_source_stream(bundle_name))
      .pipe(vinyl_buffer())
      .pipe(sourcemaps.init({ loadMaps: true })) // loads map from browserify file
      .pipe(replace('BUILD_TIMESTAMP', buildTimestampReplace))
      .pipe(sourcemaps.write('./')) // writes .map file
      .pipe(gulp.dest('./dist/game/build.dev/client/'));
  }

  function writeVersion(done) {
    let ver_filename = `${filename.slice(0, -3)}.ver.json`;
    fs.writeFile(`./dist/game/build.dev/client/${ver_filename}`, `{"ver":"${build_timestamp}"}`, done);
  }
  let version_task = `client_js_${filename}_version`;
  gulp.task(version_task, writeVersion);

  function registerTasks(b, watch) {
    let task_base = `client_js${watch ? '_watch' : ''}_${filename}`;
    b.on('log', log); // output build logs to terminal
    if (watch) {
      client_js_watch_deps.push(task_base);
    } else {
      client_js_deps.push(task_base);
    }
    gulp.task(`${task_base}_bundle`, function () {
      let ret = dobundle(b);
      if (watch) {
        ret = ret.pipe(browser_sync.stream({ once: true }));
      }
      return ret;
    });
    if (pre_task) {
      gulp.task(task_base, gulp.series(pre_task, `${task_base}_bundle`, version_task));
    } else {
      gulp.task(task_base, gulp.series(`${task_base}_bundle`, version_task));
    }
  }
  const watched = watchify(browserify(browserify_opts));
  registerTasks(watched, true);
  // on any dep update, runs the bundler
  watched.on('update', gulp.series(`client_js_watch_${filename}_bundle`, writeVersion));

  const nonwatched = browserify(browserify_opts);
  registerTasks(nonwatched, false);
}

bundleJS('app.js');

gulp.task('client_js_babel', function () {

  return gulp.src(config.client_js_files, { since: gulp.lastRun('client_js_babel') })
    // Instead of newer, using since above, so upon restart it re-processes files
    //   whose deps may have changed
    // .pipe(newer('./dist/game/build.intermediate'))
    .pipe(sourcemaps.init())
    .pipe(sourcemaps.identityMap())
    .pipe(babel({
      plugins: [
        // Note: Dependencies are not tracked from babel plugins, so use `webfs` instead of `static-fs` where possible
        ['static-fs', {}], // generates good code, but does not allow reloading/watchify
      ]
    }))
    .on('error', log.error.bind(log, 'Error'))
    // Remove extra Babel stuff that does not help anything
    .pipe(replace(/_classCallCheck\([^)]+\);\n|exports\.__esModule = true;|function _classCallCheck\((?:[^}]*\}){2}\n/g, ''))
    // Add filter that checks for "bad" transforms happening:
    .pipe(warn_match({
      'Spread constructor param': /isNativeReflectConstruct/,
      'Bad babel': /__esModule/,
    }))

    .pipe(uglify(uglify_options))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./dist/game/build.intermediate'));
});

gulp.task('client_json', function () {
  return gulp.src(config.client_json_files)
    .pipe(newer('./dist/game/build.intermediate'))
    // Minify, and convert from json5
    .pipe(json5({ beautify: false }))
    .pipe(gulp.dest('./dist/game/build.intermediate'));
});

gulp.task('test', gulp.series('client_json', 'client_js_babel', 'client_js_watch_app.js_bundle'));

gulp.task('build.prod.compress', function () {
  return gulp.src('dist/game/build.dev/**')
    .pipe(gulp.dest('./dist/game/build.prod'))
    // skipLarger so we don't end up with orphaned old compressed files
    .pipe(gulpif(config.compress_files, web_compress({ skipLarger: false })))
    .pipe(gulp.dest('./dist/game/build.prod'));
});
gulp.task('nop', function (next) {
  next();
});
let zip_tasks = [];
extra_index.forEach(function (elem) {
  if (!elem.zip) {
    return;
  }
  let name = `build.zip.${elem.name}`;
  zip_tasks.push(name);
  gulp.task(name, function () {
    return gulp.src('dist/game/build.dev/client/**')
      .pipe(ignore.exclude('index.html'))
      .pipe(ignore.exclude('*.map'))
      .pipe(gulpif(`index_${elem.name}.html`, rename('index.html')))
      .pipe(ignore.exclude('index_*.html'))
      .pipe(zip(`${elem.name}.zip`))
      .pipe(gulp.dest('./dist/game/build.prod/client'));
  });
});
if (!zip_tasks.length) {
  zip_tasks.push('nop');
}
gulp.task('build.zip', gulp.parallel(...zip_tasks));
gulp.task('build.prod.package', function () {
  return gulp.src('package*.json')
    .pipe(gulp.dest('./dist/game/build.prod'));
});
gulp.task('build.prod', gulp.parallel('build.prod.package', 'build.prod.compress', 'build.zip'));

gulp.task('client_js', gulp.parallel(...client_js_deps));
gulp.task('client_js_watch', gulp.parallel(...client_js_watch_deps));

//////////////////////////////////////////////////////////////////////////
// Combined tasks

gulp.task('client_fsdata_wrap', gulp.series(
  'client_fsdata'));

const build_misc_nolint = [
  'server_static',
  'server_js',
  'client_html',
  'client_css',
  'client_static',
  'client_fsdata_wrap',
];

if (args.nolint) {
  gulp.task('build_deps', gulp.parallel(...build_misc_nolint, 'client_js'));
  gulp.task('watch_deps', gulp.parallel(...build_misc_nolint, 'client_js_watch'));
} else {
  gulp.task('build_deps', gulp.reallyparallel('eslint', gulp.parallel(...build_misc_nolint, 'client_js')));
  gulp.task('watch_deps', gulp.reallyparallel('eslint', gulp.parallel(...build_misc_nolint, 'client_js_watch')));
}


gulp.task('build', gulp.series('build_deps', 'build.prod'));

gulp.task('bs-reload', (done) => {
  browser_sync.reload();
  done();
});


gulp.task('watch', gulp.series('watch_deps',
  (done) => {
    if (!args.nolint) {
      gulp.watch(config.all_js_files, gulp.series('eslint_watch'));
    }
    gulp.watch(config.server_js_files, gulp.series('server_js'));
    gulp.watch(config.server_static, gulp.series('server_static')); // Want to also force server reload?
    gulp.watch(config.client_html, gulp.series('client_html', 'bs-reload'));
    gulp.watch(config.client_vendor, gulp.series('client_html', 'bs-reload'));
    gulp.watch(config.client_css, gulp.series('client_css'));
    gulp.watch(config.client_static, gulp.series('client_static'));
    gulp.watch(config.client_fsdata, gulp.series('client_fsdata'));
    gulp.watch(config.client_json_files, gulp.series('client_json', 'client_js_babel'));
    gulp.watch(config.client_js_files, gulp.series('client_js_babel'));

    done();
  }
));

const deps = ['watch'];
if (args.debug) {
  deps.push('inspect');
}

// Depending on "watch" not because that implicitly triggers this, but
// just to start up the watcher and reprocessor, and nodemon restarts
// based on its own logic below.
gulp.task('nodemon', gulp.series(...deps, (done) => {
  const options = {
    script: 'dist/game/build.dev/server/index.js',
    nodeArgs: ['--inspect'],
    args: ['--dev'],
    watch: ['dist/game/build.dev/server/', 'dist/game/build.dev/common'],
  };

  if (args.debug) {
    options.nodeArgs.push('--debug');
  }
  nodemon(options);
  done();
}));

gulp.task('browser-sync', gulp.series('nodemon', (done) => {

  // for more browser-sync config options: http://www.browsersync.io/docs/options/
  browser_sync({

    // informs browser-sync to proxy our expressjs app which would run at the following location
    proxy: {
      target: 'http://localhost:3000',
      ws: true,
    },

    // informs browser-sync to use the following port for the proxied app
    // notice that the default port is 3000, which would clash with our expressjs
    port: 4000,

    // // open the proxied app in chrome
    // browser: ['google-chrome'],

    // don't sync clicks/scrolls/forms/etc
    ghostMode: false,
  });
  done();
}));

gulp.task('clean', function () {
  return gulp.src([
    'dist/game/build.dev',
    'dist/game/build.intermediate',
    'dist/game/build.prod',
    'src/client/autogen/*.*',
    '!src/client/autogen/placeholder.txt',
  ], { read: false, allowEmpty: true })
    .pipe(clean());
});
