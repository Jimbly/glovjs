/* globals navigator */

export const DEFAULT_BINDABLE_CMDS: Rec<string, string> = {
  up: 'Up',
  left: 'Left',
  down: 'Down',
  right: 'Right',
  accept: 'Accept',
  cancel: 'Cancel',
  prev: 'Select Previous',
  next: 'Select Next',
};

import assert from 'assert';
import { CmdRespFunc } from 'glov/common/cmd_parse';
import {
  Optional,
  Rec,
  TSMap,
} from 'glov/common/types';
import {
  capitalize,
  clone,
  identity,
  plural,
} from 'glov/common/util';
import { actionExists } from './actions';
import { autoResetSkippedFrames } from './auto_reset';
import {
  bindBind,
  BindExport,
  bindExport,
  BindType,
  bindUnbind,
} from './binds';
import { cmd_parse } from './cmds';
import { getFrameDt } from './engine';
import {
  ALIGN,
  FontStyle,
  fontStyleColored,
} from './font';
import {
  eatAllInput,
  eatAllKeyboardInput,
  inputFrameKeyUp,
  inputFramePadUp,
  inputLookupKeyName,
  inputLookupPadName,
  inputNameNormalize,
  inputPadMode,
  inputValidKeyName,
  inputValidPadName,
  keyDown,
  KEYS,
  padButtonDown,
  ValidKey,
  ValidPad,
} from './input';
import {
  ANY,
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
} from './input_constants';
import { eventCodeFromKeyCode } from './keycode';
import { localStorageGetJSON, localStorageSetJSON } from './local_storage';
import { scrollAreaCreate } from './scroll_area';
import {
  buttonText,
  copyTextToClipboard,
  drawRect,
  modalDialog,
  UIBox,
  uiButtonHeight,
  uiButtonWidth,
  uiGetFont,
} from './ui';

const { max, min, floor } = Math;

type UserBinds = {
  unbinds?: string[];
  binds?: string[];
};
let user_binds: UserBinds;
let base_binds: Rec<string, BindExport>;

type UserBindParam = {
  modifiers: number;
  layer: string|undefined;
  cmd: string;
  bindtype: BindType;
  key: ValidKey |ValidPad;
};

let persist_binds = false;

function toCamelCase(s: string): string {
  return s.split('_').map((a) => capitalize(a.toLowerCase())).join('');
}

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
    `${toCamelCase(bind.key).toLowerCase()}` +
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

function defaultLayerSub(cmd: string): string {
  let suffix = `.${cmd}`;
  for (let str in base_binds) {
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

function defaultLayer(cmd: string, bindtype: BindType, key: ValidKey | ValidPad): string {
  let layer = defaultLayerSub(cmd);
  if (layer === 'nav' && bindtype === 'key') {
    let keycode = KEYS[key as ValidKey];
    if (keycode && keycode >= KEYS['0'] && keycode <= KEYS.NUMPAD_DIVIDE) {
      // a nav key, but overlaps edit box keys, put into navext
      layer = 'navext';
    }
  }
  return layer;
}

function addUserBind(param: UserBindParam): void {
  const { bindtype, key, modifiers, cmd } = param;
  let { layer } = param;
  if (!layer) {
    layer = defaultLayer(cmd, bindtype, key);
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
    action: actionExists(cmd) ? 'action' : 'cmd',
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
      if (base_binds[full_bind]) {
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
const bind_key_regex = /^((?:(?:Shift|Ctrl|Alt)\+)+)?(Key|Controller)?([a-z0-9]+)$/i;
function parseBindKey(str: string): string | {
  modnames: string | undefined;
  bindtype: BindType;
  key: ValidKey | ValidPad;
} {
  let m = str.match(bind_key_regex);
  if (!m) {
    return 'Error parsing 1st argument';
  }
  let modnames = m[1] as string | undefined;
  let key_or_controller = m[2];
  let key = inputNameNormalize(m[3]);
  let bindtype: BindType;
  if (key_or_controller) {
    bindtype = key_or_controller.toLowerCase() as BindType;
    if (bindtype === 'key') {
      if (!inputValidKeyName(key)) {
        return `Unknown key "${key}"`;
      }
    } else {
      if (!inputValidPadName(key)) {
        return `Unknown controller button "${key}"`;
      }
    }
  } else {
    if (inputValidKeyName(key)) {
      if (inputValidPadName(key)) {
        return `Ambiguous parameter, please use use Key${key} or Controller${key}.`;
      }
      bindtype = 'key';
    } else if (inputValidPadName(key)) {
      bindtype = 'controller';
    } else {
      return `"${key}" is not recognized as a valid controller button nor key.`;
    }
  }
  return {
    modnames,
    bindtype,
    key,
  };
}

const split_opt_regex = /^([^ ]+)(?: (.+))?$/;
function unbindFromString(param: string): string | string[] {
  let m1 = param.match(split_opt_regex);
  if (!m1) {
    return 'Error parsing arguments';
  }
  let m2 = parseBindKey(m1[1]);
  if (typeof m2 === 'string') {
    return m2;
  }
  let { modnames, bindtype, key } = m2;
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

  return unbindSub({
    bindtype,
    key,
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
  let m2 = parseBindKey(m1[1]);
  if (typeof m2 === 'string') {
    return m2;
  }
  let m3 = m1[2].match(bind_param_regex);
  if (!m3) {
    return 'Error parsing 2nd argument';
  }
  let { modnames, bindtype, key } = m2;
  let layer = m3[1] as string | undefined;
  let cmd = m3[2] as string;

  let modifiers = modNamesToNumber(modnames);

  if (auto_unbind) {
    unbindSub({
      bindtype,
      modifiers,
      key,
      layer,
      // no cmd, unbind any matching key on this layer
    });
  }
  addUserBind({
    bindtype,
    modifiers,
    key,
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

const SPECIAL_NAMES: TSMap<string> = {
  PAGEUP: 'PageUp',
  PAGEDOWN: 'PageDown',
  NUMPAD0: 'NumPad0',
  NUMPAD1: 'NumPad1',
  NUMPAD2: 'NumPad2',
  NUMPAD3: 'NumPad3',
  NUMPAD4: 'NumPad4',
  NUMPAD5: 'NumPad5',
  NUMPAD6: 'NumPad6',
  NUMPAD7: 'NumPad7',
  NUMPAD8: 'NumPad8',
  NUMPAD9: 'NumPad9',
  NUMPAD_MULTIPLY: 'NumPad*',
  NUMPAD_ADD: 'NumPad+',
  NUMPAD_SUBTRACT: 'NumPad-',
  NUMPAD_DECIMAL_POINT: 'NumPad.',
  NUMPAD_DIVIDE: 'NumPad/',
};
function formatKeyName(key: string): string {
  return SPECIAL_NAMES[key] || toCamelCase(key);
}

function formatBindKey(show_bindtype: boolean, entry: {
  bindtype: BindType;
  key: ValidKey | ValidPad;
  key_name?: string;
  modifiers: number;
}): string {
  return `${modToString(entry.modifiers)}${show_bindtype ? capitalize(entry.bindtype) : ''}` +
    `${entry.key_name || formatKeyName(entry.key)}`;
}


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
      let is_default = base_binds[bindToString(entry)];
      let line = `${formatBindKey(true, entry)}` +
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

  let base_binds_list = bindExport();
  base_binds = Object.create(null);
  for (let ii = 0; ii < base_binds_list.length; ++ii) {
    let bind = base_binds_list[ii];
    base_binds[bindToString(bind)] = bind;
  }

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

type LayoutMapper = {
  get: (event_code: string) => string | undefined;
};
let layout_map: LayoutMapper;

let did_layout_map_init = false;
function layoutMapInit(): void {
  if (did_layout_map_init) {
    return;
  }
  did_layout_map_init = true;

  let nav = navigator as unknown as {
    keyboard: {
      getLayoutMap: () => Promise<LayoutMapper>;
    };
  };
  if (!nav.keyboard || !nav.keyboard.getLayoutMap) {
    return;
  }

  nav.keyboard.getLayoutMap().then(function (lm) {
    layout_map = lm;
  }, function (err) {
    console.warn(`Error getting keyboard layout map: ${err}`);
  });
}

function keyLocalName(key: ValidKey): string | undefined {
  // TODO: lazy populate this from `event.key` for a fallback
  let key_code = KEYS[key];
  if (layout_map && key_code) {
    // convert to event code
    let event_code = eventCodeFromKeyCode(key_code);
    if (event_code) {
      try {
        let ret = layout_map.get(event_code);
        if (ret) {
          return toCamelCase(ret);
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

function bindLocalName(bind: {
  bindtype: BindType;
  key: ValidKey | ValidPad;
  modifiers: number;
}): string {
  let key_name;
  if (bind.bindtype === 'key') {
    key_name = keyLocalName(bind.key as ValidKey);
  }
  return formatBindKey(false, {
    ...bind,
    key_name,
  });
}

function initialBindsMap(): Rec<string, BindExport> {
  let binds = bindExport();
  let ret: Rec<string, BindExport> = {};
  for (let ii = 0; ii < binds.length; ++ii) {
    let bind = binds[ii];
    ret[bindToString(bind)] = bind;
  }
  return ret;
}

class BindUIState {
  page: BindType = inputPadMode() ? 'controller' : 'key';
  scroll_area = scrollAreaCreate();
  editing_bind: null | {
    idx: number;
    cmd: string;
    existing: BindExport | null;
    waiting_for_no_keys: boolean;
  } = null;
  constructor() {
    layoutMapInit();
  }
  initial_binds = initialBindsMap();
  cur_binds = bindExport();
}
let bind_ui_state: BindUIState;
let default_style = fontStyleColored(null, 0x000000ff);

function applyChanges(old_binds: Rec<string, BindExport>, cur_binds: BindExport[], just_test: boolean): boolean {
  let seen: TSMap<true> = {};
  for (let ii = 0; ii < cur_binds.length; ++ii) {
    let bind = cur_binds[ii];
    let bind_str = bindToString(cur_binds[ii]);
    if (old_binds[bind_str]) {
      seen[bind_str] = true;
    } else {
      if (just_test) {
        return true;
      }
      addUserBind(bind);
    }
  }
  for (let key in old_binds) {
    if (!seen[key]) {
      if (just_test) {
        return true;
      }
      unbindSub(old_binds[key]!);
    }
  }
  if (!just_test) {
    bind_ui_state.initial_binds = initialBindsMap();
  }
  return false;
}

function handleEditBind(): void {
  let { cur_binds } = bind_ui_state;
  let bindtype = bind_ui_state.page;
  let editing = bind_ui_state.editing_bind;
  assert(editing);
  if (editing.waiting_for_no_keys) {
    if (!keyDown(ANY) && !inputFrameKeyUp() && !padButtonDown(ANY) && !inputFramePadUp()) {
      editing.waiting_for_no_keys = false;
    } else {
      return;
    }
  }
  let new_bind: BindExport | undefined;
  if (bindtype === 'key') {
    let keyup = inputFrameKeyUp();
    if (keyup) {
      bind_ui_state.editing_bind = null;
      let key = inputLookupKeyName(keyup.code);
      if (!key) {
        let diag = `key: ${key}, code: ${keyup.code}, eventCode: ${keyup.eventCode}, eventKey:${keyup.eventKey}`;
        modalDialog({
          title: 'Unrecognized key',
          text: 'Sorry, that key was not recognized, please try a different key and report this to the developer.\n\n' +
            `Diagnostic info: ${diag}`,
          buttons: {
            'Copy to clipboard': function () {
              copyTextToClipboard(diag);
            },
            OK: null,
          }
        });
      } else {
        new_bind = {
          bindtype,
          key,
          layer: defaultLayer(editing.cmd, bindtype, key),
          modifiers: keyup.mod,
          cmd: editing.cmd,
        };
      }
    }
    eatAllKeyboardInput();
  } else if (bindtype === 'controller') {
    let padup = inputFramePadUp();
    if (padup) {
      bind_ui_state.editing_bind = null;
      let padcode = inputLookupPadName(padup.code);
      if (!padcode) {
        let diag = `padcode: ${padcode}`;
        modalDialog({
          title: 'Unrecognized button',
          text: 'Sorry, that button was not recognized, please try a different' +
            ' button and report this to the developer.\n\n' +
            `Diagnostic info: ${diag}`,
          buttons: {
            'Copy to clipboard': function () {
              copyTextToClipboard(diag);
            },
            OK: null,
          }
        });
      } else {
        new_bind = {
          bindtype,
          key: padcode,
          layer: defaultLayer(editing.cmd, bindtype, padcode),
          modifiers: 0,
          cmd: editing.cmd,
        };
      }
    }
    eatAllInput(true);
  }

  if (new_bind) {
    if (editing.existing) {
      // replace existing bind
      let idx = cur_binds.indexOf(editing.existing);
      assert(idx !== -1);
      cur_binds[idx] = new_bind;
    } else {
      cur_binds.push(new_bind);
    }
    // unbind anything else bound to this key
    for (let ii = cur_binds.length - 1; ii >= 0; --ii) {
      let bind = cur_binds[ii];
      if (bind === new_bind) {
        continue;
      }
      if (bind.bindtype === bindtype && bind.key === new_bind.key && bind.modifiers === new_bind.modifiers) {
        cur_binds.splice(ii, 1);
      }
    }
  }
}

let edit_anim_t = 0;
function editAnim(): string {
  if (autoResetSkippedFrames('editanim')) {
    edit_anim_t = 0;
  }
  edit_anim_t += getFrameDt();
  return ['?..', '.?.', '..?'][floor((edit_anim_t % 600 / 600) * 3)];
}

export function bindUIRun(opts: UIBox & {
  pad: number;
  bindable_cmds?: Rec<string, string>;
  label_style?: FontStyle;
}): boolean {
  let { x, y, z, w, h, pad, bindable_cmds, label_style } = opts;
  const tiny_add_new = true;
  z = z || Z.UI;
  bindable_cmds = bindable_cmds || DEFAULT_BINDABLE_CMDS;
  label_style = label_style || default_style;
  x += pad;
  y += pad;
  let x0 = x;
  let y0 = y;
  w -= pad * 2;
  h -= pad * 2;
  if (!bind_ui_state || autoResetSkippedFrames('bindui')) {
    bind_ui_state = new BindUIState();
  }

  if (bind_ui_state.editing_bind) {
    handleEditBind();
  }

  let button_width = uiButtonWidth();
  let button_height = uiButtonHeight();
  let font = uiGetFont();
  let { cur_binds } = bind_ui_state;
  let binds_by_cmd: Rec<string, BindExport[]> = {};
  for (let ii = 0; ii < cur_binds.length; ++ii) {
    let bind = cur_binds[ii];
    binds_by_cmd[bind.cmd] = binds_by_cmd[bind.cmd] || [];
    binds_by_cmd[bind.cmd]!.push(bind);
  }

  if (buttonText({
    x, y, z, w: (w - pad) / 2,
    // base_style: bind_ui_state.page === 'key' ? 'button_selected' : 'button',
    disabled: bind_ui_state.page === 'key',
    text: 'Keyboard',
  })) {
    bind_ui_state.page = 'key';
    bind_ui_state.editing_bind = null;
  }
  if (buttonText({
    x: x + (w + pad) / 2, y, z, w: (w - pad) / 2,
    // base_style: bind_ui_state.page === 'controller' ? 'button_selected' : 'button',
    disabled: bind_ui_state.page === 'controller',
    text: 'Controller',
  })) {
    bind_ui_state.page = 'controller';
    bind_ui_state.editing_bind = null;
  }
  y += button_height + pad/2;

  let scroll_w = w + pad;
  bind_ui_state.scroll_area.begin({
    x, y, z, w: scroll_w, h: y0 + h - y - button_height - pad/2,
    background_color: null,
    auto_hide: true,
  });
  w = scroll_w - bind_ui_state.scroll_area.barWidth();
  y = pad/2;

  let row_h = button_height;
  let label_w = min(button_width, floor(w / 3));
  let bind_remove_w = row_h;
  let binds_per_row = 3;
  const avail_w = w - pad * (binds_per_row + 1) - label_w - (tiny_add_new ? bind_remove_w + pad : 0);
  let bind_button_w = max(row_h, (avail_w / binds_per_row) - bind_remove_w);

  let idx = 0;
  for (let cmd in bindable_cmds) {
    let row_y_start = y;
    let active_binds = binds_by_cmd[cmd] || [];
    x = 0;

    font.draw({
      style: label_style,
      x, y, z, w: label_w, h: row_h,
      align: ALIGN.HVCENTERFIT,
      text: bindable_cmds[cmd]!,
    });
    x += label_w + pad;
    let rowcount = 0;

    let show_add_new = true;
    if (bind_ui_state.editing_bind &&
      bind_ui_state.editing_bind.cmd === cmd &&
      bind_ui_state.editing_bind.idx === active_binds.length
    ) {
      show_add_new = false;
      active_binds = active_binds.slice(0);
      active_binds.push({
        bindtype: bind_ui_state.page,
        cmd,
        modifiers: 0,
        layer: 'default',
        key: 'TBD' as ValidKey,
      });
    }

    // display existing binds, button to change, button to clear
    for (let ii = 0; ii < active_binds.length; ++ii) {
      let bind = active_binds[ii];
      if (bind.bindtype !== bind_ui_state.page) {
        continue;
      }
      const is_editing = bind_ui_state.editing_bind &&
        bind_ui_state.editing_bind.cmd === cmd &&
        bind_ui_state.editing_bind.idx === ii;

      if (rowcount === binds_per_row) {
        x = label_w + pad;
        y += row_h + floor(pad / 2);
        rowcount = 0;
      }

      let this_w = bind_button_w;
      if (show_add_new || !is_editing) {
        if (buttonText({
          x, y, z, w: bind_remove_w, h: row_h,
          text: 'X',
          tooltip: `Remove binding of ${formatBindKey(true, bind)} to "${bind.cmd}"`,
        })) {
          bind_ui_state.editing_bind = null;
          let cur_idx = cur_binds.indexOf(bind);
          assert(cur_idx !== -1);
          cur_binds.splice(cur_idx, 1);
        }
        x += bind_remove_w;
      } else {
        this_w += bind_remove_w;
      }
      if (buttonText({
        x, y, z, w: this_w, h: row_h,
        text: is_editing ? editAnim() : bindLocalName(bind),
        tooltip: is_editing ? 'Press the desired key, or click to cancel changing this binding' : undefined,
      })) {
        if (is_editing) {
          bind_ui_state.editing_bind = null;
        } else {
          bind_ui_state.editing_bind = {
            cmd,
            idx: ii,
            existing: bind,
            waiting_for_no_keys: true,
          };
        }
      }
      x += this_w + pad;
      ++rowcount;
    }

    if (show_add_new) {
      if (!tiny_add_new && rowcount === binds_per_row) {
        x = label_w + pad;
        y += row_h + floor(pad / 2);
        rowcount = 0;
      }
      if (buttonText({
        x, y, z, w: tiny_add_new ? bind_remove_w : bind_remove_w + bind_button_w, h: row_h,
        key: `addnew${cmd}`,
        text: tiny_add_new ? '+' : '+Add new',
        tooltip: tiny_add_new ? 'Add new bind' : undefined,
      })) {
        bind_ui_state.editing_bind = {
          cmd,
          idx: active_binds.length,
          existing: null,
          waiting_for_no_keys: true,
        };
      }
    }

    y += row_h;
    ++idx;
    if (idx % 2) {
      drawRect(0, row_y_start - pad/2, w, y + pad/2, z - 0.5, [0,0,0,0.25]);
    }
    y += pad;
  }
  bind_ui_state.scroll_area.end(y);

  let ret = false;
  if (buttonText({
    x: x0 + w - button_width * 3 - pad * 2,
    y: y0 + h - button_height,
    z,
    disabled: !applyChanges(base_binds, cur_binds, true),
    text: 'Reset to Defaults',
  })) {
    bind_ui_state.cur_binds = clone(Object.values(base_binds) as BindExport[]);
  }
  let any_changes = applyChanges(bind_ui_state.initial_binds, cur_binds, true);
  if (buttonText({
    x: x0 + w - button_width * 2 - pad,
    y: y0 + h - button_height,
    z,
    disabled: !any_changes,
    text: 'Apply',
  })) {
    applyChanges(bind_ui_state.initial_binds, cur_binds, false);
  }
  if (buttonText({
    x: x0 + w - button_width,
    y: y0 + h - button_height,
    z,
    hotaction: any_changes ? undefined : 'cancel',
    text: any_changes ? 'Cancel' : 'Done',
  })) {
    ret = true;
  }

  return ret;
}
