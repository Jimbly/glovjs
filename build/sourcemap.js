const assert = require('assert');
const gb = require('glovjs-build');
const { forwardSlashes } = gb;
const path = require('path');
const { SourceMapConsumer, SourceMapGenerator } = require('source-map');

const BASE64PRE = 'data:application/json;charset=utf8;base64,';
// Calls next(err, map, raw_sourcemap_file (for pass-through))
exports.init = function init(job, file, next) {
  let code = String(file.contents);
  let m = code.match(/^\/\/# sourceMappingURL=(.*)$/m);
  if (!m) {
    // no sourcemaps found, will probably error if expected?
    job.warn('No sourceMappingURL found in source file');
    return void next(null, null, null);
  }
  if (m[1].startsWith(BASE64PRE)) {
    // Load inline
    // TODO: delay this parsing until needed?
    let map = JSON.parse(Buffer.from(m[1].slice(BASE64PRE.length), 'base64').toString('utf8'));
    if (map.file !== file.relative) { // sometimes seeing a dirname-less name for sourceMap.file
      map.file = file.relative;
    }
    return void next(null, map, null);
  }
  job.depAdd(`${file.bucket}:${file.relative}.map`, function (err, map_file) {
    let map = null;
    if (map_file) {
      // TODO: delay this parsing until needed?
      map = JSON.parse(map_file.contents.toString('utf8'));
      if (map.file !== file.relative) { // sometimes seeing a dirname-less name for sourceMap.file
        map.file = file.relative;
      }
    }
    next(err, map, map_file);
  });
};

exports.apply = function (map, new_map) {
  // Derived from vinyl-sourcemaps-apply
  // However, this basically doesn't work because `source-map`::applySourceMap() doesn't
  // work for anything non-trivial, and the babel-generated sourcemaps are far from trivial

  if (typeof new_map === 'string') {
    new_map = JSON.parse(new_map);
  }

  // check source map properties
  assert(new_map.file);
  assert(new_map.mappings);
  assert(new_map.sources);

  // normalize paths
  new_map.file = forwardSlashes(new_map.file);
  new_map.sources = new_map.sources.map(forwardSlashes);

  if (map && map.mappings !== '') {
    let generator = SourceMapGenerator.fromSourceMap(new SourceMapConsumer(new_map));
    generator.applySourceMap(new SourceMapConsumer(map));
    // TODO: leave as string for efficiency?
    map = JSON.parse(generator.toString());
  } else {
    map = new_map;
  }
  return map;
};

exports.out = function (job, opts) {
  let { relative, contents, map, inline } = opts;
  if (typeof map === 'object' && !Buffer.isBuffer(map)) {
    map = JSON.stringify(map);
  }
  if (!Buffer.isBuffer(map)) {
    map = Buffer.from(map);
  }
  if (inline) {
    contents = `${contents}\n//# sourceMappingURL=data:application/json;charset=utf8;base64,${map.toString('base64')}`;
    job.out({
      relative,
      contents,
    });
  } else {
    let sourcemap_filename = `${relative}.map`;
    contents = `${contents}\n//# sourceMappingURL=${path.basename(sourcemap_filename)}\n`;
    job.out({
      relative,
      contents,
    });
    job.out({
      relative: sourcemap_filename,
      contents: map,
    });
  }
};
