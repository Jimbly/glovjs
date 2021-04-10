const assert = require('assert');
const { asyncEachSeries } = require('glov-async');
const gb = require('glov-build');
const { callbackify } = gb;
const path = require('path');

module.exports = function () {
  let linter;
  let formatter;
  function eslintTaskInit(next) {
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
  function eslintTask(job, done) {
    let user_data = job.getUserData();
    let files = user_data.files = user_data.files || {};

    let updated_files = job.getFilesUpdated();
    job.log(`linting ${updated_files.length} files...`);
    asyncEachSeries(updated_files, function (file, next) {
      if (!file.contents) {
        // has been deleted, delete any errors that may have been there
        delete files[file.relative];
        return void next();
      }
      let source_code = file.contents.toString();
      linter(source_code, {
        filePath: path.join(job.gb.getSourceRoot(), file.relative),
      }, function (err, results) {
        if (results) {
          assert.equal(results.length, 1);
          let result = results[0];
          if (!result.errorCount && !result.warningCount && !result.messages.length) {
            results = null;
          }
        }
        if (results) {
          files[file.relative] = results;
        } else {
          delete files[file.relative];
        }
        next(err);
      });
    }, function (err) {
      let all_results = [];
      let keys = Object.keys(files);
      keys.sort();
      let error_count = 0;
      let warning_count = 0;
      for (let ii = 0; ii < keys.length; ++ii) {
        let results = files[keys[ii]];
        assert.equal(results.length, 1);
        let result = results[0];
        error_count += result.errorCount;
        warning_count += result.warningCount;
        all_results = all_results.concat(results);
      }

      if (all_results.length) {
        let results_text = formatter.format(all_results);
        if (results_text) {
          console.log(results_text);
        }
      }
      if (error_count) {
        job.error(`${error_count} lint error${error_count===1?'':'s'}`);
      }
      if (warning_count) {
        job.warn(`${warning_count} lint warning${warning_count===1?'':'s'}`);
      }

      done(err);
    });
  }
  return {
    type: gb.ALL,
    init: eslintTaskInit,
    func: eslintTask,
  };
};
