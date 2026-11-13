import { Events } from '@kmamal/sdl';
import { hrnow } from 'glov/client/engine';
import {
  InputMouseEvent,
  inputOnKeyDownInternal,
  inputOnKeyUpInternal,
  inputOnMouseDownInternal,
  inputOnMouseMoveInternal,
  inputOnMouseUpInternal,
  inputOnMouseWheelInternal,
  inputOnTextInputInternal,
} from 'glov/client/input';
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

function onVisible(is_visible: boolean): void {
  (window.document as { hidden: boolean }).hidden = !is_visible;
}

function onFocus(): void {
  sdlWindowEmit('focus', {});
}

function onBlur(): void {
  sdlWindowEmit('blur', {});
}

function modFromEvent(evt: Events.Window.KeyDown | Events.Window.KeyUp): number {
  return (evt.ctrl ? MOD_CTRL : 0) |
    (evt.alt ? MOD_ALT : 0) |
    // (evt.super ? MOD_META : 0) |
    (evt.shift ? MOD_SHIFT : 0);
}

function onKeyDown(evt: Events.Window.KeyDown, timestamp: number): void {
  inputOnKeyDownInternal({
    code: sdlScancodeToKeyCode(evt.scancode),
    mod: modFromEvent(evt),
    timestamp,
  });
}

function onKeyUp(evt: Events.Window.KeyUp, timestamp: number): void {
  inputOnKeyUpInternal({
    code: sdlScancodeToKeyCode(evt.scancode),
    mod: modFromEvent(evt),
    timestamp,
    debug: [evt.scancode],
  });
}

function onTextInput(evt: Events.Window.TextInput): void {
  inputOnTextInputInternal({
    mod: 0,
    text: evt.text,
  });
}

function mouseEvent(evt: Events.Window.MouseMove | Events.Window.MouseWheel | MouseButtonEvent,
  timestamp: number
): InputMouseEvent {
  return {
    // Window-relative, in the same units as `sdlwindow.width/height`, which are
    //   converted to canvas pixels by `window.devicePixelRatio`
    x: evt.x,
    y: evt.y,
    timestamp,
  };
}

type MouseButtonEvent = Events.Window.MouseButtonDown | Events.Window.MouseButtonUp;
function mouseButtonEvent(evt: MouseButtonEvent, timestamp: number): InputMouseEvent & { button: number } {
  return {
    ...mouseEvent(evt, timestamp),
    // SDL (`sdl.mouse.BUTTON`): 1=LEFT, 2=MIDDLE, 3=RIGHT, 4=X1, 5=X2
    // GLOV (DOM): 0=left, 1=middle, 2=right, 3=back (X1), 4=forward (X2)
    button: evt.button - 1,
  };
}

function onMouseButtonDown(evt: Events.Window.MouseButtonDown, timestamp: number): void {
  inputOnMouseDownInternal(mouseButtonEvent(evt, timestamp), false);
}

function onMouseButtonUp(evt: Events.Window.MouseButtonUp, timestamp: number): void {
  inputOnMouseUpInternal(mouseButtonEvent(evt, timestamp), false);
}

function onMouseMove(evt: Events.Window.MouseMove, timestamp: number): void {
  inputOnMouseMoveInternal({
    ...mouseEvent(evt, timestamp),
    movement_x: evt.dx,
    movement_y: evt.dy,
  });
}

function onMouseWheel(evt: Events.Window.MouseWheel, timestamp: number): void {
  inputOnMouseWheelInternal({
    ...mouseEvent(evt, timestamp),
    // In notches, positive is away from the user (scrolling up), same as SDL
    wheel_delta: evt.flipped ? -evt.dy : evt.dy,
  });
}

function onFingerDown(evt: Events.Window.FingerDown): void {
  // TODO
}

function onFingerUp(evt: Events.Window.FingerUp): void {
  // TODO
}

function onFingerMove(evt: Events.Window.FingerMove): void {
  // TODO
}

// System cancelled the touch (e.g. took over the gesture).  No 'fingerUp'
//   follows, so treat this as the end of the finger's gesture.
function onFingerCancel(evt: Events.Window.FingerCancel): void {
  // TODO
}

export function sdlEventsStartup(sdlwindow_in: SDLWindow): void {
  sdlwindow = sdlwindow_in;
  sdlwindow.on('*', function (a) {
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
