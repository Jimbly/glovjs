const assert = require('assert');
const gb = require('glovjs-build');
const { forwardSlashes } = gb;
const { SourceMapConsumer, SourceMapGenerator } = require('source-map');

exports.init = function init(job, file, next) {
  // TODO: also load inline?
  job.depAdd(`${file.bucket}:${file.relative}.map`, function (err, map_file) {
    if (map_file) {
      // TODO: delay this parsing until needed?
      file.sourceMap = JSON.parse(map_file.contents.toString('utf8'));
      if (file.sourceMap.file !== file.relative) { // sometimes seeing a dirname-less name for sourceMap.file
        file.sourceMap.file = file.relative;
      }
    }
    next(err, map_file);
  });
};

exports.getMapFile = function getMapFile(file) {
  if (!file.sourceMap) {
    return null;
  }
  return {
    relative: `${file.relative}.map`,
    contents: JSON.stringify(file.sourceMap),
  };
};

exports.apply = function (file, map) {
  // Derived from vinyl-sourcemaps-apply
  // However, this basically doesn't work because `source-map`::applySourceMap() doesn't
  // work for anything non-trivial, and the babel-generated sourcemaps are far from trivial

  if (typeof map === 'string') {
    map = JSON.parse(map);
  }

  // check source map properties
  assert(map.file);
  assert(map.mappings);
  assert(map.sources);

  // normalize paths
  map.file = forwardSlashes(map.file);
  map.sources = map.sources.map(forwardSlashes);

  if (file.sourceMap && file.sourceMap.mappings !== '') {
    let generator = SourceMapGenerator.fromSourceMap(new SourceMapConsumer(map));
    generator.applySourceMap(new SourceMapConsumer(file.sourceMap));
    // TODO: leave as string for efficiency?
    file.sourceMap = JSON.parse(generator.toString());
  } else {
    file.sourceMap = map;
  }
};
