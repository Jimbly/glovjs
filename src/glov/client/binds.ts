export const internal = {
  bindsTopOfFrame, // eslint-disable-line @typescript-eslint/no-use-before-define
};
export const BIND_FLAG_NOTEXT = 1<<0;
export const BIND_FLAG_NOKB = 1<<1;

// Anything on layers at this priority or higher gets executed automatically
// before ticking, so will be active in modal dialogs, etc.
// Anything below this gets executed when bindDispatch(0) or similar is called.
// This only apples to 'cmd'-type binds; action-type follow normal immediate mode
// norms.
export const BIND_LEVEL_PRETICK = 100;

import assert from 'assert';
import { Rec, TSMap } from 'glov/common/types';
import verify from 'glov/common/verify';
import { cmd_parse } from './cmds';
import {
  ANY,
  inputKeyIsText,
  keyDown,
  keyDownEdge,
  keyDownLastMod,
  KEYS,
  keyUpEdge,
  PAD,
  padButtonDown,
  padButtonDownEdge,
  padButtonUpEdge,
} from './input';
import { EventCallback } from './ui';

const { max } = Math;

export type BindType = 'key' | 'controller';
export type BindAction = 'action' | 'cmd';

export type ValidKey = keyof typeof KEYS;
export type ValidPad = keyof typeof PAD;


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
bindLayerRegister('nav', 50);

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
  layer: string;
  modifiers: number;
  action: BindAction;
  bindtype: BindType;
  code: number;
};
type BindList = {
  code: number;
  binds: Bind[];
};
let all_binds: Record<BindType, Rec<ValidKey|ValidPad, BindList>> = {
  key: {},
  controller: {},
};
let binds_by_cmd: Rec<string, Bind[]> = Object.create(null);

export type BindOpt<T> = {
  key: T;
  cmd: string;
  action: BindAction;
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

export function bindGeneric(entry: BindList, bindtype: BindType, opt: BindOpt<unknown>): void {
  let modifiers = opt.modifiers || 0;
  let layer = opt.layer || 'default';
  assert(layers[layer]);
  let bind: Bind = {
    cmd: opt.cmd,
    action: opt.action,
    modifiers,
    layer,
    bindtype,
    code: entry.code,
  };
  entry.binds.push(bind);
  entry.binds.sort(cmpLayerPriority);
  binds_by_cmd[bind.cmd] = binds_by_cmd[bind.cmd] || [];
  binds_by_cmd[bind.cmd]!.push(bind);
}

export function bindKB(opt: BindOpt<ValidKey>): void {
  let entry = all_binds.key[opt.key];
  if (!entry) {
    entry = all_binds.key[opt.key] = { code: KEYS[opt.key], binds: [] };
  }
  bindGeneric(entry, 'key', opt);
}

export function bindPad(opt: BindOpt<ValidPad>): void {
  let entry = all_binds.controller[opt.key];
  if (!entry) {
    entry = all_binds.controller[opt.key] = { code: PAD[opt.key], binds: [] };
  }
  bindGeneric(entry, 'controller', opt);
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
  let base_list = all_binds[bindtype];
  let entry = base_list[opt.key];
  if (!entry) {
    return [];
  }
  let ret: string[] = [];
  entry.binds = entry.binds.filter(function (bind) {
    if (bind.modifiers !== opt.modifiers) {
      return true;
    }
    if (opt.layer && bind.layer !== opt.layer) {
      return true;
    }
    if (opt.cmd && bind.cmd !== opt.cmd) {
      return true;
    }
    let arr = binds_by_cmd[bind.cmd];
    assert(arr);
    let idx = arr.indexOf(bind);
    assert(idx !== -1);
    arr.splice(idx, 1);
    if (!arr.length) {
      delete binds_by_cmd[bind.cmd];
    }
    ret.push(`${bind.layer !== 'default' ? `${bind.layer}.` : ''}${bind.cmd}`);
    return false;
  });
  if (!entry.binds.length) {
    delete base_list[opt.key];
  }
  return ret;
}

const bind_set = [{
  bindtype: 'key' as const,
  downEdge: keyDownEdge,
  downEdgeLastMod: keyDownLastMod,
  down: keyDown,
  upEdge: keyUpEdge,
}, {
  bindtype: 'controller' as const,
  downEdge: function (code: number, opts?: { peek?: boolean; mod?: number }) {
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

export type BindExport = Omit<Bind, 'code'> & {
  key: ValidPad | ValidKey;
};
export function bindExport(): BindExport[] {
  let ret: BindExport[] = [];
  bind_set.forEach(function (set) {
    let list = all_binds[set.bindtype];
    for (let key in list) {
      let key2 = key as keyof typeof list;
      let bindlist = list[key2]!;
      for (let ii = 0; ii < bindlist.binds.length; ++ii) {
        let bind = bindlist.binds[ii];
        ret.push({
          ...bind,
          key: key2,
        });
      }
    }
  });
  return ret;
}

export type ActionOpts = {
  in_event_cb?: EventCallback | null; // for clicks and key presses
  peek?: boolean;
  flags?: number; // BIND_FLAG_NOKB, etc
};

type KeyCheckOpts = { // TypeScript: move this to input.ts once converted
  mod?: number;
  in_event_cb?: EventCallback | null; // for clicks and key presses
  peek?: boolean;
};
export function bindDownEdge(action: string, opts?: ActionOpts | null): number {
  let arr = binds_by_cmd[action];
  if (!arr) {
    return 0;
  }
  let ret = 0;
  for (let ii = 0; ii < arr.length; ++ii) {
    let bind = arr[ii];
    if (!layers[bind.layer]!.active) {
      continue;
    }
    verify(bind.action === 'action'); // probably doesn't make sense to query for cmd-type binds?
    if (bind.bindtype === 'key') {
      if (opts && opts.flags) {
        if (opts.flags & BIND_FLAG_NOKB) {
          continue;
        }
        if (opts.flags & BIND_FLAG_NOTEXT) {
          if (inputKeyIsText(bind.code)) {
            continue;
          }
        }
      }
      let eff_opts: KeyCheckOpts | null | undefined;
      if (bind.modifiers) {
        if (opts) {
          eff_opts = {
            ...opts,
            mod: bind.modifiers,
          };
        } else {
          eff_opts = {
            mod: bind.modifiers,
          };
        }
      } else {
        eff_opts = opts;
      }
      ret += keyDownEdge(bind.code, eff_opts);
    } else {
      ret += padButtonDownEdge(bind.code, ANY, opts);
    }
  }
  return ret;
}
// export function bindUpEdge(action: string, opts?: ActionOpts | null): number {
//   // TODO, maybe
// }
export function bindDown(action: string): number {
  let arr = binds_by_cmd[action];
  if (!arr) {
    return 0;
  }
  let ret = 0;
  for (let ii = 0; ii < arr.length; ++ii) {
    let bind = arr[ii];
    if (!layers[bind.layer]!.active) {
      continue;
    }
    verify(bind.action === 'action'); // probably doesn't make sense to query for cmd-type binds?
    if (bind.bindtype === 'key') {
      let eff_opts: KeyCheckOpts | null | undefined;
      if (bind.modifiers) {
        eff_opts = {
          mod: bind.modifiers,
        };
      }
      ret = max(ret, keyDown(bind.code, eff_opts));
    } else {
      ret = max(ret, padButtonDown(bind.code, ANY));
    }
  }
  return ret;
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

  for (let jj = 0; jj < bind_set.length; ++jj) {
    let set = bind_set[jj];
    let list = all_binds[set.bindtype];
    for (let key in list) {
      let bindlist = list[key as keyof typeof list]!;
      for (let ii = 0; ii < bindlist.binds.length; ++ii) {
        let bind = bindlist.binds[ii];
        if (bind.action === 'cmd' && layers[bind.layer]!.priority >= level) {
          if (set.downEdge(bindlist.code, {
            mod: bind.modifiers,
          })) {
            handler(bind.cmd);
          }
        }
      }
    }
  }
}

function bindsTopOfFrame(): void {
  bindDispatch({
    level: BIND_LEVEL_PRETICK,
  });
}
