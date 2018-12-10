/* eslint no-alert:off */
(function () {
  let debug = document.getElementById('debug');
  window.onerror = function (e, file, line) {
    debug.innerText = `${e}\n  at ${file}(${line})`;
  };
  window.debugmsg = function (msg) {
    debug.innerText += `${msg}\n`;
  };
}());

let canvasSupported = true;
(function () {
  let contextNames = ['webgl', 'experimental-webgl'];
  let context = null;
  let canvas = document.createElement('canvas');

  document.body.appendChild(canvas);

  for (let i = 0; i < contextNames.length; i += 1) {
    try {
      context = canvas.getContext(contextNames[i]);
    } catch (e) {
      // ignore
    }

    if (context) {
      break;
    }
  }
  if (!context) {
    canvasSupported = false;
    window.alert('Sorry, but your browser does not support WebGL or does not have it enabled.');
  }

  document.body.removeChild(canvas);
}());

window.assert = function (exp) {
  if (!exp) {
    let e = new Error();
    console.log(e.stack);
    window.alert('assertion failed');
    throw e;
  }
};

// Embedded code and startup code.
window.onload = function () {
  // eslint-disable-next-line global-require
  const app = require('./app.js');
  let canvas = document.getElementById('turbulenz_game_engine_canvas');
  if (canvas.getContext && canvasSupported) {
    app.main(canvas);
  }
};
