import { hrnow } from 'glov/client/engine';
import { SDLWindow } from './platform-sdl';
import { sdlScancodeToKeyCode } from './platform-sdl-keys';
import { sdlWindowEmit } from './sdlwindow';

let sdlwindow: SDLWindow;

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

function keyEvent(evt: SDLKeyEvent): unknown {
  return {
    ...EVENT_BASIC,
    ctrlKey: evt.ctrl,
    altKey: evt.alt,
    metaKey: evt.super,
    shiftKey: evt.shift,
    key: null, // rely on layout map instead
    code: null, // e.g. KeyA, but keyCode below should be sufficient
    keyCode: sdlScancodeToKeyCode(evt.scancode),
    timeStamp: hrnow(),
  };
}

function onKeyDown(evt: SDLKeyEvent & {
  repeat: boolean;
}): void {
  if (evt.repeat) {
    return;
  }
  sdlWindowEmit('keydown', keyEvent(evt));
}

function onKeyUp(evt: SDLKeyEvent): void {
  sdlWindowEmit('keyup', keyEvent(evt));
}

function onTextInput(evt: {
  text: string;
}): void {
  // TODO
}

type SDLMouseEvent = {
  // Position relative to the window
  x: number;
  y: number;
  // Event was synthesized from a touch or pen event
  touch: boolean;
  pen: boolean;
};

function mouseEvent(evt: SDLMouseEvent): {
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
    timeStamp: hrnow(),
  };
}

type SDLMouseButtonEvent = SDLMouseEvent & {
  // A value from `sdl.mouse.BUTTON`: 1=LEFT, 2=MIDDLE, 3=RIGHT, 4=X1, 5=X2
  button: number;
};

function mouseButtonEvent(evt: SDLMouseButtonEvent): unknown {
  return {
    ...mouseEvent(evt),
    // DOM: 0=left, 1=middle, 2=right, 3=back (X1), 4=forward (X2)
    button: evt.button - 1,
  };
}

function onMouseButtonDown(evt: SDLMouseButtonEvent): void {
  sdlWindowEmit('mousedown', mouseButtonEvent(evt));
}

function onMouseButtonUp(evt: SDLMouseButtonEvent): void {
  sdlWindowEmit('mouseup', mouseButtonEvent(evt));
}

function onMouseMove(evt: SDLMouseEvent & {
  // Movement relative to the last position
  dx: number;
  dy: number;
}): void {
  sdlWindowEmit('mousemove', mouseEvent(evt));
}

// Pixels per wheel notch, matching what browsers report in `deltaY` (deltaMode 0)
const WHEEL_PIXELS_PER_NOTCH = 100;

function onMouseWheel(evt: SDLMouseEvent & {
  // Wheel movement
  dx: number;
  dy: number;
  // Platform reverses the scroll direction; multiply dx and dy by -1 to correct
  flipped: boolean;
}): void {
  let dy = evt.flipped ? -evt.dy : evt.dy;
  sdlWindowEmit('mousewheel', {
    ...mouseEvent(evt),
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

  sdlwindow.on('show', onVisible.bind(null, true));
  sdlwindow.on('hide', onVisible.bind(null, false));
  sdlwindow.on('expose', onVisible.bind(null, true));
  sdlwindow.on('minimize', onVisible.bind(null, false));
  sdlwindow.on('restore', onVisible.bind(null, true));
  sdlwindow.on('focus', onVisible.bind(null, true));

  sdlwindow.on('focus', onFocus);
  sdlwindow.on('blur', onBlur);

  sdlwindow.on('keyDown', onKeyDown);
  sdlwindow.on('keyUp', onKeyUp);
  sdlwindow.on('textInput', onTextInput);

  sdlwindow.on('mouseButtonDown', onMouseButtonDown);
  sdlwindow.on('mouseButtonUp', onMouseButtonUp);
  sdlwindow.on('mouseMove', onMouseMove);
  sdlwindow.on('mouseWheel', onMouseWheel);

  sdlwindow.on('fingerDown', onFingerDown);
  sdlwindow.on('fingerUp', onFingerUp);
  sdlwindow.on('fingerMove', onFingerMove);
  sdlwindow.on('fingerCancel', onFingerCancel);
}
