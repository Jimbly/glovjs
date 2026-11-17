import assert from 'assert';
import { default as sdl } from '@kmamal/sdl';
import {
  inputLookupKeyName,
  inputValidKeyName,
  ValidKey,
} from 'glov/client/input';
import { Rec } from 'glov/common/types';
import { sdlScancodeToKeyCode } from './platform-sdl-keys';

let layout_map_inverse: Rec<ValidKey, ValidKey>;
let layout_map: Rec<number, string>;

// Given a letter like 'W', return the input API key name (e.g. 'Z' on Azerty) that maps to it
export function keyboardLocalNameInverse(letter: ValidKey): ValidKey | null {
  return layout_map_inverse[letter] || null;
}

export function keyboardLocalName(key_code: number): string | undefined {
  return layout_map[key_code];
}

function keymapInit(): void {
  layout_map_inverse = Object.create(null);
  layout_map = Object.create(null);
  for (let scancode = 0; scancode < 511; ++scancode) {
    let keycode = sdlScancodeToKeyCode(scancode);
    if (keycode) {
      let sdl_key = sdl.keyboard.getKey(scancode);
      if (sdl_key === null) {
        continue;
      }
      let name = inputLookupKeyName(keycode);
      assert(name);
      let sdl_key_uc = sdl_key.toUpperCase();
      if (inputValidKeyName(sdl_key_uc)) {
        layout_map_inverse[name] = sdl_key_uc;
      }
      layout_map[keycode] = sdl_key;
    }
  }
}

function onKeymapChange(): void {
  keymapInit();
}

export function sdlKeyboardLayoutStartup(): void {
  sdl.keyboard.on('keymapChange', onKeymapChange);
  keymapInit();
}
