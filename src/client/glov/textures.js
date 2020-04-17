// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
/* eslint-env browser */

const assert = require('assert');
const engine = require('./engine.js');
const local_storage = require('./local_storage.js');

export let textures = {};
export let load_count = 0;
let aniso = 4;
let max_aniso = 0;
let aniso_enum;

let default_filter_min;
let default_filter_mag;

export const format = {
  R8: { count: 1 },
  RGB8: { count: 3 },
  RGBA8: { count: 4 },
};

export function defaultFilters(min, mag) {
  default_filter_min = min;
  default_filter_mag = mag;
}

const { isPowerOfTwo, nextHighestPowerOfTwo } = require('../../common/util.js');

let bound_unit = null;
let bound_tex = [];

let handle_loading;
let handle_error;

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

function unbindHandle(target, handle) {
  for (let unit = 0; unit < bound_tex.length; ++unit) {
    if (bound_tex[unit] === handle) {
      setUnit(unit);
      gl.bindTexture(target, null);
      bound_tex[unit] = null;
    }
  }
}

export function bind(unit, tex) {
  // May or may not change the unit
  bindHandle(unit, tex.target, tex.eff_handle);
}

// hot path inlined for perf
export function bindArray(texs) {
  for (let ii = 0; ii < texs.length; ++ii) {
    let tex = texs[ii];
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

export function isArrayBound(texs) {
  for (let ii = 0; ii < texs.length; ++ii) {
    let tex = texs[ii];
    let handle = tex.eff_handle;
    if (bound_tex[ii] !== handle) {
      return false;
    }
  }
  return true;
}

function Texture(params) {
  this.name = params.name;
  this.loaded = false;
  this.load_fail = false;
  this.target = params.target || gl.TEXTURE_2D;
  this.is_array = this.target === gl.TEXTURE_2D_ARRAY;
  this.handle = gl.createTexture();
  this.eff_handle = handle_loading;
  this.setSamplerState(params);
  this.src_width = this.src_height = 1;
  this.width = this.height = 1;
  this.nozoom = params.nozoom || false;
  this.on_load = [];
  this.gpu_mem = 0;

  this.format = params.format || format.RGBA8;

  if (params.data) {
    let err = this.updateData(params.width, params.height, params.data);
    assert(!err, err);
  } else if (params.url) {
    this.loadURL(params.url);
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
};

Texture.prototype.setSamplerState = function (params) {
  let target = this.target;
  setUnit(0);
  bound_tex[0] = null; // Force a re-bind, no matter what
  bindHandle(0, target, this.handle);

  this.filter_min = params.filter_min || default_filter_min;
  this.filter_mag = params.filter_mag || default_filter_mag;
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, this.filter_min);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, this.filter_mag);
  this.wrap_s = params.wrap_s || gl.REPEAT;
  this.wrap_t = params.wrap_t || gl.REPEAT;
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, this.wrap_s);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, this.wrap_t);

  this.mipmaps = this.filter_min >= 0x2700 && this.filter_min <= 0x2703; // Probably gl.LINEAR_MIPMAP_LINEAR

  if (max_aniso) {
    if (this.mipmaps && params.filter_mag !== gl.NEAREST) {
      gl.texParameterf(gl.TEXTURE_2D, aniso_enum, aniso);
    } else {
      gl.texParameterf(gl.TEXTURE_2D, aniso_enum, 1);
    }
  }
};

Texture.prototype.updateData = function updateData(w, h, data) {
  setUnit(0);
  bound_tex[0] = null; // Force a re-bind, no matter what
  bindHandle(0, this.target, this.handle);
  this.src_width = w;
  this.src_height = h;
  this.width = w;
  this.height = h;
  gl.getError(); // clear the error flag if there is one
  // Resize NP2 if this is not being used for a texture array, and it is not explicitly allowed (non-mipmapped, wrapped)
  let np2 = (!isPowerOfTwo(w) || !isPowerOfTwo(h)) && !this.is_array &&
    !(!this.mipmaps && this.wrap_s === gl.CLAMP_TO_EDGE && this.wrap_t === gl.CLAMP_TO_EDGE);
  if (np2) {
    this.width = nextHighestPowerOfTwo(w);
    this.height = nextHighestPowerOfTwo(h);
    gl.texImage2D(this.target, 0, this.format.internal_type, this.width, this.height, 0,
      this.format.internal_type, this.format.gl_type, null);
  }
  if (data instanceof Uint8Array) {
    assert(data.length >= w * h * this.format.count);
    if (this.is_array) {
      let num_images = h / w; // assume square
      gl.texImage3D(this.target, 0, this.format.internal_type, w, w,
        num_images, 0, this.format.internal_type, this.format.gl_type, data);
    } else if (np2) {
      // Could do multiple upload thing like below, but smarter, but we really shouldn't be doing this for
      // in-process generated images!
      gl.texSubImage2D(this.target, 0, 0, 0, w, h, this.format.internal_type, this.format.gl_type, data);
    } else {
      gl.texImage2D(this.target, 0, this.format.internal_type, w, h, 0,
        this.format.internal_type, this.format.gl_type, data);
    }
  } else {
    assert(data.width); // instanceof Image fails with ublock AdBlocker; also, this is either an Image or Canvas
    if (this.is_array) {
      let num_images = h / w;
      gl.texImage3D(this.target, 0, this.format.internal_type, w, w,
        num_images, 0, this.format.internal_type, this.format.gl_type, data);

      if (gl.getError()) {
        // Fix for Samsung devices (Chris's and Galaxy S8 on CrossBrowserTesting)
        // Try drawing to canvas first
        let canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(data, 0, 0);
        gl.texImage3D(this.target, 0, this.format.internal_type, w, w,
          num_images, 0, this.format.internal_type, this.format.gl_type, canvas);
      }

    } else if (np2) {
      // Pad up to power of two
      // Duplicate right and bottom pixel row by sending image 3 times
      if (w !== this.width) {
        gl.texSubImage2D(this.target, 0, 1, 0, this.format.internal_type, this.format.gl_type, data);
      }
      if (h !== this.height) {
        gl.texSubImage2D(this.target, 0, 0, 1, this.format.internal_type, this.format.gl_type, data);
      }
      gl.texSubImage2D(this.target, 0, 0, 0, this.format.internal_type, this.format.gl_type, data);
    } else {
      gl.texImage2D(this.target, 0, this.format.internal_type, this.format.internal_type, this.format.gl_type, data);
    }
  }
  let gl_err = gl.getError();
  if (gl_err) {
    return gl_err;
  }
  if (this.mipmaps) {
    gl.generateMipmap(this.target);
    assert(!gl.getError());
  }
  this.updateGPUMem();
  this.eff_handle = this.handle;
  this.loaded = true;

  let arr = this.on_load;
  this.on_load = [];
  for (let ii = 0; ii < arr.length; ++ii) {
    arr[ii](this);
  }

  return 0;
};

Texture.prototype.onLoad = function (cb) {
  if (this.loaded) {
    cb(this); // eslint-disable-line callback-return
  } else {
    this.on_load.push(cb);
  }
};

const TEX_RETRY_COUNT = 4;
Texture.prototype.loadURL = function loadURL(url, filter) {
  let tex = this;

  function tryLoad(next) {
    let did_next = false;
    function done(img) {
      if (!did_next) {
        did_next = true;
        return void next(img);
      }
    }

    let img = new Image();
    img.onload = function () {
      done(img);
    };
    function fail() {
      done(null);
    }
    img.onerror = fail;
    /* Turbulenz was doing it this way - some advantage?
    if (typeof URL !== "undefined" && URL.createObjectURL) {
      let xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let xhrStatus = xhr.status;
          // Sometimes the browser sets status to 200 OK when the connection is closed
          // before the message is sent (weird!).
          // In order to address this we fail any completely empty responses.
          // Hopefully, nobody will get a valid response with no headers and no body!
          if (xhr.getAllResponseHeaders() === "" && !xhr.response) {
            fail();
          } else {
            if (xhrStatus === 200 || xhrStatus === 0) {
              var blob = xhr.response;
              img.onload = function blobImageLoadedFn() {
                imageLoaded();
                URL.revokeObjectURL(img.src);
                blob = null;
              };
              img.src = URL.createObjectURL(blob);
            } else {
              fail();
            }
          }
          xhr.onreadystatechange = null;
        }
      };
      xhr.open('GET', src, true);
      xhr.responseType = 'blob';
      xhr.send();
    } else { */
    img.crossOrigin = 'anonymous';
    img.src = url;
  }

  ++load_count;
  let retries = 0;
  function handleLoad(img) {
    let err_details = '';
    if (img) {
      tex.format = format.RGBA8;
      if (filter) {
        img = filter(tex, img);
      }
      let err = tex.updateData(img.width, img.height, img);
      if (err) {
        err_details = `: GLError(${err})`;
        // Samsung TV gets 1282 on texture arrays
        // Samsung Galaxy S6 gets 1281 on texture arrays
        if (tex.is_array && (String(err) === '1282' || String(err) === '1281') && engine.webgl2 && !engine.DEBUG) {
          local_storage.setJSON('webgl2_disable', {
            ua: navigator.userAgent,
            ts: Date.now(),
          });
          console.error(`Error loading array texture "${url}"${err_details}, reloading without WebGL2..`);
          document.location.reload();
          return;
        }
        retries = TEX_RETRY_COUNT; // do not retry this
      } else {
        --load_count;
        return;
      }
    }
    let err = `Error loading texture "${url}"${err_details}`;
    retries++;
    if (retries > TEX_RETRY_COUNT) {
      --load_count;
      tex.eff_handle = handle_error;
      tex.load_fail = true;
      console.error(`${err}${err_details ? '' : ', retries failed'}`);
      assert(false, err);
      return;
    }
    console.error(`${err}, retrying... `);
    setTimeout(tryLoad.bind(null, handleLoad), 100 * retries * retries);
  }
  tryLoad(handleLoad);
};

Texture.prototype.copyTexImage = function (x, y, w, h) {
  assert(w && h);
  bindHandle(0, this.target, this.handle);
  gl.copyTexImage2D(this.target, 0, gl.RGB, x, y, w, h, 0);
  this.src_width = this.width = w;
  this.src_height = this.height = h;
  this.updateGPUMem();
};

Texture.prototype.destroy = function () {
  assert(this.name);
  delete textures[this.name];
  unbindHandle(this.target, this.handle);
  gl.deleteTexture(this.handle);
  this.width = this.height = 0;
  this.updateGPUMem();
};

function create(params) {
  assert(params.name);
  let texture = new Texture(params);
  textures[params.name] = texture;
  return texture;
}

let last_temporary_id = 0;
export function createForCapture(unique_name) {
  let name = unique_name || `screen_temporary_tex_${++last_temporary_id}`;
  assert(!textures[name]);
  let texture = create({
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
    wrap_s: gl.CLAMP_TO_EDGE,
    wrap_t: gl.CLAMP_TO_EDGE,
    format: format.RGB8,
    name,
  });
  texture.loaded = true;
  texture.eff_handle = texture.handle;
  return texture;
}

export function load(params) {
  let key = params.name = params.name || params.url;
  assert(key);
  if (textures[key]) {
    return textures[key];
  }
  return create(params);
}

export function cname(key) {
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
export function findTexForReplacement(search_key) {
  search_key = cname(search_key);
  for (let key in textures) {
    let compare_key = cname(key);
    if (compare_key === search_key) {
      return textures[key];
    }
  }
  return null;
}

export function startup() {

  default_filter_min = gl.LINEAR_MIPMAP_LINEAR;
  default_filter_mag = gl.LINEAR;

  format.R8.internal_type = gl.LUMINANCE;
  format.R8.gl_type = gl.UNSIGNED_BYTE;
  format.RGB8.internal_type = gl.RGB;
  format.RGB8.gl_type = gl.UNSIGNED_BYTE;
  format.RGBA8.internal_type = gl.RGBA;
  format.RGBA8.gl_type = gl.UNSIGNED_BYTE;

  let ext_anisotropic = (
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
  );
  if (ext_anisotropic) {
    aniso_enum = ext_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT;
    aniso = max_aniso = gl.getParameter(ext_anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  }

  handle_error = load({
    name: 'error',
    width: 2, height: 2,
    nozoom: true,
    format: format.RGBA8,
    filter_mag: gl.NEAREST,
    data: new Uint8Array([
      255, 20, 147, 255,
      255, 0, 0, 255,
      255, 255, 255, 255,
      255, 20, 147, 255
    ]),
  }).handle;

  handle_loading = load({
    name: 'loading',
    width: 2, height: 2,
    nozoom: true,
    format: format.RGBA8,
    data: new Uint8Array([
      127, 127, 127, 255,
      0, 0, 0, 255,
      64, 64, 64, 255,
      127, 127, 127, 255,
    ]),
  }).handle;

  load({
    name: 'white',
    width: 2, height: 2,
    nozoom: true,
    format: format.RGBA8,
    data: new Uint8Array([
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
    ]),
  });

  load({
    name: 'invisible',
    width: 2, height: 2,
    nozoom: true,
    format: format.RGBA8,
    data: new Uint8Array([
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]),
  });
}
