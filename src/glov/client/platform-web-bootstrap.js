// very light file that cannot import any engine code, just display a crash message
import {
  bootstrapHandleError,
  bootstrapHandleRejection,
  bootstrapSetCrashDisplayFunc,
} from './bootstrap';
import { isbot } from './isbot';

window.onerror = bootstrapHandleError;

window.addEventListener('unhandledrejection', bootstrapHandleRejection);

let debug = document.getElementById('debug');
function webDisplayCrash(msg, clear) {
  if (clear) {
    debug.innerText = msg;
  } else {
    debug.innerText += `${msg}\n`;
  }
  if (isbot()) {
    try {
      let desc = document.getElementsByTagName('meta').Description.content;
      if (desc) {
        let crash_html = debug.innerHTML;
        debug.innerHTML = `${desc}<br><br>This browser may not fully` +
          ' support WebGL and encountered an error while loading the page.';
        if (String(window.location).includes('verbose=1')) {
          // include error
          debug.innerHTML = `${debug.innerHTML}<br><br>${crash_html}`;
        }
      }
    } catch (err) {
      // ignored
    }
  }
}
bootstrapSetCrashDisplayFunc(webDisplayCrash);
