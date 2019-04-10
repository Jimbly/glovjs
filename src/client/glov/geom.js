// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const { ceil, max } = Math;

export const QUADS = 7;

const gl_byte_size = {
  0x1400: 1, // GL_BYTE
  0x1401: 1, // GL_UNSIGNED_BYTE
  0x1402: 2, // GL_SHORT
  0x1403: 2, // GL_UNSIGNED_SHORT
  0x1406: 4, // GL_FLOAT
};

let unit_buf;
let unit_buf_len = 0;

let quad_index_buf;
let quad_index_buf_len = 0;

function bindUnitBuf(arr_idx, len) {
  if (len > unit_buf_len) {
    if (unit_buf) {
      gl.deleteBuffer(unit_buf);
    }
    unit_buf = gl.createBuffer();
    unit_buf_len = max(ceil(unit_buf_len * 1.5), len);
    gl.bindBuffer(gl.ARRAY_BUFFER, unit_buf);
    let arr = new Uint8Array(unit_buf_len * 4);
    for (let ii = 0; ii < unit_buf_len * 4; ++ii) {
      arr[ii] = 255;
    }
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, unit_buf);
  }
  gl.vertexAttribPointer(arr_idx, 4, gl.UNSIGNED_BYTE, true, 0, 0);
  gl.enableVertexAttribArray(arr_idx);
}

// Verts should be ordered counter-clockwise from the upper left
function getQuadIndexBuf(quad_count) {
  assert(quad_count <= 16384);
  // If not, need to split into multiple vertex and index buffers (fairly easy),
  //   or use the OES_element_index_uint extension (trivial, but probably slower, maybe not supported on mobile?)
  if (quad_count * 6 > quad_index_buf_len) {
    if (!quad_index_buf) {
      quad_index_buf = gl.createBuffer();
    }
    quad_index_buf_len = max(ceil(quad_index_buf_len * 1.5), quad_count * 6);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad_index_buf);
    let arr = new Uint16Array(quad_index_buf_len);
    let vidx = 0;
    for (let ii = 0; ii < quad_index_buf_len;) {
      arr[ii++] = vidx + 1;
      arr[ii++] = vidx + 3;
      arr[ii++] = vidx++; // 0
      arr[ii++] = vidx++; // 1
      arr[ii++] = vidx++; // 2
      arr[ii++] = vidx++; // 3
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  }
  return quad_index_buf;
}


// _format is [shader.semantic.foo, gl.FLOAT/UNSIGNED_BYTE/etc, count, normalized]
function Geom(_format, verts, idxs, mode) {
  this.mode = mode || gl.TRIANGLES;
  this.format = _format;
  this.stride = 0;
  this.elem_count = 0;
  for (let ii = 0; ii < _format.length; ++ii) {
    let fmt = _format[ii];
    let gltype = fmt[1];
    let count = fmt[2];
    let byte_size = gl_byte_size[gltype];
    assert(byte_size);
    fmt[3] = fmt[3] || false;
    fmt[4] = byte_size;
    this.stride += count * byte_size;
    this.elem_count += count;
  }
  this.vert_count = verts.length / this.elem_count;
  if (verts.length) {
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  }
  this.orig_mode = mode;
  if (idxs) {
    this.ibo = gl.createBuffer();
    this.ibo_owned = true;
    this.ibo_size = idxs.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxs, gl.STATIC_DRAW);
  } else if (mode === QUADS) {
    assert(this.vert_count % 4 === 0);
    let quad_count = this.vert_count / 4;
    // PERFTODO: Use GL_QUADS_OES extension
    this.ibo = getQuadIndexBuf(quad_count);
    this.ibo_owned = false;
    this.ibo_size = quad_count * 6;
    this.mode = gl.TRIANGLES;
  } else {
    this.ibo = null;
    this.ibo_owned = false;
  }
}

Geom.prototype.update = function (verts, num_verts) {
  assert(this.orig_mode === QUADS);
  if (num_verts > this.vert_count) {
    if (this.vbo) {
      gl.deleteBuffer(this.vbo);
    }
    // Note: matching size, ignoring num_verts
    this.vert_count = verts.length / this.elem_count;
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
  } else {
    // Fits
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, num_verts * this.elem_count));
  }
  let quad_count = num_verts / 4;
  this.ibo = getQuadIndexBuf(quad_count);
  this.ibo_size = quad_count * 6;
};

Geom.prototype.dispose = function () {
  if (this.ibo_owned) {
    gl.deleteBuffer(this.ibo);
  }
  this.ibo = null;
  if (this.vbo) {
    gl.deleteBuffer(this.vbo);
  }
  this.vbo = null;
};

Geom.prototype.draw = function () {
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

  let offset = 0;
  let used = [];
  for (let ii = 0; ii < this.format.length; ++ii) {
    let fmt = this.format[ii];
    let sem = fmt[0];
    let gltype = fmt[1];
    let count = fmt[2];
    let normalized = fmt[3];
    let byte_size = fmt[4];
    gl.vertexAttribPointer(sem, count, gltype, normalized, this.stride, offset);
    gl.enableVertexAttribArray(sem);
    used[sem] = true;
    offset += count * byte_size;
  }
  if (!used[1]) { // COLOR
    bindUnitBuf(1, this.vert_count);
  }

  if (this.ibo) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.drawElements(this.mode, this.ibo_size, gl.UNSIGNED_SHORT, 0);
  } else {
    // TODO: gl.drawArrays(this.mode, ... this.ibo_size, gl.UNSIGNED_SHORT, 0);
  }

  // TODO: Some state management on this would be way better
  for (let ii = 0; ii < this.format.length; ++ii) {
    let sem = this.format[ii][0];
    gl.disableVertexAttribArray(sem);
  }
};

export function create(...args) {
  return new Geom(...args);
}

export function startup() {
  // Nothing for now.
}
