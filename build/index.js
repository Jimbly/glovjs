//////////////////////////////////////////////////////////////////////////
// Migration TODO:
//   parallel running of eslint
//

const assert = require('assert');
const gb = require('glovjs-build');
const { callbackify } = gb;
const path = require('path');

require('./checks.js')(__filename);

const targets = {
  dev: path.join(__dirname, '../dist2/game/build.dev'),
};
const SOURCE_DIR = path.join(__dirname, '../src/');
gb.configure({
  source: SOURCE_DIR,
  statedir: path.join(__dirname, '../dist2/game/.gbstate'),
  targets,
});

const config = {
  server_js_files: ['**/*.js', '!client/**/*.js'],
  server_static: ['**/common/words/*.gkg'],
  all_js_files: ['**/*.js', '!client/vendor/**/*.js'],
  client_js_files: ['**/*.js', '!server/**/*.js', '!client/vendor/**/*.js'],
  client_json_files: ['client/**/*.json', '!client/vendor/**/*.json'],
  server_json_files: ['server/**/*.json'],
  client_html: ['client/**/*.html'],
  client_html_index: ['client/**/index.html'],
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

// BUILDTODO: server_js babel need not target ie 10!
let babel;
function babelTask(job, done) {
  let source_file = job.getFile();
  let source_code = source_file.contents.toString();
  try {
    let is_first = !babel;
    let time_start;
    if (is_first) {
      time_start = Date.now();
      process.stdout.write('  Initializing Babel...');
      // eslint-disable-next-line global-require
      babel = require('@babel/core');
    }
    // BUILDTODO: set `babelrc:false` and explicitly reference a config file for slightly better perf?
    let result = babel.transformSync(source_code, {
      // even if the file does not actually live in the source dir, treat it as such, for finding .babelrc files
      filename: path.join(SOURCE_DIR, source_file.path),
      filenameRelative: source_file.path,
      sourceMap: true,
      sourceFileName: source_file.path,
    });
    if (is_first) {
      console.log(` done (${Date.now() - time_start}ms)`);
    }
    assert.equal(typeof result.code, 'string');
    assert(result.map);
    result.map.file = path.basename(source_file.path);
    let sourcemap_filename = `${source_file.path}.map`;
    let code = `${result.code}\n//# sourceMappingURL=${path.basename(sourcemap_filename)}\n`;

    job.out({
      path: source_file.path,
      contents: code,
    });
    job.out({
      path: sourcemap_filename,
      contents: JSON.stringify(result.map),
    });
    // result.code = result.code.slice(0, 200);
    // console.log(result);
    done();
  } catch (err) {
    done(err);
  }
}


let eslintLinter;
let eslintFormatter;
function eslintTaskStart(user_data) {
  user_data.results = [];
}
function eslintTaskEnd(user_data) {
  if (user_data.results.length) {
    let results_text = eslintFormatter.format(user_data.results);
    if (results_text) {
      console.log(results_text);
    }
  }
}
function eslintTask(job, done) {
  function init(next) {
    // eslint-disable-next-line global-require
    const { ESLint } = require('eslint');
    let eslint = new ESLint();
    eslintLinter = callbackify(eslint.lintText.bind(eslint));
    eslint.loadFormatter().then(function (result) {
      eslintFormatter = result;
      next();
    });
  }
  let source_file = job.getFile();
  let source_code = source_file.contents.toString();
  function doLint() {
    eslintLinter(source_code, {
      filePath: path.join(SOURCE_DIR, source_file.path),
    }, function (err, results) {
      if (results) {
        let user_data = job.getTaskUserData();
        user_data.results = user_data.results.concat(results);
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
  if (eslintLinter) {
    doLint();
  } else {
    init(doLint);
  }
}

gb.task({
  name: 'client_static',
  input: config.client_static,
  type: gb.SINGLE,
  target: 'dev',
  func: copy,
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
  type: gb.SINGLE,
  target: 'dev',
  func: babelTask,
});

gb.task({
  name: 'eslint',
  input: config.all_js_files,
  type: gb.SINGLE,
  func: eslintTask,
  on_start: eslintTaskStart,
  on_end: eslintTaskEnd,
});


gb.task({
  name: 'default',
  deps: [
    'server_static',
    // 'server_js',
    // 'client_static',
    'eslint',
  ],
});

gb.go();
