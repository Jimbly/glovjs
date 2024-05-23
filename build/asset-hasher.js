const path = require('path');
const gb = require('glov-build');
const xxhash = require('xxhash-wasm');
const { assetHasherRewriteInternal } = require('./asset-hasher-rewrite.js');

const { floor } = Math;

// From https://github.com/sebastian-software/asset-hash/blob/master/src/encode.ts
function baseEncodeFactory(charset) {
  const radix = BigInt(charset.length);
  return function (number, max_length) {
    let result = '';

    while (number > 0) {
      const mod = number % radix;
      result = charset[Number(mod)] + result;
      number = (number - mod) / radix;

      if (result.length === max_length) {
        return result;
      }
    }

    return result || '0';
  };
}
const base62Encode = baseEncodeFactory('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');

module.exports = function (opts) {
  opts = opts || {};
  const max_length = opts.max_length || 8;
  const out_base = opts.out_base || 'client/';
  const asset_dir = opts.asset_dir || 'a';
  const out_dir = `${out_base}${asset_dir}/`;
  const strip_prefix = opts.strip_prefix || out_base;
  const need_rewrite_list = opts.need_rewrite || [];
  const need_rewrite = {};
  for (let ii = 0; ii < need_rewrite_list.length; ++ii) {
    need_rewrite[need_rewrite_list[ii]] = true;
  }
  function hashedName(hash, relative) {
    let ext = path.extname(relative);
    return `${out_dir}${hash}${ext}`;
  }
  let hasher;
  function assetHasherInit(next) {
    xxhash().then((hasher_in) => {
      hasher = hasher_in;
      next();
    });
  }
  function assetHasher(job, done) {
    let files = job.getFiles();
    let mappings = {};
    let ts = String(floor(Date.now()/1000));
    // TODO: don't re-hash files that have not changed since last run (in this process)
    let have_output = {};
    function outputHashed(file) {
      let hash = hasher.h64Raw(file.contents);
      let hash_str = base62Encode(hash, max_length);
      let source_name = file.relative.startsWith(strip_prefix) ?
        file.relative.slice(strip_prefix.length) :
        file.relative;
      mappings[source_name] = hash_str;
      let out_name = hashedName(hash_str, file.relative);
      if (!have_output[out_name]) {
        have_output[out_name] = true;
        job.out({
          relative: out_name,
          contents: file.contents,
        });
      }
    }
    let phase2_files = [];
    for (let ii = 0; ii < files.length; ++ii) {
      let file = files[ii];
      if (need_rewrite[file.relative]) {
        phase2_files.push(file);
      } else {
        outputHashed(file);
      }
    }
    for (let ii = 0; ii < phase2_files.length; ++ii) {
      let file = phase2_files[ii];
      // *Not* setting an asset_prefix, to deal with manifest.json now referencing
      //   assets in the same folder as we're hashed to.
      // This is inherently doing something inconsistent compared to other uses
      //   (the source paths are relative to a different folder than the mapped
      //   paths), so may need something more complex if other files have
      //   different behaviors (source is anything other than the root).
      let text = assetHasherRewriteInternal(job, out_base, '', file, mappings);
      outputHashed({
        relative: file.relative,
        contents: Buffer.from(text),
      });
    }
    let map_file = `${out_dir}${ts}.js`;
    mappings['assets.js'] = `${ts}`;
    mappings.asset_dir = asset_dir;
    function mapContents(body) {
      return `(function (glob) {
var asset_mappings = glob.glov_asset_mappings = ${body};
}(typeof window === 'undefined' ? module.exports : window));
`;
    }
    job.out({
      relative: map_file,
      contents: mapContents(JSON.stringify(mappings)),
    });
    // also non-timestamped, formatted version for debugging (should NOT be loaded if everything is working)
    job.out({
      relative: `${out_base}assets.js`,
      contents: mapContents(JSON.stringify(mappings, undefined, 2)),
    });
    // // TODO: maybe don't need this if we use the non-timestamped file above instead?
    // job.out({
    //   relative: `${out_dir}assets.ver.json`,
    //   contents: JSON.stringify({
    //     ver: ts,
    //     fn: map_file,
    //   }),
    // });
    done();
  }
  return {
    type: gb.ALL,
    init: assetHasherInit,
    func: assetHasher,
    version: [
      hashedName,
      assetHasherRewriteInternal,
      module.exports,
    ],
  };
};
