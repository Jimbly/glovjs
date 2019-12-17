/* eslint global-require:off */

// Startup code.

let called_once = false;
window.onload = function () {
  if (called_once) {
    return;
  }
  called_once = true;
  require('./glov/bootstrap.js');
  require('./main.js').main();
};
