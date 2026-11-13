import { hrnow } from 'glov/client/engine';
import { inputOnKeyDownInternal, inputOnKeyUpInternal, inputOnTextInputInternal } from 'glov/client/input';
import {
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
} from 'glov/client/input_constants';
import { callEach } from 'glov/common/util';
import { SDLWindow } from './platform-sdl';
import { sdlScancodeToKeyCode } from './platform-sdl-keys';
import { sdlWindowEmit } from './sdlwindow';

let sdlwindow: SDLWindow;

// Many node-sdl APIs (window getters, clipboard, audio, etc) synchronously poll
//   and dispatch SDL events, so they can arrive in the middle of a frame, after
//   the code that would have read them has already run, losing entire key
//   presses / clicks.  Instead, queue them and dispatch immediately before ticking.
type QueuedHandler<T> = (evt: T, timestamp: number) => void;
let event_queue: (() => void)[] = [];
export function sdlEventQueue(fn: () => void): void {
  event_queue.push(fn);
}
function queued<T>(handler: QueuedHandler<T>): (evt: T) => void {
  return function (evt: T): void {
    sdlEventQueue(handler.bind(null, evt, hrnow()));
  };
}

export function sdlEventsDispatchQueued(): void {
  // Any events polled while dispatching wait for the next frame
  callEach(event_queue, event_queue = []);
}

// input.ts sends events with no `target` only to the DOM, not the engine
const MOUSE_EVENT_TARGET = {
  tagName: 'CANVAS',
  className: '',
};

let EVENT_BASIC = {
  target: MOUSE_EVENT_TARGET,
  stopPropagation: function () {
    // nothing for now
  },
  preventDefault: function () {
    // nothing for now
  },
};

function onVisible(is_visible: boolean): void {
  (window.document as { hidden: boolean }).hidden = !is_visible;
}

function onFocus(): void {
  sdlWindowEmit('focus', {});
}

function onBlur(): void {
  sdlWindowEmit('blur', {});
}

type SDLKeyEvent = {
  // Physical key, a value from `sdl.keyboard.SCANCODE` (USB usage page standard)
  scancode: number;
  // Virtual key in the current keyboard mapping: either the character the key
  //   produces, or a name such as 'escape', 'left', 'f1', 'shift', etc.  null
  //   if the physical key does not correspond to any virtual key.
  key: string | null;
  // Modifier state when the event was generated
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  super: boolean;
  altgr: boolean;
  capslock: boolean;
  numlock: boolean;
};

function modFromEvent(evt: SDLKeyEvent): number {
  return (evt.ctrl ? MOD_CTRL : 0) |
    (evt.alt ? MOD_ALT : 0) |
    // (evt.super ? MOD_META : 0) |
    (evt.shift ? MOD_SHIFT : 0);
}

function onKeyDown(evt: SDLKeyEvent & {
  repeat: boolean;
}, timestamp: number): void {
  if (evt.repeat) {
    return;
  }
  inputOnKeyDownInternal({
    code: sdlScancodeToKeyCode(evt.scancode),
    mod: modFromEvent(evt),
    timestamp,
  });
}

function onKeyUp(evt: SDLKeyEvent, timestamp: number): void {
  inputOnKeyUpInternal({
    code: sdlScancodeToKeyCode(evt.scancode),
    mod: modFromEvent(evt),
    timestamp,
    debug: [evt.scancode],
  });
}

function onTextInput(evt: {
  text: string;
}): void {
  inputOnTextInputInternal({
    mod: 0,
    text: evt.text,
  });
}

type SDLMouseEvent = {
  // Position relative to the window
  x: number;
  y: number;
  // Event was synthesized from a touch or pen event
  touch: boolean;
  pen: boolean;
};

function mouseEvent(evt: SDLMouseEvent, timestamp: number): {
  pageX: number;
  pageY: number;
  timeStamp: number;
} & typeof EVENT_BASIC {
  // no movementX/Y, no pointer locked support yet
  return {
    ...EVENT_BASIC,
    // Window-relative, in the same units as `sdlwindow.width/height`, which are
    //   converted to canvas pixels by `window.devicePixelRatio`
    pageX: evt.x,
    pageY: evt.y,
    timeStamp: timestamp,
  };
}

type SDLMouseButtonEvent = SDLMouseEvent & {
  // A value from `sdl.mouse.BUTTON`: 1=LEFT, 2=MIDDLE, 3=RIGHT, 4=X1, 5=X2
  button: number;
};

function mouseButtonEvent(evt: SDLMouseButtonEvent, timestamp: number): unknown {
  return {
    ...mouseEvent(evt, timestamp),
    // DOM: 0=left, 1=middle, 2=right, 3=back (X1), 4=forward (X2)
    button: evt.button - 1,
  };
}

function onMouseButtonDown(evt: SDLMouseButtonEvent, timestamp: number): void {
  sdlWindowEmit('mousedown', mouseButtonEvent(evt, timestamp));
}

function onMouseButtonUp(evt: SDLMouseButtonEvent, timestamp: number): void {
  sdlWindowEmit('mouseup', mouseButtonEvent(evt, timestamp));
}

function onMouseMove(evt: SDLMouseEvent & {
  // Movement relative to the last position
  dx: number;
  dy: number;
}, timestamp: number): void {
  sdlWindowEmit('mousemove', mouseEvent(evt, timestamp));
}

// Pixels per wheel notch, matching what browsers report in `deltaY` (deltaMode 0)
const WHEEL_PIXELS_PER_NOTCH = 100;

function onMouseWheel(evt: SDLMouseEvent & {
  // Wheel movement
  dx: number;
  dy: number;
  // Platform reverses the scroll direction; multiply dx and dy by -1 to correct
  flipped: boolean;
}, timestamp: number): void {
  let dy = evt.flipped ? -evt.dy : evt.dy;
  sdlWindowEmit('mousewheel', {
    ...mouseEvent(evt, timestamp),
    // SDL: positive is away from the user; DOM: positive is towards the user
    //   (scrolling down)
    deltaY: -dy * WHEEL_PIXELS_PER_NOTCH,
  });
}

type SDLTouchDevice = {
  id: bigint;
  name: string | null;
  type: 'direct' | 'indirectAbsolute' | 'indirectRelative' | null;
};

type SDLFingerEvent = {
  // null if the event was synthesized from a mouse or pen event
  device: SDLTouchDevice | null;
  fingerId: bigint;
  // Position and pressure, normalized to 0..1
  x: number;
  y: number;
  pressure: number;
  // Event was synthesized from a mouse or pen event
  mouse: boolean;
  pen: boolean;
};

function onFingerDown(evt: SDLFingerEvent): void {
  // TODO
}

function onFingerUp(evt: SDLFingerEvent): void {
  // TODO
}

function onFingerMove(evt: SDLFingerEvent & {
  // Movement relative to the last position, normalized to -1..1
  dx: number;
  dy: number;
}): void {
  // TODO
}

// System cancelled the touch (e.g. took over the gesture).  No 'fingerUp'
//   follows, so treat this as the end of the finger's gesture.
function onFingerCancel(evt: SDLFingerEvent): void {
  // TODO
}

export function sdlEventsStartup(sdlwindow_in: SDLWindow): void {
  sdlwindow = sdlwindow_in;
  sdlwindow.on('*', function (a: unknown) {
    if (a === 'move' || a === 'mouseMove') { // too noisy
      return;
    }
    if (a === 'keyUp' || a === 'keyDown') { // handled
      return;
    }
    if (a === 'hover' || a === 'leave') { // ignored
      return;
    }
    console.log(`SDL EVENT "${a}"`);
  });

  sdlwindow.on('show', queued(onVisible.bind(null, true)));
  sdlwindow.on('hide', queued(onVisible.bind(null, false)));
  sdlwindow.on('expose', queued(onVisible.bind(null, true)));
  sdlwindow.on('minimize', queued(onVisible.bind(null, false)));
  sdlwindow.on('restore', queued(onVisible.bind(null, true)));
  sdlwindow.on('focus', queued(onVisible.bind(null, true)));

  sdlwindow.on('focus', queued(onFocus));
  sdlwindow.on('blur', queued(onBlur));

  sdlwindow.on('keyDown', queued(onKeyDown));
  sdlwindow.on('keyUp', queued(onKeyUp));
  sdlwindow.on('textInput', queued(onTextInput));

  sdlwindow.on('mouseButtonDown', queued(onMouseButtonDown));
  sdlwindow.on('mouseButtonUp', queued(onMouseButtonUp));
  sdlwindow.on('mouseMove', queued(onMouseMove));
  sdlwindow.on('mouseWheel', queued(onMouseWheel));

  sdlwindow.on('fingerDown', queued(onFingerDown));
  sdlwindow.on('fingerUp', queued(onFingerUp));
  sdlwindow.on('fingerMove', queued(onFingerMove));
  sdlwindow.on('fingerCancel', queued(onFingerCancel));
}
