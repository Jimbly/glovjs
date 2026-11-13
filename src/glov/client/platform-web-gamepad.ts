/* global navigator */
import {
  inputOnGamepadButtonInternal,
  inputOnGamepadNameInternal,
  inputOnGamepadStickInternal,
} from './input';
import {
  PAD_NUM_SIMPLE_BUTTONS,
  PAD_NUM_STICKS,
} from './input_constants';

const { min } = Math;

type GamepadDataPlatform = {
  timestamp: number;
};
let gamepad_data_platform: GamepadDataPlatform[] = []; // Other tracking data per gamepad


function getGamepadDataPlatform(idx: number): GamepadDataPlatform {
  let gpd = gamepad_data_platform[idx];
  if (!gpd) {
    gpd = gamepad_data_platform[idx] = {
      timestamp: 0,
    };
  }
  return gpd;
}

type GetGamepadsFn = () => GetGamepadsRet;
type GamepadQueryButtonData = number | { value: number };
type GamepadQueryData = {
  id: string;
  timestamp: number;
  buttons: GamepadQueryButtonData[];
  axes: number[];
};
type GetGamepadsRet = (GamepadQueryData | null)[];
type NavigatorFallback = {
  gamepads?: GetGamepadsRet;
  webkitGamepads?: GetGamepadsRet;
  getGamepads?: GetGamepadsFn;
  webkitGetGamepads?: GetGamepadsFn;
};

export function webGamepadUpdate(): void {
  let gamepads;
  try {
    let nav = navigator as NavigatorFallback;
    gamepads = (nav.gamepads ||
      nav.webkitGamepads ||
      (nav.getGamepads && nav.getGamepads()) ||
      (nav.webkitGetGamepads && nav.webkitGetGamepads()));
  } catch (e) {
    // Firefox blocks gamepad access sometimes, just ignore it we can't access it
  }

  if (gamepads) {
    let numGamePads = gamepads.length;
    for (let ii = 0; ii < numGamePads; ii++) {
      let gamepad = gamepads[ii];
      if (!gamepad) {
        continue;
      }
      let gpd = getGamepadDataPlatform(ii);
      inputOnGamepadNameInternal(ii, gamepad.id);
      // Update button states
      if (gpd.timestamp < gamepad.timestamp) {
        let buttons = gamepad.buttons;
        gpd.timestamp = gamepad.timestamp;

        let num_buttons = min(buttons.length, PAD_NUM_SIMPLE_BUTTONS);
        for (let n = 0; n < num_buttons; n++) {
          let value = buttons[n];
          if (typeof value === 'object') {
            value = value.value;
          }
          let is_down = value > 0.5;
          inputOnGamepadButtonInternal(ii, n, is_down, gpd.timestamp);
        }
      }

      // Update axes states
      let axes = gamepad.axes;
      if (axes.length >= PAD_NUM_STICKS * 2) {
        for (let n = 0; n < PAD_NUM_STICKS; ++n) {
          inputOnGamepadStickInternal(ii, n, axes[n*2], -axes[n*2 + 1], gpd.timestamp);
        }
      }
    }
  }
}
