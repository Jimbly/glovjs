const assert = require('assert');
const gb = require('glov-build');
const { forwardSlashes } = gb;
const path = require('path');

const preamble = `(function () {
var fs = window.glov_webfs = window.glov_webfs || {};`;
const postamble = '}());';

let chars = (function () {
  const ESC = String.fromCharCode(27);
  let ret = [];
  for (let ii = 0; ii < 256; ++ii) {
    ret[ii] = String.fromCharCode(ii);
  }
  // ASCII text must encode directly
  // single-byte nulls
  ret[0] = String.fromCharCode(126);
  // escape our escape character and otherwise overlapped values
  ret[27] = `${ESC}${String.fromCharCode(27)}`;
  ret[126] = `${ESC}${String.fromCharCode(126)}`;
  // escape things not valid in Javascript strings
  ret[8] = '\\b';
  ret[9] = '\\t';
  ret[10] = '\\n';
  ret[11] = '\\v';
  ret[12] = '\\f';
  ret[13] = '\\r';
  ret['\''.charCodeAt(0)] = '\\\'';
  ret['\\'.charCodeAt(0)] = '\\\\';
  // All other characters are fine (though many get turned into 2-byte UTF-8 strings)
  return ret;
}());

function encodeString(buf) {
  let ret = [];
  for (let ii = 0; ii < buf.length; ++ii) {
    let c = buf[ii];
    ret.push(chars[c]);
  }
  return ret.join('');
}

function fileFSName(opts, name) {
  name = forwardSlashes(name).replace('autogen/', '');
  if (opts.base) {
    name = forwardSlashes(path.relative(opts.base, name));
  }
  return name;
}

function cmpName(a, b) {
  return a.name < b.name ? -1 : 1;
}

module.exports = function (opts) {
  assert(opts.output);
  function webfsBuild(job, done) {
    let updated_files = job.getFilesUpdated();
    let user_data = job.getUserData();
    user_data.files = user_data.files || {};

    for (let ii = 0; ii < updated_files.length; ++ii) {
      let file = updated_files[ii];
      let name = fileFSName(opts, file.relative);
      let data = file.contents;
      if (!data) {
        delete user_data.files[name];
      } else {
        let line = `fs['${name}'] = [${data.length},'${encodeString(data)}'];`;
        user_data.files[name] = { name, line };
      }
    }
    let files = Object.values(user_data.files).sort(cmpName);

    if (!files.length) {
      return void done();
    }

    job.log(`webfs packing ${files.length} files`);

    let output = [preamble];
    for (let ii = 0; ii < files.length; ++ii) {
      output.push(files[ii].line);
    }
    output.push(postamble);

    job.out({
      relative: opts.output,
      contents: Buffer.from(output.join('\n')),
    });
    done();
  }
  return {
    type: gb.ALL,
    func: webfsBuild,
  };
};
