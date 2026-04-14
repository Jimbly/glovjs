/* eslint-disable @stylistic/max-len */

const assert = require('assert');
const path = require('path');
const gb = require('glov-build');
const yaml = require('js-yaml');
const { parse9Patch } = require('./9patch');
const { pngAlloc, pngRead, pngWrite } = require('./png');
const { floor, max } = Math;

function nextHighestPowerOfTwo(x) {
  --x;
  for (let i = 1; i < 32; i <<= 1) {
    x |= x >> i;
  }
  return x + 1;
}

function cmpFileKeys(a, b) {
  return a.localeCompare(b, 'en', { numeric: true });
}

let png_cache = [];
let used_generation = 0;
const PNG_GENERATIONS = 4;
function pngAllocTempReset() {
  let any_used = false;
  for (let ii = 0; ii < png_cache.length; ++ii) {
    if (png_cache[ii].used) {
      png_cache[ii].used = false;
      any_used = true;
    }
  }
  if (any_used) {
    ++used_generation;
    for (let ii = png_cache.length - 1; ii >= 0; --ii) {
      if (!png_cache[ii].used && png_cache[ii].generation < used_generation - PNG_GENERATIONS) {
        // console.log('pngAllocTemp freeing');
        png_cache[ii] = png_cache[png_cache.length - 1];
        png_cache.pop();
      }
    }
  }
}

function pngAllocTemp(width, height, comment) {
  for (let ii = 0; ii < png_cache.length; ++ii) {
    if (!png_cache[ii].used && png_cache[ii].width === width && png_cache[ii].height === height) {
      png_cache[ii].used = true;
      png_cache[ii].generation = used_generation;
      let ret = png_cache[ii].img;
      for (let jj = 0; jj < ret.data.length; ++jj) {
        ret.data[jj] = 0;
      }
      // console.log('pngAllocTemp', width, height, comment || 'unknown');
      return ret;
    }
  }
  let img = pngAlloc({ width, height, byte_depth: 4, comment: comment || 'pngAllocTemp' });
  png_cache.push({
    width,
    height,
    img,
    used: true,
    generate: used_generation,
  });
  return img;
}

function packSkyline(img_list, pad, max_tex_size) {
  img_list.sort(function (imga, imgb) {
    // pack tallest first - TODO: try widest? biggest?
    let d = (imgb.imgs[0].height || 0) - (imga.imgs[0].height || 0);
    if (d) {
      return d;
    }
    return cmpFileKeys(imga.img_name, imgb.img_name);
  });

  let skyline = [
    // y, width
    [0, max_tex_size],
  ];

  let maxx = 0;
  let maxy = 0;
  for (let ii = 0; ii < img_list.length; ++ii) {
    let img_data = img_list[ii];
    let { imgs } = img_data;
    let img0 = imgs[0];
    // pack into output
    let width = img0.width + pad * 2;
    let height = img0.height + pad * 2;
    let best_x = 0;
    let best_y = Infinity;
    let best_idx = -1;
    for (let idx = 0, x = 0; idx < skyline.length; ++idx) {
      let y = skyline[idx][0];
      let left = width;
      let walk = idx;
      while (left > 0 && walk < skyline.length) {
        y = max(y, skyline[walk][0]);
        left -= skyline[walk][1];
        if (left > 0) {
          ++walk;
        }
      }
      if (left <= 0) {
        if (y < best_y) {
          best_idx = idx;
          best_x = x;
          best_y = y;
        }
      }
      x += skyline[idx][1];
    }
    assert(isFinite(best_y));
    img_data.x = best_x + pad;
    img_data.y = best_y + pad;
    maxx = max(maxx, best_x + width);
    let y1 = best_y + height;
    maxy = max(maxy, y1);
    // update skyline
    let left = width;
    let idx = best_idx;
    while (true) {
      let elem = skyline[idx];
      assert(y1 > elem[0]);
      if (left === elem[1]) {
        // perfect fit, done
        elem[0] = y1;
        break;
      } else if (left < elem[1]) {
        // split it and we're done
        skyline.splice(idx + 1, 0, [elem[0], elem[1] - left]);
        elem[0] = y1;
        elem[1] = left;
        break;
      } else {
        // bump it up, move on to the next one
        elem[0] = y1;
        left -= elem[1];
        idx++;
      }
    }
    // compress list (doesn't seem to help in my tests, but doesn't hurt, makes debugging easier)
    let combine = 0;
    let combine_len = 0;
    while (idx >= 0 && skyline[idx][0] === y1) {
      combine++;
      combine_len += skyline[idx][1];
      --idx;
    }
    if (combine > 1) {
      ++idx;
      skyline[idx][1] = combine_len;
      skyline.splice(idx + 1, combine - 1);
    }
  }

  return { width: maxx, height: maxy };
}


module.exports = function (opts) {
  let ignore_list = opts.ignore || [];
  let ignore = Object.create(null);
  for (let ii = 0; ii < ignore_list.length; ++ii) {
    ignore[ignore_list[ii]] = true;
  }
  let output_cache = {};
  let input_png_cache = {};
  function imgproc(job, done) {
    let files = job.getFiles();
    let changed_files = job.getFilesUpdated();

    let atlases = {};
    let seen_png = {};
    for (let ii = 0; ii < files.length; ++ii) {
      let img_file = files[ii];
      let m = img_file.relative.match(/^(?:.*\/)?([^/]+)\/([^/]+)\.(png|ya?ml)$/);
      let atlas_name = m[1].toLowerCase();
      let img_name = m[2].toLowerCase();
      let ext = m[3];
      let atlas_data = atlases[atlas_name] = atlases[atlas_name] || { num_layers: 1, file_data: {}, dirty: false };
      let is_dirty = changed_files.includes(img_file);
      if (is_dirty) {
        atlas_data.dirty = true;
      }
      if (ext[0] === 'y') {
        if (img_name !== 'atlas') {
          job.error(img_file, `Found unexpected yaml: "${img_file.relative}" (expected atlas.yaml or [image_name].yaml)`);
          continue;
        }
        let config_data;
        try {
          config_data = yaml.load(img_file.contents.toString('utf8')) || {};
        } catch (err) {
          job.error(img_file, `Error parsing ${img_file.relative}: ${err}`);
          continue;
        }
        if (config_data.pad && typeof config_data.pad !== 'number') {
          job.error(img_file, `pad must be number, found ${JSON.stringify(config_data.pad)}`);
          delete config_data.pad;
        }
        if (config_data.max_tex_size && typeof config_data.max_tex_size !== 'number') {
          job.error(img_file, `max_tex_size must be number, found ${JSON.stringify(config_data.max_tex_size)}`);
          delete config_data.max_tex_size;
        }
        if (config_data.tile_horiz_regex) {
          try {
            config_data.tile_horiz_regex = new RegExp(config_data.tile_horiz_regex);
          } catch (err) {
            job.error(img_file, `error parsing RegExp tile_horiz_regex: ${JSON.stringify(config_data.tile_horiz_regex)}: ${err}`);
            delete config_data.tile_horiz_regex;
          }
        }
        if (config_data.tile_vert_regex) {
          try {
            config_data.tile_vert_regex = new RegExp(config_data.tile_vert_regex);
          } catch (err) {
            job.error(img_file, `error parsing RegExp tile_vert_regex: ${JSON.stringify(config_data.tile_vert_regex)}: ${err}`);
            delete config_data.tile_vert_regex;
          }
        }
        if (config_data.tile_regex) {
          try {
            config_data.tile_regex = new RegExp(config_data.tile_regex);
          } catch (err) {
            job.error(img_file, `error parsing RegExp tile_regex: ${JSON.stringify(config_data.tile_regex)}: ${err}`);
            delete config_data.tile_regex;
          }
        }
        atlas_data.config_data = config_data;
        continue;
      }
      seen_png[img_file.relative] = true;
      let do_9patch = img_name.endsWith('.9');
      if (do_9patch) {
        img_name = img_name.slice(0, -2);
      }
      m = img_name.match(/^(.*)_(\d+)$/);
      let idx = 0;
      if (m) {
        img_name = m[1];
        idx = Number(m[2]);
      }
      atlas_data.num_layers = max(atlas_data.num_layers, idx + 1);

      let img;
      let ws;
      let hs;
      let padh;
      let padv;
      if (!is_dirty && input_png_cache[img_file.relative]) {
        img = input_png_cache[img_file.relative];
        ({ ws, hs, padh, padv } = img.cached_data);
      } else {
        let err;
        ({ err, img } = pngRead(img_file.contents));
        if (err) {
          job.error(img_file, `Error reading ${img_file.relative}: ${err}`);
          continue;
        }
        ws = [img.width];
        hs = [img.height];
        img.source_name = img_file.relative;

        if (do_9patch) {
          let ret = parse9Patch(job, img, img_name, idx !== 0);
          ({ ws, hs, img } = ret);
          if (idx === 0) {
            ({ padh, padv } = ret);
          }
        }
        img.cached_data = {
          ws,
          hs,
          padh,
          padv,
        };
        input_png_cache[img_file.relative] = img;
      }
      let img_data = atlas_data.file_data[img_name] = atlas_data.file_data[img_name] || { imgs: [] };
      if (idx === 0) {
        img_data.ws = ws;
        img_data.hs = hs;
        if (padh) {
          img_data.padh = padh;
          img_data.padv = padv;
        }
      }
      img.filename = img_file.relative;
      if (img_data.imgs[idx]) {
        job.error('Two atlas source files map to the same image:' +
          ` ${img.filename} and ${img_data.imgs[idx].filename}`);
      }
      img_data.imgs[idx] = img;
    }

    // Flag atlases as dirty for deleted files
    for (let ii = 0; ii < changed_files.length; ++ii) {
      let img_file = changed_files[ii];
      if (!img_file.contents) {
        let m = img_file.relative.match(/^(?:.*\/)?([^/]+)\/([^/]+)\.(png|ya?ml)$/);
        let atlas_name = m[1].toLowerCase();
        let atlas_data = atlases[atlas_name];
        if (atlas_data) {
          atlas_data.dirty = true;
        }
      }
    }

    for (let key in input_png_cache) {
      if (!seen_png[key]) {
        delete input_png_cache[key];
      }
    }

    let atlas_keys = Object.keys(atlases);

    if (!atlas_keys.length) {
      // no error, just no atlases in this project, that's fine
      return void done();
    }

    let seen = {};
    function doAtlas(name) {
      let atlas_data = atlases[name];
      let { file_data, config_data, dirty } = atlas_data;
      seen[name] = true;
      if (!dirty) {
        let cache = output_cache[name];
        assert(cache);
        for (let ii = 0; ii < cache.length; ++ii) {
          job.out(cache[ii]);
        }
        return;
      }
      pngAllocTempReset();

      const tile_horiz_regex = config_data?.tile_horiz_regex || null;
      const tile_vert_regex = config_data?.tile_vert_regex || null;
      const tile_regex = config_data?.tile_regex || null;
      const pad = config_data?.pad || 8;
      const max_tex_size = config_data?.max_tex_size || 1024;

      let file_keys = Object.keys(file_data);
      file_keys.sort(cmpFileKeys);
      let file_keys_for_packing = file_keys.slice(0);

      let runtime_data = {
        // name,
        tiles: [], // [name, x, y, ws, hs, padh, padv]
      };
      if (atlas_data.num_layers > 1) {
        runtime_data.layers = atlas_data.num_layers;
      }

      // Check input
      let any_error = false;
      let imgs_for_packing = [];
      for (let ii = 0; ii < file_keys_for_packing.length; ++ii) {
        let img_name = file_keys_for_packing[ii];
        if (ignore[`${name}:${img_name}`]) {
          continue;
        }
        let img_data = file_data[img_name];
        let { imgs } = img_data;
        let img0 = imgs[0];
        if (!img0) {
          any_error = true;
          job.error(`Image ${name}/${img_name} missing required base (_0) layer`);
          continue;
        }
        // Check all layers are the same size
        for (let idx = 1; idx < imgs.length; ++idx) {
          let img = imgs[idx];
          if (img) {
            if (img.width !== img0.width ||
              img.height !== img0.height
            ) {
              any_error = true;
              job.error(`Image ${name}/${img_name} layer ${idx} (${img.source_name}) resolution (${img.width}x${img.height})` +
                ` does not match base layer (${img0.source_name}) resolution (${img0.width}x${img0.height})`);
            }
          }
        }
        if (img0.width + pad * 2 > max_tex_size) {
          any_error = true;
          job.error(`Image ${name}/${img_name} resolution (${img0.width}x${img0.height})` +
            ` is larger than max_tex_size of ${max_tex_size}`);
        }
        img_data.img_name = img_name;
        imgs_for_packing.push(img_data);
      }
      if (any_error) {
        return;
      }

      let { width, height } = packSkyline(imgs_for_packing, pad, max_tex_size);

      // Allocate actual images and copy into them
      width = max(1, nextHighestPowerOfTwo(width));
      height = max(1, nextHighestPowerOfTwo(height));
      let pngouts = [];
      for (let ii = 0; ii < atlas_data.num_layers; ++ii) {
        pngouts.push(pngAllocTemp(width, height, `output:${name}`));
      }
      runtime_data.w = width;
      runtime_data.h = height;

      for (let ii = 0; ii < file_keys.length; ++ii) {
        let img_name = file_keys[ii];
        if (ignore[`${name}:${img_name}`]) {
          continue;
        }
        let img_data = file_data[img_name];
        let { imgs, x, y, ws, hs, padh, padv } = img_data;
        let { width: imgw, height: imgh } = imgs[0];
        let tuple = [img_name, x, y, ws, hs];
        if (padh) {
          tuple.push(padh, padv);
        }
        runtime_data.tiles.push(tuple);

        for (let idx = 0; idx < imgs.length; ++idx) {
          let img = imgs[idx];
          if (!img) {
            continue;
          }
          let { data: outdata } = pngouts[idx];
          let { data: indata } = img;
          let clamp = !tile_regex?.test(img_name);
          let clamp_vert = clamp && !tile_vert_regex?.test(img_name) || tile_regex && tile_horiz_regex?.test(img_name);
          let clamp_horiz = clamp && !tile_horiz_regex?.test(img_name) || tile_regex && tile_vert_regex?.test(img_name);
          for (let yy = -pad; yy < imgh + pad; ++yy) {
            let yyy;
            if (clamp_vert) {
              yyy = yy < 0 ? 0 : yy >= imgh ? imgh - 1 : yy;
            } else {
              yyy = (yy + imgh) % imgh;
            }
            for (let xx = -pad; xx < imgw + pad; ++xx) {
              let xxx;
              if (clamp_horiz) {
                xxx = xx < 0 ? 0 : xx >= imgw ? imgw - 1 : xx;
              } else {
                xxx = (xx + imgw) % imgw;
              }
              for (let jj = 0; jj < 4; ++jj) {
                outdata[(x + xx + (y + yy) * width) * 4 + jj] = indata[(xxx + yyy * imgw) * 4 + jj];
              }
            }
          }
        }
      }

      let out_list = [];
      for (let idx = 0; idx < pngouts.length; ++idx) {
        let pngout = pngouts[idx];
        out_list.push({
          relative: `client/img/atlas_${name}${atlas_data.num_layers > 1 ? `_${idx}` : ''}.png`,
          contents: pngWrite(pngout),
        });
      }
      out_list.push({
        relative: `client/${name}.auat`,
        contents: JSON.stringify(runtime_data),
      });
      for (let ii = 0; ii < out_list.length; ++ii) {
        job.out(out_list[ii]);
      }
      output_cache[name] = out_list;
      pngAllocTempReset();
    }

    for (let key in atlases) {
      doAtlas(key);
    }
    for (let key in output_cache) {
      if (!seen[key]) {
        delete output_cache[key];
      }
    }
    done();
  }

  function prepproc(job, done) {
    pngAllocTempReset();
    let img_file = job.getFile();

    let base_name = path.basename(img_file.relative);
    let ext = path.extname(img_file.relative);
    if (ext === '.yaml') {
      if (base_name === 'atlas.yaml') {
        // config file, just pass through
        job.out(img_file);
      }
      // otherwise, presumably matches a .png, will be handled when the prep the png
      return void done();
    }
    assert(ext === '.png');
    let config_name = `${img_file.relative.slice(0, -ext.length)}.yaml`;
    job.depAdd(config_name, function (err, depfile) {
      if (err) {
        // presumably config file doesn't exist, that's fine, pass the image through
        job.out(img_file);
        return void done();
      }

      let { err: img_err, img } = pngRead(img_file.contents);
      if (img_err) {
        job.error(img_file, `Error reading ${img_file.relative}: ${img_err}`);
        return void done();
      }

      assert(depfile.contents);
      let config_data;
      try {
        config_data = yaml.load(depfile.contents.toString('utf8')) || {};
      } catch (err) {
        job.error(depfile, `Error parsing ${depfile.relative}: ${err}`);
        return void done();
      }
      let { tile_res, tiles_per_row, tiles } = config_data;
      if (!tiles) {
        job.error(depfile, 'Config file missing "tiles" member');
        return void done();
      }
      if (tile_res && !Array.isArray(tile_res)) {
        tile_res = [tile_res, tile_res];
      }

      if (!tiles_per_row && tile_res) {
        tiles_per_row = floor(img.width / tile_res[0]);
      }
      for (let key in tiles) {
        let tile_def = tiles[key];
        let source;
        if (typeof tile_def === 'number') {
          if (!tile_res) {
            job.error(depfile, `Tile "${key}" specifies numerical tile, but config missing "tile_res"`);
            continue;
          }
          source = [(tile_def % tiles_per_row) * tile_res[0], floor(tile_def / tiles_per_row) * tile_res[1], tile_res[0], tile_res[1]];
        } else if (Array.isArray(tile_def) && tile_def.length === 2) {
          if (!tile_res) {
            job.error(depfile, `Tile "${key}" specifies [x,y] without w,h, but config missing "tile_res"`);
            continue;
          }
          source = [tile_def[0] * tile_res[0], tile_def[1] * tile_res[1], tile_res[0], tile_res[1]];
        } else if (Array.isArray(tile_def) && tile_def.length === 4) {
          source = tile_def;
        } else {
          job.error(depfile, `Tile "${key}" specifies unrecognized definition of "${JSON.stringify(tile_def)}" (expected index, [x, y], or [x, y, w, h])`);
          continue;
        }
        let img_out = pngAllocTemp(
          source[2],
          source[3],
          `splitting:${img_file.relative}:${key}`
        );
        try {
          img.bitblt(img_out, source[0], source[1], source[2], source[3], 0, 0);
        } catch (err) {
          job.error(depfile, `${key}: Error copying image: "${err}"`);
          continue;
        }
        job.out({
          relative: `${path.dirname(img_file.relative)}/${key}.png`,
          contents: pngWrite(img_out),
        });
      }
      pngAllocTempReset();
      done();
    });
  }

  let { name, inputs, only_prep } = opts;

  // Prep task: for images with matching .yaml, split them up
  // Other images and atlas.yaml - just pass through
  let prep_task = {
    type: gb.SINGLE,
    input: inputs,
    func: prepproc,
  };

  if (only_prep) {
    return {
      ...prep_task,
      name,
    };
  }
  let prep_task_name = `${name}_prep`;
  gb.task({
    ...prep_task,
    name: prep_task_name,
  });

  // Main task: combine an atlas per folder
  return {
    name,
    type: gb.ALL,
    func: imgproc,
    input: [
      `${prep_task_name}:**`,
    ],
    version: [
      cmpFileKeys,
      parse9Patch,
      opts,
      ignore,
      packSkyline,
    ],
  };
};
