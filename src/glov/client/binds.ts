export const BIND_SHIFT = 1<<0;
export const BIND_CTRL = 1<<1;
export const BIND_ALT = 1<<2;

import { Rec } from 'glov/common/types';
import { cmd_parse } from './cmds';
import {
  keyDown,
  keyDownEdge,
  KEYS,
  keyUpEdge,
  PAD,
  padButtonDownEdge,
  padButtonUpEdge,
} from './input';

export type ValidKey = keyof typeof KEYS;
export type ValidPad = keyof typeof PAD;
export type BindMode = 'hold' | 'fire';

type Bind = {
  cmd: string;
  mode: BindMode;
};
type BindList = {
  code: number;
  list_by_mod: Rec<number, Bind[]>;
  down_mod: number; // The active set of modifiers when the down event fired
};
let kb_binds: Rec<ValidKey, BindList> = {};
let pad_binds: Rec<ValidPad, BindList> = {};

export type BindOpt<T> = {
  key: T;
  cmd: string;
  mode: BindMode;
  modifiers?: number;
};

export function bindKB(opt: BindOpt<ValidKey>): void {
  let mod = opt.modifiers || 0;
  let entry = kb_binds[opt.key];
  if (!entry) {
    entry = kb_binds[opt.key] = { code: KEYS[opt.key], list_by_mod: {}, down_mod: 0 };
  }
  let arr = entry.list_by_mod[mod] = entry.list_by_mod[mod] || [];
  arr.push({
    cmd: opt.cmd,
    mode: opt.mode,
  });
}

export function bindPad(opt: BindOpt<ValidPad>): void {
  let mod = opt.modifiers || 0;
  let entry = pad_binds[opt.key];
  if (!entry) {
    entry = pad_binds[opt.key] = { code: PAD[opt.key], list_by_mod: {}, down_mod: 0 };
  }
  let arr = entry.list_by_mod[mod] = entry.list_by_mod[mod] || [];
  arr.push({
    cmd: opt.cmd,
    mode: opt.mode,
  });
}

const bind_set = [{
  list: kb_binds,
  downEdge: keyDownEdge,
  upEdge: keyUpEdge,
}, {
  list: pad_binds,
  downEdge: padButtonDownEdge,
  upEdge: padButtonUpEdge,
}];

// We're peeking all checks because we have default binds on all of the keys
// that apps maybe currently querying with the input API
const PEEK = { peek: true };

const MODIFIERS = [
  [KEYS.SHIFT, BIND_SHIFT],
  [KEYS.CTRL, BIND_CTRL],
  [KEYS.ALT, BIND_ALT],
] as const;

export function bindsCheck(): void {
  // TODO: allow overriding cmd_parse.handle with chatUI.cmdParse for binding to
  //   network actions and access level checks?

  let mod_list = [0];
  for (let ii = 0; ii < MODIFIERS.length; ++ii) {
    // TODO: we can pull the modifiers off of the actual event instead for better reliability
    if (keyDown(MODIFIERS[ii][0])) {
      let len = mod_list.length;
      for (let jj = 0; jj < len; ++jj) {
        mod_list.push(mod_list[jj] | MODIFIERS[ii][1]);
      }
    }
  }
  mod_list.reverse();
  for (let jj = 0; jj < bind_set.length; ++jj) {
    let set = bind_set[jj];
    for (let key in set.list) {
      let bindlist = set.list[key as keyof typeof set.list]!;
      if (set.downEdge(bindlist.code, PEEK)) {
        for (let kk = 0; kk < mod_list.length; ++kk) {
          let mod = mod_list[kk];
          let list = bindlist.list_by_mod[mod];
          if (!list) {
            continue;
          }
          for (let ii = 0; ii < list.length; ++ii) {
            let bind = list[ii];
            if (bind.mode === 'hold') {
              cmd_parse.handle(undefined, `${bind.cmd} 1`);
            } else {
              cmd_parse.handle(undefined, bind.cmd);
            }
          }
          bindlist.down_mod = mod;
          // if we, e.g., hit Shift+W, do not continue and fire unmodified W
          break;
        }
      }
      if (set.upEdge(bindlist.code, PEEK)) {
        let list = bindlist.list_by_mod[bindlist.down_mod];
        if (list) {
          for (let ii = 0; ii < list.length; ++ii) {
            let bind = list[ii];
            if (bind.mode === 'hold') {
              cmd_parse.handle(undefined, `${bind.cmd} 0`);
            }
          }
        }
      }
    }
  }
}
