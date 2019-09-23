// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');

export function create(elem, on_ptr_lock) {
  let user_want_locked = false;

  function isLocked() {
    return user_want_locked; // Either it's locked, or there's an async attempt to lock it outstanding
  }

  function pointerLog(msg) {
    console.log(`PointerLock: ${msg}`); // TODO: Disable this after things settle
  }

  function exitLock() {
    pointerLog('Lock exit requested');
    user_want_locked = false;
    document.exitPointerLock();
  }

  function onPointerLockChange() {
    if (document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement) {
      pointerLog('Lock successful');
      if (!user_want_locked) {
        pointerLog('User canceled lock');
        document.exitPointerLock();
      }
    } else {
      if (user_want_locked) {
        pointerLog('Lock lost');
        user_want_locked = false;
      }
    }
  }

  function onPointerLockError(e) {
    pointerLog('Error');
    user_want_locked = false;
  }

  function enterLock(when) {
    user_want_locked = true;
    on_ptr_lock();
    pointerLog(`Trying pointer lock in response to ${when}`);
    elem.requestPointerLock();
  }

  let lock_on = {};
  function topOfFrame() {
    lock_on = {};
  }

  function lockOn(type, code, pos) {
    if (code) {
      lock_on[type] = lock_on[type] || {};
      lock_on[type][code] = pos || true;
    } else {
      lock_on[type] = pos || true;
    }
  }

  function handle(type, event) {
    let lo = lock_on[type];
    if (!lo) {
      return;
    }
    switch (type) {
      case 'keydown':
      case 'keyup':
        if (!lo[event.keyCode]) {
          break;
        }
        enterLock(type);
        break;
      case 'mouseup':
      case 'mousedown': {
        let x = event.clientX;
        let y = event.clientY;
        if (x < lo.x || x >= lo.x + lo.w ||
          y < lo.y || y >= lo.y + lo.h
        ) {
          break;
        }
        enterLock(type);
      } break;
      default:
        assert(false);
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
    enter: enterLock,
    exit: exitLock,
    topOfFrame,
    handle,
    lockOn,
  };
}
