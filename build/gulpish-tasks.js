const eslint = require('gulp-eslint');
const gulpish = require('./gulpish.js');
const ifdef = require('gulp-ifdef');
const lazypipe = require('lazypipe');
const sourcemaps = require('gulp-sourcemaps');
const useref = require('gulp-useref');

exports.eslint = function () {
  return gulpish(null, function (stream) {
    let ret = stream.pipe(eslint())
      .pipe(eslint.format());
    ret = ret.pipe(eslint.failAfterError());
    return ret;
  });
};

const default_defines = {
  FACEBOOK: false,
  ENV: 'default',
};

exports.client_html_default = function (target) {
  return gulpish(target, function (stream) {
    return stream.pipe(useref({}, lazypipe().pipe(sourcemaps.init, { loadMaps: true })))
      .pipe(ifdef(default_defines, { extname: ['html'] }))
      .pipe(sourcemaps.write('./')); // writes .map file
  });
};
