export const internal = {
  actionStartup, // eslint-disable-line @typescript-eslint/no-use-before-define
  actionTopOfFrame, // eslint-disable-line @typescript-eslint/no-use-before-define
};

import assert from 'assert';
import { CmdRespFunc } from 'glov/common/cmd_parse';
import { BIND_CTRL, BIND_SHIFT, bindKB, bindPad } from './binds';
import { cmd_parse } from './cmds';
import { KEYS, PAD } from './input';
import { EventCallback } from './ui';
import { platformGetID } from './client_config';

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
let action_state = {} as Record<ActionKey, ActionState>;

// Can be called for external events trigger actions (e.g. on-screen controls),
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
  if (!value) {
    actionTriggerEdge(action_key, true);
    actionTriggerEdge(action_key, false);
  } else {
    if (Number(value)) {
      actionTriggerEdge(action_key, true);
    } else {
      actionTriggerEdge(action_key, false);
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

export function actionBindKB(key: keyof typeof KEYS, action_key: ActionKey, modifiers?: number): void {
  bindKB({
    key,
    cmd: action_key,
    mode: 'hold',
    modifiers,
  });
}
export function actionBindPad(pad: keyof typeof PAD, action_key: ActionKey): void {
  bindPad({
    key: pad,
    cmd: action_key,
    mode: 'hold',
  });
}

function actionTopOfFrame(): void {
  for (let key in action_state) {
    let action = action_state[key as ActionKey];
    action.down_edge = 0;
  }
}

export type ActionOpts = {
  in_event_cb?: EventCallback | null; // for clicks and key presses
  peek?: boolean;
};

export function actionEdge(action_key: ActionKey, opts?: ActionOpts): number {
  let state = action_state[action_key];
  assert(state);
  let ret = state.down_edge;
  if (!(opts && opts.peek)) {
    state.down_edge = 0;
  }
  if (opts && opts.in_event_cb) {
    // TODO: bindInEventCB(action_key, opts.in_event_cb);
  }
  return ret;
}

export function actionDown(action_key: ActionKey): number {
  let state = action_state[action_key];
  assert(state);
  return state.down;
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
  actionBindPad('UP', 'up');
  actionBindPad('DOWN', 'down');
  actionBindPad('LEFT', 'left');
  actionBindPad('RIGHT', 'right');
  actionBindPad('ANALOG_UP', 'up');
  actionBindPad('ANALOG_LEFT', 'left');
  actionBindPad('ANALOG_DOWN', 'down');
  actionBindPad('ANALOG_RIGHT', 'right');
  actionBindPad('LEFT_BUMPER', 'prev');
  actionBindPad('RIGHT_BUMPER', 'next');
  actionBindKB('TAB', 'next');
  actionBindKB('TAB', 'prev', BIND_SHIFT);
  if (platformGetID() === 'electron') {
    actionBindKB('TAB', 'prev', BIND_CTRL);
  }

  // simplenav set - always active except if a widget is stealing keyboard input
  // TODO move these into navsimple set
  actionBindKB('UP', 'up');
  actionBindKB('LEFT', 'left');
  actionBindKB('DOWN', 'down');
  actionBindKB('RIGHT', 'right');

  // extended nav set - active based on app's needs
  // TODO: move these to an extended bind set
  actionBindKB('W', 'up');
  actionBindKB('A', 'left');
  actionBindKB('S', 'down');
  actionBindKB('D', 'right');
  actionBindKB('NUMPAD8', 'up');
  actionBindKB('NUMPAD4', 'left');
  actionBindKB('NUMPAD5', 'down');
  actionBindKB('NUMPAD2', 'down');
  actionBindKB('NUMPAD6', 'right');

  // general binds
  actionBindKB('SPACE', 'accept');
  actionBindKB('ENTER', 'accept');
  actionBindPad('SELECT', 'accept');

  actionBindKB('ESC', 'cancel');
  actionBindKB('BACKSPACE', 'cancel');
  actionBindPad('CANCEL', 'cancel');

  // recommended extras:
  // actionBindKB('E', 'accept');
  // actionBindKB('Q', 'cancel');
  // actionBindPad('X', 'accept');
  // actionBindPad('Y', 'cancel');
  // actionBindPad('BACK', 'cancel');
}
