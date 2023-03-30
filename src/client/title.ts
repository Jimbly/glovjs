
import * as engine from 'glov/client/engine.js';
import { localStorageGet } from 'glov/client/local_storage.js';
import { netSubs } from 'glov/client/net.js';
import * as ui from 'glov/client/ui.js';
import * as urlhash from 'glov/client/urlhash.js';
import { createAccountUI } from './account_ui.js';
import { crawlerCommStart, crawlerCommStartup, crawlerCommWant } from './crawler_comm.js';
import { crawlerPlayWantNewGame } from './crawler_play.js';
import * as main from './main.js';


const { max } = Math;

type AccountUI = ReturnType<typeof createAccountUI>;

let account_ui: AccountUI;

function title(dt: number): void {
  main.chat_ui.run({
    hide: true,
  });

  let y = 40;
  if (engine.DEBUG || true) {
    let next_y = account_ui.showLogin({
      x: 10,
      y: 10,
      pad: 2,
      text_w: 120,
      label_w: 80,
      style: null,
      center: false,
      button_width: ui.button_width,
      font_height_small: ui.font_height,
    });

    y = max(next_y + 2, y);
  }

  let x = 10;
  ui.print(null, x, y, Z.UI, 'Crawler Demo');
  x += 10;
  y += ui.font_height + 2;
  for (let ii = 0; ii < 3; ++ii) {
    let slot = ii + 1;
    ui.print(null, x, y, Z.UI, `Slot ${slot}`);
    if (ui.buttonText({
      x, y: y + ui.button_height, text: 'Load Game',
      disabled: !localStorageGet(`savedgame_${slot}`)
    })) {
      urlhash.go(`?c=local&slot=${slot}`);
    }
    if (ui.buttonText({
      x, y: y + ui.button_height * 2 + 2, text: 'New Game',
    })) {
      crawlerPlayWantNewGame();
      urlhash.go(`?c=local&slot=${slot}`);
    }
    x += ui.button_width + 2;
  }
  x = 10;
  y += ui.button_height * 3 + 6;
  if (netSubs().loggedIn()) {
    if (ui.buttonText({
      x, y, text: 'Online Test',
    })) {
      urlhash.go('?c=build');
    }
    y += ui.button_height + 2;
  }
  if (crawlerCommWant()) {
    crawlerCommStart();
  }
}

export function titleInit(dt: number): void {
  account_ui = account_ui || createAccountUI();
  engine.setState(title);
  title(dt);
}

export function titleStartup(): void {
  crawlerCommStartup({
    lobby_state: titleInit,
    title_func: (value: string) => `Crawler Demo | "${value}"`,
    chat_ui: main.chat_ui,
  });
}
