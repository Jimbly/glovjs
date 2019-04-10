/* eslint no-bitwise:off */

// Vector math functions required by the rest of the engine taken piecemeal from
// gl-matrix and related, as well as some generic math utilities
exports.mat3 = require('gl-mat3/create');
exports.mat4 = require('gl-mat4/create');

const { floor, max, min, sqrt } = Math;

export function clamp(a, mn, mx) {
  return max(mn, min(mx, a));
}

export function lerp(a, v0, v1) {
  return (1 - a) * v0 + a * v1;
}

export function isPowerOfTwo(n) {
  return ((n & (n - 1)) === 0);
}

export function nextHighestPowerOfTwo(x) {
  --x;
  for (let i = 1; i < 32; i <<= 1) {
    x |= x >> i;
  }
  return x + 1;
}

export function vec2(a, b) {
  let r = new Float32Array(2);
  r[0] = a;
  r[1] = b;
  return r;
}

export function vec3(a, b, c) {
  let r = new Float32Array(3);
  r[0] = a;
  r[1] = b;
  r[2] = c;
  return r;
}

export function vec4(a, b, c, d) {
  let r = new Float32Array(4);
  r[0] = a;
  r[1] = b;
  r[2] = c;
  r[3] = d;
  return r;
}

export const unit_vec = vec4(1,1,1,1);
export const zero_vec = vec4(0,0,0,0);

export function v2add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
}

export function v2addScale(out, a, b, s) {
  out[0] = a[0] + b[0] * s;
  out[1] = a[1] + b[1] * s;
}

export function v2allocZero() {
  return new Float32Array(2);
}

export function v2copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
}

export function v2distSq(a, b) {
  return (a[0] - b[0]) * (a[0] - b[0]) +
    (a[1] - b[1]) * (a[1] - b[1]);
}

export function v2lengthSq(a) {
  return a[0]*a[0] + a[1]*a[1];
}

export function v2lerp(out, t, a, b) {
  let it = 1 - t;
  out[0] = it * a[0] + t * b[0];
  out[1] = it * a[1] + t * b[1];
}

export function v2mul(out, a, b) {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
}

export function v2normalize(out, a) {
  let len = a[0]*a[0] + a[1]*a[1];
  if (len > 0) {
    len = 1 / sqrt(len);
    out[0] = a[0] * len;
    out[1] = a[1] * len;
  }
}

export function v2scale(out, a, s) {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
}

export function v2sub(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
}

export function v3add(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
}

export function v3addScale(out, a, b, s) {
  out[0] = a[0] + b[0] * s;
  out[1] = a[1] + b[1] * s;
  out[2] = a[2] + b[2] * s;
}

export function v3copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
}

export function v3cross(out, a, b) {
  let a0 = a[0];
  let a1 = a[1];
  let a2 = a[2];
  let b0 = b[0];
  let b1 = b[1];
  let b2 = b[2];
  out[0] = ((a1 * b2) - (a2 * b1));
  out[1] = ((a2 * b0) - (a0 * b2));
  out[2] = ((a0 * b1) - (a1 * b0));
}

export function v3distSq(a, b) {
  return (a[0] - b[0]) * (a[0] - b[0]) +
    (a[1] - b[1]) * (a[1] - b[1]) +
    (a[2] - b[2]) * (a[2] - b[2]);
}

export function v3div(out, a, b) {
  out[0] = a[0] / b[0];
  out[1] = a[1] / b[1];
  out[2] = a[2] / b[2];
}

export function v3floor(out, a) {
  out[0] = floor(a[0]);
  out[1] = floor(a[1]);
  out[2] = floor(a[2]);
}

export function v3lengthSq(a) {
  return a[0]*a[0] + a[1]*a[1] + a[2]*a[2];
}

export function v3mulMat4(out, a, m) {
  let x = a[0];
  let y = a[1];
  let z = a[2];
  out[0] = x * m[0] + y * m[4] + z * m[8];
  out[1] = x * m[1] + y * m[5] + z * m[9];
  out[2] = x * m[2] + y * m[6] + z * m[10];
}

export function v3normalize(out, a) {
  let len = a[0]*a[0] + a[1]*a[1] + a[2]*a[2];
  if (len > 0) {
    len = 1 / sqrt(len);
    out[0] = a[0] * len;
    out[1] = a[1] * len;
    out[2] = a[2] * len;
  }
}

export function v3scale(out, a, s) {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  out[2] = a[2] * s;
}

export function v3sub(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
}

export function v3zero(out) {
  out[0] = out[1] = out[2] = 0;
}

export function v4allocZero() {
  return new Float32Array(4);
}

export function v4clone(a) {
  let r = new Float32Array(4);
  r[0] = a[0];
  r[1] = a[1];
  r[2] = a[2];
  r[3] = a[3];
  return r;
}

export function v4copy(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
}

export function v4lerp(out, t, a, b) {
  let it = 1 - t;
  out[0] = it * a[0] + t * b[0];
  out[1] = it * a[1] + t * b[1];
  out[2] = it * a[2] + t * b[2];
  out[3] = it * a[3] + t * b[3];
}

export function v4mul(out, a, b) {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  out[3] = a[3] * b[3];
}

export function v4mulAdd(out, a, b, c) {
  out[0] = a[0] * b[0] + c[0];
  out[1] = a[1] * b[1] + c[1];
  out[2] = a[2] * b[2] + c[2];
  out[3] = a[3] * b[3] + c[3];
}

export function v4scale(out, a, s) {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  out[2] = a[2] * s;
  out[3] = a[3] * s;
}

export function v4set(out, a, b, c, d) {
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
}

export function v4zero(out) {
  out[0] = out[1] = out[2] = out[3] = 0;
}
