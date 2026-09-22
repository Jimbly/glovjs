import { Rec } from 'glov/common/types';
import { cmd_parse } from './cmds';
import {
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
  list: Bind[];
};
let kb_binds: Rec<ValidKey, BindList> = {};
let pad_binds: Rec<ValidPad, BindList> = {};

export function bindKB(key: keyof typeof KEYS, cmd: string, mode: BindMode): void {
  kb_binds[key] = kb_binds[key] || { code: KEYS[key], list: [] };
  kb_binds[key].list.push({
    cmd,
    mode,
  });
}

export function bindPad(pad: keyof typeof PAD, cmd: string, mode: BindMode): void {
  pad_binds[pad] = pad_binds[pad] || { code: PAD[pad], list: [] };
  pad_binds[pad].list.push({
    cmd,
    mode,
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

export function bindsCheck(): void {
  // TODO: allow overriding cmd_parse.handle with chatUI.cmdParse for binding to
  //   network actions and access level checks?
  for (let jj = 0; jj < bind_set.length; ++jj) {
    let set = bind_set[jj];
    for (let key in set.list) {
      let bindlist = set.list[key as keyof typeof set.list]!;
      if (set.downEdge(bindlist.code)) {
        for (let ii = 0; ii < bindlist.list.length; ++ii) {
          let bind = bindlist.list[ii];
          if (bind.mode === 'hold') {
            cmd_parse.handle(undefined, `${bind.cmd} 1`);
          } else {
            cmd_parse.handle(undefined, bind.cmd);
          }
        }
      }
      if (set.upEdge(bindlist.code)) {
        for (let ii = 0; ii < bindlist.list.length; ++ii) {
          let bind = bindlist.list[ii];
          if (bind.mode === 'hold') {
            cmd_parse.handle(undefined, `${bind.cmd} 0`);
          }
        }
      }
    }
  }
}
