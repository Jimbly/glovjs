import assert from 'assert';
import { ActionKey } from 'glov/client/actions';
import { bindLocalName } from 'glov/client/bind_ui';
import { BindExport, bindIsController, bindIsKey, bindsForCmd } from 'glov/client/binds';
import { inputPadMode, inputTouchMode, ValidKey } from 'glov/client/input';
import { SettingsValueKeys } from 'glov/client/settings_types';
import { TSMap } from 'glov/common/types';
import { TEXT } from './text';

const { abs } = Math;

export type TextKey = keyof typeof TEXT;

export function validTextKey(key: string): key is TextKey {
  return Boolean((TEXT as TSMap<string>)[key]);
}

export function fmt(key: TextKey, data: TSMap<string | number>): string {
  return (TEXT[key] || key).replace(/\{(\w+)\}/g, function (a: string, b: string) {
    if (data[b] !== undefined) {
      return String(data[b]);
    }
    return a;
  });
}

function splitTwoLine(str: string): string {
  if (str.includes('\n')) {
    return str;
  }
  let in_bracket = false;
  let str_eff_len = 0;
  for (let ii = 0; ii < str.length; ++ii) {
    let c = str[ii];
    if (c === '[') {
      in_bracket = true;
    } else if (c === ']') {
      in_bracket = false;
    } else if (!in_bracket) {
      ++str_eff_len;
    }
  }
  let midpt = str_eff_len / 2;
  let best_dist = Infinity;
  let best_idx = -1;
  in_bracket = false;
  let idx = 0;
  for (let ii = 0; ii < str.length; ++ii) {
    let c = str[ii];
    if (c === '[') {
      in_bracket = true;
    } else if (c === ']') {
      in_bracket = false;
    } else if (!in_bracket) {
      if (c === ' ') {
        let dist = abs(idx - midpt);
        if (dist < best_dist) {
          best_dist = dist;
          best_idx = ii;
        }
      }
      ++idx;
    }
  }
  if (best_idx === -1) {
    return str;
  }
  return `${str.slice(0, best_idx)}\n${str.slice(best_idx + 1)}`;
}

function wordStarts(str: string): TSMap<number> {
  let ret: TSMap<number> = {};
  let was_space = true;
  for (let ii = 0; ii < str.length; ++ii) {
    let c = str[ii];
    if (c === ' ') {
      was_space = true;
    } else if (was_space) {
      if (ret[c] === undefined) {
        ret[c] = ii;
      }
      was_space = false;
    }
  }
  return ret;
}

// Technically can be any string, but lets limit automation to actions and settings?
export type BindValue = ActionKey | SettingsValueKeys;

function bindNameFromAction(action: BindValue): string | undefined {
  let binds = bindsForCmd(action);
  if (!binds.length) {
    return;
  }
  let best_bind: string | undefined;
  let best_bind_frame = -1;
  for (let ii = 0; ii < binds.length; ++ii) {
    let bind = binds[ii];
    if (bindIsKey(bind) && !inputPadMode() ||
      bindIsController(bind) && inputPadMode()
    ) {
      let key_name = bindLocalName(bind);
      if (!best_bind || bind.last_used > best_bind_frame) {
        best_bind = key_name;
        best_bind_frame = bind.last_used;
      }
    }
  }
  return best_bind;
}

export function fmthotkey(param: {
  key?: TextKey;
  data?: TSMap<string | number>;
  disabled?: boolean;
  twoline?: boolean; // prefer `\n(hotkey)` if not a clean match
  twolinewrap?: boolean; // force splitting in midpoint instead of putting hotkey on another line
  action?: BindValue;
  actions?: BindValue[];
  double_bind?: [ActionKey, ActionKey]; // combo bind such as move_mod + move_forward
} & ({
  action: BindValue;
} | {
  actions: BindValue[];
})): string {
  profilerStartFunc();
  let { key, disabled, action, actions, twoline, twolinewrap, double_bind, data } = param;
  if (action) {
    assert(!actions);
    actions = [action];
  }
  assert(actions);
  let str = key ? (data ? fmt(key, data) : TEXT[key] || key) : '';
  if (inputTouchMode()) {
    let ret = twoline ? splitTwoLine(str) : str;
    profilerStopFunc();
    return ret;
  }

  const hs = disabled ? '' : '[c=hotkey]';
  const he = disabled ? '' : '[/c]';

  function wrap(hotkey: string): string {
    if (hotkey.includes('[img')) {
      if (twolinewrap && str) {
        return splitTwoLine(`${hotkey} ${str}`);
      } else {
        return str ? `${hotkey}${twoline ? '\n' : ' '}${str}` : hotkey;
      }
    } else {
      if (twolinewrap && str) {
        return splitTwoLine(`${str} (${hs}${hotkey}${he})`);
      } else {
        return str ? `${str}${twoline ? '\n' : ' '}(${hs}${hotkey}${he})` : `${hs}${hotkey}${he}`;
      }
    }
  }

  function checkDoubleBinds(): string {
    if (double_bind) {
      let bind1 = bindNameFromAction(double_bind[0]);
      if (bind1) {
        let bind2 = bindNameFromAction(double_bind[1]);
        if (bind2) {
          let ret = wrap(`${bind1}+${bind2}`);
          profilerStop();
          return ret;
        }
      }
    }
    let ret = twoline ? splitTwoLine(str) : str;
    profilerStop();
    return ret;
  }

  if (inputPadMode()) {
    for (let ii = 0; ii < actions.length; ++ii) {
      let bind_name = bindNameFromAction(actions[ii]);
      if (bind_name) {
        let ret = wrap(bind_name);
        profilerStop();
        return ret;
      }
    }
    return checkDoubleBinds();
  }

  // keyboard mode
  let binds: BindExport[] | undefined;
  for (let ii = 0; ii < actions.length; ++ii) {
    let binds_sub = bindsForCmd(actions[ii]);
    if (binds_sub.length) {
      binds = binds ? binds.concat(binds_sub) : binds_sub;
    }
  }
  if (!binds) {
    return checkDoubleBinds();
  }
  // modified version of bindNameFromAction that uses wordStarts
  let word_starts = wordStarts(str);
  let best_bind: string | undefined;
  let best_bind_frame = -1;
  for (let ii = 0; ii < binds.length; ++ii) {
    let bind = binds[ii];
    if (bindIsKey(bind)) {
      let key_name = bindLocalName(bind);
      let idx = word_starts[key_name];
      if (idx !== undefined) {
        if (!disabled) {
          str = `${str.slice(0, idx)}${hs}${str[idx]}${he}${str.slice(idx + 1)}`;
        }
        let ret = twoline ? splitTwoLine(str) : str;
        profilerStop();
        return ret;
      }
      if (!best_bind || bind.last_used > best_bind_frame) {
        best_bind = key_name;
        best_bind_frame = bind.last_used;
      }
    }
  }
  if (!best_bind) {
    return checkDoubleBinds();
  }
  let ret = wrap(best_bind);
  profilerStop();
  return ret;
}

export function fmthotkeyAlphaNumeric(param: {
  key?: TextKey;
  hotkey: ValidKey;
  disabled?: boolean;
}): string {
  let { key, hotkey, disabled } = param;
  let str = key ? TEXT[key] : '';
  if (inputTouchMode() || inputPadMode()) {
    return str;
  }

  let key_name = bindLocalName({
    bindtype: 'key',
    key: hotkey,
    modifiers: 0,
  });
  if (str) {
    let word_starts = wordStarts(str);
    let idx = word_starts[key_name];
    if (idx !== undefined) {
      if (!disabled) {
        str = `${str.slice(0, idx)}[c=hotkey]${str[idx]}[/c]${str.slice(idx + 1)}`;
      }
      return str;
    }
  }
  return `${str}${str ? ' ' : ''}(${disabled ? '' : '[c=hotkey]'}${key_name}${disabled ? '' : '[/c]'})`;
}
