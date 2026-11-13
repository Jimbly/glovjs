/* global ClipboardEvent, EventListener, KeyboardEvent, Element, UIEvent, MouseEvent, Event */

let mouse_log = 0;

import assert from 'assert';
import { Rec, TSMap, WithRequired } from 'glov/common/types';
import { cmd_parse } from './cmds';
import * as engine from './engine';
import {
  getFrameIndex,
} from './engine';
import {
  inputAllEventsAllowed,
  InputMouseEvent,
  inputOnKeyDownInternal,
  inputOnKeyUpInternal,
  inputOnMouseDownInternal,
  inputOnMouseMoveInternal,
  inputOnMouseUpInternal,
  inputOnMouseWheelInternal,
  inputOnTextInputInternal,
  inputUpdateLayoutMap,
  KEYS,
  pointerLocked,
  protectUnload,
} from './input';
import {
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
} from './input_constants';
import { qwertyKeyCodeFromEvent } from './keycode';
import { normalizeWheel, WheelEvent } from './normalize_mousewheel';

cmd_parse.registerValue('mouse_log', {
  type: cmd_parse.TYPE_INT,
  range: [0, 1],
  get: () => mouse_log,
  set: (v) => (mouse_log = v),
});

type OurKeyboardEvent = KeyboardEvent & {
  target: Element | null;
  glov_do_not_cancel?: boolean; // can be set by app if they handle 'keydown' events before us
};

type OurInputEvent = UIEvent & {
  target: Element | null;
  glov_do_not_cancel?: boolean;
};

type OurMouseEvent = MouseEvent & {
  target: Element | null;
  glov_do_not_cancel?: boolean;
  mozMovementX?: number;
  mozMovementY?: number;
  webkitMovementX?: number;
  webkitMovementY?: number;
};

let last_event: OurInputEvent;
const skip: TSMap<1> = { isTrusted: 1, sourceCapabilities: 1, path: 1, currentTarget: 1, view: 1 };
function eventlog(event: OurInputEvent): void {
  if (event === last_event) {
    return;
  }
  last_event = event;
  let event_iter = event as unknown as TSMap<TSMap<unknown> & { id: string }>;
  let pairs = [];
  for (let k in event_iter) {
    let v = event_iter[k];
    if (!v || typeof v === 'function' || k.toUpperCase() === k || skip[k]) {
      continue;
    }
    pairs.push(`${k}:${v.id || v}`);
  }
  console.log(`${getFrameIndex()} ${event.type} ${pointerLocked()?'ptrlck':'unlckd'} ${pairs.join(',')}`);
}

function eventTimestamp(event: UIEvent | null): number {
  if (event) {
    if (event.timeStamp) {
      // browser event timestamp
      // assert((event.timeStamp < 1e12) === (engine.hrtime < 1e12));
      // Must both be high res times, or both not!
      if ((event.timeStamp < 1e12) !== (engine.hrtime < 1e12)) {
        return engine.hrtime;
      }
      return event.timeStamp;
    }
  }
  return engine.hrtime;
}

// eslint-disable-next-line func-style
let event_filter: (event: OurInputEvent) => boolean = function (): boolean {
  return false;
};

// `filter` returns true if the event should be allowed to propagate to the DOM,
// and (for mouse up/down events) not be sent to the engine
export function platformWebSetEventFilter(filter: (event: OurInputEvent) => boolean): void {
  event_filter = filter;
}

function isInputElement(target: Element | null): boolean | null {
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
    target.tagName === 'LABEL' || target.tagName === 'VIDEO');
}

const EVENT_TO_ENGINE = 1; // Note: only mouse-up/down events get filtered, all events otherwise got to-engine
const EVENT_TO_DOM = 2;
const EVENT_TO_BOTH = 3;
function letEventThrough(event: OurInputEvent, no_dom_if_leaving?: boolean): 1 | 2 | 3 {
  if (!event.target || inputAllEventsAllowed() || event.glov_do_not_cancel) {
    return EVENT_TO_DOM;
  }
  // Going to an input or related element
  if (isInputElement(event.target) ||
    String(event.target.className).includes('noglov') || event_filter(event)) {
    return EVENT_TO_DOM;
  }

  /* Note: not preventing engine from handling this case, because it would cause
     legitimate clicks (e.g. when an edit box is focused)
     to be lost, instead, relying on inputAllEventsAllowed() when a full-screen HTML UI is active.
  */
  // or, one of those is focused, and going away from it (e.g. input elem focused, clicking on canvas)
  // this also allows drag events that started in a text area to function (issue on Electron)
  if (document.activeElement && event.target !== document.activeElement &&
    (isInputElement(document.activeElement) ||
      String(document.activeElement.className).includes('noglov'))
  ) {
    if (no_dom_if_leaving) {
      // for mouse down events leaving a focused input element, we do _not_ want
      // them to go to the DOM, because it will unfocus the input element, which,
      // if it's the Chat UI, will cause the element the user is trying to click
      // on to disappear before the click (mouse up) even comes through.
      return EVENT_TO_ENGINE;
    } else {
      return EVENT_TO_BOTH;
    }
  }
  return EVENT_TO_ENGINE;
}

function letWheelEventThrough(event: OurMouseEvent): boolean | null {
  // *not* checking for `noglov`, as links have these, and we want to capture scroll events even if mouse is over links
  return inputAllEventsAllowed() || isInputElement(event.target);
}

function modFromEvent(event: OurKeyboardEvent): number {
  return (event.shiftKey ? MOD_SHIFT : 0) |
    (event.ctrlKey ? MOD_CTRL : 0) |
    (event.altKey ? MOD_ALT : 0);
}

function onKeyUp(event: OurKeyboardEvent): void {
  protectUnload(event.ctrlKey);
  let code = qwertyKeyCodeFromEvent(event);
  if (!(letEventThrough(event) & EVENT_TO_DOM)) {
    event.stopPropagation();
    event.preventDefault();
  }

  inputOnKeyUpInternal({
    code,
    mod: modFromEvent(event),
    timestamp: eventTimestamp(event),
    debug: [event.code, event.key],
  });
}

// Characters for US QWERTY, used only when event.key is unavailable
// [unshifted, shifted]
const US_KEYCODE_CHARS: Rec<number, [string, string]> = {
  32: [' ', ' '],
  48: ['0', ')'], 49: ['1', '!'], 50: ['2', '@'], 51: ['3', '#'], 52: ['4', '$'],
  53: ['5', '%'], 54: ['6', '^'], 55: ['7', '&'], 56: ['8', '*'], 57: ['9', '('],
  // Punctuation: Chrome/Safari codes, plus Firefox's different codes
  186: [';', ':'], 59: [';', ':'],    // Firefox: 59
  187: ['=', '+'], 61: ['=', '+'],    // Firefox: 61
  189: ['-', '_'], 173: ['-', '_'],   // Firefox: 173
  188: [',', '<'], 190: ['.', '>'], 191: ['/', '?'], 192: ['`', '~'],
  219: ['[', '{'], 220: ['\\', '|'], 221: [']', '}'], 222: ["'", '"'],
  // Numpad (keyCodes only appear here with Num Lock on)
  96: ['0', '0'], 97: ['1', '1'], 98: ['2', '2'], 99: ['3', '3'], 100: ['4', '4'],
  101: ['5', '5'], 102: ['6', '6'], 103: ['7', '7'], 104: ['8', '8'], 105: ['9', '9'],
  106: ['*', '*'], 107: ['+', '+'], 109: ['-', '-'], 110: ['.', '.'], 111: ['/', '/']
};

// Old IE / legacy Edge key names for printable keys
const LEGACY_KEY_NAMES: TSMap<string> = {
  Spacebar: ' ',
  Add: '+',
  Subtract: '-',
  Multiply: '*',
  Divide: '/',
  Decimal: '.',
};

// Returns the typed character, or null if this keydown doesn't produce one.
function getTypedChar(e: OurKeyboardEvent): string | null {
  // Skip shortcuts, but allow Ctrl+Alt (AltGr on Windows).
  if (e.metaKey || (e.ctrlKey && !e.altKey)) {
    return null;
  }

  let k: string | undefined = e.key;
  if (k !== undefined) {
    if (LEGACY_KEY_NAMES[k]) {
      k = LEGACY_KEY_NAMES[k]!;
    }
    // "Dead", "Unidentified", "Shift", "ArrowLeft", etc. are all multi-char.
    // (Code-point check so emoji/astral chars count as one character.)
    if (k.length === 1 || (k.length === 2 && (/^[\uD800-\uDBFF]/).test(k))) {
      return k;
    }
    return null;
  }

  // ---- Legacy fallback: assume US layout ----
  if (e.altKey) {
    return null; // can't know AltGr/Option output
  }
  let code = e.keyCode || e.which;
  if (code >= 65 && code <= 90) { // letters
    let upper = e.shiftKey;
    // Caps Lock where detectable (getModifierState exists in some pre-`key` builds)
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      upper = !upper;
    }
    let ch = String.fromCharCode(code);
    return upper ? ch : ch.toLowerCase();
  }
  let pair = US_KEYCODE_CHARS[code];
  return pair ? pair[e.shiftKey ? 1 : 0] : null;
}


function isPasteKey(code: number, event: OurKeyboardEvent): boolean {
  return code === KEYS.V && event.ctrlKey && !event.altKey && !event.shiftKey ||
    code === KEYS.INS && event.shiftKey && !event.ctrlKey && !event.altKey;
}

// Browsers have no synchronous clipboard read, so capture the text from the
//   `paste` event the browser fires after a paste keystroke's keydown; it is
//   cleared after the next frame (which processes that keystroke).
let paste_text: string | null = null;
function onPaste(event: ClipboardEvent): void {
  if (letEventThrough(event as unknown as OurInputEvent) & EVENT_TO_DOM) {
    // going to a DOM input element, not us
    return;
  }
  event.preventDefault();
  paste_text = event.clipboardData ? event.clipboardData.getData('text/plain') : null;
}

export function webInputPasteText(): string | null {
  return paste_text;
}

export function webInputPasteTextClear(): void {
  paste_text = null;
}

function onKeyDown(event: OurKeyboardEvent): void {
  // console.log(`${event.code} ${event.keyCode} ${event.key}`);
  protectUnload(event.ctrlKey);
  let code = qwertyKeyCodeFromEvent(event);
  let typed_char = getTypedChar(event);
  let no_stop = (letEventThrough(event) & EVENT_TO_DOM) ||
    code >= KEYS.F5 && code <= KEYS.F12 || // Chrome debug hotkeys
    code === KEYS.F4 && (event.altKey || event.metaKey || event.ctrlKey) || // Windows/Electron close window hotkey
    code === KEYS.I && (event.altKey && event.metaKey || event.ctrlKey && event.shiftKey) || // Safari, alternate Chrome
    code === KEYS.R && event.ctrlKey || // Chrome reload hotkey
    (code === KEYS.LEFT || code === KEYS.RIGHT) && event.altKey || // forward/back navigation
    event.ctrlKey && code >= KEYS['0'] && code <= KEYS['9'] || // Chrome tab switch hotkeys
    isPasteKey(code, event); // let the browser generate a `paste` event
  if (!no_stop) {
    event.stopPropagation();
    event.preventDefault();
  }
  // Letting through to our code regardless of no_stop, because we handle things like ESC in INPUT elements
  if (typeof event.key === 'string') {
    inputUpdateLayoutMap(code, event.key);
  }
  let mod = modFromEvent(event);
  let timestamp = eventTimestamp(event);

  inputOnKeyDownInternal({ code, mod, timestamp });
  if (typed_char) {
    inputOnTextInputInternal({
      mod,
      text: typed_char,
    });
  }
}

function onMouseEvent(
  event: OurMouseEvent,
  no_stop?: boolean,
  no_dom_if_leaving?: boolean
): InputMouseEvent {
  /// eventlog(event);
  // Don't block mouse button 3, that's the Back button
  if (!(letEventThrough(event, no_dom_if_leaving) & EVENT_TO_DOM) && !no_stop && event.button !== 3) {
    event.preventDefault();
    event.stopPropagation();
  }

  // offsetX/layerX return position relative to text-entry boxes, not good!
  // clientX/clientY do not handle weird scrolling that happens on iOS, but
  //   should not affect mouse events (but maybe on Safari desktop?)
  let x = event.pageX;
  let y = event.pageY;
  // if (event.offsetX !== undefined) {
  //   mouse_pos[0] = event.offsetX;
  //   mouse_pos[1] = event.offsetY;
  // } else {
  //   mouse_pos[0] = event.layerX;
  //   mouse_pos[1] = event.layerY;
  // }

  let movement_x = event.movementX || event.mozMovementX || event.webkitMovementX;
  let movement_y = event.movementY || event.mozMovementY || event.webkitMovementY;

  return {
    x, y,
    movement_x,
    movement_y,
    button: event.button,
    timestamp: event.timeStamp,
  };
}

function onMouseMove(event: OurMouseEvent): void {
  let evt2 = onMouseEvent(event);
  inputOnMouseMoveInternal(evt2);
}

function onMouseDown(event: OurMouseEvent): void {
  if (mouse_log) {
    eventlog(event);
  }
  let evt2 = onMouseEvent(event, false, true);
  let no_click = !(letEventThrough(event, true) & EVENT_TO_ENGINE);
  inputOnMouseDownInternal(evt2, no_click);
  //This solves input bug when game is running as iframe. E.g. Facebook Instant
  if (window.focus) {
    window.focus();
  }
}

function hasButton(event: InputMouseEvent): event is WithRequired<InputMouseEvent, 'button'> {
  return event.button !== undefined;
}

function onMouseUp(event: OurMouseEvent): void {
  if (mouse_log) {
    eventlog(event);
  }
  let evt2 = onMouseEvent(event);
  assert(hasButton(evt2));
  let no_click = !(letEventThrough(event) & EVENT_TO_ENGINE);
  inputOnMouseUpInternal(evt2, no_click);
}

function onWheel(event: OurMouseEvent): void {
  let evt2 = onMouseEvent(event, true);
  let normalized = normalizeWheel(event as unknown as WheelEvent);
  inputOnMouseWheelInternal({
    ...evt2,
    wheel_delta: -normalized.pixel_y/100,
  });
  if (!letWheelEventThrough(event)) {
    event.stopPropagation();
    event.preventDefault();
  }
}

let passive_param: false | { passive: false } = false;

function dummyListener(evt: Event): void {
  // nothing
}

function ignored(event: OurInputEvent): void {
  // eventlog(event);
  if (!(letEventThrough(event) & EVENT_TO_DOM)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function webInputStartup(): void {
  try {
    let opts = Object.defineProperty({}, 'passive', {
      get: function () {
        passive_param = { passive: false };
        return false;
      }
    });
    window.addEventListener('test', dummyListener, opts);
    window.removeEventListener('test', dummyListener, opts);
  } catch (e) {
    passive_param = false;
  }

  window.addEventListener('keydown', onKeyDown as EventListener, false);
  window.addEventListener('keyup', onKeyUp as EventListener, false);
  window.addEventListener('paste', onPaste as EventListener, false);

  window.addEventListener('mousemove', onMouseMove as EventListener, false);
  window.addEventListener('mousedown', onMouseDown as EventListener, false);
  window.addEventListener('mouseup', onMouseUp as EventListener, false);
  if (window.WheelEvent) {
    window.addEventListener('wheel', onWheel as EventListener, passive_param);
  } else {
    window.addEventListener('DOMMouseScroll', onWheel as EventListener, false);
    window.addEventListener('mousewheel', onWheel as EventListener, false);
  }

  window.addEventListener('click', ignored as EventListener, false);
  //window.addEventListener('click', eventlog as EventListener, false);
  window.addEventListener('contextmenu', ignored as EventListener, false);
}
