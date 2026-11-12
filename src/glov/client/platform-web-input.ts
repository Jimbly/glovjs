/* global EventListener, KeyboardEvent, Element, UIEvent */
import { Rec, TSMap } from 'glov/common/types';
import * as engine from './engine';
import {
  inputAllEventsAllowed,
  inputOnKeyDownInternal,
  inputOnKeyUpInternal,
  inputOnTextInputInternal,
  inputUpdateLayoutMap,
  KEYS,
  protectUnload,
} from './input';
import {
  MOD_ALT,
  MOD_CTRL,
  MOD_SHIFT,
} from './input_constants';
import { qwertyKeyCodeFromEvent } from './keycode';

type OurKeyboardEvent = KeyboardEvent & {
  target: Element | null;
  glov_do_not_cancel?: boolean; // can be set by app if they handle 'keydown' events before us
};

type OurInputEvent = UIEvent & {
  target: Element | null;
  glov_do_not_cancel?: boolean;
};

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
     to be lost, instead, relying on `allow_all_events` when a full-screen HTML UI is active.
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
    event.ctrlKey && code >= KEYS['0'] && code <= KEYS['9']; // Chrome tab switch hotkeys
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

export function webInputStartup(): void {
  window.addEventListener('keydown', onKeyDown as EventListener, false);
  window.addEventListener('keyup', onKeyUp as EventListener, false);
}
