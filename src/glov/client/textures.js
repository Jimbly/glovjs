// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
/* globals navigator */

// constants for use before the WebGL context is created
export const GL_REPEAT = 0x2901;
export const GL_CLAMP_TO_EDGE = 0x812f;

export const TEXTURE_FORMAT = {
  R8: { count: 1 },
  RGB8: { count: 3 },
  RGBA8: { count: 4 },
  DEPTH16: { count: 1 },
  DEPTH24: { count: 1 },
};

import * as assert from 'assert';
import { dataError } from 'glov/common/data_error';
import {
  FORMAT_ASTC,
  FORMAT_DXT,
  FORMAT_PACK,
  FORMAT_PNG,
  TEXPACK_MAGIC,
  TEXPROC_COMPRESSED_HEADER,
} from 'glov/common/texpack_common';
import {
  callbackify,
  callEach,
  isPowerOfTwo,
  nextHighestPowerOfTwo,
  ridx,
} from 'glov/common/util';
import { vec4 } from 'glov/common/vmath';
import { asyncParallel, asyncSeries } from 'glov-async';
import { is_firefox, is_ios_safari } from './browser';
import { buildUIActiveReload } from './build_ui';
import * as engine from './engine';
import {
  isLoading,
  postTick,
} from './engine';
import { fetch } from './fetch';
import { filewatchOn } from './filewatch';
import {
  localStorageGetJSON,
  localStorageSetJSON,
} from './local_storage';
import { locateAsset } from './locate_asset';
import * as settings from './settings';
import { shadersSetGLErrorReportDetails } from './shaders';
import * as urlhash from './urlhash';
import { webFSExists, webFSGetFile } from './webfs';

const { ceil, floor, min } = Math;

const TEX_UNLOAD_TIME = 5 * 60 * 1000; // for textures loaded (each frame) with auto_unload: true

const ASYNC_TEXTURE_SIZE = 4*1024*1024; // anything bigger than this many bytes gets cut into chunks uploaded each frame

const textures = {};
let load_count = 0;
export function textureLoadCount() {
  return load_count;
}

let texture_loading_state = false;
export function textureSetIsLoading(value) {
  texture_loading_state = value;
}

function textureIsLoading() {
  return texture_loading_state || isLoading();
}

let texture_stream_delay = 0;
export function texturesDelayStreamingPostLoad() {
  if (!textureLoadCount()) {
    texture_stream_delay = 500;
  }
}

let aniso = 4;
let max_aniso = 0;
let max_texture_size = 1024;
let aniso_enum;
let dxt_supported = false;
let astc_supported = false;

let default_filter_min;
let default_filter_mag;

const cube_faces = [
  { target: 'TEXTURE_CUBE_MAP_NEGATIVE_X', pos: [0,1] },
  { target: 'TEXTURE_CUBE_MAP_POSITIVE_X', pos: [0,0] },
  { target: 'TEXTURE_CUBE_MAP_NEGATIVE_Y', pos: [1,0] },
  { target: 'TEXTURE_CUBE_MAP_POSITIVE_Y', pos: [1,1] },
  { target: 'TEXTURE_CUBE_MAP_NEGATIVE_Z', pos: [2,0] },
  { target: 'TEXTURE_CUBE_MAP_POSITIVE_Z', pos: [2,1] },
];

export function textureDefaultFilters(filter_min, filter_mag) {
  default_filter_min = filter_min;
  default_filter_mag = filter_mag;
}

export function textureDefaultIsNearest() {
  return default_filter_mag === gl.NEAREST;
}

const supports_cib = Boolean(window.createImageBitmap); // iOS 12 at least doesn't
const createImageBitmap = callbackify(window.createImageBitmap);

let bound_unit = null;
let bound_tex = [];

let handle_loading;
let handle_error;

let frame_timestamp;

function setUnit(unit) {
  if (unit !== bound_unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    bound_unit = unit;
  }
}

function bindHandle(unit, target, handle) {
  if (bound_tex[unit] !== handle) {
    setUnit(unit);
    gl.bindTexture(target, handle);
    bound_tex[unit] = handle;
  }
}

function unbindAll(target) {
  for (let unit = 0; unit < bound_tex.length; ++unit) {
    setUnit(unit);
    gl.bindTexture(target, target === gl.TEXTURE_2D ? handle_loading : null);
    bound_tex[unit] = null;
  }
}

export function textureGetAll() {
  return textures;
}

export function textureWhite() {
  return textures.white;
}
export function textureZero() {
  return textures.invisible;
}
export function textureError() {
  return textures.error;
}

export function textureBind(unit, tex) {
  tex.last_use = frame_timestamp;
  // May or may not change the unit
  bindHandle(unit, tex.target, tex.eff_handle);
}

// hot path inlined for perf
export function textureBindArray(texs) {
  for (let ii = 0; ii < texs.length; ++ii) {
    let tex = texs[ii];
    tex.last_use = frame_timestamp;
    let handle = tex.eff_handle;
    if (bound_tex[ii] !== handle) {
      if (ii !== bound_unit) {
        gl.activeTexture(gl.TEXTURE0 + ii);
        bound_unit = ii;
      }
      gl.bindTexture(tex.target, handle);
      bound_tex[ii] = handle;
    }
  }
}

export function textureCmpArray(texsa, texsb) {
  let d = texsa.length - texsb.length;
  if (d) {
    return d;
  }
  for (let ii = 0; ii < texsa.length; ++ii) {
    d = texsa[ii].id - texsb[ii].id;
    if (d) {
      return d;
    }
  }
  return 0;
}

export function textureIsArrayBound(texs) {
  for (let ii = 0; ii < texs.length; ++ii) {
    let tex = texs[ii];
    let handle = tex.eff_handle;
    if (bound_tex[ii] !== handle) {
      return false;
    }
  }
  return true;
}

export function textureResetState() {
  bound_unit = -1;
  if (engine.webgl2) {
    unbindAll(gl.TEXTURE_2D_ARRAY);
  }
  unbindAll(gl.TEXTURE_2D);
  setUnit(0);
  // Disabling this.  In theory clearing the GL error at the beginning of the frame
  //   is good for debugging, and shouldn't actually harm anything (possibly stall
  //   as it's the first GL call of the frame, but theoretically not much more than
  //   whatever the next GL call would be), however in practice this is adding up
  //   to a couple ms (when running at /max_fps 1000) in Chrome.  Does not seem to
  //   have any effect either way under GPU-bound conditions though.
  // profilerStart('gl.getError()');
  // gl.getError();
  // profilerStop('gl.getError()');
}

export function textureCname(key) {
  let idx = key.lastIndexOf('/');
  if (idx !== -1) {
    key = key.slice(idx+1);
  }
  idx = key.indexOf('.');
  if (idx !== -1) {
    key = key.slice(0, idx);
  }
  return key.toLowerCase();
}

let auto_unload_textures = [];

let last_id = 0;
function Texture(params) {
  this.id = ++last_id;
  this.name = params.name;
  this.cname = textureCname(this.name); // Note: many loaded textures may have the same `cname`
  this.loaded = false;
  this.load_fail = false;
  this.target = params.target || gl.TEXTURE_2D;
  this.is_array = this.target === gl.TEXTURE_2D_ARRAY;
  this.is_cube = this.target === gl.TEXTURE_CUBE_MAP;
  this.packed_mips = Boolean(params.packed_mips);
  if (this.packed_mips) {
    assert(this.is_array); // only path it's supported on currently
  }
  this.handle = gl.createTexture();
  this.eff_handle = handle_loading;
  this.mipmaps_allowed = true; // assume true until otherwise known
  this.setSamplerState(params);
  this.src_width = this.src_height = 1;
  this.width = this.height = 1;
  this.nozoom = params.nozoom || false;
  this.on_load = [];
  this.gpu_mem = 0;
  this.soft_error = params.soft_error || false;
  this.last_use = frame_timestamp;
  this.auto_unload = params.auto_unload ? [] : null;
  if (typeof params.auto_unload === 'function') {
    this.auto_unload.push(params.auto_unload);
  }
  if (this.auto_unload) {
    auto_unload_textures.push(this);
  }
  this.load_filter = params.load_filter || null;
  this.load_time_total = -1;
  this.load_time_upload = -1;
  this.actual_url = '?';

  this.format = params.format || TEXTURE_FORMAT.RGBA8;

  if (params.data) {
    this.updateData(params.width, params.height, params.data, null, function (err) {
      if (err) {
        shadersSetGLErrorReportDetails();
        assert(false, `Error loading ${params.name}: ${err}`);
      }
    });
  } else {
    // texture is not valid, do not leave bound
    unbindAll(this.target);
    if (params.url) {
      this.format = TEXTURE_FORMAT.RGBA8;
      this.url = params.url;
      this.loadURL(params.url, this.load_filter);
    }
  }
}

Texture.prototype.updateGPUMem = function () {
  let new_size = this.width * this.height * this.format.count;
  if (this.mipmaps) {
    new_size *= 1.5;
  }
  let diff = new_size - this.gpu_mem;
  engine.perf_state.gpu_mem.tex += diff;
  this.gpu_mem = diff;
  this.tex_size_shader_params = null;
};

function bindForced(tex) {
  let target = tex.target;
  setUnit(0);
  bound_tex[0] = null; // Force a re-bind, no matter what
  bindHandle(0, target, tex.handle);
}

export function textureFilterKey(params) {
  let filter_min = params.filter_min || default_filter_min;
  let filter_mag = params.filter_mag || default_filter_mag;
  let wrap_s = params.wrap_s || gl.REPEAT;
  let wrap_t = params.wrap_t || gl.REPEAT;
  let force_mipmaps = params.force_mipmaps ? 1 : 0;
  return (((filter_min * 77 + filter_mag) * 77 + wrap_s) * 77 + wrap_t) * 77 + force_mipmaps;
}

let tex_size_shader_params_cache = {};
function getTexSizeShaderParams(w, h) {
  if (!tex_size_shader_params_cache[w]) {
    tex_size_shader_params_cache[w] = {};
  }
  let row = tex_size_shader_params_cache[w];
  if (!row[h]) {
    row[h] = { tex0_size: vec4(w, h, 1/w, 1/h) };
  }
  return row[h];
}

Texture.prototype.getTexSizeShaderParams = function () {
  let v = this.tex_size_shader_params;
  if (!v) {
    v = this.tex_size_shader_params = getTexSizeShaderParams(this.width, this.height);
  }
  return v;
};

Texture.prototype.setSamplerState = function (params) {
  let target = this.target;
  bindForced(this);

  let filter_min = this.filter_min = params.filter_min || default_filter_min;
  this.filter_mag = params.filter_mag || default_filter_mag;

  if (!this.mipmaps_allowed) {
    if (filter_min === gl.LINEAR_MIPMAP_LINEAR) {
      filter_min = gl.LINEAR;
    } else if (filter_min === gl.NEAREST_MIPMAP_NEAREST) {
      filter_min = gl.NEAREST;
    }
  }

  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter_min);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, this.filter_mag);
  let wrap_s = this.wrap_s = params.wrap_s || gl.REPEAT;
  let wrap_t = this.wrap_t = params.wrap_t || gl.REPEAT;
  if (this.np2_on_gpu) {
    wrap_s = wrap_t = gl.CLAMP_TO_EDGE;
  }
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap_s);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap_t);

  // set if mipmaps desired, may not exist
  this.mipmaps = this.filter_min >= 0x2700 && this.filter_min <= 0x2703 || // Probably gl.LINEAR_MIPMAP_LINEAR
    params.force_mipmaps;

  if (max_aniso) {
    if (this.mipmaps && params.filter_mag !== gl.NEAREST) {
      gl.texParameterf(gl.TEXTURE_2D, aniso_enum, aniso);
    } else {
      gl.texParameterf(gl.TEXTURE_2D, aniso_enum, 1);
    }
  }
};

Texture.prototype.allowMipmaps = function (allow) {
  if (this.mipmaps_allowed === allow) {
    return;
  }
  this.mipmaps_allowed = allow;
  this.setSamplerState({
    filter_min: this.filter_min,
    filter_mag: this.filter_mag,
    wrap_s: this.wrap_s,
    wrap_t: this.wrap_t,
  });
};

// Texture.prototype.generateManualArrayMipmaps = function (img) {
//   let w = img.width;
//   let h = img.height;
//   let num_images = h / w;
//   // This was already called:
//   // gl.texImage3D(this.target, 0, this.format.internal_type, w, w,
//   //   num_images, 0, this.format.internal_type, this.format.gl_type, data);

//   let level = 0;
//   let canvas = document.createElement('canvas');
//   let ctx = canvas.getContext('2d');
//   while (w > 1) {
//     ++level;
//     w = max(1, floor(w / 2));
//     canvas.width = w;
//     let eff_h = w * num_images;
//     canvas.height = eff_h;
//     // TODO: filter here instead of nearest (1px canvas blur on each step would do it?)
//     ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, eff_h);
//     gl.texImage3D(this.target, level, this.format.internal_type, w, w,
//       num_images, 0, this.format.internal_type, this.format.gl_type, canvas);
//   }
// };

// function countMipLevels(dim) {
//   let ret = 1;
//   while (dim > 1) {
//     ++ret;
//     dim = floor(dim/2);
//   }
//   return ret;
// }

Texture.prototype.uploadPackedTexArrayWithMips = function uploadPackedTexArrayWithMips(
  per_mipmap_data, tile_w, num_images, orig_img
) {
  let temp_canvas;
  let level = 0;
  let last_w = tile_w;
  while (last_w >= 1) {
    let img = per_mipmap_data[level];
    assert(img);
    gl.texImage3D(this.target, level, this.format.internal_type, last_w, last_w,
      num_images, 0, this.format.internal_type, this.format.gl_type, level === 0 ? orig_img : img);

    if (gl.getError()) {
      // Reproducing Samsung fix from below, assumed also needed here
      temp_canvas = temp_canvas || document.createElement('canvas');
      temp_canvas.width = last_w;
      temp_canvas.height = last_w * num_images;
      let ctx = temp_canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      gl.texImage3D(this.target, level, this.format.internal_type, last_w, last_w,
        num_images, 0, this.format.internal_type, this.format.gl_type, temp_canvas);
    }

    level++;
    last_w = floor(last_w / 2);
  }
  assert(!per_mipmap_data[level]);
};

const BYTES_PER_PIXEL_COMPRESSED = {
  0x83f0: 0.5, // RGB_S3TC_DXT1
  0x83f1: 0.5, // RGBA_S3TC_DXT1
  0x83f2: 1, // RGBA_S3TC_DXT3
  0x83f3: 1, // RGBA_S3TC_DXT5
  0x93B0: 8/8, // GL_COMPRESSED_RGBA_ASTC_4x4_KHR - ASTC 4×4 RGBA    8bpp
  0x93D0: 8/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_4x4_KHR - ASTC 4×4 SRGB    8bpp
  0x93B1: 6.4/8, // GL_COMPRESSED_RGBA_ASTC_5x4_KHR - ASTC 5×4 RGBA    6.4bpp
  0x93D1: 6.4/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_5x4_KHR - ASTC 5×4 SRGB    6.4bpp
  0x93B2: 5.1/8, // GL_COMPRESSED_RGBA_ASTC_5x5_KHR - ASTC 5×5 RGBA    5.1bpp
  0x93D2: 5.1/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_5x5_KHR - ASTC 5×5 SRGB    5.1bpp
  0x93B3: 4.3/8, // GL_COMPRESSED_RGBA_ASTC_6x5_KHR - ASTC 6×5 RGBA    4.3bpp
  0x93D3: 4.3/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_6x5_KHR - ASTC 6×5 SRGB    4.3bpp
  0x93B4: 3.6/8, // GL_COMPRESSED_RGBA_ASTC_6x6_KHR - ASTC 6×6 RGBA    3.6bpp
  0x93D4: 3.6/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_6x6_KHR - ASTC 6×6 SRGB    3.6bpp
  0x93B5: 3.2/8, // GL_COMPRESSED_RGBA_ASTC_8x5_KHR - ASTC 8×5 RGBA    3.2bpp
  0x93D5: 3.2/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_8x5_KHR - ASTC 8×5 SRGB    3.2bpp
  0x93B6: 2.7/8, // GL_COMPRESSED_RGBA_ASTC_8x6_KHR - ASTC 8×6 RGBA    2.7bpp
  0x93D6: 2.7/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_8x6_KHR - ASTC 8×6 SRGB    2.7bpp
  0x93B7: 2.0/8, // GL_COMPRESSED_RGBA_ASTC_8x8_KHR - ASTC 8×8 RGBA    2.0bpp
  0x93D7: 2.0/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_8x8_KHR - ASTC 8×8 SRGB    2.0bpp
  0x93B8: 2.6/8, // GL_COMPRESSED_RGBA_ASTC_10x5_KHR - ASTC 10×5 RGBA    2.6bpp
  0x93D8: 2.6/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_10x5_KHR - ASTC 10×5 SRGB    2.6bpp
  0x93B9: 2.1/8, // GL_COMPRESSED_RGBA_ASTC_10x6_KHR - ASTC 10×6 RGBA    2.1bpp
  0x93D9: 2.1/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_10x6_KHR - ASTC 10×6 SRGB    2.1bpp
  0x93BA: 1.6/8, // GL_COMPRESSED_RGBA_ASTC_10x8_KHR - ASTC 10×8 RGBA    1.6bpp
  0x93DA: 1.6/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_10x8_KHR - ASTC 10×8 SRGB    1.6bpp
  0x93BB: 1.3/8, // GL_COMPRESSED_RGBA_ASTC_10x10_KHR - ASTC 10×10 RGBA    1.3bpp
  0x93DB: 1.3/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_10x10_KHR - ASTC 10×10 SRGB    1.3bpp
  0x93BC: 1.1/8, // GL_COMPRESSED_RGBA_ASTC_12x10_KHR - ASTC 12×10 RGBA    1.1bpp
  0x93DC: 1.1/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_12x10_KHR - ASTC 12×10 SRGB    1.1bpp
  0x93BD: 0.9/8, // GL_COMPRESSED_RGBA_ASTC_12x12_KHR - ASTC 12×12 RGBA    0.9bpp
  0x93DD: 0.9/8, // GL_COMPRESSED_SRGB_ALPHA8_ASTC_12x12_KHR   - ASTC 12×12 SRGB    0.9bpp
};
function bytesPerPixelFromCompressedFormat(fmt) {
  let ret = BYTES_PER_PIXEL_COMPRESSED[fmt];
  if (!ret) {
    assert(ret, fmt.toString(16));
  }
  return ret;
}

Texture.prototype.texStorage = function (levels, gl_internal_format, width, height) {
  assert(!this.fbo);
  assert(bound_tex[0] === this.handle);
  let key = [levels, gl_internal_format, width, height].join();
  if (this.immutable_storage) {
    if (this.immutable_storage === key) {
      // already good
      return;
    }
    // destroy and create a new texture
    unbindAll(this.target);
    gl.deleteTexture(this.handle);
    if (this.eff_handle === this.handle) {
      this.eff_handle = handle_loading;
    }
    this.handle = gl.createTexture();
    bindForced(this);
  }
  if (levels === null) {
    this.immutable_storage = null;
    return;
  }
  gl.texStorage2D(this.target, levels, gl_internal_format, width, height);
  this.immutable_storage = key;
};

function uploadPrep(is_compressed, tex, data, per_mipmap_data) {
  let size = tex.width * tex.height * tex.format.count;
  let do_sync = size <= ASYNC_TEXTURE_SIZE || textureIsLoading() || tex.for_reload;
  let total_levels = 1;
  let leveloffs = 0;
  let do_prealloc = engine.webgl2 && is_compressed || !is_compressed;
  let base_level = data;
  if (per_mipmap_data) {
    for (let level = 0; level < per_mipmap_data.length; ++level) {
      let img = per_mipmap_data[level];
      if (img.width > max_texture_size || img.height > max_texture_size) {
        if (level === 0) {
          dataError(`Texture ${tex.url} (${img.width}x${img.height}) larger ` +
            `than GL max texture size (${max_texture_size}) and has been resized`);
        }
        ++leveloffs;
        continue;
      }
      total_levels = per_mipmap_data.length - leveloffs;
      base_level = img;
      break;
    }
  }
  // if we downsampled, adjust width/height (for GPU mem calculations, but might confuse other logic?)
  tex.width = base_level.width;
  tex.height = base_level.height;
  let no_mipmaps = !engine.webgl2 && (!isPowerOfTwo(tex.width) || !isPowerOfTwo(tex.height));
  if (no_mipmaps) {
    total_levels = 1;
  }

  if (do_prealloc) {
    profilerStart('pre-allocate');
    if (is_compressed && engine.webgl2) {
      tex.texStorage(total_levels, data.gl_internal_format, base_level.width, base_level.height);
    } else {
      if (tex.immutable_storage) {
        tex.texStorage(null);
      }
      for (let ii = 0; ii < total_levels; ++ii) {
        let img = ii === 0 ? base_level : per_mipmap_data[ii + leveloffs];
        gl.texImage2D(tex.target, ii, tex.format.internal_type, img.width, img.height, 0,
          tex.format.internal_type, tex.format.gl_type, null);
      }
    }
    profilerStop();
  } else {
    if (tex.immutable_storage) {
      tex.texStorage(null);
    }
  }

  return {
    do_sync,
    leveloffs,
    base_level,
    do_prealloc,
    no_mipmaps,
  };
}

function runUploadTasks(tex, base_level, no_mipmaps, per_mipmap_data, leveloffs, uploadLevel, finish) {
  let tasks = [];
  if (per_mipmap_data && !no_mipmaps) {
    for (let level = per_mipmap_data.length - 1; level >= leveloffs; --level) {
      let img = per_mipmap_data[level];
      uploadLevel(tasks, level - leveloffs, img);
    }
  } else {
    uploadLevel(tasks, 0, base_level);
  }
  if (!tasks.length) {
    // was sync
    return void finish();
  }
  let task_idx = 0;
  let waiting = false;
  function tick() {
    if (tex.destroyed) {
      // cancel uploading
      return void finish('texture destroyed while uploading');
    }
    bindForced(tex);
    function doneWaiting() {
      assert(waiting);
      waiting = false;
    }
    while (task_idx < tasks.length && !waiting) {
      waiting = true;
      let keep_going = tasks[task_idx++](doneWaiting);
      if (!keep_going) {
        break;
      }
    }
    if (task_idx === tasks.length && !waiting) {
      finish();
    } else {
      postTick({
        inactive: true,
        fn: tick,
      });
    }
  }
  tick();
}

function uploadTextureCompressed(tex, data, per_mipmap_data, finish) {
  assert(data.is_raw_data);
  let bpp = bytesPerPixelFromCompressedFormat(data.gl_internal_format);
  tex.format = {
    is_compressed: true,
    internal_type: data.gl_base_internal_format,
    count: bpp, // actually bytes-per-pixel
    gl_type: data.gl_internal_format,
  };

  const { do_sync, leveloffs, do_prealloc, base_level, no_mipmaps } = uploadPrep(true, tex, data, per_mipmap_data);

  function uploadLevel(tasks, level, img) {
    function doUploadFull() {
      profilerStart('compressedTexImage2D');
      if (tex.immutable_storage) {
        gl.compressedTexSubImage2D(tex.target, level,
          0, 0, img.width, img.height,
          data.gl_internal_format, img.data);
      } else {
        gl.compressedTexImage2D(tex.target, level,
          data.gl_internal_format, img.width, img.height, 0, img.data);
      }
      if (engine.webgl2) {
        gl.texParameteri(tex.target, gl.TEXTURE_BASE_LEVEL, level);
        tex.eff_handle = tex.handle; // if it was using the loading handle, we have at least some good level now
      }
      profilerStop();
    }
    if (do_sync) {
      doUploadFull();
    } else {
      let level_size = img.width * img.height * bpp;
      if (level_size <= ASYNC_TEXTURE_SIZE || !do_prealloc) {
        // this level is small enough, do all at once
        // or, WebGL1, we can't pre-allocate compressed textures, just do one mip layer at a time
        tasks.push(function (done) {
          doUploadFull();
          done();
          // if this didn't use up the whole quota, keep going
          return level_size < ASYNC_TEXTURE_SIZE * 0.5;
        });
      } else {
        // do full width (contiguous blocks)
        let chunk_w = img.width;
        let chunk_h = (ceil(ASYNC_TEXTURE_SIZE / bpp / chunk_w) + 3) & ~3;
        for (let yy = 0; yy < img.height; yy += chunk_h) {
          let yyy = yy;
          tasks.push(function (done) {
            profilerStart('compressedTexSubImage2D');
            let eff_h = min(chunk_h, img.height - yyy);
            let dv = new DataView(
              img.data.buffer,
              img.data.byteOffset + chunk_w * yyy * bpp,
              chunk_w * eff_h * bpp
            );
            gl.compressedTexSubImage2D(tex.target, level,
              0, yyy, chunk_w, eff_h,
              data.gl_internal_format, dv);
            if (yyy + eff_h === img.height) {
              if (engine.webgl2) {
                gl.texParameteri(tex.target, gl.TEXTURE_BASE_LEVEL, level);
                tex.eff_handle = tex.handle;
              }
            }
            done();
            profilerStop();
            return false;
          });
        }
      }
    }
  }

  tex.allowMipmaps(!no_mipmaps);
  runUploadTasks(tex, base_level, no_mipmaps, per_mipmap_data, leveloffs, uploadLevel, function (err) {
    buildUIActiveReload('texcomp', null);
    finish(err);
  });
}

function uploadTextureImgOrCanvas(tex, data, per_mipmap_data, finish) {
  let { do_sync, leveloffs, base_level, do_prealloc, no_mipmaps } = uploadPrep(false, tex, data, per_mipmap_data);

  if (base_level.width > max_texture_size || base_level.height > max_texture_size) {
    assert(!per_mipmap_data); // would have returned a different base_level
    assert(!do_prealloc); // would be wrong size
    profilerStart('texture resize and upload');
    dataError(`Texture ${tex.url} (${base_level.width}x${base_level.height}) larger ` +
      `than GL max texture size (${max_texture_size}) and has been resized`);
    let canvas = document.createElement('canvas');
    canvas.width = min(base_level.width, max_texture_size);
    canvas.height = min(base_level.height, max_texture_size);
    let ctx = canvas.getContext('2d');
    ctx.drawImage(base_level, 0, 0, canvas.width, canvas.height);
    base_level = canvas;
    profilerStop();
  }

  function uploadLevel(tasks, level, img) {
    function doUploadFull() {
      profilerStart('texImage2D');
      if (do_prealloc) {
        gl.texSubImage2D(tex.target, level, 0, 0,
          tex.format.internal_type, tex.format.gl_type, img);
      } else {
        gl.texImage2D(tex.target, level, tex.format.internal_type, tex.format.internal_type, tex.format.gl_type, img);
      }
      if (engine.webgl2) {
        gl.texParameteri(tex.target, gl.TEXTURE_BASE_LEVEL, level);
        tex.eff_handle = tex.handle; // if it was using the loading handle, we have at least some good level now
      }
      profilerStop();
    }
    if (do_sync) {
      doUploadFull();
    } else {
      let bpp = tex.format.count;
      let level_size = img.width * img.height * bpp;

      if (level_size <= ASYNC_TEXTURE_SIZE || !do_prealloc ||
        // a blob source, which on Chrome at least causes a full image decode for each chunk
        String(img.src).startsWith('blob') ||
        // Firefox just getting weird GL crashes below
        is_firefox ||
        // iOS Safari gets out of mem crash or something
        is_ios_safari ||
        !supports_cib
      ) {
        // this level is small enough, do all at once
        tasks.push(function (done) {
          doUploadFull();
          done();
          // if this didn't use up the whole quota, keep going
          return level_size < ASYNC_TEXTURE_SIZE * 0.5;
        });
      } else {
        // upload in chunks
        // note: this seems to cause issues on everything other than Chrome, and in some (blob)
        //   cases even causes problems on Chrome, maybe it's not worth it?
        let chunk_w = img.width;
        let chunk_h = (ceil(ASYNC_TEXTURE_SIZE / bpp / chunk_w) + 3) & ~3;
        for (let yy = 0; yy < img.height; yy += chunk_h) {
          let yyy = yy;
          tasks.push(function (done) {
            let eff_h = min(chunk_h, img.height - yyy);
            createImageBitmap(img, 0, yyy, chunk_w, eff_h,
              { premultiplyAlpha: 'none', colorSpaceConversion: 'none' },
              function (err, result) {
                if (err) {
                  throw err;
                }
                profilerStart('texSubImage2D');
                bindForced(tex);
                gl.texSubImage2D(tex.target, level, 0, yyy,
                  tex.format.internal_type, tex.format.gl_type, result);
                if (yyy + eff_h === img.height) {
                  if (engine.webgl2) {
                    gl.texParameteri(tex.target, gl.TEXTURE_BASE_LEVEL, level);
                    tex.eff_handle = tex.handle;
                  }
                }
                done();
                profilerStop();
              }
            );
            return false;
          });
        }
      }
    }
  }

  tex.allowMipmaps(!no_mipmaps); // provided or can be autogenerated
  runUploadTasks(tex, base_level, no_mipmaps, per_mipmap_data, leveloffs, uploadLevel, finish);
}

Texture.prototype.updateData = function updateData(w, h, data, per_mipmap_data, next) {
  const tex = this;
  profilerStart('Texture:updateData');
  assert(!this.destroyed);
  bindForced(this);
  this.last_use = frame_timestamp;
  this.src_width = w;
  this.src_height = h;
  this.width = w;
  this.height = h;

  function finish() {
    let err = null;
    profilerStart('getError (flush)');
    let gl_err = gl.getError();
    profilerStop();
    if (gl_err) {
      err = `GLError(${gl_err})`;
    }
    if (!err && tex.mipmaps && !per_mipmap_data && tex.mipmaps_allowed) {
      profilerStart('generateMipmap');
      gl.generateMipmap(tex.target);
      profilerStopStart('generateMipmap-getError (flush)');
      gl_err = gl.getError();
      profilerStop();
      if (gl_err) {
        err = `generateMipmap:GLError(${gl_err})`;
      }
    }
    if (!err) {
      tex.updateGPUMem();
      tex.eff_handle = tex.handle;
      tex.loaded = true;

      callEach(tex.on_load, tex.on_load = null, tex);
    }
    next(err);
  }

  function clearGLErr() {
    // clear the error flag(s) if there are any
    for (let ii = 0; ii < 10 && gl.getError(); ++ii) {
      // Error cleared with gl.getError()
    }
  }

  clearGLErr();

  // Resize NP2 if this is not being used for a texture array, and it is not explicitly allowed (non-mipmapped, clamped)
  let np2_source = (!isPowerOfTwo(w) || !isPowerOfTwo(h));
  let np2_pad = np2_source &&
    !this.is_array && !this.is_cube && !data.is_raw_data && !per_mipmap_data &&
    !(!this.mipmaps && this.wrap_s === gl.CLAMP_TO_EDGE && this.wrap_t === gl.CLAMP_TO_EDGE);
  if (np2_pad) {
    this.width = nextHighestPowerOfTwo(w);
    this.height = nextHighestPowerOfTwo(h);
    profilerStart('texImage2D(null)');
    gl.texImage2D(this.target, 0, this.format.internal_type, this.width, this.height, 0,
      this.format.internal_type, this.format.gl_type, null);
    profilerStop();
  }
  this.np2_on_gpu = np2_source && !np2_pad;
  if (data.is_raw_data) {
    assert(!np2_pad);
    assert(data.data instanceof Uint8Array);
    uploadTextureCompressed(this, data, per_mipmap_data, finish);
  } else if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    assert(!per_mipmap_data); // not implemented
    assert(data.length >= w * h * this.format.count);
    assert(!this.is_cube);
    if (this.is_array) {
      let num_images = h / w; // assume square
      profilerStart('texImage');
      gl.texImage3D(this.target, 0, this.format.internal_type, w, w,
        num_images, 0, this.format.internal_type, this.format.gl_type, data);
      profilerStop();
    } else if (np2_pad) {
      // Could do multiple upload thing like below, but smarter, but we really shouldn't be doing this for
      // in-process generated images!
      profilerStart('texSubImage2D');
      gl.texSubImage2D(this.target, 0, 0, 0, w, h, this.format.internal_type, this.format.gl_type, data);
      profilerStop();
    } else {
      profilerStart('texImage2D');
      gl.texImage2D(this.target, 0, this.format.internal_type, w, h, 0,
        this.format.internal_type, this.format.gl_type, data);
      profilerStop();
    }
    this.allowMipmaps(true); // can be auto-generated
    finish();
  } else {
    // Ensure this is an Image or Canvas
    if (!data.width) {
      profilerStop();
      return void next(`Missing width (${data.width}) ("${String(data).slice(0, 100)}")`);
    }
    if (this.is_cube) {
      assert(!per_mipmap_data); // not implemented
      assert.equal(w * 2, h * 3);
      let tex_size = h / 2;
      let canvas = document.createElement('canvas');
      canvas.width = tex_size;
      canvas.height = tex_size;
      let ctx = canvas.getContext('2d');
      for (let ii = 0; ii < cube_faces.length; ++ii) {
        let face = cube_faces[ii];
        profilerStart('drawImage');
        ctx.drawImage(data, face.pos[0] * tex_size, face.pos[1] * tex_size, tex_size, tex_size,
          0, 0, tex_size, tex_size);
        profilerStopStart('texImage2D');
        gl.texImage2D(gl[face.target], 0, this.format.internal_type, this.format.internal_type, this.format.gl_type,
          canvas);
        profilerStop();
      }
      this.allowMipmaps(true); // can be auto-generated
      finish();
    } else if (this.is_array && per_mipmap_data) {
      let tile_w = per_mipmap_data[0].width;
      assert(per_mipmap_data[0].height % tile_w === 0);
      let num_images = per_mipmap_data[0].height / tile_w;

      profilerStart('texImage3D');
      this.uploadPackedTexArrayWithMips(per_mipmap_data, tile_w, num_images, data);
      profilerStop();
      this.allowMipmaps(true); // provided
      finish();
    } else if (this.is_array) {
      assert(!per_mipmap_data); // handled above
      let num_images = h / w;
      profilerStart('texImage3D');
      gl.texImage3D(this.target, 0, this.format.internal_type, w, w,
        num_images, 0, this.format.internal_type, this.format.gl_type, data);
      profilerStop();

      if (gl.getError()) {
        // Fix for Samsung devices (Chris's and Galaxy S8 on CrossBrowserTesting)
        // Also fixes locally on Chrome when using a 8K source texture (was 896x57344),
        //  perhaps some auto-scaling is going on in the gl.texImage3D call if required?
        // Try drawing to canvas first
        let canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(data, 0, 0);
        gl.texImage3D(this.target, 0, this.format.internal_type, w, w,
          num_images, 0, this.format.internal_type, this.format.gl_type, canvas);
      }

      // if (engine.defines.MIP) {
      //   this.generateManualArrayMipmaps(data);
      //   did_mipmaps = true;
      // }

      this.allowMipmaps(true); // can be auto-generated
      finish();
    } else if (np2_pad) {
      assert(!per_mipmap_data); // not implemented
      // Pad up to power of two
      // Duplicate right and bottom pixel row by sending image 3 times
      if (w !== this.width) {
        profilerStart('texSubImage2D');
        gl.texSubImage2D(this.target, 0, 1, 0, this.format.internal_type, this.format.gl_type, data);
        profilerStop();
      }
      if (h !== this.height) {
        profilerStart('texSubImage2D');
        gl.texSubImage2D(this.target, 0, 0, 1, this.format.internal_type, this.format.gl_type, data);
        profilerStop();
      }
      profilerStart('texSubImage2D');
      gl.texSubImage2D(this.target, 0, 0, 0, this.format.internal_type, this.format.gl_type, data);
      profilerStop();
      this.allowMipmaps(true); // can be auto-generated
      finish();
    } else {
      uploadTextureImgOrCanvas(tex, data, per_mipmap_data, finish);
    }
  }

  profilerStop();
};

Texture.prototype.onLoad = function (cb) {
  if (this.loaded) {
    cb(this);
  } else {
    this.on_load.push(cb);
  }
};

let has_content_security_policy = localStorageGetJSON('has_csp', false);
document.addEventListener('securitypolicyviolation', function () {
  localStorageSetJSON('has_csp', true);
  has_content_security_policy = true;
});

let blob_supported;
function blobSupported() {
  if (blob_supported !== undefined) {
    return blob_supported;
  }
  if (typeof window.Blob === 'undefined') {
    blob_supported = false;
    return false;
  }
  try {
    let view = new Uint8Array(4);
    let url_object = URL.createObjectURL(new Blob([view], { type: 'image/png' }));
    URL.revokeObjectURL(url_object);
    blob_supported = true;
  } catch (e) {
    blob_supported = false;
  }
  return blob_supported;
}

function removeHash(url) {
  let idx = url.indexOf('#');
  if (idx === -1) {
    return url;
  }
  return url.slice(0, idx);
}

const TEX_RETRY_COUNT = 4;
Texture.prototype.loadURL = function loadURL(url, filter) {
  let tex = this;
  assert(!tex.destroyed);

  let tflags;
  let compressed_type;
  let load_gen = tex.load_gen = (tex.load_gen || 0) + 1;
  let load_start_wall_time;
  function tryLoad(next) {
    profilerStart('Texture:tryLoad');
    load_start_wall_time = Date.now();
    let url_use = url;
    let did_next = false;
    function done(err, img) {
      profilerStart('Texture:onload');
      if (!did_next) {
        did_next = true;
        if (url_use.endsWith('astc') && err) {
          // presumably in development, we don't have these built by default, try again without
          console.error(`Disabling ASTC support after failure loading: ${url_use}`);
          astc_supported = null;
        }
        tex.load_time_total = Date.now() - load_start_wall_time;
        if (texture_stream_delay) {
          setTimeout(function () {
            next(err, img, url_use);
          }, texture_stream_delay);
        } else {
          next(err, img, url_use);
        }
      }
      profilerStop();
    }

    tflags = 0;
    compressed_type = 0;

    if (url_use.includes(':')) {
      url_use = locateAsset(removeHash(url_use));
    } // note: above line may make the below clause _also_ true
    let is_external = url_use.includes(':');
    if (!is_external) {
      // Additional logic for non-external textures
      // Fetching tflags in each load attempt, they may have changed/been reloaded in development
      let ext_idx = url_use.lastIndexOf('.');
      assert(ext_idx !== -1);
      let filename_no_ext = url_use.slice(0, ext_idx);
      let png_name = `${filename_no_ext}.png`;
      let tflag_file = `${filename_no_ext}.tflag`;
      if (webFSExists(tflag_file)) {
        tflags = webFSGetFile(tflag_file, 'jsobj');
        assert.equal(typeof tflags, 'number');
        if (tflags & FORMAT_PACK) {
          url_use = `${filename_no_ext}.txp`;
        }
        if ((tflags & FORMAT_ASTC) && astc_supported) {
          compressed_type = FORMAT_ASTC;
          if (url_use.endsWith('.txp')) {
            url_use += '-astc';
          } else {
            url_use = `${filename_no_ext}.astc`;
          }
        } else if ((tflags & FORMAT_DXT) && dxt_supported) {
          compressed_type = FORMAT_DXT;
          if (url_use.endsWith('.txp')) {
            url_use += '-dxt';
          } else {
            url_use = `${filename_no_ext}.dxt`;
          }
        }
      }

      tex.actual_url = url_use;

      if (webFSExists(url_use) && blobSupported()) {
        assert(!(tflags & FORMAT_PACK)); // not supported/tested, but should be trivial?

        if (compressed_type) {
          assert(false, 'untested, maybe works');
          let view = webFSGetFile(png_name);
          assert(view instanceof Uint8Array);
          done(view.buffer);
          profilerStop();
          return;
        }

        let view = webFSGetFile(png_name);
        let url_object = URL.createObjectURL(new Blob([view], { type: 'image/png' }));
        let img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url_object);
          done(null, img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url_object);
          done('img decode error');
        };
        img.src = url_object;
        profilerStop();
        return;
      }

      url_use = locateAsset(removeHash(url_use));
      // When our browser's location has been changed from 'site.com/foo/' to
      //  'site.com/foo/bar/7' our relative image URLs are still relative to the
      //  base.  Maybe should set some meta tag to do this instead?
      url_use = `${urlhash.getURLBase()}${url_use}`;
    }

    if (tex.format.is_compressed && !compressed_type) {
      tex.format = TEXTURE_FORMAT.RGBA8;
    }

    if ((tflags & FORMAT_PACK) || compressed_type) {
      fetch({
        url: url_use,
        response_type: 'arraybuffer',
      }, done);
      profilerStop();
      return;
    }

    if (blobSupported() && supports_cib) {
      if (is_external && has_content_security_policy) {
        // Use `fetch` to get around content security policy
        fetch({
          url: url_use,
          response_type: 'arraybuffer',
        }, done);
        profilerStop();
        return;
      }

      // Also, generally, use fetch + createImageBitmap to avoid main-thread stalls decoding the PNG
      fetch({
        url: url_use,
        response_type: 'arraybuffer',
      }, done);
      profilerStop();
      return;
    }

    // Old browser (just IE?) fallback path
    let img = new Image();
    img.onload = function () {
      done(null, img);
    };
    img.onerror = function () {
      done('error', null);
    };
    img.crossOrigin = 'anonymous';
    img.src = url_use;
    profilerStop();
  }

  // next(err, img)
  function decodeCompressedImage(arraybuffer, offset, length, next) {
    assert(arraybuffer instanceof ArrayBuffer);
    let view = new DataView(arraybuffer, offset, length);
    let header = view.getUint32(0, true);
    if (header !== TEXPROC_COMPRESSED_HEADER) {
      return void next('invalid header');
    }
    let gl_internal_format = view.getUint32(4, true);
    let gl_base_internal_format = view.getUint32(8, true);
    let width = view.getUint32(12, true);
    let height = view.getUint32(16, true);
    next(null, {
      is_raw_data: true,
      gl_internal_format,
      gl_base_internal_format,
      width,
      height,
      data: new Uint8Array(arraybuffer).subarray(offset + 20, offset + length),
    });
  }

  function decodeTexturePack(arraybuffer, next) {
    assert(arraybuffer instanceof ArrayBuffer);
    let dv = new DataView(arraybuffer);
    let header_offs = 0;
    let header = dv.getUint32(header_offs, true);
    header_offs += 4;
    if (header !== TEXPACK_MAGIC) {
      return void next('TXP: Invalid header');
    }
    let num_images = dv.getUint32(header_offs, true);
    if (num_images > 32) {
      return void next('TXP: Data out of bounds');
    }
    header_offs += 4;
    let txp_flags = dv.getUint32(header_offs, true);
    header_offs += 4;

    let mipmaps = [];
    let tasks = [];
    function decodeLevelPNG(level, offset, length, next) {
      let img_out = new Image();
      if (blobSupported()) {
        let view = new Uint8Array(arraybuffer, offset, length);
        let url_object = URL.createObjectURL(new Blob([view], { type: 'image/png' }));
        img_out.onload = function () {
          URL.revokeObjectURL(url_object);
          mipmaps[level] = img_out;
          next();
        };
        img_out.onerror = function () {
          URL.revokeObjectURL(url_object);
          next('img load error');
        };
        img_out.src = url_object;
      } else {
        img_out.onload = function () {
          mipmaps[level] = img_out;
          next();
        };
        img_out.onerror = function () {
          next('img load error');
        };
        let src_str = ['data:image/png;base64,'];
        for (let ii = 0; ii < length;) {
          let sublen = Math.min(length - ii, 768);
          let view = new Uint8Array(arraybuffer, offset + ii, sublen);
          src_str.push(btoa(String.fromCharCode.apply(null, view)));
          ii += sublen;
        }
        img_out.src = src_str.join('');
      }
    }
    function decodeLevelCompressed(level, offset, length, next) {
      decodeCompressedImage(arraybuffer, offset, length, function (err, data) {
        mipmaps[level] = data;
        next(err);
      });
    }
    let data_offs = header_offs + num_images * 4;
    for (let level = 0; level < num_images; ++level) {
      let len = dv.getUint32(header_offs, true);
      header_offs += 4;
      if (txp_flags & FORMAT_PNG) {
        tasks.push(decodeLevelPNG.bind(null, level, data_offs, len));
      } else if (txp_flags & (FORMAT_DXT | FORMAT_ASTC)) {
        tasks.push(decodeLevelCompressed.bind(null, level, data_offs, len));
      } else {
        return void next(`TXP: Unknown format ${txp_flags}`);
      }
      data_offs += len;
    }
    if (data_offs !== arraybuffer.byteLength) {
      if (data_offs > arraybuffer.byteLength) {
        return void next(`TXP: Unexpected end of file (${data_offs} > ${arraybuffer.byteLength})`);
      } else {
        assert(false, `TXP: Unexpected end of file (${data_offs} != ${arraybuffer.byteLength})`);
      }
    }
    asyncSeries(tasks, function (err) {
      next(err, mipmaps[0], mipmaps);
    });
  }

  function decodeFetchedImage(arraybuffer, next) {
    assert(arraybuffer instanceof ArrayBuffer);
    let view = new Uint8Array(arraybuffer);
    let blob = new Blob([view], { type: 'image/png' });
    if (supports_cib) { // this method doesn't stall the main thread as much
      createImageBitmap(blob,
        { premultiplyAlpha: 'none', colorSpaceConversion: 'none' },
        function (err, result) {
          if (err) {
            return void next(err);
          }
          next(null, result);
        }
      );

      return;
    }
    let img_out = new Image();
    let url_object = URL.createObjectURL(blob);
    img_out.onload = function () {
      URL.revokeObjectURL(url_object);
      if (texture_stream_delay) {
        setTimeout(function () {
          next(null, img_out);
        }, texture_stream_delay);
      } else {
        next(null, img_out);
      }
    };
    img_out.onerror = function () {
      URL.revokeObjectURL(url_object);
      next('img load error');
    };
    img_out.src = url_object;
  }

  // next(err, img, mipmaps)
  function prepImage(err, img, next) {
    if (err || !img) {
      return void next(err || 'error', img);
    }
    if (tflags & FORMAT_PACK) {
      return void decodeTexturePack(img, next);
    }
    if (compressed_type) {
      return void decodeCompressedImage(img, 0, img.byteLength, next);
    }
    let unpack_mips = tex.is_array && tex.packed_mips;
    if (img instanceof ArrayBuffer) {
      assert(!unpack_mips);
      return void decodeFetchedImage(img, next);
    }
    if (filter) {
      img = filter(tex, img);
    }
    if (!unpack_mips) {
      return void next(null, img);
    }

    let mipmaps = [];
    let tasks = [];
    let w = img.width;
    let h = img.height;
    let tile_w = w * 2 / 3;
    assert.equal(floor(tile_w), tile_w);
    let num_images = h / tile_w;

    if (engine.defines.ARRAYNOMIP) {
      img.width = tile_w;
      img.height = num_images * tile_w;
      return void next(null, img);
    }

    function getLevel(level, x, y, wh, next) {
      createImageBitmap(img, x, y, wh, wh * num_images,
        { premultiplyAlpha: 'none', colorSpaceConversion: 'none' },
        function (err, result) {
          if (err) {
            return void next(err);
          }
          mipmaps[level] = result;
          next();
        }
      );
    }

    let level = 0;
    let last_w = tile_w;
    let next_y = 0;
    let next_x = 0;
    while (last_w >= 1) {
      tasks.push(getLevel.bind(null, level, next_x, next_y, last_w));
      if (next_x) {
        next_y += last_w * num_images;
      } else {
        next_x = last_w;
      }
      last_w = floor(last_w/2);
      ++level;
    }

    asyncParallel(tasks, function (err) {
      next(err, img, mipmaps);
    });
  }

  ++load_count;
  let retries = 0;
  function handleLoad(err, img, url_use_debug) {
    if (tex.load_gen !== load_gen || tex.destroyed) {
      // someone else requested this texture to be loaded!  Or, it was already unloaded
      --load_count;
      return;
    }
    prepImage(err, img, function (err_prep, img_new, mipmaps) {
      if (tex.load_gen !== load_gen || tex.destroyed) {
        // someone else requested this texture to be loaded!  Or, it was already unloaded
        --load_count;
        return;
      }

      function onError(err_details) {
        let err_url = url_use_debug && url_use_debug.length > 200 ? `${url_use_debug.slice(0, 200)}...` : url_use_debug;
        let err = `Error loading texture "${err_url}": ${err_details}`;
        retries++;
        if (retries > TEX_RETRY_COUNT) {
          --load_count;
          tex.eff_handle = handle_error;
          tex.load_fail = true;
          console.error(`${err}: ${err_details}, retries failed`);
          if (tex.soft_error) {
            tex.err = 'Load failed';
          } else {
            shadersSetGLErrorReportDetails();
            assert(false, err);
          }
          return;
        }
        console.error(`${err}: ${err_details}, retrying... `);
        setTimeout(tryLoad.bind(null, handleLoad), 100 * retries * retries);
      }

      img = img_new;
      let err_details = '';
      if (err_prep) {
        return void onError(err_prep);
      }
      if (!img) {
        return void onError('no img');
      }
      let upload_start_wall_time = Date.now();
      tex.updateData(img.width, img.height, img, mipmaps, function (err) {
        tex.load_time_upload = Date.now() - upload_start_wall_time;
        if (err) {
          err_details = String(err);
          // Samsung TV gets 1282 on texture arrays
          // Samsung Galaxy S6 gets 1281 on texture arrays
          // Note: Any failed image load (partial read of a bad png, etc) also results in 1281!
          if (tex.is_array && (err === 'GLError(1282)' || err === 'GLError(1281)') &&
            engine.webgl2 && !engine.DEBUG
          ) {
            localStorageSetJSON('webgl2_disable', {
              ua: navigator.userAgent,
              ts: Date.now(),
            });
            console.error(`Error loading array texture "${url_use_debug}": ` +
              `${err_details}, reloading without WebGL2..`);
            engine.reloadSafe();
            return;
          }
          if (!tex.for_reload) {
            retries = TEX_RETRY_COUNT; // do not retry this
          }
          onError(err_details);
        } else {
          --load_count;
        }
      });
    });
  }
  tryLoad(handleLoad);
};

Texture.prototype.allocFBO = function (w, h) {
  const fbo_format = settings.fbo_rgba ? gl.RGBA : gl.RGB;
  bindForced(this);
  gl.texImage2D(this.target, 0, fbo_format, w, h, 0, fbo_format, gl.UNSIGNED_BYTE, null);

  this.fbo = gl.createFramebuffer();
  assert(this.fbo); // If this is firing, it's probably due to context loss
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.handle, 0);

  this.last_use = frame_timestamp;
  this.src_width = this.width = w;
  this.src_height = this.height = h;
  this.updateGPUMem();
};

Texture.prototype.allocDepth = function (w, h) {
  bindForced(this);
  gl.texImage2D(gl.TEXTURE_2D, 0, this.format.internal_type,
    w, h, 0, this.format.format, this.format.gl_type, null);

  this.last_use = frame_timestamp;
  this.src_width = this.width = w;
  this.src_height = this.height = h;
  this.updateGPUMem();
};

Texture.prototype.captureStart = function (w, h) {
  assert(!this.capture);
  this.capture = { w, h };
  if (this.fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
  } else {
    assert(w); // will assert in captureEnd:copyTexImage
    assert(h);
  }
};

Texture.prototype.captureEnd = function (filter_linear, wrap) {
  assert(this.capture);
  let capture = this.capture;
  this.capture = null;
  if (this.fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } else {
    this.copyTexImage(0, 0, capture.w, capture.h);
  }
  let filter = filter_linear ? gl.LINEAR : gl.NEAREST;
  this.setSamplerState({
    filter_min: filter,
    filter_mag: filter,
    wrap_s: wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE,
    wrap_t: wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE,
  });
};

Texture.prototype.copyTexImage = function (x, y, w, h) {
  assert(!this.destroyed);
  assert(w && h);
  bindHandle(0, this.target, this.handle);
  gl.copyTexImage2D(this.target, 0, gl.RGB, x, y, w, h, 0);
  this.last_use = frame_timestamp;
  this.src_width = this.width = w;
  this.src_height = this.height = h;
  this.updateGPUMem();
};

Texture.prototype.destroy = function () {
  if (this.destroyed) {
    return;
  }
  profilerStart('Texture:destroy');
  assert(this.name);
  let auto_unload = this.auto_unload;
  if (auto_unload) {
    this.auto_unload = null;
    let idx = auto_unload_textures.indexOf(this);
    assert(idx !== -1);
    ridx(auto_unload_textures, idx);
  }
  delete textures[this.name];
  unbindAll(this.target);
  gl.deleteTexture(this.handle);
  if (this.fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(this.fbo);
  }
  this.width = this.height = 0;
  this.updateGPUMem();
  this.destroyed = true;
  if (auto_unload) {
    for (let ii = 0; ii < auto_unload.length; ++ii) {
      auto_unload[ii]();
    }
  }
  profilerStop('Texture:destroy');
};

function create(params) {
  assert(params.name);
  let texture = new Texture(params);
  textures[params.name] = texture;
  return texture;
}

let last_temporary_id = 0;
export function textureCreateForCapture(unique_name, auto_unload) {
  let name = unique_name || `screen_temporary_tex_${++last_temporary_id}`;
  assert(!textures[name]);
  let texture = create({
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
    wrap_s: gl.CLAMP_TO_EDGE,
    wrap_t: gl.CLAMP_TO_EDGE,
    format: TEXTURE_FORMAT.RGB8,
    name,
    auto_unload,
  });
  texture.loaded = true;
  texture.eff_handle = texture.handle;
  return texture;
}

export function textureCreateForDepthCapture(unique_name, tex_format) {
  let name = unique_name || `screen_temporary_tex_${++last_temporary_id}`;
  assert(!textures[name]);
  let texture = create({
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
    wrap_s: gl.CLAMP_TO_EDGE,
    wrap_t: gl.CLAMP_TO_EDGE,
    format: tex_format,
    name,
  });
  texture.loaded = true;
  texture.eff_handle = texture.handle;
  return texture;
}

export function textureLoad(params) {
  let key = params.name = params.name || params.url;
  assert(key);
  let tex = textures[key];
  if (!tex) {
    tex = create(params);
  } else {
    if (typeof params.auto_unload === 'function') {
      assert(tex.auto_unload);
      tex.auto_unload.push(params.auto_unload);
    }
  }
  tex.last_use = frame_timestamp;
  return tex;
}

export function textureFindForReplacement(search_key) {
  search_key = textureCname(search_key);
  for (let key in textures) {
    let tex = textures[key];
    if (tex.cname === search_key) {
      return textures[key];
    }
  }
  return null;
}

let tick_next_tex = 0;
export function textureTick() {
  frame_timestamp = engine.frame_timestamp;
  let len = auto_unload_textures.length;
  if (!len) {
    return;
  }
  if (tick_next_tex >= len) {
    tick_next_tex = 0;
  }
  let tex = auto_unload_textures[tick_next_tex];
  if (tex.last_use < frame_timestamp - TEX_UNLOAD_TIME) {
    console.log(`Unloading texture ${tex.name}`);
    tex.destroy();
  } else {
    ++tick_next_tex;
  }
}

export function textureUnloadDynamic() {
  while (auto_unload_textures.length) {
    auto_unload_textures[0].destroy();
  }
}

function textureReloadEarly(filename) {
  assert(filename.startsWith('.early/'));
  let orig_name = filename.slice('.early/'.length);
  let ret = false;
  let cname = textureCname(orig_name);
  for (let key in textures) {
    let tex = textures[key];
    if (tex.cname === cname && tex.url) {
      tex.for_reload = true;
      if (tex.format.is_compressed) {
        buildUIActiveReload('texcomp', 'Compressing textures...');
        tex.format = TEXTURE_FORMAT.RGBA8;
        // real, compressed texture should get reloaded later
      }
      tex.had_early_reload = true;
      tex.loadURL(`${filename}?rl=${Date.now()}`, tex.load_filter);
      ret = true;
    }
  }
  return ret;
}

function textureReload(filename) {
  if (filename.startsWith('.early')) {
    return textureReloadEarly(filename);
  }
  let ret = false;
  let cname = textureCname(filename);
  for (let key in textures) {
    let tex = textures[key];
    if (tex.cname === cname && tex.url) {
      if (tex.had_early_reload && filename.endsWith('.png')) {
        // we, presumably, just reloaded this in the early pass already
        continue;
      }
      tex.for_reload = true;
      tex.loadURL(`${removeHash(tex.url)}?rl=${Date.now()}`, tex.load_filter);
      ret = true;
    }
  }
  return ret;
}

let depth_supported;
export function textureSupportsDepth() {
  return depth_supported;
}

let texcomp_support;
export function textureCompressionSupported() {
  return texcomp_support;
}

export function textureStartup() {

  default_filter_min = gl.LINEAR_MIPMAP_LINEAR;
  default_filter_mag = gl.LINEAR;

  TEXTURE_FORMAT.R8.internal_type = gl.LUMINANCE;
  TEXTURE_FORMAT.R8.gl_type = gl.UNSIGNED_BYTE;
  TEXTURE_FORMAT.RGB8.internal_type = gl.RGB;
  TEXTURE_FORMAT.RGB8.gl_type = gl.UNSIGNED_BYTE;
  TEXTURE_FORMAT.RGBA8.internal_type = gl.RGBA;
  TEXTURE_FORMAT.RGBA8.gl_type = gl.UNSIGNED_BYTE;

  let UNSIGNED_INT_24_8;
  if (engine.webgl2) {
    depth_supported = true;
    UNSIGNED_INT_24_8 = gl.UNSIGNED_INT_24_8;
  } else {
    let ext = gl.getExtension('WEBGL_depth_texture');
    if (ext) {
      UNSIGNED_INT_24_8 = ext.UNSIGNED_INT_24_8_WEBGL;
      depth_supported = true;
    }
  }
  if (depth_supported) {
    TEXTURE_FORMAT.DEPTH16.internal_type = engine.webgl2 ? gl.DEPTH_COMPONENT16 : gl.DEPTH_COMPONENT;
    TEXTURE_FORMAT.DEPTH16.format = gl.DEPTH_COMPONENT;
    TEXTURE_FORMAT.DEPTH16.gl_type = gl.UNSIGNED_SHORT;
    TEXTURE_FORMAT.DEPTH24.internal_type = engine.webgl2 ? gl.DEPTH24_STENCIL8 : gl.DEPTH_STENCIL;
    TEXTURE_FORMAT.DEPTH24.format = gl.DEPTH_STENCIL;
    TEXTURE_FORMAT.DEPTH24.gl_type = UNSIGNED_INT_24_8;
  }

  let ext_anisotropic = (
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
  );
  if (ext_anisotropic) {
    aniso_enum = ext_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT;
    aniso = max_aniso = gl.getParameter(ext_anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  }

  max_texture_size = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  texcomp_support = [];
  let ext_astc = gl.getExtension('WEBGL_compressed_texture_astc') ||
    gl.getExtension('MOZ_WEBGL_compressed_texture_astc') ||
    gl.getExtension('WEBKIT_WEBGL_compressed_texture_astc');
  if (ext_astc) {
    console.log('Supported ASTC profiles:', ext_astc.getSupportedProfiles());
    texcomp_support.push('ASTC');
    astc_supported = true;
  } else {
    console.log('ASTC not supported');
  }
  let ext_s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc') ||
    gl.getExtension('MOZ_WEBGL_compressed_texture_s3tc') ||
    gl.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc');
  if (ext_s3tc) {
    let keys = [];
    for (let key in ext_s3tc) {
      let m = key.match(/^COMPRESSED_(.*)_EXT$/);
      if (m) {
        keys.push(m[1]);
      }
    }
    console.log(`DXT supported: ${keys.join()}`);
    texcomp_support = texcomp_support.concat(keys);
    dxt_supported = true;
  } else {
    console.log('DXT not supported');
  }

  handle_error = textureLoad({
    name: 'error',
    width: 2, height: 2,
    nozoom: true,
    format: TEXTURE_FORMAT.RGBA8,
    filter_mag: gl.NEAREST,
    data: new Uint8Array([
      255, 20, 147, 255,
      255, 0, 0, 255,
      255, 255, 255, 255,
      255, 20, 147, 255
    ]),
  }).handle;

  handle_loading = textureLoad({
    name: 'loading',
    width: 2, height: 2,
    nozoom: true,
    format: TEXTURE_FORMAT.RGBA8,
    data: new Uint8Array([
      127, 127, 127, 255,
      0, 0, 0, 255,
      64, 64, 64, 255,
      127, 127, 127, 255,
    ]),
  }).handle;

  textureLoad({
    name: 'white',
    width: 2, height: 2,
    nozoom: true,
    format: TEXTURE_FORMAT.RGBA8,
    data: new Uint8Array([
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
    ]),
  });

  textureLoad({
    name: 'invisible',
    width: 2, height: 2,
    nozoom: true,
    format: TEXTURE_FORMAT.RGBA8,
    data: new Uint8Array([
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]),
  });

  filewatchOn('.png', textureReload);
  filewatchOn('.jpg', textureReload);
  filewatchOn('.dxt', textureReload);
  filewatchOn('.astc', textureReload);
  filewatchOn('.txp', textureReload);
  filewatchOn('.txp-dxt', textureReload);
  filewatchOn('.txp-astc', textureReload);
}

// Legacy API
exports.format = TEXTURE_FORMAT;
exports.defaultFilters = textureDefaultFilters;
exports.texturesUnloadDynamic = textureUnloadDynamic;
exports.bind = textureBind;
exports.bindArray = textureBindArray;
exports.load = textureLoad;
exports.cmpTextureArray = textureCmpArray;
exports.isArrayBound = textureIsArrayBound;
exports.createForCapture = textureCreateForCapture;
exports.createForDepthCapture = textureCreateForDepthCapture;
exports.cname = textureCname;
exports.findTexForReplacement = textureFindForReplacement;
exports.textures = textures;

window.glov_textures = exports;
