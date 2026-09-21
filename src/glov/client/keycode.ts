/* globals KeyboardEvent */

/**
 * Layout-independent conversion from KeyboardEvent.code (e.g. "KeyA")
 * to the legacy US-QWERTY KeyboardEvent.keyCode (e.g. 65).
 *
 * `event.code` identifies the PHYSICAL key, so it is the same on QWERTY,
 * AZERTY, Dvorak, etc. `event.keyCode` is derived from the character the
 * key produces, so it changes with the layout (AZERTY's physical "KeyA"
 * position reports 81). Mapping from `code` gives a stable QWERTY keyCode.
 */

const QWERTY_KEY_CODES: Partial<Record<string, number>> = {
  // Numpad operators
  NumpadMultiply: 106,
  NumpadAdd: 107,
  NumpadSubtract: 109,
  NumpadDecimal: 110,
  NumpadDivide: 111,
  NumpadEnter: 13,
  NumLock: 144,

  // Editing / white-space
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Space: 32,
  Insert: 45,
  Delete: 46,

  // Navigation
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,

  // Modifiers & system
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
  AltLeft: 18,
  AltRight: 18,
  Pause: 19,
  CapsLock: 20,
  Escape: 27,
  PrintScreen: 44,
  ScrollLock: 145,
  MetaLeft: 91,
  MetaRight: 92,
  ContextMenu: 93,

  // Punctuation (US-QWERTY positions)
  Semicolon: 186,
  Equal: 187,
  Comma: 188,
  Minus: 189,
  Period: 190,
  Slash: 191,
  Backquote: 192,
  BracketLeft: 219,
  Backslash: 220,
  BracketRight: 221,
  Quote: 222,
  IntlBackslash: 226,
};

// Letters: KeyA..KeyZ -> 65..90
for (let ii = 0; ii < 26; ++ii) {
  QWERTY_KEY_CODES[`Key${String.fromCharCode(65 + ii)}`] = 65 + ii;
}

// Top-row digits: Digit0..Digit9 -> 48..57
for (let ii = 0; ii < 10; ++ii) {
  QWERTY_KEY_CODES[`Digit${ii}`] = 48 + ii;
}

// Numpad digits: Numpad0..Numpad9 -> 96..105
for (let ii = 0; ii < 10; ++ii) {
  QWERTY_KEY_CODES[`Numpad${ii}`] = 96 + ii;
}

// Function keys: F1..F12 -> 112..123
for (let ii = 0; ii < 12; ++ii) {
  QWERTY_KEY_CODES[`F${ii + 1}`] = 112 + ii;
}

export function qwertyKeyCodeFromEvent(event: KeyboardEvent): number {
  return QWERTY_KEY_CODES[event.code] || event.keyCode;
}
