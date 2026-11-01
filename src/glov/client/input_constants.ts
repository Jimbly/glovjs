export type ButtonIndex = 0 | 1 | 2 | -1 | -2;

export const BUTTON_LEFT: ButtonIndex = 0;
export const BUTTON_MIDDLE: ButtonIndex = 1;
export const BUTTON_RIGHT: ButtonIndex = 2;
export const BUTTON_ANY: ButtonIndex = -2;
export const BUTTON_POINTERLOCK: ButtonIndex = -1;
export const ANY = BUTTON_ANY;
export const POINTERLOCK = BUTTON_POINTERLOCK;

export const MOD_SHIFT = 1<<0;
export const MOD_CTRL = 1<<1;
export const MOD_ALT = 1<<2;
