var _ = require('lodash');
var args = require('yargs').argv;
var babel = require('gulp-babel');
var babelify = require('babelify');
var browserify = require('browserify');
var browser_sync = require('browser-sync');
var buffer = require('vinyl-buffer');
var gulp = require('gulp');
var gutil = require('gulp-util');
var jshint = require('gulp-jshint');
var node_inspector = require('gulp-node-inspector');
var nodemon = require('gulp-nodemon');
var source = require('vinyl-source-stream');
var sourcemaps = require('gulp-sourcemaps');
var ts = require('gulp-typescript');
var tsify = require('tsify');
var watchify = require('watchify');

//////////////////////////////////////////////////////////////////////////
// Server tasks
var config = {
  ts_files: ['src/**/*.ts', '!src/client/**/*.ts'],
  js_files: ['src/**/*.js', '!src/client/**/*.js'],
  all_js_files: ['src/**/*.js', '!src/client/vendor/**/*.js'],
  client_html: ['src/client/**/*.html'],
  client_css: ['src/client/**/*.css', '!src/client/sounds/Bfxr/**'],
  client_static: ['src/client/**/*.mp3', 'src/client/**/*.wav', 'src/client/**/*.ogg', 'src/client/**/*.png', 'src/client/**/vendor/**', '!src/client/sounds/Bfxr/**'],
};

gulp.task('inspect', function () {
  gulp.src([]).pipe(node_inspector({
    debugPort: 5858,
    webHost: '0.0.0.0',
    webPort: '8080',
    preload: false
  }));
});

// Compile typescript sources
gulp.task('ts', function() {
  var ts_project = ts.createProject('tsconfig.json', {
    sortOutput: true,
  });
  return ts_project.src()
    .pipe(sourcemaps.init())
    .pipe(ts(ts_project))
    .js
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('./build'));
});

gulp.task('js', function () {
  return gulp.src(config.js_files)
    .pipe(sourcemaps.init())
    .pipe(babel())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('./build'));
});

gulp.task('jshint', function () {
  return gulp.src(config.all_js_files)
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

//////////////////////////////////////////////////////////////////////////
// client tasks
gulp.task('client_html', function () {
  return gulp.src(config.client_html)
    .pipe(gulp.dest('./build/client'))
    .pipe(jshint.extract('auto'))
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('client_css', function () {
  return gulp.src(config.client_css)
    .pipe(gulp.dest('./build/client'))
    .pipe(browser_sync.reload({ stream: true }));
});

gulp.task('client_static', function () {
  return gulp.src(config.client_static)
    .pipe(gulp.dest('./build/client'));
});

(function () {
  var customOpts = {
    entries: ['./src/client/main.js'],
    debug: true
  };
  var opts = _.assign({}, watchify.args, customOpts);
  function dobundle(b) {
    return b.bundle()
      // log errors if they happen
      .on('error', gutil.log.bind(gutil, 'Browserify Error'))
      .pipe(source('main.bundle.js'))
      // optional, remove if you don't need to buffer file contents
      .pipe(buffer())
      // optional, remove if you dont want sourcemaps
      .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
         // Add transformation tasks to the pipeline here.
      .pipe(sourcemaps.write('./')) // writes .map file
      .pipe(gulp.dest('./build/client/'));
  }

  var watched = watchify(browserify(opts));
  watched.plugin(tsify, { noImplicitAny: true });
  watched.transform(babelify);

  watched.on('update', function () {
    console.log('Task:client_js_watch::update');
    // on any dep update, runs the bundler
    dobundle(watched)
      .pipe(browser_sync.stream({ once: true }));
  });
  watched.on('log', gutil.log); // output build logs to terminal
  gulp.task('client_js_watch', function () {
    return dobundle(watched);
  });

  var nonwatched = browserify(opts);
  nonwatched.plugin(tsify, { noImplicitAny: true });
  nonwatched.transform(babelify);
  nonwatched.on('log', gutil.log); // output build logs to terminal
  gulp.task('client_js', function () {
    return dobundle(nonwatched);
  });
}());

//////////////////////////////////////////////////////////////////////////
// Combined tasks

gulp.task('build', ['jshint', 'js', 'ts', 'client_html', 'client_css', 'client_static', 'client_js']);

gulp.task('bs-reload', ['client_static', 'client_html'], function () {
  browser_sync.reload();
});

gulp.task('watch', ['jshint', 'js', 'ts', 'client_html', 'client_css', 'client_static', 'client_js_watch'], function() {
  gulp.watch(config.ts_files, ['ts']);
  gulp.watch(config.js_files, ['js']);
  gulp.watch(config.all_js_files, ['jshint']);
  gulp.watch(config.client_html, ['client_html', 'bs-reload']);
  gulp.watch(config.client_css, ['client_css']);
  gulp.watch(config.client_static, ['client_static', 'bs-reload']);
});

var deps = ['watch'];
if (args.debug) {
  deps.push('inspect');
}

// Depending on "watch" not because that implicitly triggers this, but
// just to start up the watcher and reprocessor, and nodemon restarts
// based on its own logic below.
gulp.task('nodemon', deps, function() {
  var options = {
    script: 'build/server/index.js',
    nodeArgs: [],
    watch: ['build/server/'],
  };
  if (args.debug) {
    options.nodeArgs.push('--debug');
  }
  nodemon(options);
});

gulp.task('browser-sync', ['nodemon'], function () {

  // for more browser-sync config options: http://www.browsersync.io/docs/options/
  browser_sync({

    // informs browser-sync to proxy our expressjs app which would run at the following location
    proxy: 'http://localhost:3000',

    // informs browser-sync to use the following port for the proxied app
    // notice that the default port is 3000, which would clash with our expressjs
    port: 4000,

    // // open the proxied app in chrome
    // browser: ['google-chrome'],
  });
});

