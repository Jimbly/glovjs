const eslint = require('gulp-eslint');
const gulpif = require('gulp-if');
const gulpish = require('./gulpish.js');
const ifdef = require('gulp-ifdef');
const ignore = require('gulp-ignore');
const lazypipe = require('lazypipe');
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const sourcemaps = require('gulp-sourcemaps');
const useref = require('gulp-useref');
const web_compress = require('gulp-web-compress');
const zip = require('gulp-zip');

exports.eslint = function () {
  return gulpish(null, function (stream) {
    let ret = stream.pipe(eslint())
      .pipe(eslint.format());
    ret = ret.pipe(eslint.failAfterError());
    return ret;
  });
};

exports.client_html_default = function (target, default_defines) {
  return gulpish(target, function (stream) {
    return stream.pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))
      //.on('error', log.error.bind(log, 'client_html Error'))
      .pipe(ifdef(default_defines, { extname: ['html'] }))
      .pipe(sourcemaps.write('./')); // writes .map file
  });
};

exports.client_html_custom = function (target, elem) {
  return gulpish(target, function (stream) {
    return stream
      .pipe(ifdef(elem.defines, { extname: ['html'] }))
      .pipe(rename(`client/index_${elem.name}.html`))
      .pipe(replace(/<!-- build:js ([^.]+\.js) -->[^!]+<!-- endbuild -->/g, function (a, b) {
        // already bundled in client_html_default, just export filename reference
        return `<script src="${b}"></script>`;
      }));
  });
};

exports.zip = function (target, elem) {
  return gulpish(target, function (stream) {
    return stream
      .pipe(rename(function (path) {
        path.dirname = path.dirname.replace(/^client[/\\]?/, '');
      }))
      .pipe(ignore.exclude('index.html'))
      .pipe(ignore.exclude('*.map'))
      .pipe(gulpif(`index_${elem.name}.html`, rename('index.html')))
      .pipe(ignore.exclude('index_*.html'))
      .pipe(zip(`client/${elem.name}.zip`));
  });
};

exports.compress = function (target, compress_files) {
  return gulpish(target, function (stream) {
    return stream
      // skipLarger so we don't end up with orphaned old compressed files
      //   - not strictly needed after migrating to `glov-build` though!
      .pipe(gulpif(compress_files, web_compress({ skipLarger: false })));
  });
};
