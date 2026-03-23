import {
  DEBUG,
  debugDefineIsSet,
  setState,
} from 'glov/client/engine';
import { localStorageGetJSON } from 'glov/client/local_storage';
import { netSubs } from 'glov/client/net';
import {
  buttonText,
  modalDialog,
  print,
  uiButtonHeight,
  uiButtonWidth,
  uiTextHeight,
} from 'glov/client/ui';
import * as urlhash from 'glov/client/urlhash';

export const DEMO_AUTO_START = debugDefineIsSet('CHARCREATE') || false; // moraff demo

import { createAccountUI } from './account_ui';
import {
  crawlerCommStart,
  crawlerCommStartup,
  crawlerCommWant,
} from './crawler_comm';
import {
  crawlerPlayWantMode,
  crawlerPlayWantNewGame,
  SavedGameData,
} from './crawler_play';
import * as main from './main';
import { tickMusic } from './music';


const ALLOW_ONLINE = true;

const { max } = Math;

type AccountUI = ReturnType<typeof createAccountUI>;

let account_ui: AccountUI;

function startNewGame(slot: number): void {
  crawlerPlayWantNewGame();
  urlhash.go(`?c=local&slot=${slot}`);
}

function title(dt: number): void {
  main.chat_ui.run({
    hide: true,
  });

  tickMusic(null);

  let y = 40;
  if (ALLOW_ONLINE || DEBUG) {
    let next_y = account_ui.showLogin({
      x: 10,
      y: 10,
      pad: 2,
      text_w: 120,
      label_w: 80,
      style: null,
      center: false,
      button_width: uiButtonWidth(),
      font_height_small: uiTextHeight(),
    });

    y = max(next_y + 2, y);
  }

  let x = 10;
  print(null, x, y, Z.UI, 'Crawler Demo');
  x += 10;
  y += uiTextHeight() + 2;
  for (let ii = 0; ii < 3; ++ii) {
    let slot = ii + 1;
    let manual_data = localStorageGetJSON<SavedGameData>(`savedgame_${slot}.manual`, { timestamp: 0 });
    print(null, x, y, Z.UI, `Slot ${slot}`);
    if (buttonText({
      x, y: y + uiButtonHeight(), text: 'Load Game',
      disabled: !manual_data.timestamp
    })) {
      crawlerPlayWantMode('manual');
      urlhash.go(`?c=local&slot=${slot}`);
    }
    if (buttonText({
      x, y: y + uiButtonHeight() * 2 + 2, text: 'New Game',
    })) {
      if (manual_data.timestamp) {
        modalDialog({
          text: 'This will overwrite your existing game when you next save.  Continue?',
          buttons: {
            yes: function () {
              startNewGame(slot);
            },
            no: null,
          }
        });
      } else {
        startNewGame(slot);
      }
    }
    x += uiButtonWidth() + 2;
  }
  x = 10;
  y += uiButtonHeight() * 3 + 6;
  if (ALLOW_ONLINE && netSubs().loggedIn()) {
    if (buttonText({
      x, y, text: 'Online Test',
    })) {
      urlhash.go('?c=build');
    }
    y += uiButtonHeight() + 2;
  }
  if (crawlerCommWant()) {
    crawlerCommStart();
  }
}

export function titleInit(dt: number): void {
  account_ui = account_ui || createAccountUI();
  setState(title);
  title(dt);

  if (DEMO_AUTO_START) {
    startNewGame(1);
  }
}

export function titleStartup(): void {
  crawlerCommStartup({
    lobby_state: titleInit,
    title_func: (value: string) => `Crawler Demo | "${value}"`,
    chat_ui: main.chat_ui,
  });
}
