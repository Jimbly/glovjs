const assert = require('assert');
const gb = require('glov-build');

function parseAssetsJS(job, s) {
  try {
    let m = s.match(/mappings = (\{[^;]*\});/);
    if (!m) {
      return null;
    }
    return JSON.parse(m[1]);
  } catch (e) {
    job.error(e);
  }
  return null;
}

function assetHasherRewriteInternal(job, asset_prefix, buffer, mappings) {
  let text = buffer.toString('utf8');

  text = text.replace(/"([-a-zA-Z0-9._/]+)"/g, function (full, match) {
    let new_name = mappings[match];
    if (new_name) {
      let idx = match.lastIndexOf('.');
      if (idx !== -1) {
        new_name += match.slice(idx);
      }
      return `"${asset_prefix}${new_name}"`;
    } else {
      if (match.match(/\.\w+$/)) {
        // Warn on this, it's probably just something missing from asset_hashed_files
        // Fine to remove this if there are exceptions, though, mostly useful during boostrapping hashing
        job.warn(`References unhashed filename "${match}"`);
      }
      return full;
    }
  });
  return text;
}

module.exports = function (opts) {
  assert(opts);
  let { hash_dep } = opts;
  assert(hash_dep);
  const out_base = opts.out_base || 'client/';
  function assetHasherRewrite(job, done) {
    job.depAdd(`${hash_dep}:${out_base}assets.js`, function (err, assets_file) {
      if (err) {
        return void done(err);
      }

      let mappings = parseAssetsJS(job, assets_file.contents.toString('utf8'));
      if (!mappings) {
        return void done('Could not parse assets.js');
      }
      let { asset_dir } = mappings;
      assert(asset_dir);

      let file = job.getFile();
      let text = assetHasherRewriteInternal(job, `${asset_dir}/`, file.contents, mappings);

      job.out({
        relative: file.relative,
        contents: text,
      });
      done();
    });
  }
  return {
    type: gb.SINGLE,
    func: assetHasherRewrite,
    version: [
      assetHasherRewriteInternal,
      parseAssetsJS,
      module.exports,
    ],
    deps: [hash_dep],
  };
};
module.exports.assetHasherRewriteInternal = assetHasherRewriteInternal;
