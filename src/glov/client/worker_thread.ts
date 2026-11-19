// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

/* globals Console, Transferable, self, postMessage */

require('./polyfill.js');

import assert from 'assert';
import type { TSMap } from 'glov/common/types';
import type { MessagePort, TransferListItem } from 'worker_threads';
import {
  webFSApplyReload,
  webFSGetData,
  webFSStartup,
} from './webfs';

const is_node = typeof self === 'undefined';
const parent_port: MessagePort | null = is_node ? require('worker_threads').parentPort : null;
const glob = is_node ? globalThis : self;

if (!glob.profilerStart) {
  glob.profilerStart = glob.profilerStop = glob.profilerStopStart = function () {
    // no profiling in the worker thread
  };
}

export function sendmsg<T=unknown>(id: string, data: T, transfer?: Transferable[]): void {
  if (parent_port) {
    parent_port.postMessage({ id, data }, transfer as unknown as TransferListItem[]);
  } else {
    (postMessage as (message: unknown, transfer?: Transferable[]) => void)({ id, data }, transfer);
  }
}

export function debugmsg(msg: string, clear?: boolean): void {
  sendmsg('debugmsg', { msg, clear });
}

function consoleLogForward(...args: unknown[]): void {
  sendmsg('log', args.join(' '));
}

if (!glob.console) {
  glob.console = {
    log: consoleLogForward,
    info: consoleLogForward,
    warn: consoleLogForward,
    error: consoleLogForward,
  } as Console;
}

function sendError(e: unknown): void {
  // Manually "cloning" the Error object, because it's toJSON (or some other
  //   serialization logic) strips the relevant bits on MacOS Safari.
  // Just send the fields we need for bootstrap.js's handling
  sendmsg('error', {
    message: (e as Error)?.message || String(e),
    stack: (e as Error)?.stack,
  });
}

// Catch errors not happening inside handlers' try/catch
if (is_node) {
  // Also receives unhandled rejections (Node's default --unhandled-rejections=throw)
  process.on('uncaughtException', sendError);
} else {
  self.addEventListener('error', function (evt) {
    if (evt.error) {
      sendError(evt.error);
      evt.preventDefault();
    }
  });
}

export type WorkerReqHandler<T=unknown> = (payload: T) => void;

let handlers: TSMap<WorkerReqHandler> = {};
export function addHandler<T>(id: string, cb: WorkerReqHandler<T>): void {
  assert(!handlers[id]);
  handlers[id] = cb as WorkerReqHandler;
}

let time_work = 0;
let time_idle = 0;
let batch_timing: number[] = [];
let last_report_time = Date.now();
let timing_enabled = false;

function reportTiming(now: number): void {
  // end work, start yield/idle
  if (now - last_report_time > 100) {
    let elapsed = time_work + time_idle;
    assert(elapsed <= now - last_report_time + 10); // this happened once, why?
    sendmsg('timing', { time_work, time_idle, elapsed, batches: batch_timing });
    last_report_time = now;
    time_idle = time_work = 0;
    batch_timing.length = 0;
  }
}

let last_work_end = last_report_time;
let last_work_start = 0;
export function startWork(): void {
  let now = Date.now();
  let idle_time = now - last_work_end;
  if (timing_enabled) {
    batch_timing.push(idle_time);
  }
  time_idle += idle_time;
  last_work_start = now;
}

export function endWork(): void {
  let now = Date.now();
  last_work_end = now;
  let batch_time = now - last_work_start;
  time_work += batch_time;
  if (timing_enabled) {
    batch_timing.push(batch_time);
    reportTiming(now);
  }
}

type MyWorkerMessage = {
  id: string;
  data: unknown;
};

function isMyWorkerMessage(evt: unknown): evt is MyWorkerMessage {
  return Boolean(evt instanceof Object && (evt as MyWorkerMessage).id);
}


function onMessage(evt: unknown): void {
  // start work, end yield/idle
  startWork();
  if (isMyWorkerMessage(evt)) {
    let handler = handlers[evt.id];
    assert(handler, evt.id);
    try {
      handler(evt.data);
    } catch (e) {
      sendError(e);
    }
  } else {
    console.log('worker (worker thread) unhandled message', evt);
  }
  endWork();
}

if (parent_port) {
  parent_port.on('message', onMessage);
} else {
  self.onmessage = function (evt_in: { data: unknown }) {
    onMessage(evt_in.data);
  };
}

addHandler('busy', function (data: number) {
  let start = Date.now();
  let a = 1;
  let b = 1;
  while (Date.now() - start < data) {
    let c = a + b;
    a = b;
    b = c;
  }
  sendmsg('busy_done', null);
});

addHandler('timing_enable', function (data: boolean) {
  timing_enabled = data;
});

addHandler('webfs_data', function (data) {
  if (webFSGetData()) {
    webFSApplyReload(data);
  } else {
    webFSStartup(data);
  }
});

addHandler('assert_now', function () {
  assert(false);
});

addHandler('assert_later', function () {
  setTimeout(function assertLater() {
    assert(false);
  }, 100);
});

addHandler('crash_now', function () {
  let obj: { foo: { bar: number } } = null!;
  obj.foo.bar++;
});

addHandler('crash_later', function () {
  setTimeout(function crashLater() {
    let obj: { foo: { bar: number } } = null!;
    obj.foo.bar++;
  }, 100);
});

addHandler('reject_now', function () {
  // eslint-disable-next-line no-new
  new Promise((resolve, reject) => {
    reject(new Error('client_worker_reject_now'));
  });
});

sendmsg('log', 'WebWorker communication initialized');
