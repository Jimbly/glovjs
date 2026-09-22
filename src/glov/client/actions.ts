export const internal = {
  actionStartup, // eslint-disable-line @typescript-eslint/no-use-before-define
  actionTopOfFrame, // eslint-disable-line @typescript-eslint/no-use-before-define
};

import assert from 'assert';
import { CmdRespFunc } from 'glov/common/cmd_parse';
import { bindKB, bindPad } from './binds';
import { cmd_parse } from './cmds';
import { KEYS, PAD } from './input';

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

export function actionBindKB(key: keyof typeof KEYS, action_key: ActionKey): void {
  bindKB({
    key,
    cmd: action_key,
    mode: 'hold'
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

export function actionEdge(action_key: ActionKey): number {
  let state = action_state[action_key];
  assert(state);
  let ret = state.down_edge;
  state.down_edge = 0;
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
  actionRegister('accept');
  actionRegister('cancel');

  actionBindKB('UP', 'up');
  actionBindKB('W', 'up');
  actionBindKB('LEFT', 'left');
  actionBindKB('A', 'left');
  actionBindKB('DOWN', 'down');
  actionBindKB('S', 'down');
  actionBindKB('RIGHT', 'right');
  actionBindKB('D', 'right');
  // actionBindKB('Z', 'accept');
  // actionBindKB('X', 'cancel');
  // actionBindKB('C', 'accept');
  // actionBindKB('J', 'accept');
  // actionBindKB('K', 'cancel');
  // actionBindKB('L', 'accept');
  // actionBindKB('Q', 'cancel');
  // actionBindKB('E', 'accept');
  actionBindKB('SPACE', 'accept');
  actionBindKB('ESC', 'cancel');
  actionBindKB('BACKSPACE', 'cancel');
  actionBindKB('ENTER', 'accept');

  actionBindPad('SELECT', 'accept');
  actionBindPad('CANCEL', 'cancel');
  actionBindPad('X', 'accept');
  actionBindPad('Y', 'cancel');
  // actionBindPad('LEFT_BUMPER', 'accept');
  // actionBindPad('RIGHT_BUMPER', 'accept');
  // actionBindPad('LEFT_TRIGGER', 'cancel');
  // actionBindPad('RIGHT_TRIGGER', 'cancel');
  actionBindPad('BACK', 'cancel');
  // actionBindPad('START', 'cancel');
  // actionBindPad('LEFT_STICK', 'accept');
  // actionBindPad('RIGHT_STICK', 'accept');
  actionBindPad('UP', 'up');
  actionBindPad('DOWN', 'down');
  actionBindPad('LEFT', 'left');
  actionBindPad('RIGHT', 'right');
  actionBindPad('ANALOG_UP', 'up');
  actionBindPad('ANALOG_LEFT', 'left');
  actionBindPad('ANALOG_DOWN', 'down');
  actionBindPad('ANALOG_RIGHT', 'right');
}
