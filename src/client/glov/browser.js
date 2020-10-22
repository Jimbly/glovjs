let ua = window.navigator.userAgent;
export let is_ios = ua.match(/iPad/i) || ua.match(/iPhone/i);
export let is_webkit = ua.match(/WebKit/i);
export let is_ios_safari = is_ios && is_webkit && !ua.match(/CriOS/i);

export let is_discrete_gpu = false;

function init() {
  let canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  let gltest = canvas.getContext('webgl');
  let debug_info = gltest.getExtension('WEBGL_debug_renderer_info');
  if (debug_info) {
    let renderer_unmasked = gltest.getParameter(debug_info.UNMASKED_RENDERER_WEBGL);
    is_discrete_gpu = Boolean(renderer_unmasked && renderer_unmasked.match(/nvidia|radeon/i));
  }
}
init();
