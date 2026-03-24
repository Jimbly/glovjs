import assert from 'assert';

export abstract class UIAction {
  abstract tick(): void;
  declare name: string;
  declare is_overlay_menu: boolean;
  declare is_fullscreen_ui: boolean;
  declare esc_cancels: boolean;
}
UIAction.prototype.name = 'UnknownAction';
UIAction.prototype.is_overlay_menu = false;
UIAction.prototype.is_fullscreen_ui = false;
UIAction.prototype.esc_cancels = false;

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

export function uiActionTick(): void {
  cur_action?.tick();
}
