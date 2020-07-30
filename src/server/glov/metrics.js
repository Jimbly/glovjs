const assert = require('assert');

const EVENT_METRIC_CLEAR = 60*60*1000;
const TICK_TIME = EVENT_METRIC_CLEAR / 10;

let metric;
let add_metrics = {};
let set_metrics = {};

// Add to a metric for event counts (i.e. something that we want to view the sum of over a time range)
function add(metric_name, value) {
  assert(!set_metrics[metric_name]);
  add_metrics[metric_name] = Date.now();
  if (metric) {
    metric.add(metric_name, value);
  }
}
exports.add = add;


// Set a measurement metric (i.e. something reported on a fixed period that we may want to view the min/max/average of)
// The most recent value will be reported when flushed
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

// Set a valued event metric for which we want detailed statistics (e.g. bytes sent per request), *not* sampled
//   at a regular interval
// The metric provider may need to track sum/min/max/avg in-process between flushes
// This could maybe be combined with `metric.add(metric_name, 1)` (but only care about sum in that case)?
function stats(metric_name, value) {
  if (metric) {
    metric.stats(metric_name, value);
  }
}
exports.stats = stats;

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
