import assert from 'assert';

export abstract class UIAction {
  abstract tick(dt: number): void;
  declare name: string;
  declare is_overlay_menu: boolean; // Interrupts other activity
  declare is_fullscreen_ui: boolean; // Causes any dialogs to be centered on the screen, not the 3D viewport
  declare esc_cancels: boolean;
  declare dim_music: number | null; // null means "use default dimming if is_fullscreen_ui is set"
  declare spot_simple_nav: boolean; // disable WASD for nav, if they're used for hotkeys
}
UIAction.prototype.name = 'UnknownAction';
UIAction.prototype.is_overlay_menu = false;
UIAction.prototype.is_fullscreen_ui = false;
UIAction.prototype.esc_cancels = false;
UIAction.prototype.dim_music = null;
UIAction.prototype.spot_simple_nav = false;

let cur_action: UIAction | null = null;

export function uiAction(action: UIAction | null): void {
  if (action) {
    assert(!cur_action);
    cur_action = action;
  } else {
    cur_action = null;
  }
}

export function uiActionClear(): void {
  uiAction(null);
}

export function uiActionActive(ctor: Constructor<UIAction>): boolean {
  return Boolean(cur_action && cur_action instanceof ctor);
}

export function uiActionCurrent(): UIAction | null {
  return cur_action;
}

export function uiActionTick(dt: number): void {
  cur_action?.tick(dt);
}
