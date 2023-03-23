
import * as engine from 'glov/client/engine.js';
import { netSubs } from 'glov/client/net.js';
import * as ui from 'glov/client/ui.js';
import * as urlhash from 'glov/client/urlhash.js';
import { createAccountUI } from './account_ui.js';
import { crawlerCommStart, crawlerCommStartup, crawlerCommWant } from './crawler_comm.js';
import { crawlerPlayWantNewGame } from './crawler_play.js';
import * as main from './main.js';
import { play } from './play.js';


type AccountUI = ReturnType<typeof createAccountUI>;

let account_ui: AccountUI;

function title(dt: number): void {
  main.chat_ui.run({
    hide: true,
  });
  if (engine.DEBUG || true) {
    account_ui.showLogin({
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
  }

  let y = 40;
  let x = 10;
  ui.print(null, x, y, Z.UI, 'Crawler Demo');
  x += 10;
  y += ui.font_height + 2;
  if (netSubs().loggedIn()) {
    if (ui.buttonText({
      x, y, text: 'Build Mode',
    })) {
      urlhash.go('?c=build');
    }
    y += ui.button_height + 2;
  }
  if (ui.buttonText({
    x, y, text: 'New Game',
  })) {
    crawlerPlayWantNewGame();
    urlhash.go('?c=local');
  }
  if (ui.buttonText({
    x: x + ui.button_width + 2, y, text: 'Load Game',
  })) {
    urlhash.go('?c=local');
  }
  y += ui.button_height + 2;
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
    play_state: play,
    title_func: (value: string) => `Crawler Demo | "${value}"`,
    chat_ui: main.chat_ui,
  });
}
