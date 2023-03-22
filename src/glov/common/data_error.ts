import assert from 'assert';

export type DataError = {
  msg: string;
};

let on_error: null | ((err: DataError) => void) = null;
let enabled = false;
let error_queue: DataError[] = [];
export function dataErrorEx(err: DataError): void {
  if (!enabled) {
    return;
  }
  if (on_error) {
    on_error(err);
  }
  error_queue.push(err);
  if (error_queue.length > 25) {
    error_queue.splice(0, 1);
  }
}

export function dataError(msg: string): void {
  dataErrorEx({ msg });
}

export function dataErrorQueueEnable(val: boolean): void {
  enabled = val;
}

export function dataErrorOnError(cb: (err: DataError) => void): void {
  assert(!on_error);
  on_error = cb;
}

export function dataErrorQueueGet(): DataError[] {
  return error_queue;
}

export function dataErrorQueueClear(): void {
  error_queue = [];
}
