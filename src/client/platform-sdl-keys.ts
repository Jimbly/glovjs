import assert from 'assert';
import { default as sdl, Sdl } from '@kmamal/sdl';
import { KEYS, ValidKey } from 'glov/client/input';
import { Rec } from 'glov/common/types';

// SDL scancode name (from `sdl.keyboard.SCANCODE`) => GLOV key name (from `KEYS`).
// Multiple scancodes may map to the same key, matching the browser's `keyCode`
//   (e.g. both shift keys => SHIFT, numpad enter => RETURN).
const SCANCODE_TO_KEY: [Sdl.Keyboard.ScancodeNames, ValidKey][] = [
  ['BACKSPACE', 'BACKSPACE'],
  ['TAB', 'TAB'],
  ['RETURN', 'RETURN'],
  ['KP_ENTER', 'RETURN'],
  ['LSHIFT', 'SHIFT'],
  ['RSHIFT', 'SHIFT'],
  ['LCTRL', 'CTRL'],
  ['RCTRL', 'CTRL'],
  ['LALT', 'ALT'],
  ['RALT', 'ALT'],
  ['PAUSE', 'PAUSE'],
  ['CAPSLOCK', 'CAPS_LOCK'],
  ['ESCAPE', 'ESCAPE'],
  ['SPACE', 'SPACE'],
  ['PAGEUP', 'PAGEUP'],
  ['PAGEDOWN', 'PAGEDOWN'],
  ['END', 'END'],
  ['HOME', 'HOME'],
  ['LEFT', 'LEFT'],
  ['UP', 'UP'],
  ['RIGHT', 'RIGHT'],
  ['DOWN', 'DOWN'],
  ['PRINTSCREEN', 'PRINT_SCREEN'],
  ['INSERT', 'INS'],
  ['DELETE', 'DEL'],

  ['0', '0'],
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4'],
  ['5', '5'],
  ['6', '6'],
  ['7', '7'],
  ['8', '8'],
  ['9', '9'],

  ['A', 'A'],
  ['B', 'B'],
  ['C', 'C'],
  ['D', 'D'],
  ['E', 'E'],
  ['F', 'F'],
  ['G', 'G'],
  ['H', 'H'],
  ['I', 'I'],
  ['J', 'J'],
  ['K', 'K'],
  ['L', 'L'],
  ['M', 'M'],
  ['N', 'N'],
  ['O', 'O'],
  ['P', 'P'],
  ['Q', 'Q'],
  ['R', 'R'],
  ['S', 'S'],
  ['T', 'T'],
  ['U', 'U'],
  ['V', 'V'],
  ['W', 'W'],
  ['X', 'X'],
  ['Y', 'Y'],
  ['Z', 'Z'],

  ['LGUI', 'META_LEFT'],
  ['RGUI', 'META_RIGHT'],
  ['APPLICATION', 'CONTEXT_MENU'], // The "menu" key on standard (Windows) keyboards

  ['KP_0', 'NUMPAD0'],
  ['KP_1', 'NUMPAD1'],
  ['KP_2', 'NUMPAD2'],
  ['KP_3', 'NUMPAD3'],
  ['KP_4', 'NUMPAD4'],
  ['KP_5', 'NUMPAD5'],
  ['KP_6', 'NUMPAD6'],
  ['KP_7', 'NUMPAD7'],
  ['KP_8', 'NUMPAD8'],
  ['KP_9', 'NUMPAD9'],
  ['KP_MULTIPLY', 'NUMPAD_MULTIPLY'],
  ['KP_PLUS', 'NUMPAD_ADD'],
  ['KP_MINUS', 'NUMPAD_SUBTRACT'],
  ['KP_PERIOD', 'NUMPAD_DECIMAL_POINT'],
  ['KP_DIVIDE', 'NUMPAD_DIVIDE'],

  ['F1', 'F1'],
  ['F2', 'F2'],
  ['F3', 'F3'],
  ['F4', 'F4'],
  ['F5', 'F5'],
  ['F6', 'F6'],
  ['F7', 'F7'],
  ['F8', 'F8'],
  ['F9', 'F9'],
  ['F10', 'F10'],
  ['F11', 'F11'],
  ['F12', 'F12'],

  ['NUMLOCKCLEAR', 'NUM_LOCK'],
  ['SCROLLLOCK', 'SCROLL_LOCK'],
  ['SEMICOLON', 'SEMICOLON'],
  ['EQUALS', 'EQUALS'],
  ['COMMA', 'COMMA'],
  ['MINUS', 'MINUS'],
  ['PERIOD', 'PERIOD'],
  ['SLASH', 'SLASH'],
  ['GRAVE', 'TILDE'],

  ['LEFTBRACKET', 'BRACKET_LEFT'],
  ['BACKSLASH', 'BACKSLASH'],
  ['NONUSHASH', 'BACKSLASH'], // ISO keyboards' key next to Enter; browsers also report it as Backslash
  ['RIGHTBRACKET', 'BRACKET_RIGHT'],
  ['APOSTROPHE', 'QUOTE'],
  ['NONUSBACKSLASH', 'INTLBACKSLASH'], // ISO keyboards' key next to left shift
];

const SCANCODE_MAP: Rec<number, number> = {};
for (let ii = 0; ii < SCANCODE_TO_KEY.length; ++ii) {
  let [scancode_name, key] = SCANCODE_TO_KEY[ii];
  let scancode = sdl.keyboard.SCANCODE[scancode_name];
  assert(typeof scancode === 'number', `Unknown SDL scancode ${scancode_name}`);
  SCANCODE_MAP[scancode] = KEYS[key];
}

export function sdlScancodeToKeyCode(scancode: Sdl.Keyboard.Scancode): number {
  return SCANCODE_MAP[scancode] || 0;
}
