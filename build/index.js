//////////////////////////////////////////////////////////////////////////
// Migration TODO:
//   parallel running of eslint
//

const assert = require('assert');
const gb = require('glovjs-build');
const eslint = require('./eslint.js');
const gulpish_tasks = require('./gulpish-tasks.js');
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

function babelTask() {
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
        sourceMap: true,
        sourceFileName: 'foo.js',
      });
    }
    next();
  }
  function babelTaskFunc(job, done) {
    let source_file = job.getFile();
    let source_code = source_file.contents.toString();
    try {
      // BUILDTODO: set `babelrc:false` and explicitly reference a config file for slightly better perf?
      let result = babel.transformSync(source_code, {
        // even if the file does not actually live in the source dir, treat it as such, for finding .babelrc files
        filename: path.join(gb.getSourceRoot(), source_file.path),
        filenameRelative: source_file.path,
        sourceMap: true,
        sourceFileName: source_file.path,
      });
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
    } catch (err) {
      return void done(err);
    }
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
  name: 'default',
  deps: [
    // 'server_static',
    // 'server_js',
    // 'client_static',
    // 'eslint',
    // 'gulpish-eslint',
    'gulpish-client_html_default',
  ],
});

gb.go();
