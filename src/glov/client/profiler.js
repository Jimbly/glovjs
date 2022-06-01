// Portions Copyright 2008-2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

// Initially derived from libGlov:utilPerf.h/GlovPerf.cpp

/* globals performance*/
const assert = require('assert');
const camera2d = require('./camera2d.js');
const { cmd_parse } = require('./cmds.js');
const engine = require('./engine.js');
const { style } = require('./font.js');
const input = require('./input.js');
const { localStorageGetJSON, localStorageSetJSON } = require('./local_storage.js');
const { floor, max, min } = Math;
const ui = require('./ui.js');
const { perfGraphOverride } = require('./perf.js');
const settings = require('./settings.js');
const { vec2, vec4 } = require('glov/common/vmath.js');

const HIST_SIZE = 64;
const HIST_COMPONENTS = 2; // count, time
const HIST_TOT = HIST_SIZE * HIST_COMPONENTS;

Z.PROFILER = Z.PROFILER || 9950; // above Z.BUILD_ERRORS

let profiler_open_keys = localStorageGetJSON('profiler_open_keys', {});

let last_id = 0;
function ProfilerEntry(parent, name) {
  this.parent = parent;
  this.next = null;
  this.child = null;
  this.name = name;
  this.count = 0;
  this.time = 0;
  this.show_children = !(parent && parent.parent) || profiler_open_keys[this.getKey()] || false;
  this.history = new Float32Array(HIST_TOT);
  this.start_time = 0;
  this.id = ++last_id;
  this.color_override = null;
}
ProfilerEntry.prototype.getKey = function () {
  if (!this.parent) {
    return '';
  } else {
    return `${this.parent.getKey()}.${this.name}`;
  }
};
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
// Add static nodes to the tree that we will reference later
let node_tick = new ProfilerEntry(root, 'tick');
root.child = node_tick;
let node_out_of_tick = new ProfilerEntry(root, 'GPU/idle');
node_tick.next = node_out_of_tick;

let current = root;
let history_index = 0;
let paused = false;
let avg_percents;

export function profilerFrameStart() {
  let now = performance.now();
  root.count = 1;
  root.time += now - root.start_time;
  root.start_time = now;
  node_out_of_tick.count = 1;
  node_out_of_tick.time = root.time - node_tick.time;
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
    }
    walk.count = 0;
    walk.time = 0;
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
}

function profilerStop(old_name, count) {
  if (old_name) {
    assert.equal(old_name, current.name);
  }
  let now = performance.now();
  let dt = now - current.start_time;
  current.time += dt;
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

function profilerPause() {
  paused = true;
}

function profilerToggle(data, resp_func) {
  if (data === '1') {
    settings.set('show_profiler', 1);
  } else if (data === '0') {
    settings.set('show_profiler', 0);
  } else {
    if (settings.show_profiler) {
      if (paused) {
        paused = false;
      } else {
        settings.set('show_profiler', 0);
      }
    } else {
      settings.set('show_profiler', 1);
      profilerPause();
    }
  }

  if (resp_func) {
    resp_func();
  }
}
const access_show = engine.DEBUG ? undefined : ['hidden'];
cmd_parse.register({
  cmd: 'profiler_toggle',
  help: 'Show or toggle profiler visibility',
  access_show,
  func: profilerToggle,
});
settings.register({
  show_profiler: {
    default_value: 0,
    type: cmd_parse.TYPE_INT,
    range: [0,1],
    access_show,
  },
  profiler_avg_percents: {
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0,1],
    access_show: ['hidden'],
  },
  profiler_relative: {
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0,2],
    access_show: ['hidden'],
  },
  profiler_interactable: {
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0,1],
    access_show: ['hidden'],
  },
});

function walkTree(cb) {
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

// For calling manually in the console for debugging
window.profilerDump = function profilerDump() {
  assert(current === root);
  let last_index = (history_index - HIST_COMPONENTS + HIST_TOT) % HIST_TOT;
  let lines = ['','','# PROFILER RESULTS'];
  walkTree(function (walk, depth) {
    let time_sum=0;
    let count_sum=0;
    let sum_count=0;
    for (let ii = 0; ii < HIST_TOT; ii+=HIST_COMPONENTS) {
      if (walk.history[ii]) {
        sum_count++;
        count_sum += walk.history[ii]; // count
        time_sum += walk.history[ii+1]; // time
      }
    }
    let buf = '';
    if (walk.history[last_index]) {
      for (let ii = 0; ii < depth; ++ii) {
        buf += '*';
      }
      buf += ' ';
      buf += walk.name;
      buf = `${buf} ${walk.history[last_index+1].toFixed(3)} (${walk.history[last_index]})` +
        ` Avg:${(time_sum / sum_count).toFixed(3)} (${(count_sum / sum_count).toFixed(1)})`;
      lines.push(buf);
    }
    return true;
  });
  lines.push('', '');
  console.log(lines.join('\n'));
};

function avgTime(entry) {
  let sum = 0;
  for (let ii = 0; ii < HIST_TOT; ii+=HIST_COMPONENTS) {
    if (entry.history[ii]) {
      sum += entry.history[ii+1];
    }
  }
  return sum / HIST_SIZE;
}

let font;
let y;
const style_time_spike = style(null, {
  color: 0xFF7F7Fff,
});
const style_number = style(null, {
  color: 0xFFFFD0ff,
});
const style_ms = style(null, {
  color: 0xD0FFFFff,
});
const style_header = style(null, {
  color: 0xFFFFFFff,
  outline_width: 0.8,
  outline_color: 0xFFFFFFff,
});
const style_name = style(null, {
  color: 0xFFFFFFff,
  outline_width: 1,
  outline_color: 0x00000080,
});
const FONT_SIZE = 22;
const LINE_HEIGHT = 24;
const LINE_YOFFS = (LINE_HEIGHT - FONT_SIZE)/2;
let font_number_scale;
let font_size_number;
let number_yoffs;
let bar_w;
// Different Zs for better batching
const Z_BAR = Z.PROFILER;
const Z_GRAPH = Z.PROFILER+1;
const Z_TREE = Z.PROFILER+2;
const Z_NAMES = Z.PROFILER+3;
const Z_NUMBER = Z.PROFILER+4;
const Z_MS = Z.PROFILER+5;
const MS_W = 56;
const MS_AVG_W = 50;
const MSPAIR_W = MS_W + 4 + MS_AVG_W;
const COL_HEADERS = ['Profiler', 'µs (count)', 'average', 'max'];
const COL_W = [400, MSPAIR_W, MSPAIR_W, MS_W];
const COL_X = [];
let bar_x0;
COL_X[0] = 0;
for (let ii = 0; ii < COL_W.length; ++ii) {
  COL_X[ii+1] = COL_X[ii] + COL_W[ii] + 4;
}
const LINE_WIDTH = COL_X[COL_W.length];
let color_bar = vec4(0,0,0,0.85);
let color_bar2 = vec4(0.2,0.2,0.2,0.85);
let color_bar_header = vec4(0.3,0.3,0.3,0.85);
let color_bar_over = vec4(0,0,0.5,0.85);
let color_bar_over2 = vec4(0.2,0.2,0.7,0.85);
let color_bar_parent = vec4(0,0,0.3,0.85);
let color_bar_parent2 = vec4(0.2,0.2,0.4,0.85);
let color_timing = vec4(1, 1, 0.5, 1);
let color_bar_highlight = vec4(0,0,0, 0.5);
let color_gpu = node_out_of_tick.color_override = vec4(0.5, 0.5, 1, 1);
const GRAPH_FRAME_TIME = 16;
let total_frame_time;
let show_index_count;
let show_index_time;
let do_ui;
let mouseover_elem = {};
let mouseover_main_elem;
let mouseover_bar_idx;
let perf_graph = {
  history_size: HIST_SIZE,
  num_lines: 2,
  data: {
    history: new Float32Array(HIST_SIZE * 2),
    index: 0,
  },
  line_scale_top: GRAPH_FRAME_TIME,
  bars_stack: true,
  colors: [
    vec4(0.5, 1.0, 0.5, 1),
    color_gpu,
  ],
};
function profilerShowEntryEarly(walk, depth) {
  if (settings.profiler_relative === 0 && walk === node_out_of_tick) {
    // doesn't make sense to show
    return false;
  }
  let count_sum=0;
  for (let ii = 0; ii < HIST_TOT; ii+=HIST_COMPONENTS) {
    count_sum += walk.history[ii];
  }
  if (!count_sum) {
    return true;
  }
  if (input.mouseOver({ x: 0, y, w: LINE_WIDTH, h: LINE_HEIGHT, peek: true })) {
    mouseover_main_elem = walk;
    mouseover_elem[walk.id] = 1;
    for (let parent = walk.parent; parent; parent = parent.parent) {
      mouseover_elem[parent.id] = 2;
    }
  }
  y += LINE_HEIGHT;
  if (!walk.show_children) {
    return false;
  }
  return true;
}
function hasActiveChildren(walk) {
  walk = walk.child;
  if (!walk) {
    return false;
  }
  while (walk) {
    for (let ii = 0; ii < HIST_TOT; ii+=HIST_COMPONENTS) {
      if (walk.history[ii]) {
        return true;
      }
    }
    walk = walk.next;
  }
  return false;
}
function profilerShowEntry(walk, depth) {
  if (settings.profiler_relative === 0 && walk === node_out_of_tick) {
    // doesn't make sense to show
    return false;
  }
  let time_sum=0;
  let count_sum=0;
  let time_max=0;
  let sum_count=0;
  for (let ii = 0; ii < HIST_TOT; ii+=HIST_COMPONENTS) {
    if (walk.history[ii]) {
      sum_count++;
      count_sum += walk.history[ii]; // count
      time_sum += walk.history[ii+1]; // time
      time_max = max(time_max, walk.history[ii+1]);
    }
  }
  if (!count_sum) {
    return true;
  }
  let over = mouseover_elem[walk.id] === 1;
  let parent_over = mouseover_elem[walk.id] === 2;
  if (do_ui) {
    if (input.click({ x: 0, y, w: LINE_WIDTH, h: LINE_HEIGHT, button: 0 })) {
      walk.toggleShowChildren();
    } else if (input.click({ x: 0, y, w: LINE_WIDTH, h: LINE_HEIGHT, button: 1 })) {
      walk.parent.toggleShowChildren();
    }
  }
  let color_top = over ? color_bar_over : parent_over ? color_bar_parent : color_bar;
  let color_bot = over ? color_bar_over2 : parent_over ? color_bar_parent2 : color_bar2;
  ui.drawRect4Color(0, y, LINE_WIDTH, y + LINE_HEIGHT, Z_BAR,
    color_top, color_top, color_bot, color_bot);

  let x = bar_x0;
  for (let ii = 0; ii < HIST_SIZE; ++ii) {
    let time = walk.history[(history_index + ii*2) % HIST_TOT + 1];
    if (time) {
      let hv = time / GRAPH_FRAME_TIME;
      let h = min(hv * LINE_HEIGHT, LINE_HEIGHT);
      if (hv < 1) {
        color_timing[0] = hv;
        color_timing[1] = 1;
      } else {
        color_timing[0] = 1;
        color_timing[1] = max(0, 2 - hv);
      }
      let color = walk.color_override || color_timing;
      ui.drawRect(x + ii*bar_w, y + LINE_HEIGHT - h, x + (ii + 1)*bar_w, y + LINE_HEIGHT, Z_GRAPH, color);
    }
  }

  y += LINE_YOFFS;

  let prefix;
  if (hasActiveChildren(walk)) {
    if (!walk.show_children) {
      prefix = '▶'; // '+';
    } else {
      prefix = '▼'; // '-';
    }
  }
  let percent = 0;
  if (settings.profiler_relative === 1) {
    // "% of parent"
    if (walk.parent) {
      if (avg_percents) {
        percent = (time_sum/HIST_SIZE) / avgTime(walk.parent);
      } else {
        percent = walk.history[show_index_time] / walk.parent.history[show_index_time];
      }
    }
  } else {
    if (avg_percents) {
      percent = (time_sum/HIST_SIZE) / total_frame_time;
    } else {
      percent = walk.history[show_index_time] / total_frame_time;
    }
  }
  x = depth * FONT_SIZE;
  if (prefix) {
    font.drawSized(null, x - 16, y, Z_TREE, FONT_SIZE, prefix);
  }
  x += FONT_SIZE*2;
  font.drawSizedAligned(style_number, x, y + number_yoffs, Z_NUMBER, font_size_number, font.ALIGN.HRIGHT, 0, 0,
    `${(percent * 100).toFixed(0)}%`);
  x += 4;
  font.drawSized(style_name, x, y, Z_NAMES, FONT_SIZE,
    walk.name);

  x = COL_X[1];
  font.drawSizedAligned(style_ms, x, y + number_yoffs, Z_MS, font_size_number, font.ALIGN.HRIGHT, MS_W, 0,
    `${(walk.history[show_index_time]*1000).toFixed(0)}`);
  x += MS_W + 4;
  font.drawSizedAligned(style_number, x, y + number_yoffs, Z_NUMBER, font_size_number, font.ALIGN.HFIT, MS_AVG_W, 0,
    `(${walk.history[show_index_count]})`);

  x = COL_X[2];
  font.drawSizedAligned(style_ms, x, y + number_yoffs, Z_MS, font_size_number, font.ALIGN.HRIGHT, MS_W, 0,
    (time_sum / sum_count*1000).toFixed(0));
  x += MS_W + 4;
  font.drawSizedAligned(style_number, x, y + number_yoffs, Z_NUMBER, font_size_number, font.ALIGN.HFIT, MS_AVG_W, 0,
    `(${(count_sum / sum_count).toFixed(0)})`);
  x = COL_X[3];
  let spike = (time_max * 0.25 > (time_sum / sum_count));
  font.drawSizedAligned(spike ? style_time_spike : style_ms, x, y + number_yoffs, Z_MS, font_size_number,
    font.ALIGN.HRIGHT, COL_W[3], 0,
    (time_max*1000).toFixed(0));

  y += FONT_SIZE + LINE_YOFFS;
  if (!walk.show_children) {
    return false;
  }
  return true;
}

function doGraph() {
  if (!mouseover_main_elem || mouseover_main_elem === node_out_of_tick) {
    perf_graph.line_scale_top = GRAPH_FRAME_TIME * 2;
  } else {
    perf_graph.line_scale_top = GRAPH_FRAME_TIME;
  }
  if (mouseover_main_elem) {
    let elem = mouseover_main_elem;
    for (let ii = 0; ii < HIST_SIZE; ++ii) {
      perf_graph.data.history[ii*2] = elem.history[ii*HIST_COMPONENTS + 1];
      perf_graph.data.history[ii*2+1] = 0;
    }
  } else {
    for (let ii = 0; ii < HIST_SIZE; ++ii) {
      let idx = ii*HIST_COMPONENTS + 1;
      perf_graph.data.history[ii*2] = root.history[idx] - node_out_of_tick.history[idx];
      perf_graph.data.history[ii*2+1] = node_out_of_tick.history[idx];
    }
  }
  perf_graph.data.index = history_index/2;
  perfGraphOverride(perf_graph);
}

const BUTTON_W = 140;
const BUTTON_H = 48;
const BUTTON_FONT_HEIGHT = 24;
const PROFILER_RELATIVE_LABELS = ['% of user', '% of parent', '% of frame'];
let mouse_pos = vec2();
function profilerUIRun() {
  profilerStart('profilerUIRun');
  if (engine.render_width) {
    let scale = FONT_SIZE / ui.font_height;
    camera2d.set(0, 0, scale * engine.render_width, scale * engine.render_height);
    font_number_scale = 1;
    bar_w = scale;
  } else {
    camera2d.setScreen();
    font_number_scale = 0.9;
    bar_w = 2;
  }
  bar_x0 = COL_X[1] - HIST_SIZE*bar_w;
  font_size_number = FONT_SIZE * font_number_scale;
  number_yoffs = (FONT_SIZE - font_size_number) / 2;

  let z = Z.PROFILER + 10;
  y = 0;
  let x = LINE_WIDTH;
  if (ui.buttonText({
    x, y, z,
    w: BUTTON_W, h: BUTTON_H, font_height: BUTTON_FONT_HEIGHT,
    text: settings.profiler_interactable ? 'Interactable' : 'Overlay',
  })) {
    settings.set('profiler_interactable', 1 - settings.profiler_interactable);
  }
  do_ui = settings.profiler_interactable;
  if (do_ui && ui.buttonText({
    x: x + BUTTON_W, y, z,
    w: BUTTON_H, h: BUTTON_H, font_height: BUTTON_FONT_HEIGHT,
    text: 'X',
  })) {
    settings.set('show_profiler', 0);
  }
  y += BUTTON_H;
  if (do_ui) {
    if (ui.buttonText({
      x, y, z,
      w: BUTTON_W, h: BUTTON_H, font_height: BUTTON_FONT_HEIGHT,
      text: paused ? 'Paused' : 'Running',
    })) {
      if (paused) {
        paused = false;
      } else {
        profilerPause();
      }
    }
  } else {
    font.drawSizedAligned(null, x, y, z, FONT_SIZE, font.ALIGN.HVCENTERFIT, BUTTON_W, BUTTON_H,
      paused ? 'Paused' : 'Running');
  }
  y += BUTTON_H;
  if (do_ui) {
    if (ui.buttonText({
      x, y, z,
      w: BUTTON_W, h: BUTTON_H, font_height: BUTTON_FONT_HEIGHT,
      text: PROFILER_RELATIVE_LABELS[settings.profiler_relative],
    })) {
      settings.set('profiler_relative', (settings.profiler_relative + 1) % 3);
    }
  } else {
    font.drawSizedAligned(null, x, y, z, FONT_SIZE, font.ALIGN.HVCENTERFIT, BUTTON_W, BUTTON_H,
      PROFILER_RELATIVE_LABELS[settings.profiler_relative]);
  }
  y += BUTTON_H;
  if (do_ui) {
    if (ui.buttonText({
      x, y, z,
      w: BUTTON_W, h: BUTTON_H, font_height: BUTTON_FONT_HEIGHT,
      text: settings.profiler_avg_percents ? 'average %' : 'frame %',
    })) {
      settings.set('profiler_avg_percents', 1 - settings.profiler_avg_percents);
    }
  } else {
    font.drawSizedAligned(null, x, y, z, FONT_SIZE, font.ALIGN.HVCENTERFIT, BUTTON_W, BUTTON_H,
      settings.profiler_avg_percents ? 'average %' : 'frame %');
  }
  y += BUTTON_H;
  ui.drawRect(x, 0, x + BUTTON_W, y, z-1, color_bar);

  y = 0;

  font.drawSizedAligned(style_header, COL_X[0], y, z, FONT_SIZE, font.ALIGN.HLEFT, COL_W[0], 0, COL_HEADERS[0]);
  font.drawSizedAligned(style_header, COL_X[1], y, z, FONT_SIZE, font.ALIGN.HCENTER, COL_W[1], 0, COL_HEADERS[1]);
  font.drawSizedAligned(style_header, COL_X[2], y, z, FONT_SIZE, font.ALIGN.HCENTER, COL_W[2], 0, COL_HEADERS[2]);
  font.drawSizedAligned(style_header, COL_X[3], y, z, FONT_SIZE, font.ALIGN.HCENTER, COL_W[3], 0, COL_HEADERS[3]);
  ui.drawRect(0, y, LINE_WIDTH, y + LINE_HEIGHT, z-1, color_bar_header);
  y += LINE_HEIGHT;

  let y0 = y;

  // first determine mouseover tree
  mouseover_main_elem = null;
  mouseover_bar_idx = -1;
  if (do_ui) {
    mouseover_elem = {};
    walkTree(profilerShowEntryEarly);
    if (mouseover_main_elem) {
      let xx = input.mousePos(mouse_pos)[0] - bar_x0;
      mouseover_bar_idx = floor(xx / bar_w);
      if (mouseover_bar_idx < 0 || mouseover_bar_idx >= HIST_SIZE) {
        mouseover_bar_idx = -1;
      }
    }
  }

  avg_percents = settings.profiler_avg_percents;
  show_index_count = (history_index - HIST_COMPONENTS + HIST_TOT) % HIST_TOT;

  if (mouseover_bar_idx !== -1) {
    // override avg_percents if the mouse is over a particular frame in the bar graph
    avg_percents = false;
    show_index_count = (show_index_count - (HIST_SIZE - mouseover_bar_idx - 1) * 2 + HIST_TOT) % HIST_TOT;
  }

  show_index_time = show_index_count + 1;

  if (avg_percents) {
    // use average for percents
    if (settings.profiler_relative === 0) {
      // "% of user"
      total_frame_time = 0;
      let walk = root.child;
      while (walk) {
        if (walk !== node_out_of_tick) {
          total_frame_time += avgTime(walk);
        }
        walk = walk.next;
      }
      total_frame_time = max(total_frame_time, 0.001);
    } else if (settings.profiler_relative === 2) {
      // "% of frame"
      total_frame_time = avgTime(root);
    }
  } else {
    // use last frame for percents
    if (settings.profiler_relative === 0) {
      // "% of user"
      total_frame_time = 0;
      let walk = root.child;
      while (walk) {
        if (walk !== node_out_of_tick) {
          total_frame_time += walk.history[show_index_time];
        }
        walk = walk.next;
      }
      total_frame_time = max(total_frame_time, 0.001);
    } else if (settings.profiler_relative === 2) {
      // "% of frame"
      total_frame_time = root.history[show_index_time];
    }
  }

  // then render / do UI
  y = y0;
  walkTree(profilerShowEntry);

  if (mouseover_bar_idx !== -1) {
    ui.drawRect(bar_x0 + mouseover_bar_idx * bar_w, y0,
      bar_x0 + (mouseover_bar_idx + 1) * bar_w, y, Z_GRAPH + 0.5,
      color_bar_highlight);
  }

  // consume mouseover regardless
  input.mouseOver({ x: 0, y: 0, w: LINE_WIDTH, h: y });

  doGraph();

  profilerStop('profilerUIRun');
}

export function profilerStartup() {
  ({ font } = ui);
}

export function profilerUI() {
  if (engine.DEBUG && input.keyUpEdge(input.KEYS.F7)) {
    profilerToggle();
  }
  if (settings.show_profiler) {
    profilerUIRun();
  }
  if (engine.DEBUG || settings.show_profiler) {
    // TODO: warn if more than some number of profiler calls per frame
  }
}
