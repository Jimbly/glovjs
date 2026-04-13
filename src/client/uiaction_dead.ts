import { ALIGN, fontStyleColored } from 'glov/client/font';
import {
  buttonText,
  menuUp,
  panel,
  uiButtonWidth,
  uiGetFont,
  uiTextHeight,
} from 'glov/client/ui';
import { crawlerController } from './crawler_play';
import {
  render_height,
  render_width,
  VIEWPORT_X0,
  VIEWPORT_Y0,
} from './globals';
import {
  myEnt,
} from './play';
import {
  uiAction,
  UIAction,
  uiActionActive,
  uiActionClear,
} from './uiaction';

const { ceil, floor } = Math;

class DeadAction extends UIAction {
  tick(): void {

    crawlerController().setFadeOverride(0.75);

    const BORDER_PAD = 32;
    let y = VIEWPORT_Y0 + BORDER_PAD;
    let y0 = y;
    let w = render_width - BORDER_PAD * 2;
    let x = VIEWPORT_X0 + BORDER_PAD;
    let h = render_height - BORDER_PAD * 2;
    let z = Z.MODAL + 20;

    uiGetFont().drawSizedAligned(fontStyleColored(null, 0x000000ff),
      x + floor(w/2), y + floor(h/2) - 16, z,
      uiTextHeight(), ALIGN.HCENTER|ALIGN.VBOTTOM,
      0, 0, 'You have died.');

    if (buttonText({
      x: x + floor(w/2 - uiButtonWidth()/2), y: y + floor(h/2), z,
      text: 'Respawn',
    })) {
      myEnt().data.stats.hp = myEnt().data.stats.hp_max;
      crawlerController().goToFloor(0, 'stairs_in', 'respawn');
      uiActionClear();
    }

    y += h / 2;

    panel({
      x: x + floor(w/10),
      y: y0,
      w: ceil(w * 4/5),
      h: y - y0 + BORDER_PAD,
      z: Z.MODAL + 18,
    });

    menuUp();
  }
}
DeadAction.prototype.name = 'Dead';
DeadAction.prototype.is_overlay_menu = true;
DeadAction.prototype.is_fullscreen_ui = false;
DeadAction.prototype.dim_music = 1;

export function deadOpen(): void {
  uiAction(new DeadAction());
}

export function deadActive(): boolean {
  return uiActionActive(DeadAction);
}
