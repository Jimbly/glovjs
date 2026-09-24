import assert from 'assert';
import { CmdRespFunc } from 'glov/common/cmd_parse';
import { Optional, TSMap } from 'glov/common/types';
import { capitalize, identity, plural } from 'glov/common/util';
import { actionExists } from './actions';
import {
  BIND_EVENT_ALL,
  BIND_EVENT_DOWN,
  bindBind,
  BindExport,
  bindExport,
  BindType,
  bindUnbind,
  ValidKey,
  ValidPad,
} from './binds';
import { cmd_parse } from './cmds';
import { inputValidKeyName, inputValidPadName, KEYS } from './input';
import {
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
} from './input_constants';
import { localStorageGetJSON, localStorageSetJSON } from './local_storage';
import { copyTextToClipboard } from './ui';

type UserBinds = {
  unbinds?: string[];
  binds?: string[];
};
let user_binds: UserBinds;
let base_binds: string[];

type UserBindParam = {
  modifiers: number;
  layer: string|undefined;
  cmd: string;
  bindtype: BindType;
  key: ValidKey |ValidPad;
};

let persist_binds = false;

const MOD_LOOKUP: TSMap<number> = {
  shift: MOD_SHIFT,
  alt: MOD_ALT,
  ctrl: MOD_CTRL,
};
function modToString(modifiers: number): string {
  let ret = [];
  for (let key in MOD_LOOKUP) {
    let v = MOD_LOOKUP[key]!;
    if (modifiers & v) {
      ret.push(`${capitalize(key)}+`);
    }
  }
  return ret.join('');
}

function bindToString(bind: Omit<BindExport, 'events'> | Optional<UserBindParam, 'layer'>): string {
  return `${modToString(bind.modifiers).toLowerCase()}${bind.bindtype.toLowerCase()}` +
    `${String(bind.key).toLowerCase()}` +
    ` ${bind.layer && bind.layer !== 'default' ?`${bind.layer}.`:''}${bind.cmd}`;
}

function modNamesToNumber(modnames: string | undefined): number {
  let modifiers = 0;
  if (modnames) {
    modnames.split('+').filter(identity).forEach(function (part) {
      assert(MOD_LOOKUP[part]);
      modifiers |= MOD_LOOKUP[part];
    });
  }
  return modifiers;
}

function defaultLayer(cmd: string): string {
  let suffix = `.${cmd}`;
  for (let ii = 0; ii < base_binds.length; ++ii) {
    let str = base_binds[ii];
    if (str.endsWith(suffix)) {
      let tail = str.slice(0, -(cmd.length + 1));
      let idx = tail.lastIndexOf(' ');
      assert(idx > 0);
      tail = tail.slice(idx + 1);
      return tail;
    }
  }
  return 'default';
}

function addUserBind(param: UserBindParam): void {
  const { bindtype, key, modifiers, cmd } = param;
  let { layer } = param;
  let events = BIND_EVENT_DOWN;
  if (actionExists(cmd)) {
    events = BIND_EVENT_ALL;
  }
  if (!layer) {
    layer = defaultLayer(cmd);
    if (layer === 'nav' && bindtype === 'key') {
      let keycode = KEYS[key as ValidKey];
      if (keycode && keycode >= KEYS['0'] && keycode <= KEYS.NUMPAD_DIVIDE) {
        // a nav key, but overlaps edit box keys, put into navext
        layer = 'navext';
      }
    }
    param.layer = layer;
  }
  if (persist_binds) {
    let str = bindToString(param);
    //first: check if we can restore a base bind that's unbound
    if (user_binds.unbinds && user_binds.unbinds.includes(str)) {
      user_binds.unbinds = user_binds.unbinds.filter((unbind) => unbind !== str);
    } else {
      user_binds.binds = user_binds.binds || [];
      user_binds.binds.push(str);
    }
    localStorageSetJSON<UserBinds>('binds', user_binds);
  }
  bindBind(bindtype, {
    key,
    cmd,
    modifiers,
    events,
    layer,
  });
}

function unbindSub(opt: {
  bindtype: BindType;
  key: ValidKey | ValidPad;
  modifiers: number;
  layer?: string;
  cmd?: string;
}): string | string[] {
  let results = bindUnbind(opt.bindtype, opt);

  if (persist_binds) {
    let diff = false;
    for (let ii = 0; ii < results.length; ++ii) {
      let cmd2 = results[ii];
      let layer = opt.layer;
      let m = cmd2.match(/^([^ ]+)\.(.+)$/);
      if (m) {
        layer = m[1];
        cmd2 = m[2];
      }
      let full_bind = bindToString({
        ...opt,
        layer,
        cmd: cmd2,
      });
      if (user_binds.binds) {
        let idx;
        while ((idx = user_binds.binds.indexOf(full_bind)) !== -1) {
          user_binds.binds.splice(idx, 1);
          diff = true;
        }
      }
      if (base_binds.includes(full_bind)) {
        user_binds.unbinds = user_binds.unbinds || [];
        if (!user_binds.unbinds.includes(full_bind)) {
          user_binds.unbinds.push(full_bind);
          diff = true;
        }
      }
    }
    if (diff) {
      localStorageSetJSON<UserBinds>('binds', user_binds);
    }
  }

  return results;
}

const bind_param_regex = /^(?:([^ .]+)\.)?(.+)?$/i;
const bind_key_regex = /^((?:(?:Shift|Ctrl|Alt)\+)+)?(Key|Controller)([a-z0-9]+)$/i;

const split_opt_regex = /^([^ ]+)(?: (.+))?$/;
function unbindFromString(param: string): string | string[] {
  let m1 = param.match(split_opt_regex);
  if (!m1) {
    return 'Error parsing arguments';
  }
  let m2 = m1[1].match(bind_key_regex);
  if (!m2) {
    return 'Error parsing 1st argument';
  }
  let modnames = m2[1] as string | undefined;
  let bindtype = m2[2].toLowerCase() as BindType;
  let key = m2[3].toUpperCase();
  let layer: string | undefined;
  let cmd: string | undefined;
  if (m1[2]) {
    let m3 = m1[2].match(bind_param_regex);
    if (!m3) {
      return 'Error parsing 2nd argument';
    }
    layer = m3[1] as string | undefined;
    cmd = m3[2] as string;
  }
  let modifiers = modNamesToNumber(modnames);

  let validkey: ValidKey | ValidPad;
  if (bindtype === 'key') {
    if (!inputValidKeyName(key)) {
      return `Unknown key "${key}"`;
    }
    validkey = key as ValidKey; // TypeScript TODO: inputValidKeyName should handle this coercion
  } else {
    if (!inputValidPadName(key)) {
      return `Unknown controller button "${key}"`;
    }
    validkey = key as ValidPad; // TypeScript TODO: inputValidKeyName should handle this coercion
  }

  return unbindSub({
    bindtype,
    key: validkey,
    modifiers,
    layer,
    cmd,
  });
}

const split_regex = /^([^ ]+) (.+)$/;
function addBindFromString(param: string, auto_unbind: boolean): string | null {
  let m1 = param.match(split_regex);
  if (!m1) {
    return 'Expected 2 arguments';
  }
  let m2 = m1[1].match(bind_key_regex);
  if (!m2) {
    return 'Error parsing 1st argument';
  }
  let m3 = m1[2].match(bind_param_regex);
  if (!m3) {
    return 'Error parsing 2nd argument';
  }
  let modnames = m2[1] as string | undefined;
  let bindtype = m2[2].toLowerCase() as BindType;
  let key = m2[3].toUpperCase();
  let layer = m3[1] as string | undefined;
  let cmd = m3[2] as string;

  let modifiers = modNamesToNumber(modnames);

  let validkey: ValidKey | ValidPad;
  if (bindtype === 'key') {
    if (!inputValidKeyName(key)) {
      return `Unknown key "${key}"`;
    }
    validkey = key as ValidKey; // TypeScript TODO: inputValidKeyName should handle this coercion
  } else {
    if (!inputValidPadName(key)) {
      return `Unknown controller button "${key}"`;
    }
    validkey = key as ValidPad; // TypeScript TODO: inputValidKeyName should handle this coercion
  }
  if (auto_unbind) {
    unbindSub({
      bindtype,
      modifiers,
      key: validkey,
      layer,
      // no cmd, unbind any matching key on this layer
    });
  }
  addUserBind({
    bindtype,
    modifiers,
    key: validkey,
    layer,
    cmd,
  });
  return null;
}
const BIND_USAGE = 'Usage: /bind [Mod+]KeyX|ControllerX [layer.]command';
cmd_parse.register({
  cmd: 'bind',
  help: 'Binds a key or button to a command',
  prefix_usage_with_help: true,
  usage: BIND_USAGE,
  func: function (param: string, resp_func: CmdRespFunc): void {
    let err = addBindFromString(param, true);
    if (err) {
      resp_func(`${err}\n${BIND_USAGE}`);
    } else {
      resp_func();
    }
  }
});

const UNBIND_USAGE = 'Usage: /unbind [Mod+]KeyX|ControllerX [[layer.]command]';
cmd_parse.register({
  cmd: 'unbind',
  help: 'Unbinds a key or button',
  prefix_usage_with_help: true,
  usage: UNBIND_USAGE,
  func: function (param: string, resp_func: CmdRespFunc): void {
    let err_or_res = unbindFromString(param);
    if (Array.isArray(err_or_res)) {
      if (!err_or_res.length) {
        resp_func(null, `No existing binds matching "${param}" found`);
      } else {
        resp_func(null, `Removed binds:\n  ${err_or_res.join('\n  ')}`);
      }
    } else {
      resp_func(`${err_or_res}\n${BIND_USAGE}`);
    }
  }
});

cmd_parse.register({
  cmd: 'bindlist',
  help: 'Lists all current binds',
  usage: 'Usage: **/bindlist**\n' +
    'Usage: **/bindlist copy** (also copies to clipboard)',
  prefix_usage_with_help: true,
  func: function (param: string, resp_func: CmdRespFunc): void {
    let list = bindExport();
    let ret_default: string[] = [];
    let ret_user: string[] = [];
    for (let ii = 0; ii < list.length; ++ii) {
      let entry = list[ii];
      let is_default = base_binds.includes(bindToString(entry));
      let line = `${modToString(entry.modifiers)}${capitalize(entry.bindtype)}` +
        `${capitalize(String(entry.key).toLowerCase())}` +
        ` ${entry.layer !== 'default' ? `${entry.layer}.` : ''}${entry.cmd}`;
      (is_default ? ret_default : ret_user).push(line);
    }
    if (param.toLowerCase() === 'copy') {
      copyTextToClipboard(ret_user.join('\n')); // TODO: also add appropriate unbinds?
    }
    resp_func(null, `**Active default binds**:\n${ret_default.join('\n')}\n\n` +
      `**Active user binds**:\n${ret_user.join('\n')}`);
  }
});

cmd_parse.register({
  cmd: 'bindreset',
  help: 'Resets all binds to defaults',
  func: function (param: string, resp_func: CmdRespFunc): void {
    let diffs = 0;
    // Remove all extra binds
    if (user_binds.binds) {
      let list = user_binds.binds.slice(0);
      for (let ii = 0; ii < list.length; ++ii) {
        unbindFromString(list[ii]);
        ++diffs;
      }
    }
    // Restore all unbinds
    if (user_binds.unbinds) {
      let list = user_binds.unbinds.slice(0);
      for (let ii = 0; ii < list.length; ++ii) {
        addBindFromString(list[ii], false);
        ++diffs;
      }
    }
    resp_func(null, `Restored ${diffs} ${plural(diffs, 'bind')}`);
  }
});

// Loads custom user binds, must be called after all relevant actions are registered
export function bindUIStartup(): void {
  assert(!persist_binds); // should be called exactly once

  base_binds = bindExport().map(bindToString);

  user_binds = localStorageGetJSON<UserBinds>('binds', {});

  if (user_binds.unbinds) {
    for (let ii = user_binds.unbinds.length - 1; ii >= 0; --ii) {
      let str = user_binds.unbinds[ii];
      let res = unbindFromString(str);
      if (!Array.isArray(res) || !res.length) {
        console.error(`Error applying saved unbind "${str}": "${Array.isArray(res) ? 'Bind not found' : res}"`);
        user_binds.unbinds.splice(ii, 1);
      }
    }
  }
  if (user_binds.binds) {
    for (let ii = user_binds.binds.length - 1; ii >= 0; --ii) {
      let str = user_binds.binds[ii];
      let err = addBindFromString(str, false);
      if (err) {
        console.error(`Error applying saved bind "${str}": "${err}"`);
        user_binds.binds.splice(ii, 1);
      }
    }
  }

  persist_binds = true;
}
