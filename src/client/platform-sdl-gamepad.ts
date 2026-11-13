import fs from 'fs';
import { default as sdl, Sdl } from '@kmamal/sdl';
import { hrnow } from 'glov/client/engine';
import {
  inputOnGamepadButtonInternal,
  inputOnGamepadNameInternal,
  inputOnGamepadStickInternal,
  PAD,
} from 'glov/client/input';
import { sdlEventQueue } from './platform-sdl-events';

type GamepadInstance = Sdl.Gamepad.GamepadInstance;

const BUTTON_TO_PAD: Partial<Record<Sdl.Gamepad.Button, number>> = {
  south: PAD.A,
  east: PAD.B,
  west: PAD.X,
  north: PAD.Y,
  leftShoulder: PAD.LEFT_BUMPER,
  rightShoulder: PAD.RIGHT_BUMPER,
  back: PAD.BACK,
  start: PAD.START,
  leftStick: PAD.LEFT_STICK,
  rightStick: PAD.RIGHT_STICK,
  dpadUp: PAD.UP,
  dpadDown: PAD.DOWN,
  dpadLeft: PAD.LEFT,
  dpadRight: PAD.RIGHT,
  guide: PAD.CENTER,
};

const TRIGGER_THRESHOLD = 0.5;

type PadData = {
  instance: GamepadInstance;
  device_id: number;
};
// Index is the GLOV pad index; freed slots are reused by the next gamepad connected
let pads: (PadData | null)[] = [];

function releaseAll(idx: number): void {
  let timestamp = hrnow();
  for (let padcode = 0; padcode <= PAD.CENTER; ++padcode) {
    inputOnGamepadButtonInternal(idx, padcode, false, timestamp);
  }
  inputOnGamepadStickInternal(idx, 0, 0, 0, timestamp);
  inputOnGamepadStickInternal(idx, 1, 0, 0, timestamp);
}

function onButton(pad: PadData, button: Sdl.Gamepad.Button, is_down: boolean): void {
  let padcode = BUTTON_TO_PAD[button];
  if (padcode === undefined) {
    return;
  }
  let timestamp = hrnow();
  sdlEventQueue(function () {
    let idx = pads.indexOf(pad);
    if (idx !== -1) {
      inputOnGamepadButtonInternal(idx, padcode, is_down, timestamp);
    }
  });
}

// Call from within node-sdl event listeners (or before ticking): reading
//   `instance.axes` polls SDL events, except while one is being delivered.  There,
//   it reflects exactly the events delivered so far.
function onAxisMotion(pad: PadData, axis: Sdl.Gamepad.Axis): void {
  let axes = pad.instance.axes;
  let timestamp = hrnow();
  let fn: (idx: number) => void;
  switch (axis) {
    case 'leftStickX':
    case 'leftStickY': {
      // SDL: +Y is down; GLOV: +Y is up
      let x = axes.leftStickX;
      let y = -axes.leftStickY;
      fn = (idx) => inputOnGamepadStickInternal(idx, 0, x, y, timestamp);
    } break;
    case 'rightStickX':
    case 'rightStickY': {
      let x = axes.rightStickX;
      let y = -axes.rightStickY;
      fn = (idx) => inputOnGamepadStickInternal(idx, 1, x, y, timestamp);
    } break;
    case 'leftTrigger': {
      let is_down = axes.leftTrigger > TRIGGER_THRESHOLD;
      fn = (idx) => inputOnGamepadButtonInternal(idx, PAD.LEFT_TRIGGER, is_down, timestamp);
    } break;
    case 'rightTrigger': {
      let is_down = axes.rightTrigger > TRIGGER_THRESHOLD;
      fn = (idx) => inputOnGamepadButtonInternal(idx, PAD.RIGHT_TRIGGER, is_down, timestamp);
    } break;
    default:
      return;
  }
  sdlEventQueue(function () {
    let idx = pads.indexOf(pad);
    if (idx !== -1) {
      fn(idx);
    }
  });
}

function onClose(pad: PadData): void {
  let idx = pads.indexOf(pad);
  if (idx !== -1) {
    releaseAll(idx);
    pads[idx] = null;
  }
}

function openDevice(device: Sdl.Gamepad.Device): void {
  if (pads.some((pad) => pad?.device_id === device.id)) {
    return;
  }
  let instance;
  try {
    instance = sdl.gamepad.openDevice(device);
  } catch (e) {
    console.error(`Error opening gamepad "${device.name}":`, e);
    return;
  }
  let idx = pads.indexOf(null);
  if (idx === -1) {
    idx = pads.length;
  }
  let pad: PadData = {
    instance,
    device_id: device.id,
  };
  pads[idx] = pad;
  inputOnGamepadNameInternal(idx, device.name || undefined);
  instance.on('buttonDown', (evt) => onButton(pad, evt.button, true));
  instance.on('buttonUp', (evt) => onButton(pad, evt.button, false));
  instance.on('axisMotion', (evt) => onAxisMotion(pad, evt.axis));
  // Initial state (e.g. a trigger already held)
  onAxisMotion(pad, 'leftStickX');
  onAxisMotion(pad, 'rightStickX');
  onAxisMotion(pad, 'leftTrigger');
  onAxisMotion(pad, 'rightTrigger');
  instance.on('close', () => sdlEventQueue(onClose.bind(null, pad)));
}

function loadMappings(application_root: string): void {
  let db = `${application_root}gamecontrollerdb.txt`;
  fs.readFile(db, 'utf8', function (err, text) {
    if (err) {
      console.error(`Error reading ${db}: ${err}`);
      return;
    }
    const mappings = text.split('\n').filter((line) => line && !line.startsWith('#'));
    sdl.gamepad.addMappings(mappings);
    console.log(`Loaded ${mappings.length} mappings from gamecontrollerdb.txt`);
  });
}

export function sdlGamepadStartup(application_root: string): void {
  sdl.gamepad.on('deviceAdd', (evt) => sdlEventQueue(openDevice.bind(null, evt.device)));
  sdl.gamepad.devices.forEach(openDevice);
  loadMappings(application_root);
}
