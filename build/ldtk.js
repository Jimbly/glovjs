/* eslint no-underscore-dangle:off */
const assert = require('assert');
const path = require('path');
const { asyncSeries } = require('glov-async');
const gb = require('glov-build');

const { max } = Math;

module.exports = function () {
  function proc(job, done) {
    let file = job.getFile();
    let leveldata;
    try {
      leveldata = JSON.parse(file.contents.toString());
    } catch (e) {
      return void done(e);
    }
    let m = file.relative.match(/^(.*)\/([^/]+)\/([^/]+)\.ldtkl$/);
    if (!m) {
      return void done(`Couldn't parse filename "${file.relative}"`);
    }
    let rootdir = m[1];
    let projdir = m[2];
    let levelname = m[3];
    let base_file_data;
    let atlasdata;
    asyncSeries([
      function (next) {
        let base_file_name = `${rootdir}/${projdir}.ldtk`;
        job.depAdd(base_file_name, function (err, base_file) {
          if (err) {
            return void next(err);
          }
          try {
            base_file_data = JSON.parse(base_file.contents.toString());
          } catch (e) {
            return void next(e);
          }
          next();
        });
      },
      function (next) {
        let { tilesets } = base_file_data.defs;
        assert(tilesets && tilesets.length === 1);
        let pngname = tilesets[0].relPath;
        let atlas_name = path.basename(pngname).split('.')[0];
        job.depAdd(`client_autoatlas:client/${atlas_name}.atlas_map`, function (err, atlasfile) {
          if (err) {
            return void done(err);
          }
          try {
            atlasdata = JSON.parse(atlasfile.contents.toString());
          } catch (e) {
            return void done(e);
          }
          // atlasdata = { 1: tilename, 2: tilename }
          next();
        });
      },
      function (next) {
        let layers = leveldata.layerInstances;
        assert(layers && layers.length > 1);
        let layers_out = [];
        let enum_layer;
        let map_w = 0;
        let map_h = 0;

        layers.forEach(function (layer, layer_idx) {
          let layer_out = [];
          let name = layer.__identifier;
          // let tile_size = layer.__gridSize;
          let layer_w = layer.__cWid;
          let layer_h = layer.__cHei;
          map_w = max(map_w, layer_w);
          map_h = max(map_h, layer_h);
          // layers_out.push({
          //   name,
          //   w: layer_w,
          //   h: layer_h,
          //   gfx: layer_out,
          // });
          layers_out.push(layer_out);
          let base_layer = base_file_data.defs.layers[layer_idx];

          function addArray(arr, tile_idx) {
            for (let jj = 0; jj < arr.length; ++jj) {
              let entry = arr[jj];
              // entry like { "px": [28,84], "src": [112,0], "f": 0, "t": 8, "d": [110], "a": 1 },
              assert(entry.d);
              assert(Array.isArray(entry.d));
              assert(entry.d.length === tile_idx + 1);
              let posidx = entry.d[tile_idx];
              let x = posidx % layer_w;
              let y = (posidx - x) / layer_w;
              let tile = entry.t;
              // TODO: support `f` for flipping/rotating
              assert(typeof tile === 'number');
              if (!tile) {
                continue;
              }
              let tilename = atlasdata[tile];
              if (!tilename) {
                job.error(`No atlas tile name found for tile #${tile} on layer` +
                  ` ${layer_idx} (${name}) at ${x},${y}`);
                continue;
              }
              layer_out[y] = layer_out[y] || [];
              layer_out[y][x] = tilename;
            }
          }
          if (layer.gridTiles.length) {
            addArray(layer.gridTiles, 0);
          }
          if (layer.autoLayerTiles.length) {
            addArray(layer.autoLayerTiles, 1);
          }
          if (layer.intGridCsv.length && !enum_layer) {
            enum_layer = [];
            assert.equal(layer.intGridCsv.length, layer_w * layer_h);
            assert(base_layer.intGridValues.length);
            let lookup = {};
            for (let ii = 0; ii < base_layer.intGridValues.length; ++ii) {
              let entry = base_layer.intGridValues[ii];
              lookup[entry.value] = entry.identifier;
            }
            for (let yy = 0, idx = 0; yy < layer_h; ++yy) {
              let row = [];
              for (let xx = 0; xx < layer_w; ++xx, ++idx) {
                let v = layer.intGridCsv[idx];
                if (v) {
                  v = lookup[v];
                  assert(v);
                } else {
                  v = null;
                }
                row.push(v);
              }
              enum_layer.push(row);
            }
          }
          assert(!layer.entityInstances.length, 'entityInstances not yet handled');
        });
        layers_out.reverse();
        job.out({
          relative: `client/${levelname}.ldtkl`,
          contents: JSON.stringify({
            w: map_w,
            h: map_h,
            layers: layers_out,
            enum_layer,
          })
        });
        next();
      },
    ], done);
  }

  return {
    deps: ['client_autoatlas'],
    type: gb.SINGLE,
    version: [
      module.exports,
    ],
    func: proc,
  };
};
