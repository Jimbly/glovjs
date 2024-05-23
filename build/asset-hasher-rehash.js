const assert = require('assert');
const { asyncEach } = require('glov-async');
const gb = require('glov-build');
const { assetHasherLoadMappings } = require('./asset-hasher-rewrite.js');


module.exports = function (opts) {
  const { hash_dep } = opts;
  assert(hash_dep);
  const out_base = opts.out_base || 'client/';
  const asset_dir = opts.asset_dir || 'a';
  const out_dir = `${out_base}${asset_dir}/`;
  const use_hashed_version = opts.use_hashed_version || ['assets.js'];

  function outName(orig_name, mapped_name) {
    let out_name = `${out_dir}${mapped_name}`;
    let idx = orig_name.lastIndexOf('.');
    if (idx !== -1) {
      out_name += orig_name.slice(idx);
    }
    return out_name;
  }

  function assetHasherRehash(job, done) {
    job.depReset();
    assetHasherLoadMappings(hash_dep, out_base, job, function (err, mappings) {
      if (err) {
        return void done(err);
      }
      let all_files = job.getFiles().slice(0); // base files + assets.js

      let hashed_versions = {};
      asyncEach(use_hashed_version, function (thing, next) {
        assert(mappings[thing]);
        job.depAdd(`${hash_dep}:${outName(thing, mappings[thing])}`, function (err, mapped_file) {
          if (err) {
            return void next(err);
          }
          hashed_versions[thing] = mapped_file;
          next();
        });
      }, function (err) {
        if (err) {
          return void done(err);
        }

        let files_map = {};
        let seen = {};
        for (let ii = 0; ii < all_files.length; ++ii) {
          let file = all_files[ii];
          files_map[file.relative] = file;
        }
        // verify all files that were originally mapped exist in this new data set
        for (let key in mappings) {
          if (key === 'asset_dir') {
            assert.equal(mappings[key], asset_dir);
            continue;
          }
          let file_key = `${out_base}${key}`;
          if (!files_map[file_key]) {
            job.warn(`File "${key}" was originally hashed, but not found in production data set`);
          } else {
            seen[file_key] = true;
          }
        }
        // verify all files in data set were originally mapped, and output appropriate files
        let did_output = {};
        for (let key in files_map) {
          let file = files_map[key];
          if (!seen[key]) {
            // TODO: enable this later to ensure everything is caught?
            // job.warn(`File "${key}" was found in production data set, but not originally hashed`);
            // Pass through
            job.out(file);
          } else {
            // output original/unhashed file (for reference and the server, should not be loaded by the client)
            job.out(file);
            let orig_name = file.relative;
            assert(orig_name.startsWith(out_base));
            orig_name = orig_name.slice(out_base.length);
            if (hashed_versions[orig_name]) {
              file = hashed_versions[orig_name];
            }
            let mapped_name = mappings[orig_name];
            assert(mapped_name);
            let out_name = outName(orig_name, mapped_name);
            if (!did_output[out_name]) {
              did_output[out_name] = true;
              job.out({
                relative: out_name,
                contents: file.contents,
              });
            }
          }
        }
        done();
      });
    });
  }
  return {
    type: gb.ALL,
    func: assetHasherRehash,
    deps: [hash_dep],
    version: [
      assetHasherLoadMappings,
      outName,
      module.exports,
    ],
  };
};
