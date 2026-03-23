//
// asyncHashed - split a build task by jobs across multiple forked tasks for maximum parallelism
//
const assert = require('assert');
const gb = require('glov-build');
const xxhash = require('xxhash-wasm');

module.exports = function (hashes, task) {
  let { name } = task;
  assert(name);
  assert.equal(task.type, gb.SINGLE);
  assert(!task.init);
  let final_input = [];

  let hasher;
  let hasher_promise;
  function assetHasherInit(next) {
    if (!hasher_promise) {
      hasher_promise = xxhash();
    }
    hasher_promise.then((hasher_in) => {
      hasher = hasher_in;
      next();
    });
  }

  function funcWrap(idx, job, done) {
    let file = job.getFile();
    let { relative } = file;
    let hash = hasher.h32(relative) % hashes;
    if (hash !== idx) {
      return void done();
    }
    task.func(job, done);
  }

  for (let ii = 0; ii < hashes; ++ii) {
    let subname = `${name}-${ii}`;
    gb.task({
      ...task,
      name: subname,
      version: [funcWrap, hashes, ...(task.version || [])],
      async: gb.ASYNC_FORK,
      init: assetHasherInit,
      func: funcWrap.bind(null, ii),
    });
    final_input.push(`${subname}:**`);
  }
  return {
    name,
    input: final_input,
    type: gb.SINGLE,
    func: function (job, done) {
      job.out(job.getFile());
      done();
    },
  };
};
