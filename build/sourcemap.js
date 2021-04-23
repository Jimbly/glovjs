const assert = require('assert');
const gb = require('glov-build');
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
function extractSourcemap(code) {
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

// Calls next(err, map, raw_sourcemap_file (for pass-through), stripped source file)
exports.init = function init(job, file, next) {
  let code = String(file.contents);
  let [is_inline, map_url] = extractSourcemap(code);
  if (!map_url) {
    // no sourcemaps found, will probably error if expected?
    job.warn('No sourceMappingURL found in source file');
    return void next(null, null, null);
  }
  let stripped = code.replace(REGEX_SOURCEMAP_URL, '');

  if (is_inline) {
    // Loaded inline
    // TODO: delay the parsing until needed?
    let map = JSON.parse(map_url);
    if (map.file !== file.relative) { // sometimes seeing a dirname-less name for sourceMap.file
      map.file = file.relative;
    }

    return void next(null, map, null, stripped);
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
    next(err, map, map_file, stripped);
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

// From https://github.com/mishoo/UglifyJS/blob/master/lib/sourcemap.js
let vlq_char = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');
let vlq_bits = vlq_char.reduce(function (map, ch, bits) {
  map[ch] = bits;
  return map;
}, Object.create(null));
function vlq_decode(indices, str) {
  let value = 0;
  let shift = 0;
  let j = 0;
  for (let i = 0; i < str.length; i++) {
    let bits = vlq_bits[str[i]];
    value += (bits & 31) << shift;
    if (bits & 32) {
      shift += 5;
    } else {
      indices[j++] += value & 1 ? 0x80000000 | -(value >> 1) : value >> 1;
      value = shift = 0;
    }
  }
  return j;
}
function vlq_encode(num) {
  let result = '';
  num = Math.abs(num) << 1 | num >>> 31;
  do {
    let bits = num & 31;
    if ((num >>>= 5)) {
      bits |= 32;
    }
    result += vlq_char[bits];
  } while (num);
  return result;
}

exports.decode = function (map) {
  let indices = [0, 0, 1, 0, 0];
  assert(map);
  assert.equal(map.version, 3);
  return {
    names: map.names,
    // mappings format:
    //   mappings[mapped linenum][idx] = [ mapped char offset, source file index, source line, char start, name index]
    //   sometimes just [mapped char offset] with no mapping, often no name index
    mappings: map.mappings.split(/;/).map(function (line) {
      indices[0] = 0;
      return line.split(/,/).map(function (segment) {
        return indices.slice(0, vlq_decode(indices, segment));
      });
    }),
    sources: map.sources,
    sourcesContent: map.sourcesContent,
  };
};

exports.encode = function (filename, map) {
  let mappings = '';
  let prev_src_idx;
  let generated_line = 1;
  let generated_column = 0;
  let source_index = 0;
  let original_line = 1;
  let original_column = 0;
  let name_index = 0;
  // Derived from https://github.com/mishoo/UglifyJS/blob/master/lib/sourcemap.js
  function add(src_idx, gen_line, gen_col, orig_line, orig_col, name_idx) {
    if (prev_src_idx === undefined && src_idx === undefined) {
      return;
    }
    prev_src_idx = src_idx;
    if (gen_line > generated_line) {
      generated_column = 0;
      do {
        mappings += ';';
      } while (++generated_line < gen_line);
    } else if (mappings) {
      mappings += ',';
    }
    mappings += vlq_encode(gen_col - generated_column);
    generated_column = gen_col;
    if (src_idx === undefined) {
      return;
    }
    mappings += vlq_encode(src_idx - source_index);
    source_index = src_idx;
    mappings += vlq_encode(orig_line - original_line);
    original_line = orig_line;
    mappings += vlq_encode(orig_col - original_column);
    original_column = orig_col;
    if (name_idx !== undefined) {
      mappings += vlq_encode(name_idx - name_index);
      name_index = name_idx;
    }
  }
  for (let line_num = 0; line_num < map.mappings.length; ++line_num) {
    let line_map = map.mappings[line_num];
    for (let ii = 0; ii < line_map.length; ++ii) {
      let map_elem = line_map[ii];
      add(map_elem[1], line_num+1, map_elem[0], map_elem[2], map_elem[3], map_elem[4]);
    }
  }

  return {
    version: 3,
    file: filename,
    names: map.names,
    mappings,
    sources: map.sources,
    sourcesContent: map.sourcesContent,
  };
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
  let dirname = forwardSlashes(path.dirname(relative));
  if (Buffer.isBuffer(map)) {
    if (map.indexOf(dirname) !== -1) { // needs path fixup
      map = map.toString();
    }
  }
  if (typeof map === 'string' && map.indexOf(dirname) !== -1) {
    map = JSON.parse(map);
    // Fix up paths to be relative to where we're writing the map
    if (map.sources) {
      for (let ii = 0; ii < map.sources.length; ++ii) {
        if (path.dirname(map.sources[ii]) === path.dirname(relative)) {
          map.sources[ii] = path.basename(map.sources[ii]);
        }
      }
    }
    if (path.dirname(map.file) === path.dirname(relative)) {
      map.file = path.basename(map.file);
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
