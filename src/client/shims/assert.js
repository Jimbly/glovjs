function ok(exp) {
  if (exp) {
    return;
  }
  throw new Error('Assertion failed');
}
module.exports = ok;
module.exports.ok = ok;

function equals(a, b) {
  if (a === b) {
    return;
  }
  throw new Error(`Assertion failed: "${a}"!=="${b}"`);
}
module.exports.equals = equals;
