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
