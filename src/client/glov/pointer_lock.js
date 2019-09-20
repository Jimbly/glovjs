// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const engine = require('./engine.js');

export function create(elem) {
  let deferred_lock_id = 0;
  let want_lock_async = false;
  let trying_direct_lock = 0;
  let direct_lock_works = false; // unknown at start
  let direct_lock_disabled = false;
  let async_pointer_lock_start_frame = 0;
  let user_want_locked = false;

  function isLocked() {
    return user_want_locked; // Either it's locked, or there's an async attempt to lock it outstanding
  }

  function pointerLog(msg) {
    // console.log(`PointerLock: ${msg}`);
  }

  function exitLock() {
    pointerLog('Lock exit requested');
    user_want_locked = false;
    document.exitPointerLock();
  }

  function onPointerLockChange() {
    if (document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement) {
      pointerLog('Lock successful');
      if (trying_direct_lock) {
        pointerLog('Direct lock works');
        direct_lock_works = true;
        trying_direct_lock = 0;
      }
      if (!user_want_locked) {
        pointerLog('User canceled lock');
        document.exitPointerLock();
      }
    } else {
      pointerLog('Lock lost');
      user_want_locked = false;
    }
  }

  function onPointerLockError() {
    pointerLog('Error');
    if (trying_direct_lock) {
      direct_lock_disabled = true;
      want_lock_async = true;
      trying_direct_lock = 0;
    }
  }

  function asyncPointerLockCheck() {
    deferred_lock_id = 0;
    // If we asked for a lock, and direct locks are disabled, lock it
    if (want_lock_async) {
      want_lock_async = false;
      pointerLog('Async watcher executing lock');
      elem.requestPointerLock();
      return;
    }
    // If we successfully locked through any means, stop
    if (direct_lock_works) {
      pointerLog('Async watcher canceled, direct lock worked');
      return;
    }
    if (trying_direct_lock) {
      // If we tried a direct lock 2+ frames ago, lock it, disable direct locks
      if (engine.global_frame_index - trying_direct_lock >= 4) {
        pointerLog('5 frames since attempting a direct lock, assuming failed');
        direct_lock_disabled = true;
        trying_direct_lock = 0;
        elem.requestPointerLock();
        return;
      }
    } else if (engine.global_frame_index !== async_pointer_lock_start_frame) {
      // tick has happened, no request for lock, stop watching
      // pointerLog('Async watcher done, no lock request');
      return;
    }
    deferred_lock_id = setTimeout(asyncPointerLockCheck, 1);
  }

  function enterLock(maybe) {
    // Assert that we got a mouse down event recently, otherwise this won't work
    assert(maybe || engine.global_frame_index - async_pointer_lock_start_frame <= 2);
    if (!direct_lock_works) {
      if (maybe && !deferred_lock_id) {
        // not going to work
        return;
      }
      assert(deferred_lock_id);
    }
    user_want_locked = true;
    // If direct locks are disabled, just ask for async lock
    if (direct_lock_disabled) {
      pointerLog('Requesting async lock');
      want_lock_async = true;
      return;
    }
    pointerLog('Trying direct pointer lock');
    if (!direct_lock_works) { // if we don't know yet
      trying_direct_lock = engine.global_frame_index;
    }
    elem.requestPointerLock();
  }

  function allowAsync() {
    async_pointer_lock_start_frame = engine.global_frame_index;
    // If we know direct locks work, do nothing, otherwise start watcher
    if (!direct_lock_works) {
      // pointerLog('Starting async watcher');
      if (deferred_lock_id) {
        clearTimeout(deferred_lock_id);
      }
      deferred_lock_id = setTimeout(asyncPointerLockCheck, 1);
    } else {
      // pointerLog('Direct lock works, not starting async watcher');
    }
  }

  elem.requestPointerLock = elem.requestPointerLock || elem.mozRequestPointerLock ||
    elem.webkitRequestPointerLock || function () { /* nop */ };
  document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock ||
    document.webkitExitPointerLock || function () { /* nop */ };

  document.addEventListener('pointerlockchange', onPointerLockChange, false);
  document.addEventListener('mozpointerlockchange', onPointerLockChange, false);
  document.addEventListener('webkitpointerlockchange', onPointerLockChange, false);

  document.addEventListener('pointerlockerror', onPointerLockError, false);
  document.addEventListener('mozpointerlockerror', onPointerLockError, false);
  document.addEventListener('webkitpointerlockerror', onPointerLockError, false);

  return {
    isLocked,
    allowAsync,
    enter: enterLock,
    exit: exitLock,
  };
}
