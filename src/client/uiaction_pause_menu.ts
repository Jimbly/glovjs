import { MenuItem } from 'glov/client/selection_box';
import * as settings from 'glov/client/settings';
import { settingsSet } from 'glov/client/settings';
import {
  SimpleMenu,
  simpleMenuCreate,
} from 'glov/client/simple_menu';
import {
  menuUp,
} from 'glov/client/ui';
import * as urlhash from 'glov/client/urlhash';
import {
  isLocal,
  isOnline,
} from './crawler_entity_client';
import { crawlerSaveGame } from './crawler_play';
import {
  game_width,
} from './globals';
import { queueTransition } from './play';
import { statusPush } from './status';
import {
  uiAction,
  UIAction,
  uiActionActive,
  uiActionClear,
} from './uiaction';

const { floor } = Math;

const PAUSE_MENU_W = floor(160/346*game_width);
let pause_menu: SimpleMenu;
class PauseMenuAction extends UIAction {
  tick(): void {
    if (!pause_menu) {
      pause_menu = simpleMenuCreate({
        x: floor((game_width - PAUSE_MENU_W)/2),
        y: 50,
        z: Z.MODAL + 2,
        width: PAUSE_MENU_W,
      });
    }
    let items: MenuItem[] = [{
      name: 'Return to game',
      cb: function () {
        uiActionClear();
      },
    }, {
      name: 'SFX Vol',
      slider: true,
      value_inc: 0.05,
      value_min: 0,
      value_max: 1,
    }, {
      name: 'Mus Vol',
      slider: true,
      value_inc: 0.05,
      value_min: 0,
      value_max: 1,
    }, {
      name: `Turn: ${settings.turn_toggle ? 'A/S/4/6/←/→': 'Q/E/7/9/LB/RB'}`,
      cb: () => {
        settingsSet('turn_toggle', 1 - settings.turn_toggle);
      },
    }];
    if (isLocal()) {
      items.push({
        name: 'Save game',
        cb: function () {
          crawlerSaveGame('manual');
          statusPush('Game saved.');
          uiActionClear();
        },
      });
    }
    items.push({
      name: isOnline() ? 'Return to Title' : 'Save and Exit',
      cb: function () {
        if (!isOnline()) {
          crawlerSaveGame('auto');
        }
        urlhash.go('');
        queueTransition();
      },
    });
    if (isLocal()) {
      items.push({
        name: 'Exit without saving',
        cb: function () {
          urlhash.go('');
          queueTransition();
        },
      });
    }

    let volume_item = items[1];
    volume_item.value = settings.volume_sound;
    volume_item.name = `SFX Vol: ${(settings.volume_sound * 100).toFixed(0)}`;
    volume_item = items[2];
    volume_item.value = settings.volume_music;
    volume_item.name = `Mus Vol: ${(settings.volume_music * 100).toFixed(0)}`;

    pause_menu.run({
      slider_w: floor(PAUSE_MENU_W/2),
      items,
    });

    settingsSet('volume_sound', pause_menu.getItem(1).value as number);
    settingsSet('volume_music', pause_menu.getItem(2).value as number);

    menuUp();
  }
}
PauseMenuAction.prototype.name = 'PauseMenu';
PauseMenuAction.prototype.is_overlay_menu = true;

export function pauseMenuOpen(): void {
  uiAction(new PauseMenuAction());
}

export function pauseMenuActive(): boolean {
  return uiActionActive(PauseMenuAction);
}
