const { abs, floor, min, max, round, pow, sqrt } = Math;

export function easeInOut(v, a) {
  let va = pow(v, a);
  return va / (va + pow(1 - v, a));
}

export function easeIn(v, a) {
  return 2 * easeInOut(0.5 * v, a);
}

export function easeOut(v, a) {
  return 2 * easeInOut(0.5 + 0.5 * v, a) - 1;
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function merge(dest, src) {
  for (let f in src) {
    dest[f] = src[f];
  }
  return dest;
}

export function defaults(dest, src) {
  for (let f in src) {
    if (!Object.prototype.hasOwnProperty.call(dest, f)) {
      dest[f] = src[f];
    }
  }
  return dest;
}

export function cloneShallow(src) {
  return merge({}, src);
}

export function clamp(v, mn, mx) {
  return min(max(mn, v), mx);
}

export function lerp(a, v0, v1) {
  return (1 - a) * v0 + a * v1;
}

export function mix(v0, v1, a) { // GLSL semantics
  return (1 - a) * v0 + a * v1;
}

export function sign(a) {
  return a < 0 ? -1 : a > 0 ? 1 : 0;
}

export function round100(a) {
  return round(a * 100) / 100;
}

export function round1000(a) {
  return round(a * 1000) / 1000;
}

export function fract(a) {
  return a - floor(a);
}

export function nearSame(a, b, tol) {
  return abs(b - a) <= tol;
}

export function titleCase(str) {
  return str.split(' ').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

const EPSILON = 0.00001;

// http://local.wasp.uwa.edu.au/~pbourke/geometry/sphereline/
export function lineCircleIntersect(p1, p2, pCircle, radius) {
  let dp = [
    p2[0] - p1[0],
    p2[1] - p1[1]
  ];
  let a = dp[0] * dp[0] + dp[1] * dp[1];
  let b = 2 * (dp[0] * (p1[0] - pCircle[0]) + dp[1] * (p1[1] - pCircle[1]));
  let c = pCircle[0] * pCircle[0] + pCircle[1] * pCircle[1];
  c += p1[0] * p1[0] + p1[1] * p1[1];
  c -= 2 * (pCircle[0] * p1[0] + pCircle[1] * p1[1]);
  c -= radius * radius;
  let bb4ac = b * b - 4 * a * c;
  if (abs(a) < EPSILON || bb4ac < 0) {
    return false;
  }

  let mu1 = (-b + sqrt(bb4ac)) / (2 * a);
  let mu2 = (-b - sqrt(bb4ac)) / (2 * a);
  if (mu1 >= 0 && mu1 <= 1 || mu2 >= 0 && mu2 <= 1) {
    return true;
  }

  return false;
}
