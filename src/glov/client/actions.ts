export const internal = {
  actionStartup, // eslint-disable-line @typescript-eslint/no-use-before-define
  actionTopOfFrame, // eslint-disable-line @typescript-eslint/no-use-before-define
  actionEatAll, // eslint-disable-line @typescript-eslint/no-use-before-define
};

import assert from 'assert';
import { CmdRespFunc } from 'glov/common/cmd_parse';
import {
  bindDown,
  bindDownEdge,
  bindKB,
  bindLayerRegister,
  bindPad,
} from './binds';
import { platformGetID } from './client_config';
import { cmd_parse } from './cmds';
import { getFrameDtHr } from './engine';
import {
  KEYS,
  MOD_CTRL,
  MOD_SHIFT,
  PAD,
} from './input';
import { EventCallback } from './ui';

/*

Callers can add custom actions with the following code:

declare module 'glov/client/actions' {
  interface ActionRegistry {
    myaction: 0;
  }
}

actionRegister('myaction');

*/

const { max } = Math;

export interface ActionRegistry {
  up: 0;
  left: 0;
  down: 0;
  right: 0;
  prev: 0;
  next: 0;
  accept: 0;
  cancel: 0;
}

export type ActionKey = keyof ActionRegistry;

type ActionState = {
  down: number;
  down_edge: number;
};
let action_state = Object.create(null) as Record<ActionKey, ActionState>;

// Used for external events to trigger actions (e.g. on-screen controls),
//   though e.g. cmd_parse.handle('myaction 0') also works
export function actionTriggerEdge(action_key: ActionKey, is_down: boolean): void {
  let action = action_state[action_key];
  assert(action);
  if (is_down) {
    action.down_edge++;
    action.down++;
  } else {
    action.down = max(0, action.down - 1);
  }
}

function actionCmd(action_key: ActionKey, value: string, resp_func: CmdRespFunc): void {
  value = value.trim();
  if (!value) {
    actionTriggerEdge(action_key, true);
    actionTriggerEdge(action_key, false);
  } else {
    let action = action_state[action_key];
    if (value === '0') {
      if (action.down) {
        actionTriggerEdge(action_key, false);
      }
    } else if (value === '1') {
      if (!action.down) {
        actionTriggerEdge(action_key, true);
      }
    } else {
      return resp_func(`Usage: /${action_key} 0|1`);
    }
  }
  resp_func();
}

export function actionRegister(action_key: ActionKey): void {
  assert(!action_state[action_key]);
  action_state[action_key] = {
    down: 0,
    down_edge: 0,
  };
  cmd_parse.register({
    cmd: action_key,
    help: `Bindable Action: ${action_key}`,
    func: actionCmd.bind(null, action_key),
  });
}

export function actionExists(key: string): key is ActionKey {
  return Boolean(action_state[key as ActionKey]);
}

export function actionBindKB(key: keyof typeof KEYS, action_key: ActionKey, modifiers?: number, layer?: string): void {
  bindKB({
    key,
    cmd: action_key,
    action: 'action',
    modifiers,
    layer,
  });
}
export function actionBindPad(pad: keyof typeof PAD, action_key: ActionKey, layer?: string): void {
  bindPad({
    key: pad,
    cmd: action_key,
    action: 'action',
    layer,
  });
}

function actionTopOfFrame(): void {
  // TODO: this whole thing is mostly only needed for actionTriggerEvent()
  //   (on-screen controls) support, should this live in binds or input instead?
  //   It's also, arguably, useful for `/bind = up 1` kinds of things
  for (let key in action_state) {
    let action = action_state[key as ActionKey];
    action.down_edge = 0;
  }
}

function actionEatAll(): void {
  actionTopOfFrame();
}

export type ActionOpts = {
  in_event_cb?: EventCallback | null; // for clicks and key presses
  peek?: boolean;
  flags?: number; // BIND_FLAG_NOKB, etc
};

export function actionEdge(action_key: ActionKey, opts?: ActionOpts | null): number {
  let ret = bindDownEdge(action_key, opts);
  let state = action_state[action_key];
  assert(state);
  ret += state.down_edge;
  if (!(opts && opts.peek)) {
    state.down_edge = 0;
  }
  return ret;
}

export function actionDown(action_key: ActionKey): number {
  let ret = bindDown(action_key);
  let state = action_state[action_key];
  assert(state);
  if (state.down) {
    ret = getFrameDtHr();
  }
  return ret;
}

function actionStartup(): void {
  actionRegister('up');
  actionRegister('left');
  actionRegister('down');
  actionRegister('right');
  actionRegister('prev');
  actionRegister('next');
  actionRegister('accept');
  actionRegister('cancel');

  // basic nav set - active even when an edit box has keyboard focus
  actionBindPad('UP', 'up', 'nav');
  actionBindPad('DOWN', 'down', 'nav');
  actionBindPad('LEFT', 'left', 'nav');
  actionBindPad('RIGHT', 'right', 'nav');
  actionBindPad('ANALOG_UP', 'up', 'nav');
  actionBindPad('ANALOG_LEFT', 'left', 'nav');
  actionBindPad('ANALOG_DOWN', 'down', 'nav');
  actionBindPad('ANALOG_RIGHT', 'right', 'nav');
  actionBindPad('LEFT_BUMPER', 'prev', 'nav');
  actionBindPad('RIGHT_BUMPER', 'next', 'nav');
  actionBindKB('TAB', 'next', 0, 'nav');
  actionBindKB('TAB', 'prev', MOD_SHIFT, 'nav');
  if (platformGetID() === 'electron') {
    actionBindKB('TAB', 'prev', MOD_CTRL, 'nav');
  }
  // note: these input events, not actions/binds, are disabled if widget is stealing keyboard input
  actionBindKB('UP', 'up', 0, 'nav');
  actionBindKB('DOWN', 'down', 0, 'nav');
  actionBindKB('LEFT', 'left', 0, 'nav');
  actionBindKB('RIGHT', 'right', 0, 'nav');

  // extended nav set - active based on app's needs
  bindLayerRegister('navext', 60);
  actionBindKB('W', 'up', 0, 'navext');
  actionBindKB('A', 'left', 0, 'navext');
  actionBindKB('S', 'down', 0, 'navext');
  actionBindKB('D', 'right', 0, 'navext');
  actionBindKB('NUMPAD8', 'up', 0, 'navext');
  actionBindKB('NUMPAD4', 'left', 0, 'navext');
  actionBindKB('NUMPAD5', 'down', 0, 'navext');
  actionBindKB('NUMPAD2', 'down', 0, 'navext');
  actionBindKB('NUMPAD6', 'right', 0, 'navext');

  // general binds
  actionBindKB('SPACE', 'accept', 0, 'nav');
  actionBindKB('ENTER', 'accept', 0, 'nav');
  actionBindPad('SELECT', 'accept', 'nav');

  actionBindKB('ESC', 'cancel', 0, 'nav');
  actionBindKB('BACKSPACE', 'cancel', 0, 'nav');
  actionBindPad('CANCEL', 'cancel', 'nav');

  // recommended extras:
  // actionBindKB('E', 'accept', 0, 'nav');
  // actionBindKB('Q', 'cancel', 0, 'nav');
  // actionBindPad('X', 'accept', 'nav');
  // actionBindPad('Y', 'cancel', 'nav');
  // actionBindPad('BACK', 'cancel', 'nav');
}
