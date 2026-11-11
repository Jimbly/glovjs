const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { asyncEach } = require('glov-async');
const gb = require('glov-build');
const { patchExe } = require('./patch-exe');
const sourcemapRemap = require('./sourcemap-remap');

module.exports = function (config, opts) {
  const { exe_name, company_name, native_mappings } = opts;
  gb.addTarget('sdl', path.join(__dirname, '../dist/game/build.sdl'));
  gb.addTarget('pkg', path.join(__dirname, '../dist/game/build.pkg'));

  assert(!config.bundles[0].ban_deps);
  config.bundles[0].ban_deps = {
    'Cannot include native modules from web build': [
      'platform-sdl',
      'platform-steamworks',
    ]
  };

  config.bundles.push({
    entrypoint: 'sdlapp',
    deps: 'sdlapp_deps',
    is_worker: false,
    is_cli: true,
    do_version: 'client/sdlapp.ver.json',
    do_reload: true,
    browserify_options_deps_override: {
      insertGlobalVars: {
        __dirname: null,
        process: null,
        Buffer: null,
      },
      bare: true,
      browserField: false,
      transform: [
        ['babelify', {
          global: true,
          presets: [
            ['@babel/env', {
              // Node 10+ required to keep native classes for SDL
              targets: { node: '14' },
              loose: true
            }],
          ],
        }],
      ],
      exclude: [
        'electron',
        'worker_threads',
        'node:worker_threads',
        'node:os',
        'node:events',
        './dist/linux64/steamworksjs.linux-x64-gnu.node',
        './dist/osx/steamworksjs.darwin-arm64.node',
        './dist/osx/steamworksjs.darwin-x64.node',
        './dist/win64/steamworksjs.win32-x64-msvc.node',
        '../../dist/sdl.node',
        '../../dist/webgl.node',
      ],
    },
  });

  gb.task({
    name: 'native_modules',
    input: [
      'placeholder',
    ],
    type: gb.ALL,
    version: [Date.now(), native_mappings],
    func: function (job, done) {
      let exts = ['so', 'node', 'dylib', 'dll'];
      native_mappings.forEach(function (pair) {
        let [indir, outdir] = pair;
        let basedir = __dirname + '/../' + indir;
        let files = fs.readdirSync(basedir, {
          recursive: true,
        }).map(gb.forwardSlashes);
        files = files.filter((name) => {
          return exts.includes(name.split('.').pop());
        });
        files.forEach(function (name) {
          let contents = fs.readFileSync(`${basedir}/${name}`);
          job.out({
            relative: `${outdir}/${name}`,
            contents: contents,
          });
        });
      });
      done();
    },
  });

  gb.task({
    name: 'sdl_support',
    input: [
      'native_modules:**/*',
      'sdl/**',
    ],
    type: gb.SINGLE,
    version: [exe_name],
    func: function (job, done) {
      let file = job.getFile();
      let { relative, contents } = file;
      if (relative.startsWith('sdl/')) {
        relative = file.relative.replace('sdl/', '');
        let str = contents.toString('utf8');
        if (str.includes('SDLProjectNameMacro')) {
          str = str.replace(/SDLProjectNameMacro/g, exe_name);
          contents = str;
        }
        relative = relative.replace('SDLProjectNameMacro', exe_name);
      }
      job.out({
        relative,
        contents,
      });
      done();
    },
  });

  function remapToData(job, done) {
    let { contents, relative, bucket } = job.getFile();
    relative = relative.replace(/^(client)\//, '');
    if (bucket !== 'sdl_support') {
      relative = 'data/' + relative;
    }
    job.out({
      contents,
      relative,
    });
    done();
  }

  const sdlapp_bundles = [
    '**/sdlapp*.bundle.js*',
    '**/sdlapp.ver.json',
  ];
  gb.task({
    name: 'sdlcopy-dev-bundles',
    target: 'sdl',
    type: gb.SINGLE,
    input: sdlapp_bundles.map((a) => `client_dev_outputs:${a}`),
    func: remapToData,
  });

  gb.task({
    name: 'sdlcopy-from-dev',
    target: 'sdl',
    type: gb.SINGLE,
    input: [
      'client_dev_outputs:**',
      'client_dev_outputs:!**/*.html',
      'client_dev_outputs:!**/*.css',
      'client_dev_outputs:!**/*app.ver.json',
      'client_dev_outputs:!**/*.bundle.js*',
      'client_dev_outputs:!**/*.mp3',
      'sdl_support:**',
    ],
    func: remapToData,
  });

  gb.task({
    name: 'sdlcopy-from-prod',
    input: [
      'prod.posthash:**',
      'prod.posthash:!**/*.html',
      'prod.posthash:!**/*.css',
      'prod.posthash:!**/*.mp3',
      'prod.posthash:!**/app.ver.json',
      'prod.posthash:!**/*.bundle.js*',
      'prod.posthash:!**/*.mp3',
      ...sdlapp_bundles.map((a) => `prod.posthash:${a}`),
    ],
    type: gb.SINGLE,
    func: function (job, done) {
      sourcemapRemap(function (job2, filename, next) {
        filename = filename.replace(
          /^https?:\/\/localhost(?::\d+)?\/sourcemap\/auto\/\d+\//, '../../artifacts/client/');
        next(null, filename);
      }, function (relative) {
        relative = relative.replace(/^(client)\//, '');
        relative = 'data/' + relative;
        return relative;
      }).func(job, done);
    },
  });


  function execWrap(cmd, args, spawn_opts, next) {
    let proc = spawn(cmd, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      ...spawn_opts,
    });
    let did_done = false;
    function doneWrap(err) {
      if (did_done) {
        return;
      }
      did_done = true;
      next(err);
    }
    proc.on('error', doneWrap);
    proc.on('close', function (code) {
      if (code === 0) {
        doneWrap();
      } else {
        doneWrap(`Process exited with code ${code}`);
      }
    });
  }

  gb.task({
    name: 'sdlpackage',
    deps: [
      'sdlcopy-from-dev',
      'sdlcopy-dev-bundles',
      'build_deps',
    ],
    input: [
      'sdlcopy-from-dev:sdlmain.js',
      'sdlcopy-from-dev:package.json',
      'sdlcopy-from-dev:pkg.config.js',
    ],
    type: gb.ALL,
    version: [exe_name],
    func: function (job, done) {
      const tmp = 'dist/game/build.pkg/exes';
      function cleanup(next) {
        fs.rm(tmp, {
          force: true,
          recursive: true,
        }, function () {
          // ignore errors
          next();
        });
      }
      function runProc(next) {
        let cmd;
        let args;
        if (1) {
          // Way slower, but signs mac builds
          cmd = 'docker';
          args = [
            'run', '--rm', // '-it',
            '-v', `${path.resolve(__dirname, '..')}:/app`,
            'jimbly/pkg-ldid', 'sh', '-c',
            'cd dist/game/build.sdl && node ../../../node_modules/@yao-pkg/pkg/lib-es5/bin.js .',
          ];
        } else {
          cmd = 'node';
          args = [
            '../../../node_modules/@yao-pkg/pkg/lib-es5/bin.js',
            '.',
          ];
        }
        execWrap(cmd, args, { cwd: 'dist/game/build.sdl' }, function (err) {
          if (err) {
            return void done(err);
          }
          next();
        });
      }
      cleanup(function () {
        runProc(function () {
          fs.readdir(tmp, function (err, files) {
            if (err) {
              return void done(err);
            }
            asyncEach(files, function (filename, next) {
              fs.readFile(tmp + '/' + filename, function (err, filedata) {
                if (err) {
                  return void next(err);
                }
                filename = filename.replace('-win-x64.exe', '.exe');
                job.out({
                  relative: filename,
                  contents: filedata,
                });
                next();
              });
            }, done);
          });
        });
      });
    },
  });

  gb.task({
    name: 'sdlpatch',
    input: [
      'sdlpackage:*.exe'
    ],
    type: gb.SINGLE,
    version: [exe_name, company_name],
    func: function (job, done) {
      let file = job.getFile();
      job.depAdd('client/favicon.ico', function (err, iconfile) {
        if (err) {
          return void done(err);
        }

        patchExe({
          src: file.contents,
          original_filename: path.basename(file.relative),
          name: exe_name,
          company: company_name,
          ico: iconfile.contents,
        }, function (err, filedata) {
          if (err) {
            return void done(err);
          }
          job.out({
            relative: file.relative,
            contents: filedata,
          });
          done();
        });
      });
    }
  });

  gb.task({
    name: 'sdlsign',
    input: [
      'sdlpatch:*.exe',
    ],
    type: gb.SINGLE,
    func: function (job, done) {
      let file = job.getFile();
      if (process.platform !== 'win32') {
        job.warn('Code signing only available from Win32');
        job.out(file);
        return void done();
      }
      let filename = file.relative;
      assert(!filename.includes('/')); // expected in root
      let temp_file = path.join(os.tmpdir(), filename);
      fs.writeFile(temp_file, file.contents, function (err) {
        if (err) {
          return void done(err);
        }
        execWrap('dssign.cmd', [temp_file], { shell: true }, function (err) {
          if (err) {
            return void done(err);
          }
          fs.readFile(temp_file, function (err, filedata) {
            if (err) {
              return void done(err);
            }
            if (file.contents.compare(filedata) === 0) {
              job.error('File unchanged after signing, signing must have failed');
            }
            job.out({
              relative: file.relative,
              contents: filedata,
            });
            done();
          });
        });
      });
    }
  });

  gb.task({
    name: 'sdlpackage-dist-dev',
    type: gb.SINGLE,
    target: 'pkg',
    input: [
      'sdlpackage:**',
      'sdlpackage:!*.exe',
      'sdlpatch:*.exe',
      'sdlcopy-from-dev:**',
      'sdlcopy-from-dev:!package.json',
      'sdlcopy-from-dev:!pkg.config.js',
      'sdlcopy-dev-bundles:**',
    ],
    func: function (job, done) {
      let file = job.getFile();
      job.out({
        relative: 'dist-dev/' + file.relative,
        contents: file.contents,
      });
      done();
    }
  });

  const NO_SIGN = false;
  gb.task({
    name: 'sdlpackage-dist-prod',
    type: gb.SINGLE,
    target: 'pkg',
    input: [
      'sdlpackage:**',
      'sdlpackage:!*.exe',
      NO_SIGN ? 'sdlpatch:*.exe' : 'sdlsign:*.exe',
      'sdlcopy-from-prod:**',
      'sdlcopy-from-prod:!**/*.map',
      'sdl_support:**',
      'sdl_support:!package.json',
      'sdl_support:!pkg.config.js',
      'sdl_support:!sdlmain.js',
    ],
    func: function (job, done) {
      let file = job.getFile();
      job.out({
        relative: 'dist/' + file.relative,
        contents: file.contents,
      });
      done();
    }
  });

  gb.task({
    name: 'sdlpackage-artifacts',
    type: gb.SINGLE,
    target: 'pkg',
    input: [
      'sdlcopy-from-prod:**/*.bundle.js.map',
      'sdl_support:sdlmain.js',
    ],
    func: function (job, done) {
      let file = job.getFile();
      job.out({
        relative: 'artifacts/' + file.relative.replace('data/', '/'),
        contents: file.contents,
      });
      done();
    }
  });

  gb.task({
    name: 'sdlpackage-dev',
    deps: [
      'sdlpackage-dist-dev',
    ],
  });

  gb.task({
    name: 'sdlpackage-prod',
    deps: [
      'sdlpackage-dist-dev',
      'sdlpackage-dist-prod',
      'sdlpackage-artifacts',
    ],
  });

  gb.task({
    name: 'sdlpackage-all',
    deps: [
      'sdlpackage-dev',
      'sdlpackage-prod',
    ],
  });

  gb.task({
    name: 'sdl-dev',
    deps: [
      'sdlcopy-dev-bundles',
      'sdlcopy-from-dev',
      // Then run with:
      //   npx nodemon -- --enable-source-maps sdlmain.js
      // TODO: do this automatically as part of the build script? Maybe easier to see errors if not?

      // plus regular dev stuff, but no browsersync
      'build_deps',
      'client_earlyreload',
      'run_server',
    ],
  });
};
