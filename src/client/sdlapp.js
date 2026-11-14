/* eslint n/global-require:off */

// For debug and used internally in the build/bundling pipeline
window.glov_build_version=BUILD_TIMESTAMP;

// Startup code.

window.time_load_onload = Date.now();
require('./sdlwindow');
require('glov/client/bootstrap');
require('./platform-sdl-bootstrap');
require('./appconfig');
// require('./platform-steamworks').steamInit({
//   main_app_id: 480,
//   demo_app_id: null,
// });
require('./platform-sdl-storage').storageStartup({}, function () {
  require('./platform-sdl');
  require('./main').main();
  window.time_load_init = Date.now();
});
