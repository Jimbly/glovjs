// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

import { platformAdapterGet } from 'glov/client/engine';
import { fontSetReplacementChars } from 'glov/client/font';
import { locateAsset } from 'glov/client/locate_asset';
import { getURLBase } from 'glov/client/urlhash';
import { webFSGetFile } from 'glov/client/webfs';
import { mashString } from 'glov/common/rand_alea';
import { randFastCreate } from 'glov/common/rand_fast';
import {
  profanityCommonStartup,
  profanityFilterCommon,
  profanitySetReplacementChars,
} from 'glov/common/words/profanity_common';

let non_profanity;

export function profanityStartup() {
  non_profanity = webFSGetFile('words/replacements.txt', 'text').split('\n').filter((a) => a);
  profanityCommonStartup(webFSGetFile('words/filter.gkg', 'text'),
    webFSGetFile('words/exceptions.txt', 'text'));

}

export function profanityStartupLate() {
  // Async load of (potentially large) unicode replacement data, after all other loading is finished
  let url = `${getURLBase()}${locateAsset('replacement_chars.min.js')}`;
  platformAdapterGet().loadScript(url, function () {
    if (window.unicode_replacement_chars) {
      profanitySetReplacementChars(window.unicode_replacement_chars);
      fontSetReplacementChars(window.unicode_replacement_chars);
    }
  });
}

let rand = randFastCreate();

let last_word;
function randWord() {
  if (last_word === -1 || non_profanity.length === 1) {
    last_word = rand.range(non_profanity.length);
  } else {
    let choice = rand.range(non_profanity.length - 1);
    last_word = choice < last_word ? choice : choice + 1;
  }
  return non_profanity[last_word];
}

export function profanityFilter(user_str) {
  last_word = -1;
  rand.seed = mashString(user_str);
  return profanityFilterCommon(user_str, randWord);
}
