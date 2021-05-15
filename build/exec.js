/* eslint no-use-before-define:off */

const assert = require('assert');
const child_process = require('child_process');
const gb = require('glov-build');

const copy_opts = [
  'cwd', 'detached', 'env', 'uid', 'gid', 'shell', 'stdio',
  'windowsVerbatimArguments', 'windowsHide',
];

let is_win = Boolean(process.platform.match(/^win/i));
let kill_sig = is_win ? 'SIGINT' : 'SIGHUP';

function mapGBPaths(obj) {
  if (!obj) {
    return obj;
  } else if (Array.isArray(obj)) {
    for (let ii = 0; ii < obj.length; ++ii) {
      obj[ii] = mapGBPaths(obj[ii]);
    }
  } else if (typeof obj === 'object') {
    for (let key in obj) {
      obj[key] = mapGBPaths(obj[key]);
    }
  } else if (typeof obj === 'string') {
    if (obj.match(/^[^:]{2,}:[^:]*$/)) {
      obj = gb.getDiskPath(obj);
    }
  }
  return obj;
}

module.exports = function exec(opts) {
  assert.equal(typeof opts, 'object');
  assert.equal(typeof opts.cmd, 'string');
  opts.args = opts.args || [];
  assert(Array.isArray(opts.args));
  opts = mapGBPaths(opts);
  let spawn_opts = {};
  copy_opts.forEach(function (key) {
    if (opts[key] !== undefined) {
      spawn_opts[key] = opts[key];
    }
  });

  let proc;

  process.on('exit', function onExitCleanup() {
    // Doesn't seem to help
    if (proc && proc.exitCode !== null) {
      // Previous run exited
      proc = null;
    }
    if (proc) {
      proc.kill('SIGTERM');
      proc = null;
    }
  });

  return {
    type: gb.ALL,
    version: Date.now(), // always runs once per process
    read: false,
    func: function (job, done) {
      if (proc && proc.exitCode !== null) {
        // Previous run exited
        proc = null;
      }
      if (proc) {
        job.log(`Restarting ${opts.cmd} ${opts.args.join(' ')}`);
        let kill_proc = proc;
        proc = null;
        kill_proc.on('exit', startProc);
        kill_proc.kill(kill_sig);
        // Use a stronger signal after a timeout if it doesn't exit?
        setTimeout(function () {
          if (kill_proc.exitCode === null) {
            kill_proc.kill('SIGTERM');
          }
        }, 2500);
      } else {
        job.log(`Starting ${opts.cmd} ${opts.args.join(' ')}`);
        startProc();
      }

      function startProc() {
        let my_proc = proc = child_process.spawn(opts.cmd, opts.args, spawn_opts);
        function guard(fn) {
          return function (...args) {
            if (proc === my_proc) {
              fn(...args);
            }
          };
        }
        proc.on('close', guard(function (code) {
          gb.warn(`Sub-process "${opts.cmd}" (PID ${proc.pid}) exited with code=${code}`);
          proc = null;
        }));

        // Fire done() immediately if we have a PID, otherwise wait for the error
        //   event that must be coming.
        let is_done = false;
        proc.on('error', guard(function (err) {
          if (!is_done) {
            is_done = true;
            done(err);
          }
        }));
        if (proc.pid && !is_done) {
          // spawned successfully
          is_done = true;
          done();
        }
      }
    }
  };
};
