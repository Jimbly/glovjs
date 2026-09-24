export const BIND_EVENT_DOWN = 1<<0;
export const BIND_EVENT_UP = 1<<1;
export const BIND_EVENT_TIME = 1<<2;
export const BIND_EVENT_WITH_PARAMS = 1<<3;
export const BIND_EVENT_DOWNUP = BIND_EVENT_DOWN | BIND_EVENT_UP | BIND_EVENT_WITH_PARAMS;
export const BIND_EVENT_ALL = BIND_EVENT_DOWNUP | BIND_EVENT_TIME | BIND_EVENT_WITH_PARAMS;

// Anything on layers at this priority or higher gets executed automatically
// before ticking, so will be active in modal dialogs, etc.
// Anything below this gets executed when bindDispatch(0) or similar is called.
export const BIND_LEVEL_PRETICK = 100;

import assert from 'assert';
import { Rec, TSMap } from 'glov/common/types';
import { empty } from 'glov/common/util';
import { cmd_parse } from './cmds';
import {
  ANY,
  keyDown,
  keyDownEdge,
  keyDownLastMod,
  KEYS,
  keyUpEdge,
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
  PAD,
  padButtonDown,
  padButtonDownEdge,
  padButtonUpEdge,
} from './input';
import { EventCallback } from './ui';

const { max } = Math;

export type BindType = 'key' | 'controller';

export type ValidKey = keyof typeof KEYS;
export type ValidPad = keyof typeof PAD;
export type BindEvents =
  // in theory, any bitmask allowed, but probably only these two are useful
  typeof BIND_EVENT_DOWN |
  typeof BIND_EVENT_DOWNUP |
  typeof BIND_EVENT_ALL;


let layers: TSMap<{
  active: boolean;
  active_user: boolean;
  trickle: boolean;
  priority: number;
}> = {};
function layersUpdateActive(): void {
  let min_priority = -Infinity;
  for (let layer_name in layers) {
    let layer = layers[layer_name]!;
    if (!layer.trickle) {
      min_priority = max(min_priority, layer.priority);
    }
  }
  for (let layer_name in layers) {
    let layer = layers[layer_name]!;
    layer.active = layer.active_user && layer.priority >= min_priority;
  }
}
export function bindLayerRegister(layer_name: string, priority: number): void {
  assert(!layers[layer_name]);
  layers[layer_name] = {
    active: true,
    active_user: true,
    trickle: true,
    priority,
  };
  layersUpdateActive();
}
bindLayerRegister('default', 10);
bindLayerRegister('nav', 110); // anything above this is active even in modal dialogs, etc

export function bindLayerSet(layer_name: string, active: boolean): void {
  assert(layers[layer_name]);
  layers[layer_name].active_user = active;
  layersUpdateActive();
}

// if trickle is disabled, all layers with lower priority are disabled
export function bindLayerTrickle(layer_name: string, trickle: boolean): void {
  assert(layers[layer_name]);
  layers[layer_name].trickle = trickle;
  layersUpdateActive();
}


type Bind = {
  cmd: string;
  events: BindEvents;
  layer: string;
};
type DownState = {
  mod: number; // The active set of modifiers when the down event fired
  layer: string; // The layer on which the down event fired (no time/up events on other layers will fire)
};
type BindList = {
  code: number;
  list_by_mod: Rec<number, Bind[]>;
  down: DownState[]; // If a bind responded to the down event, under what circumstances, one for each down event
};
let kb_binds: Rec<ValidKey, BindList> = {};
let pad_binds: Rec<ValidPad, BindList> = {};

export type BindOpt<T> = {
  key: T;
  cmd: string;
  events: BindEvents;
  modifiers?: number;
  // layer behavior:
  //   layers can be enabled/disabled
  //   multiple bindings to the same key on the same layer both fire
  //   a binding to the same key on multiple layers only fires the higher priority one
  //     this currently respects modifiers (e.g. priority-0 Shift+S will fire even if
  //     there's a priority-1 S), however this is probably not desired (maybe never comes up?)
  layer?: string;
};

function cmpLayerPriority(a: Bind, b: Bind): number {
  return layers[b.layer]!.priority - layers[a.layer]!.priority;
}

export function bindGeneric(entry: BindList, opt: BindOpt<unknown>): void {
  let mod = opt.modifiers || 0;
  let arr = entry.list_by_mod[mod] = entry.list_by_mod[mod] || [];
  let layer = opt.layer || 'default';
  assert(layers[layer]);
  arr.push({
    cmd: opt.cmd,
    events: opt.events,
    layer,
  });
  arr.sort(cmpLayerPriority);
}

export function bindKB(opt: BindOpt<ValidKey>): void {
  let entry = kb_binds[opt.key];
  if (!entry) {
    entry = kb_binds[opt.key] = { code: KEYS[opt.key], list_by_mod: {}, down: [] };
  }
  bindGeneric(entry, opt);
}

export function bindPad(opt: BindOpt<ValidPad>): void {
  let entry = pad_binds[opt.key];
  if (!entry) {
    entry = pad_binds[opt.key] = { code: PAD[opt.key], list_by_mod: {}, down: [] };
  }
  bindGeneric(entry, opt);
}

// Slightly less type-safe generic interface
export function bindBind(bindtype: BindType, opt: BindOpt<ValidKey | ValidPad>): void {
  if (bindtype === 'key') {
    bindKB(opt as BindOpt<ValidKey>);
  } else {
    bindPad(opt as BindOpt<ValidPad>);
  }
}

export function bindUnbind(bindtype: BindType, opt: Partial<BindOpt<ValidKey | ValidPad>>): string[] {
  assert(opt.key); // required parameter
  assert(opt.modifiers !== undefined); // required parameter
  let base_list: Rec<string, BindList>;
  if (bindtype === 'key') {
    base_list = kb_binds;
  } else {
    base_list = pad_binds;
  }
  let entry = base_list[opt.key];
  if (!entry) {
    return [];
  }
  let list = entry.list_by_mod[opt.modifiers];
  if (!list) {
    return [];
  }
  let ret: string[] = [];
  list = list.filter(function (bind) {
    if (opt.layer && bind.layer !== opt.layer) {
      return true;
    }
    if (opt.cmd && bind.cmd !== opt.cmd) {
      return true;
    }
    ret.push(`${bind.layer !== 'default' ? `${bind.layer}.` : ''}${bind.cmd}`);
    return false;
  });
  if (!list.length) {
    delete entry.list_by_mod[opt.modifiers];
  }
  if (empty(entry.list_by_mod)) {
    delete base_list[opt.key];
  }
  return ret;
}

const bind_set = [{
  bindtype: 'key' as const,
  list: kb_binds,
  downEdge: keyDownEdge,
  downEdgeLastMod: keyDownLastMod,
  down: keyDown,
  upEdge: keyUpEdge,
}, {
  bindtype: 'controller' as const,
  list: pad_binds,
  downEdge: function (code: number, opts?: { peek?: boolean }) {
    return padButtonDownEdge(code, ANY, opts);
  },
  downEdgeLastMod: function () {
    return 0;
  },
  down: function (code: number, opts?: { peek?: boolean }) {
    return padButtonDown(code, ANY, opts);
  },
  upEdge: function (code: number, opts?: { peek?: boolean }) {
    return padButtonUpEdge(code, ANY, opts);
  },
}];

let in_event_cbs: TSMap<EventCallback> = {};

export function bindInEventCB(cmd: string, in_event_cb: EventCallback): void {
  in_event_cbs[cmd] = in_event_cb;
}


export type BindExport = Bind & {
  key: ValidPad | ValidKey;
  modifiers: number;
  bindtype: 'key' | 'controller';
};
export function bindExport(): BindExport[] {
  let ret: BindExport[] = [];
  bind_set.forEach(function (set) {
    const { bindtype, list } = set;
    for (let key in list) {
      let key2 = key as keyof typeof list;
      let bindlist = list[key2]!;
      for (let mod in bindlist.list_by_mod) {
        let modifiers = Number(mod);
        let sublist = bindlist.list_by_mod[mod]!;
        for (let ii = 0; ii < sublist.length; ++ii) {
          let bind = sublist[ii];
          ret.push({
            bindtype,
            key: key2,
            cmd: bind.cmd,
            modifiers,
            events: bind.events,
            layer: bind.layer,
          });
        }
      }
    }
  });
  return ret;
}

// We're peeking all checks because we have default binds on all of the keys
// that apps maybe currently querying with the input API
const PEEK = { peek: true };

type QueuedCmd = {
  level: number;
  cmd: string;
};
let cmd_queue: QueuedCmd[] = [];

function handleUp(bindlist: BindList): void {
  assert(bindlist.down.length);
  let down_state = bindlist.down.shift()!;
  let list = bindlist.list_by_mod[down_state.mod];
  if (list) {
    for (let ii = 0; ii < list.length; ++ii) {
      let bind = list[ii];
      if (bind.layer === down_state.layer) {
        if (bind.events & BIND_EVENT_UP) {
          cmd_queue.push({
            // up events must always be delivered if the down was delivered
            // TODO: maybe only bump the level if we know the down was delivered?
            level: Infinity,
            cmd: (bind.events & BIND_EVENT_WITH_PARAMS) ? `${bind.cmd} up` : bind.cmd,
          });
        }
      }
    }
  }
}

function handleDown(bindlist: BindList, mod_list: number[]): void {
  let handled = false;
  for (let kk = 0; kk < mod_list.length; ++kk) {
    let mod = mod_list[kk];
    let list = bindlist.list_by_mod[mod];
    if (!list) {
      continue;
    }
    let execute_layer: string | undefined;
    for (let ii = 0; ii < list.length; ++ii) {
      let bind = list[ii];
      if (execute_layer && bind.layer !== execute_layer) {
        break;
      }
      if (!layers[bind.layer]!.active) {
        continue;
      }
      execute_layer = bind.layer;
      if (bind.events & BIND_EVENT_DOWN) {
        cmd_queue.push({
          level: layers[bind.layer]!.priority,
          cmd: (bind.events & BIND_EVENT_WITH_PARAMS) ? `${bind.cmd} down` : bind.cmd,
        });
      }
    }
    if (!execute_layer) {
      // didn't actually find an active bind (must have been a disabled layer), keep searching
      continue;
    }
    bindlist.down.push({
      mod,
      layer: execute_layer,
    });
    handled = true;
    // if we, e.g., hit Shift+W, do not continue and fire unmodified W
    break;
  }
  if (!handled) {
    // no bind matched (e.g. there was only a bind for Shift+W)
    // still record the down state so we don't accidentally release the wrong one
    bindlist.down.push({
      mod: 0,
      layer: '.none',
    });
  }
}

const MODIFIERS = [
  MOD_SHIFT,
  MOD_CTRL,
  MOD_ALT,
] as const;
let mod_list_cache: Rec<number, number[]> = {};
function modListFromMod(mod: number): number[] {
  let entry = mod_list_cache[mod];
  if (entry) {
    return entry;
  }

  let mod_list = [0];
  for (let ii = 0; ii < MODIFIERS.length; ++ii) {
    // TODO: we can pull the modifiers off of the actual event instead for better reliability
    if (mod & MODIFIERS[ii]) {
      let len = mod_list.length;
      for (let jj = 0; jj < len; ++jj) {
        mod_list.push(mod_list[jj] | MODIFIERS[ii]);
      }
    }
  }
  mod_list.reverse();
  mod_list_cache[mod] = mod_list;
  return mod_list;
}

export function defaultHandle(cmd: string): void {
  cmd_parse.handle(undefined, cmd);
}

export function bindDispatch(opt?: {
  level?: number;
  handler?: (cmd: string) => void;
}): void {
  opt = opt || {};
  let level = opt.level ?? 0;
  let handler = opt.handler || defaultHandle;
  cmd_queue = cmd_queue.filter(function (entry) {
    if (entry.level >= level) {
      handler(entry.cmd);
      return false;
    }
    return true;
  });
}

export function bindEatAll(): void {
  cmd_queue.length = 0;
}

export function bindsCheck(): void {
  cmd_queue.length = 0;

  let base_mod = (keyDown(KEYS.SHIFT) ? MOD_SHIFT : 0) |
    (keyDown(KEYS.CTRL) ? MOD_CTRL : 0) |
    (keyDown(KEYS.ALT) ? MOD_ALT : 0);
  let base_mod_list = modListFromMod(base_mod);
  for (let jj = 0; jj < bind_set.length; ++jj) {
    let set = bind_set[jj];
    for (let key in set.list) {
      let bindlist = set.list[key as keyof typeof set.list]!;

      // check if any of the binds for the current mod need an in_event_cb
      let in_event_cb: EventCallback | undefined;
      for (let kk = 0; kk < base_mod_list.length; ++kk) {
        let mod = base_mod_list[kk];
        let list = bindlist.list_by_mod[mod];
        if (list) {
          for (let ii = 0; ii < list.length; ++ii) {
            let bind = list[ii];
            if (in_event_cbs[bind.cmd]) {
              if (layers[bind.layer]!.active) {
                in_event_cb = in_event_cbs[bind.cmd];
              }
            }
          }
        }
      }
      let param = in_event_cb ? {
        peek: true,
        in_event_cb,
      } : PEEK;

      let up_edge = set.upEdge(bindlist.code, param);
      let down_edge = set.downEdge(bindlist.code, param);
      let down_mod = down_edge ? set.downEdgeLastMod() : 0;
      let mod_list = modListFromMod(down_mod);

      // if required, first release any held down events from previous frames
      while (up_edge && bindlist.down.length) {
        --up_edge;
        handleUp(bindlist);
      }

      while (down_edge) {
        --down_edge;
        handleDown(bindlist, mod_list);
      }

      if (bindlist.down.length) {
        let down_state = bindlist.down[bindlist.down.length - 1];
        let down_time = set.down(bindlist.code);
        if (down_time) {
          let list = bindlist.list_by_mod[down_state.mod];
          if (list) {
            for (let ii = 0; ii < list.length; ++ii) {
              let bind = list[ii];
              if (bind.layer === down_state.layer) {
                if (bind.events & BIND_EVENT_TIME) {
                  cmd_queue.push({
                    level: layers[bind.layer]!.priority,
                    cmd: (bind.events & BIND_EVENT_WITH_PARAMS) ? `${bind.cmd} time ${down_time}` : bind.cmd,
                  });
                }
              }
            }
          }
        }
      }

      // if required, release any downs that were generated this frame
      while (up_edge && bindlist.down.length) {
        --up_edge;
        handleUp(bindlist);
      }
    }
  }
  if (!empty(in_event_cbs)) {
    in_event_cbs = {};
  }

  bindDispatch({
    level: BIND_LEVEL_PRETICK,
  });
}
