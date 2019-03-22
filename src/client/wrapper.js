/* eslint no-alert:off, consistent-return:off */
(function () {
  let debug = document.getElementById('debug');
  window.onerror = function (e, file, line) {
    debug.innerText = `${e}\n  at ${file}(${line})`;
  };
  window.debugmsg = function (msg) {
    debug.innerText += `${msg}\n`;
  };
}());

// Embedded code and startup code.
window.onload = function () {
  // eslint-disable-next-line global-require
  const app = require('./app.js');

  let canvas = document.getElementById('canvas');
  let contextNames = ['webgl', 'experimental-webgl'];
  for (let i = 0; i < contextNames.length; i += 1) {
    let context;
    try {
      context = canvas.getContext(contextNames[i]);
    } catch (e) {
      // ignore
    }
    if (context) {
      return app.main(canvas);
    }
  }
  window.alert('Sorry, but your browser does not support WebGL or does not have it enabled.');
};
