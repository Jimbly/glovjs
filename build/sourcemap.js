const assert = require('assert');
const gb = require('glovjs-build');
const { forwardSlashes } = gb;
const path = require('path');
const { SourceMapConsumer, SourceMapGenerator } = require('source-map');

const BASE64PRE1 = 'data:application/json;charset=utf8;base64,';
const BASE64PRE2 = 'data:application/json;charset=utf-8;base64,';
const SOURCEMAP_INLINE_PRE1 = `//# sourceMappingURL=${BASE64PRE1}`;
// const SOURCEMAP_INLINE_PRE2 = `//# sourceMappingURL=${BASE64PRE2}`;
const REGEX_SOURCEMAP_INLINE = /^\/\/# sourceMappingURL=data:application\/json;charset=utf-?8;base64,/m;
const REGEX_SOURCEMAP_URL = /^\/\/# sourceMappingURL=(.*)$/m;

// returns [is_inline, path or map string]
function extractSourcemap(buf) {
  let code = String(buf);
  let m = code.match(REGEX_SOURCEMAP_URL);
  if (!m) {
    // no sourcemaps found, will probably error if expected?
    return [false, null];
  }
  let pre = m[1].startsWith(BASE64PRE1) ? BASE64PRE1 :
    m[1].startsWith(BASE64PRE2) ? BASE64PRE2 : null;
  if (pre) {
    // Load inline
    let map_string = Buffer.from(m[1].slice(pre.length), 'base64').toString('utf8');
    return [true, map_string];
  }
  return [false, m[1]];
}

// Calls next(err, map, raw_sourcemap_file (for pass-through))
exports.init = function init(job, file, next) {
  let [is_inline, map_url] = extractSourcemap(file.contents);
  if (!map_url) {
    // no sourcemaps found, will probably error if expected?
    job.warn('No sourceMappingURL found in source file');
    return void next(null, null, null);
  }
  if (is_inline) {
    // Loaded inline
    // TODO: delay the parsing until needed?
    let map = JSON.parse(map_url);
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
  if (!map) {
    if (contents.match(REGEX_SOURCEMAP_INLINE)) {
      // has inline sourcemap
      assert(!inline); // would be a no-op
      let is_inline;
      [is_inline, map] = extractSourcemap(contents);
      assert(map);
      assert(is_inline); // not a URL to an external file
      contents = contents.replace(REGEX_SOURCEMAP_URL, '');
    } else {
      assert(false, 'Missing `map` parameter');
    }
  }
  if (typeof map === 'object' && !Buffer.isBuffer(map)) {
    map = JSON.stringify(map);
  }
  if (!Buffer.isBuffer(map)) {
    map = Buffer.from(map);
  }
  if (inline) {
    contents = `${contents}\n${SOURCEMAP_INLINE_PRE1}${map.toString('base64')}`;
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
