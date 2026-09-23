export const BIND_EVENT_DOWN = 1<<0;
export const BIND_EVENT_UP = 1<<1;
export const BIND_EVENT_TIME = 1<<2;
export const BIND_EVENT_DOWNUP = BIND_EVENT_DOWN | BIND_EVENT_UP;
export const BIND_EVENT_ALL = BIND_EVENT_DOWNUP | BIND_EVENT_TIME;

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

export type ValidKey = keyof typeof KEYS;
export type ValidPad = keyof typeof PAD;
export type BindEvents =
  // in theory, any bitmask allowed, but probably only these two are useful
  typeof BIND_EVENT_DOWN |
  typeof BIND_EVENT_DOWNUP |
  typeof BIND_EVENT_ALL;


let layers: TSMap<{
  active: boolean;
  priority: number;
}> = {};
export function bindLayerRegister(layer_name: string, priority: number): void {
  assert(!layers[layer_name]);
  layers[layer_name] = {
    active: true,
    priority,
  };
}
bindLayerRegister('default', 10);

export function bindLayerSet(layer_name: string, active: boolean): void {
  assert(layers[layer_name]);
  layers[layer_name].active = active;
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

const bind_set = [{
  list: kb_binds,
  downEdge: keyDownEdge,
  downEdgeLastMod: keyDownLastMod,
  down: keyDown,
  upEdge: keyUpEdge,
}, {
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


// We're peeking all checks because we have default binds on all of the keys
// that apps maybe currently querying with the input API
const PEEK = { peek: true };

function handleUp(bindlist: BindList): void {
  assert(bindlist.down.length);
  let down_state = bindlist.down.shift()!;
  let list = bindlist.list_by_mod[down_state.mod];
  if (list) {
    for (let ii = 0; ii < list.length; ++ii) {
      let bind = list[ii];
      if (bind.layer === down_state.layer) {
        if (bind.events & BIND_EVENT_UP) {
          cmd_parse.handle(undefined, `${bind.cmd} up`);
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
        cmd_parse.handle(undefined, `${bind.cmd} down`);
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

export function bindsCheck(): void {
  // TODO: allow overriding cmd_parse.handle with chatUI.cmdParse for binding to
  //   network actions and access level checks?

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
                  cmd_parse.handle(undefined, `${bind.cmd} time ${down_time}`);
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
}
