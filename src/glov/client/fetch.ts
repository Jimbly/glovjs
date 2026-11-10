/* globals self, RequestInit */
export const ERR_CONNECTION = 'ERR_CONNECTION';
export const ERR_TIMEOUT = 'ERR_TIMEOUT';

import assert from 'assert';
import { ErrorCallback, NetErrorCallback } from 'glov/common/types';
import { callbackify, unpromisify } from 'glov/common/util';
import { platformAdapterGet } from './engine';

const { random, round } = Math;

let fetch_delay = 0;
let fetch_delay_rand = 0;
export function fetchDelaySet(delay: number, rand: number): void {
  fetch_delay = delay;
  fetch_delay_rand = rand;
}

const regex_with_host = /\/\/[^/]+\/([^?#]+)/;
const regex_no_host = /([^?#]+)/;
function labelFromURL(url: string): string {
  let m = url.match(regex_with_host);
  if (m) {
    return m[1];
  }
  m = url.match(regex_no_host);
  return m ? m[1] : url;
}

export type FetchParams = {
  method?: 'GET' | 'POST';
  url: string;
  response_type?: 'arraybuffer' | 'json' | 'text'; // default text
  label?: string;
  body?: string;
  headers?: Record<string, string>;
  timeout?: number; // milliseconds
};

export type FetchInternalParams = {
  method: 'GET' | 'POST';
  url: string;
  response_type: 'arraybuffer' | 'json' | 'text';
  label: string;
  body?: string;
  headers: Record<string, string>;
  timeout?: number; // milliseconds
};

export function fetch<T>(params: FetchParams, cb: NetErrorCallback<T>): void {
  let is_done = false;
  let timer: NodeJS.Timeout | undefined;
  function done(err?: string | null | unknown, response?: unknown): void {
    if (is_done) {
      return;
    }
    is_done = true;
    if (timer) {
      clearTimeout(timer);
    }
    cb(err ? String(err) : null, response as T);
  }
  let { method, url, response_type, label, body, headers = {}, timeout } = params;
  method = method || 'GET';
  assert(url);
  label = label || labelFromURL(url);
  response_type = response_type || 'text';

  if (timeout) {
    // But, in case the underlying timeout doesn't fire, add a chained timeout
    //   at double the time to make sure (double to give it a chance to
    //   potentially fire a (late) success, in the case of stalls/hiccups/etc)
    timer = setTimeout(function () {
      timer = setTimeout(function () {
        profilerStart(`fetch_timeout:${label}`);
        done(ERR_TIMEOUT);
        profilerStop();
      }, timeout);
    }, timeout);
  }

  function sendit(): void {
    platformAdapterGet().fetch({
      method,
      url,
      label,
      response_type,
      body,
      headers,
      timeout,
    }, done);
  }

  if (fetch_delay || fetch_delay_rand) {
    setTimeout(sendit, fetch_delay + round(random() * fetch_delay_rand));
  } else {
    sendit();
  }
}


const glob = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self;
let nativeFetch = glob.fetch || null;
export function fetchNative(params: FetchInternalParams, done: ErrorCallback<unknown>): void {
  if (!nativeFetch) {
    return done('Native fetch not supported');
  }
  let { method, url, response_type, label, body, headers } = params;
  // This mostly works, however it creates larger (untracked) stalls when loading textures
  headers = {
    ...headers,
  };
  if (body !== undefined) {
    if (typeof body === 'object') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    } else {
      body = String(body);
    }
  }
  let options: RequestInit = {
    method,
    headers,
    mode: 'cors',
    body,
  };

  profilerStart(`nativeFetch:${label}`);
  nativeFetch(url, options).then(function (resp) {
    if (!resp.ok) {
      return void callbackify(resp.text.bind(resp))(function (err, resp_body) {
        if (err) {
          return void done(err);
        }
        done(String(resp.status), resp_body);
      });
    }
    const resp_func = response_type === 'arraybuffer' ? 'arrayBuffer' :
      response_type === 'json' ? 'json' : 'text';
    profilerStart(`nativeFetch:${label}:getResponse`);
    callbackify(resp[resp_func].bind(resp))(function (err, resp_body) {
      if (err) {
        return void done(err);
      }
      done(null, resp_body);
    });
    profilerStop(`nativeFetch:${label}:getResponse`);
  }, unpromisify(function () {
    done(ERR_CONNECTION);
  }));
  profilerStop(`nativeFetch:${label}`);
}
