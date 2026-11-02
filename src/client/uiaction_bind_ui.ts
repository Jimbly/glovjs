import { bindUIRun } from 'glov/client/bind_ui';
import {
  menuUp,
} from 'glov/client/ui';
import { Rec } from 'glov/common/types';
import {
  game_height,
  game_width,
} from './globals';
import { style_text } from './styles';
import { BindValue } from './textutil';
import {
  uiAction,
  UIAction,
  uiActionClear,
} from './uiaction';
import { pauseMenuOpen } from './uiaction_pause_menu';

const { floor } = Math;

const BIND_CMDS: Rec<BindValue, string> = {
  up: 'General Interface#Menus Up',
  down: 'Menus Down',
  left: 'Menus Left',
  right: 'Menus Right',
  accept: 'Menus Accept',
  cancel: 'Menus Cancel',
  prev: 'Select Previous',
  next: 'Select Next',

  move_forward: 'Gameplay#Move Forward',
  move_back: 'Move Back',
  move_left: 'Move Left',
  move_right: 'Move Right',
  turn_left: 'Turn Left',
  turn_right: 'Turn Right',
  move_mod: 'Action Modifier',
  run_forward: 'Run Forward',

  menu: 'Menu',
  map: 'Map',
};

class BindUIAction extends UIAction {
  exit(): void {
    uiActionClear();
    pauseMenuOpen();
  }
  tick(): void {
    const z = Z.MODAL + 2;
    const SCREEN_PAD = 8;

    let w = floor(game_width * 3/4);
    if (bindUIRun({
      bindable_cmds: BIND_CMDS,
      x: (game_width - w) / 2,
      y: SCREEN_PAD,
      w,
      h: game_height - SCREEN_PAD * 2,
      z,
      pad: 20,
      label_style: style_text,
      header_style: style_text,
      alt_background_color: [1, 1, 1, 0.1],
    })) {
      this.exit();
    }

    menuUp();
  }
}
BindUIAction.prototype.name = 'BindUI';
BindUIAction.prototype.is_overlay_menu = true;
BindUIAction.prototype.is_fullscreen_ui = true;

export function bindUIOpen(): void {
  uiAction(new BindUIAction());
}
