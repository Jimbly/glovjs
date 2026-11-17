/* global navigator */

import { Rec } from 'glov/common/types';
import { inputLookupKeyName, inputValidKeyName, ValidKey } from './input';
import { eventCodeFromKeyCode, qwertyKeyCodeFromEventCode } from './keycode';

type LayoutMapper = {
  get: (event_code: string) => string | undefined;
  keys: () => string[]; // not actually, it's really some kind of Iterator
};
let layout_map: LayoutMapper;
let layout_inverse_map: Rec<ValidKey, ValidKey>;

let layout_map_initing = false;
function layoutMapInit(): void {
  if (layout_map_initing) {
    return;
  }

  let nav = navigator as unknown as {
    keyboard: {
      getLayoutMap: () => Promise<LayoutMapper>;
    };
  };
  if (!nav.keyboard || !nav.keyboard.getLayoutMap) {
    return;
  }

  layout_map_initing = true;
  nav.keyboard.getLayoutMap().then(function (lm) {
    layout_map = lm;
    layout_inverse_map = {};
    if (layout_map) {
      let keys = layout_map.keys();
      if (keys && keys.forEach) {
        keys.forEach(function (event_code: string) {
          let input_code_number = qwertyKeyCodeFromEventCode(event_code);
          if (!input_code_number) {
            return;
          }
          let input_code_name = inputLookupKeyName(input_code_number);
          if (!input_code_name) {
            return;
          }
          let key_name = layout_map.get(event_code);
          if (key_name) {
            let key_name_uc = key_name.toUpperCase();
            if (inputValidKeyName(key_name_uc)) {
              layout_inverse_map[key_name_uc] = input_code_name;
            }
          }
        });
      }
    }
  }, function (err) {
    console.warn(`Error getting keyboard layout map: ${err}`);
  });
  setTimeout(function () {
    layout_map_initing = false;
  }, 1000);
}

// Given a letter like 'W', return the input API key name (e.g. 'Z' on Azerty) that maps to it
export function keyboardLocalNameInverse(letter: ValidKey): ValidKey | null {
  if (layout_inverse_map && layout_inverse_map[letter]) {
    return layout_inverse_map[letter];
  }
  return null;
}

export function keyboardLocalName(key_code: number): string | undefined {
  layoutMapInit();
  if (layout_map) {
    // convert to event code
    let event_code = eventCodeFromKeyCode(key_code);
    if (event_code) {
      try {
        let ret = layout_map.get(event_code);
        if (ret) {
          return ret;
        }
      } catch (e) {
        // ignore
      }
    }
  }
}
