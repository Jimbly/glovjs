/* global XMLHttpRequest */

const assert = require('assert');
const { callbackify, unpromisify } = require('glov/common/util');

const { random, round } = Math;

export const ERR_CONNECTION = 'ERR_CONNECTION';
export const ERR_TIMEOUT = 'ERR_TIMEOUT';

let fetch_delay = 0;
let fetch_delay_rand = 0;
export function fetchDelaySet(delay, rand) {
  fetch_delay = delay;
  fetch_delay_rand = rand;
}

const regex_with_host = /\/\/[^/]+\/([^?#]+)/;
const regex_no_host = /([^?#]+)/;
function labelFromURL(url) {
  let m = url.match(regex_with_host);
  if (m) {
    return m[1];
  }
  m = url.match(regex_no_host);
  return m ? m[1] : url;
}

let nativeFetch = window.fetch || null;

export function fetch(params, cb) {
  let is_done = false;
  let timer;
  function done(err, response) {
    if (is_done) {
      return;
    }
    is_done = true;
    if (timer) {
      clearTimeout(timer);
    }
    cb(err, response);
  }
  let { method, url, response_type, label, body, headers = {}, timeout } = params;
  method = method || 'GET';
  assert(url);
  label = label || labelFromURL(url);

  if (nativeFetch && false) {
    // This mostly works, however it creates larger (untracked) stalls when loading textures
    // If we use this path: need to add timeout logic
    let options = {
      method,
      headers: {
        ...headers,
      },
      mode: 'cors',
    };
    if (body !== undefined) {
      if (typeof body === 'object') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      } else {
        options.body = String(body);
      }
    }
    profilerStart('nativeFetch');
    nativeFetch(url, options).then(function (resp) {
      if (!resp.ok) {
        return void callbackify(resp.text.bind(resp))(function (err, resp_body) {
          if (err) {
            return void done(err);
          }
          done(String(resp.status), resp_body);
        });
      }
      let resp_func = response_type === 'arraybuffer' ? 'arrayBuffer' :
        response_type === 'json' ? 'json' : 'text';
      profilerStart('nativeFetch:getResponse');
      callbackify(resp[resp_func].bind(resp))(function (err, resp_body) {
        if (err) {
          return void done(err);
        }
        done(null, resp_body);
      });
      profilerStop('nativeFetch:getResponse');
    }, unpromisify(done));
    profilerStop('nativeFetch');
    return;
  }

  let xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  if (timeout) {
    // Expect XHR timeout to work
    xhr.timeout = timeout;
    // But, in case it doesn't fire, add a chained timeout at double the
    //   time to make sure (double to give it a chance to
    //   potentially fire a (late) success, in the case of stalls/hiccups/etc)
    // Note: evidence `timeout` wasn't working was wrong - we were not attaching
    //   a `ontimeout` handler.
    timer = setTimeout(function () {
      timer = setTimeout(function () {
        profilerStart(`fetch_timeout:${label}`);
        done(ERR_TIMEOUT);
        profilerStop();
      }, timeout);
    }, timeout);
  }
  if (response_type && response_type !== 'json') {
    xhr.responseType = response_type;
  }
  for (let header in headers) {
    xhr.setRequestHeader(header, headers[header]);
  }
  xhr.onload = function () {
    profilerStart(`fetch_onload:${label}`);
    if ((xhr.status !== 0 && xhr.status < 200) || xhr.status >= 300) {
      let text;
      if (response_type !== 'arraybuffer') {
        try {
          text = xhr.responseText;
        } catch (e) {
          // ignored
        }
      }
      done(String(xhr.status), text || '');
    } else {
      if (response_type === 'json') {
        let text;
        let obj;
        try {
          text = xhr.responseText;
          obj = JSON.parse(text);
        } catch (e) {
          console.error(`Received invalid JSON response from ${url}: ${text || '<empty response>'}`);
          // Probably internal server error or such as the server is restarting
          done(e);
          profilerStop();
          return;
        }
        done(null, obj);
      } else if (response_type === 'arraybuffer') {
        profilerStart('access response');
        // non-trivial amount of time (37% of compressed texture loading!)
        let resp = xhr.response;
        profilerStop();
        if (resp) {
          done(null, resp);
        } else {
          done('empty response');
        }
      } else {
        done(null, xhr.responseText);
      }
    }
    profilerStop();
  };
  xhr.onabort = xhr.onerror = () => {
    profilerStart(`fetch_onerror:${label}`);
    done(ERR_CONNECTION);
    profilerStop();
  };
  xhr.ontimeout = function () {
    profilerStart(`fetch_ontimeout:${label}`);
    done(ERR_TIMEOUT);
    profilerStop();
  };
  if (body !== undefined) {
    if (typeof body === 'object') {
      xhr.setRequestHeader('Content-Type', 'application/json');
      body = JSON.stringify(body);
    } else {
      body = String(body);
    }
  }
  if (fetch_delay || fetch_delay_rand) {
    setTimeout(xhr.send.bind(xhr, body), fetch_delay + round(random() * fetch_delay_rand));
  } else {
    xhr.send(body);
  }
}
