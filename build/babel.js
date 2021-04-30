const assert = require('assert');
const gb = require('glov-build');
const path = require('path');
const sourcemap = require('glov-build-sourcemap');

module.exports = function (opts) {
  opts = opts || {};
  let babel_opts = {
    sourceMap: true,
    ...opts.babel,
  };
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
};
