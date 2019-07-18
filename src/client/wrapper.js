// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
(function () {
  let debug = document.getElementById('debug');
  window.onerror = function (e, file, line, col, errorobj) {
    let msg = errorobj && errorobj.stack || `${e}\n  at ${file}(${line}:${col})`;
    debug.innerText = msg;
    if (window.glov_error_report) {
      window.glov_error_report(msg, file, line, col);
    }
  };
  window.debugmsg = function (msg, clear) {
    if (clear) {
      debug.innerText = msg;
    } else {
      debug.innerText += `${msg}\n`;
    }
  };
}());

// Embedded code and startup code.
window.onload = function () {
  // eslint-disable-next-line global-require
  require('./main.js').main();
};
