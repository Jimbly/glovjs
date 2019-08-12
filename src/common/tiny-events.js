/* eslint prefer-rest-params:off, no-underscore-dangle:off */

const assert = require('assert');

function EventEmitter() {
  this._listeners = {};
}

module.exports = EventEmitter;
module.exports.EventEmitter = EventEmitter;

function addListener(ee, type, fn, once) {
  assert(typeof fn === 'function');
  let arr = ee._listeners[type];
  if (!arr) {
    arr = ee._listeners[type] = [];
  }
  arr.push({
    once,
    fn,
  });
}

EventEmitter.prototype.listeners = function () {
  return Object.keys(this._listeners);
};

EventEmitter.prototype.on = function (type, fn) {
  addListener(this, type, fn, 0);
  return this;
};

EventEmitter.prototype.once = function (type, fn) {
  addListener(this, type, fn, 1);
  return this;
};

EventEmitter.prototype.removeListener = function (type, fn) {
  let arr = this._listeners[type];
  assert(arr);
  let idx = arr.lastIndexOf(fn);
  assert(idx !== -1);
  arr.splice(idx, 1);
  return this;
};

function filterOnce(elem) {
  return elem.once;
}

EventEmitter.prototype.emit = function (type, ...args) {
  let arr = this._listeners[type];
  if (!arr) {
    return this;
  }

  let any = false;
  let any_once = false;
  for (let ii = 0; ii < arr.length; ++ii) {
    let elem = arr[ii];
    any = true;
    elem.fn(...args);
    if (elem.once) {
      any_once = true;
    }
  }
  if (any_once) {
    this._listeners[type] = arr.filter(filterOnce);
  }

  return any;
};

// Aliases
// EventEmitter.prototype.addListener = EventEmitter.prototype.on;
