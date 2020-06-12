const assert = require('assert');

const EVENT_METRIC_CLEAR = 60*60*1000;
const TICK_TIME = EVENT_METRIC_CLEAR / 10;

let metric;
let add_metrics = {};
let set_metrics = {};


function add(metric_name, value) {
  assert(!set_metrics[metric_name]);
  add_metrics[metric_name] = Date.now();
  if (metric) {
    metric.add(metric_name, value);
  }
}
exports.add = add;

function set(metric_name, value) {
  assert(!add_metrics[metric_name]);
  if (set_metrics[metric_name] !== value || true) {
    set_metrics[metric_name] = value;
    if (metric) {
      metric.set(metric_name, value);
    }
  }
}
exports.set = set;

// Registers an event metric which should be cleared to 0 if not updated in an hour
function register(metric_name) {
  add_metrics[metric_name] = Date.now();
}
exports.register = register;

function tick() {
  setTimeout(tick, TICK_TIME);
  let now = Date.now();
  for (let metric_name in add_metrics) {
    if (now - add_metrics[metric_name] > EVENT_METRIC_CLEAR) {
      metric.set(metric_name, 0);
      delete add_metrics[metric_name];
    }
  }
}

// metric_impl must have .add and .set
function init(metric_impl) {
  metric = metric_impl;
  tick();
}
exports.init = init;
