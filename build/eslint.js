const assert = require('assert');
const gb = require('glovjs-build');
const { callbackify } = gb;
const path = require('path');

module.exports = function () {
  let linter;
  let formatter;
  let all_results;
  function eslintTaskInit(next) {
    all_results = [];
    // eslint-disable-next-line global-require
    const { ESLint } = require('eslint');
    let eslint = new ESLint();
    linter = callbackify(eslint.lintText.bind(eslint));
    eslint.loadFormatter().then(function (result) {
      formatter = result;
      // prime it / load any other deps
      linter('', { filePath: path.join(gb.getSourceRoot(), 'foo.js') }, function (err, results) {
        if (err) {
          throw err;
        }
        formatter.format(results);
        next();
      });
    });
  }
  function eslintTaskEnd(user_data) {
    if (all_results.length) {
      let results_text = formatter.format(all_results);
      if (results_text) {
        console.log(results_text);
      }
    }
  }
  function eslintTask(job, done) {
    let source_file = job.getFile();
    let source_code = source_file.contents.toString();
    linter(source_code, {
      filePath: path.join(job.gb.getSourceRoot(), source_file.path),
    }, function (err, results) {
      if (results) {
        all_results = all_results.concat(results);
      }
      if (!err) {
        assert.equal(results.length, 1);
        let result = results[0];
        if (result.errorCount) {
          job.error('lint error');
        } else if (result.warningCount) {
          job.warn('lint warning');
        }
      }
      done(err);
    });
  }
  return {
    type: gb.SINGLE,
    func: eslintTask,
    init: eslintTaskInit,
    finish: eslintTaskEnd,
  };
};
