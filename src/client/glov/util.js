export function easeInOut(v, a) {
  let va = Math.pow(v, a);
  return va / (va + Math.pow(1 - v, a));
}

export function easeIn(v, a) {
  return 2 * easeInOut(0.5 * v, a);
}

export function easeOut(v, a) {
  return 2 * easeInOut(0.5 + 0.5 * v, a) - 1;
}


const EPSILON = 0.00001;

// http://local.wasp.uwa.edu.au/~pbourke/geometry/sphereline/
export function lineCircleIntersect(p1, p2, pCircle, radius)
{
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
  if (Math.abs(a) < EPSILON || bb4ac < 0) {
    return false;
  }

  let mu1 = (-b + Math.sqrt(bb4ac)) / (2 * a);
  let mu2 = (-b - Math.sqrt(bb4ac)) / (2 * a);
  if (mu1 >= 0 && mu1 <= 1 || mu2 >= 0 && mu2 <= 1) {
    return true;
  }

  return false;
}
