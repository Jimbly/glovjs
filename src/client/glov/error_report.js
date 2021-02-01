/* eslint-env browser */

export let session_uid = `${String(Date.now()).slice(-8)}${String(Math.random()).slice(2,8)}`;

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
errorReportSetDetails('sesuid', session_uid);
const time_start = Date.now();
errorReportSetDetails('time_start', time_start);
let time_accum = 0;
export function errorReportSetTimeAccum(new_value) {
  time_accum = new_value;
}

export function errorReportGetDetails() {
  return error_report_details;
}

let last_error_time = 0;
let crash_idx = 0;
// Errors from plugins that we don't want to get reported to us, or show the user!
// The exact phrase "Script error.\n  at (0:0)" comes from our bootstap.js when we
//   receive the message 'Script Error.' and no stack.  This happens on the Mi Browser on Redmi phones
//   and doesn't seem to be indicative of any actual problem.
// Ignoring null at null for similar reasons and because we get nothing useful from the reports.
// eslint-disable-next-line no-regex-spaces
let filtered_errors = /avast_submit|vc_request_action|^Script error\.\n  at \(0:0\)$|^null\n  at null\(null:null\)$|getElementsByTagName\('video'\)/;
export function glovErrorReport(is_fatal, msg, file, line, col) {
  console.error(msg);
  if (is_fatal) {
    // Only doing filtering and such on fatal errors, as non-fatal errors are
    // just logged and should not corrupt state.
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
  }
  // Post to an error reporting endpoint that (probably) doesn't exist - it'll get in the logs anyway!
  let url = api_path; // base like http://foo.com/bar/ (without index.html)
  url += `${is_fatal ? 'errorReport' : 'errorLog'}?cidx=${crash_idx}&file=${escape(file)}` +
    `&line=${line||0}&col=${col||0}&url=${escape(location.href)}` +
    `&msg=${escape(msg)}${error_report_details_str}` +
    `&time_up=${Date.now() - time_start}&time_accum=${time_accum}`;
  let xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.send(null);
  return true;
}
