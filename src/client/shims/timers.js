exports.setImmediate = window.setImmediate || function setImmediate(fn) {
  return setTimeout(fn, 0);
};
exports.clearImmediate = window.clearImmediate || function clearImmediate(id) {
  return clearTimeout(id);
};
