/* eslint-env browser */

let error_report_disabled = false;

export function errorReportDisable() {
  error_report_disabled = true;
}

let api_path = '/';
export function errorReportSetPath(path) {
  api_path = path;
}

let error_report_details = {};
let error_report_details_str = '';
export function errorReportSetDetails(key, value) {
  if (value) {
    error_report_details[key] = escape(String(value));
  } else {
    delete error_report_details[key];
  }
  error_report_details_str = `&${Object.keys(error_report_details)
    .map((k) => `${k}=${error_report_details[k]}`)
    .join('&')}`;
}
errorReportSetDetails('ver', BUILD_TIMESTAMP);

let last_error_time = 0;
let crash_idx = 0;
// Errors from plugins that we don't want to get reported to us, or show the user!
let filtered_errors = /avast_submit|vc_request_action/;
export function glovErrorReport(msg, file, line, col) {
  ++crash_idx;
  let now = Date.now();
  let dt = now - last_error_time;
  last_error_time = now;
  if (error_report_disabled) {
    return false;
  }
  if (dt < 30*1000) {
    // Less than 30 seconds since the last error, either we're erroring every
    // frame, or this is a secondary error caused by the first, do not report it.
    // Could maybe hash the error message and just report each message once, and
    // flag errors as primary or secondary.
    return false;
  }
  if (msg.match(filtered_errors)) {
    return false;
  }
  // Post to an error reporting endpoint that (probably) doesn't exist - it'll get in the logs anyway!
  let url = api_path; // base like http://foo.com/bar/ (without index.html)
  url += `errorReport?cidx=${crash_idx}&file=${escape(file)}&line=${line}&col=${col}&url=${escape(location.href)}` +
    `&msg=${escape(msg)}${error_report_details_str}`;
  let xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.send(null);
  return true;
}