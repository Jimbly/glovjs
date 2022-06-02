// Portions Copyright 2008-2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

// Initially derived from libGlov:utilPerf.h/GlovPerf.cpp
// For good memory profiling, Chrome must be launched with --enable-precise-memory-info

/* globals performance*/

export const HAS_MEMSIZE = Boolean(window.performance && performance.memory && performance.memory.usedJSHeapSize);
export const HIST_SIZE = 64;
export const HIST_COMPONENTS = 3; // count, time, dmem
export const HIST_TOT = HIST_SIZE * HIST_COMPONENTS;
// Default `mem_depth` very low, as every profile section with
//    memory adds about 12µs and 56bytes, compared to 1µs and 24bytes without
export const MEM_DEPTH_DEFAULT = 2;

const assert = require('assert');
const { max } = Math;

// For profiler_ui.js
const { localStorageGetJSON, localStorageSetJSON } = require('./local_storage.js');
let profiler_open_keys = localStorageGetJSON('profiler_open_keys', {});

let last_id = 0;
function ProfilerEntry(parent, name) {
  this.parent = parent;
  this.depth = parent ? parent.depth + 1 : 0;
  this.next = null;
  this.child = null;
  this.name = name;
  this.count = 0;
  this.time = 0;
  this.dmem = 0;
  this.start_time = 0;
  this.start_mem = 0;
  this.history = new Float32Array(HIST_TOT);
  this.id = ++last_id;
  // For profiler_ui.js
  this.show_children = !(parent && parent.parent) || profiler_open_keys[this.getKey()] || false;
  this.color_override = null;
}
// For profiler_ui.js
ProfilerEntry.prototype.getKey = function () {
  if (!this.parent) {
    return '';
  } else {
    return `${this.parent.getKey()}.${this.name}`;
  }
};
// For profiler_ui.js
ProfilerEntry.prototype.toggleShowChildren = function () {
  this.show_children = !this.show_children;
  if (this.show_children) {
    profiler_open_keys[this.getKey()] = 1;
  } else {
    delete profiler_open_keys[this.getKey()];
  }
  localStorageSetJSON('profiler_open_keys', profiler_open_keys);
};

let root = new ProfilerEntry(null, 'root');
// Add static node to the tree that we will reference later
let node_out_of_tick = new ProfilerEntry(root, 'GPU/idle');
root.child = node_out_of_tick;
// Immediately add `tick` node, so it's always second in the list
let node_tick = new ProfilerEntry(root, 'tick');
node_out_of_tick.next = node_tick;

let current = root;
let history_index = 0;
let paused = false;
let mem_depth = MEM_DEPTH_DEFAULT;
let total_calls = 0;
let last_frame_total_calls = 0;

function memSizeChrome() {
  return performance.memory.usedJSHeapSize;
}
function memSizeNop() {
  return 0;
}
let memSize = HAS_MEMSIZE ? memSizeChrome : memSizeNop;
let mem_is_high_res = 10;
const WARN_CALLS_COUNT = 1000;
export function profilerWarning() {
  if (last_frame_total_calls > WARN_CALLS_COUNT) {
    return `Warning: Too many per-frame profilerStart() calls (${last_frame_total_calls} > ${WARN_CALLS_COUNT})`;
  } else if (!HAS_MEMSIZE) {
    return 'To access memory profiling, run in Chrome';
  } else if (mem_depth > 1 && mem_is_high_res < 10) {
    return 'For precise memory profiling, launch Chrome with --enable-precise-memory-info';
  }
  return '';
}

export function profilerNodeRoot() {
  return root;
}
export function profilerNodeTick() {
  return node_tick;
}
export function profilerNodeOutOfTick() {
  return node_out_of_tick;
}
export function profilerHistoryIndex() {
  return history_index;
}

export function profilerFrameStart() {
  last_frame_total_calls = total_calls;
  total_calls = 0;
  root.count = 1;
  let now = performance.now();
  root.time = now - root.start_time;
  root.start_time = now;
  if (mem_depth > 0) {
    let memnow = memSize();
    root.dmem = memnow - root.start_mem;
    root.start_mem = memnow;
  }
  node_out_of_tick.count = 1;
  // Place the unaccounted portion of the root's time in `node_out_of_tick`
  node_out_of_tick.time = root.time;
  node_out_of_tick.dmem = root.dmem;
  for (let walk = root.child; walk; walk = walk.next) {
    if (walk === node_out_of_tick) {
      continue;
    }
    node_out_of_tick.time -= walk.time;
    node_out_of_tick.dmem -= walk.dmem;
    if (mem_depth > 1) {
      if (walk.count) {
        // Should basically never see a `0` for dmem, if we do, probably low-precision memory tracking
        if (walk.dmem) {
          mem_is_high_res++;
        } else {
          mem_is_high_res-=5;
        }
      }
    }
  }
  if (current !== root) {
    console.error('Profiler starting new frame but some section was not stopped', current && current.name);
    current = root;
  }
  let walk = root;
  while (walk) {
    let recursing_down = true;
    if (!paused) {
      walk.history[history_index] = walk.count;
      walk.history[history_index+1] = walk.time;
      walk.history[history_index+2] = walk.dmem;
    }
    walk.count = 0;
    walk.time = 0;
    walk.dmem = 0;
    do {
      if (recursing_down && walk.child) {
        walk = walk.child;
      } else if (walk.next) {
        walk = walk.next;
      } else {
        walk = walk.parent;
        recursing_down = false;
        if (walk) {
          continue;
        }
      }
      break;
    } while (true);
  }
  if (!paused) {
    history_index = (history_index + HIST_COMPONENTS) % HIST_TOT;
  }
}

function profilerStart(name) {
  ++total_calls;

  // Find us in current's children
  let last = null;
  let instance;
  // PERFTODO: is having a child map instead of / in addition to the children linked list more efficient?
  for (instance = current.child; instance; last = instance, instance = instance.next) {
    if (instance.name === name) {
      break;
    }
  }
  if (!instance) {
    if (!last) {
      // No children yet
      assert(!current.child);
      instance = new ProfilerEntry(current, name);
      current.child = instance;
    } else {
      instance = new ProfilerEntry(current, name);
      last.next = instance;
    }
  } else {
    assert(instance.parent === current);
  }
  // instance is set to us now!

  current = instance;
  instance.start_time = performance.now();
  if (instance.depth < mem_depth) {
    instance.start_mem = memSize();
  }
}

function profilerStop(old_name, count) {
  if (old_name) {
    assert.equal(old_name, current.name);
  }
  current.time += performance.now() - current.start_time;
  if (current.depth < mem_depth) {
    current.dmem += memSize() - current.start_mem;
  }
  current.count += count || 1;
  current = current.parent;
}

function profilerStopStart(name, count) {
  // TODO: only sample timestamp once
  profilerStop(null, count);
  profilerStart(name);
}

if (window.performance && window.performance.now) {
  window.profilerStart = profilerStart;
  window.profilerStop = profilerStop;
  window.profilerStopStart = profilerStopStart;
} // else set to `nop` in bootstrap.js

export function profilerPaused() {
  return paused;
}
export function profilerPause(new_value) {
  paused = new_value;
}

export function profilerMemDepthGet() {
  return mem_depth;
}

export function profilerMemDepthSet(value) {
  mem_depth = value;
}

export function profilerTotalCalls() {
  return last_frame_total_calls;
}

export function profilerWalkTree(cb) {
  let depth = 0;
  let walk = root;
  while (walk) {
    let recursing_down = true;
    if (walk !== root) {
      if (!cb(walk, depth)) {
        recursing_down = false;
      }
    }
    do {
      if (recursing_down && walk.child) {
        depth++;
        walk = walk.child;
      } else if (walk.next) {
        walk = walk.next;
      } else {
        depth--;
        walk = walk.parent;
        recursing_down = false;
        if (walk) {
          continue;
        }
      }
      break;
    } while (true);
  }
}

export function profilerAvgTime(entry) {
  let sum = 0;
  for (let ii = 0; ii < HIST_TOT; ii+=HIST_COMPONENTS) {
    if (entry.history[ii]) {
      sum += entry.history[ii+1];
    }
  }
  return sum / HIST_SIZE;
}

// For calling manually in the console for debugging
export function profilerDump() {
  assert(current === root);
  let lines = ['','','# PROFILER RESULTS'];

  // Using "% of frame" and "average" equivalent options from profiler_ui
  let total_frame_time = profilerAvgTime(root);

  profilerWalkTree(function (walk, depth) {
    let time_sum=0;
    let count_sum=0;
    let time_max=0;
    let sum_count=0;
    let dmem_max=0;
    for (let ii = 0; ii < HIST_TOT; ii+=HIST_COMPONENTS) {
      if (walk.history[ii]) {
        sum_count++;
        count_sum += walk.history[ii]; // count
        time_sum += walk.history[ii+1]; // time
        time_max = max(time_max, walk.history[ii+1]);
        dmem_max = max(dmem_max, walk.history[ii+2]);
      }
    }
    if (!count_sum) {
      return true;
    }
    let percent = (time_sum/HIST_SIZE) / total_frame_time;

    let ms = time_sum / sum_count;
    let count = (count_sum / sum_count).toFixed(0);

    let buf = '';
    for (let ii = 1; ii < depth; ++ii) {
      buf += '* ';
    }
    buf += `${(percent * 100).toFixed(0)}% ${walk.name} `;
    buf += `${(ms*1000).toFixed(0)} (${count}) max:${(time_max*1000).toFixed(0)}`;
    if (HAS_MEMSIZE) {
      buf += ` dmem:${dmem_max}`;
    }
    lines.push(buf);
    return true;
  });
  let warning = profilerWarning();
  if (warning) {
    lines.push('', warning);
  }
  lines.push('', '');
  console.log(lines.join('\n'));
}

window.profilerDump = profilerDump;
