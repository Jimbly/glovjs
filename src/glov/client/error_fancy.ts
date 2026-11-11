import { getCrashMessage } from './bootstrap';
import * as camera2d from './camera2d';
import { getAbilityExit, getAbilityReload, MODE_DEVELOPMENT } from './client_config';
import {
  lastFrameCompletedSuccessfully,
  popOverrideState,
  pushOverrideState,
  reloadSafe
} from './engine';
import {
  errorReportClear,
  errorReportSetFancyHandler,
} from './error_report';
import { ALIGN } from './font';
import { keyDown, KEYS } from './input';
import { buttonText, copyTextToClipboard, uiGetFont } from './ui';

const W = 1000;
const H = 1000;
const FONT_H = 28;
const PAD = 10;
const BUTTON_H = 100;
const BUTTON_W = Math.floor((W - PAD * 4) / 3);

let allow_dismiss = false;
export function errorFancyAllowDismiss(allow: boolean): void {
  allow_dismiss = allow;
}

let is_active = false;
export function errorFancyClear(): void {
  if (!is_active) {
    return;
  }
  allow_dismiss = false;
  is_active = false;
  // run between frames for most likely to work
  setTimeout(function () {
    errorReportClear();
    popOverrideState();
    errorReportSetFancyHandler(errorFancyHandler); // eslint-disable-line @typescript-eslint/no-use-before-define
  }, 1);
}

let did_clear_platform_error_display = false;
let error_msg: string;
function errorFancyState(dt: number): void {
  if (!did_clear_platform_error_display && lastFrameCompletedSuccessfully()) {
    did_clear_platform_error_display = true;
    errorReportClear();
  }

  gl.clearColor(0, 0, 0, 1);

  let x = camera2d.x0() + PAD;
  let y = camera2d.y0() + PAD + FONT_H;
  let w = camera2d.w() - PAD * 2;
  let font = uiGetFont();
  font.draw({
    color: 0xFFFFFFff,
    x, y, w,
    size: FONT_H,
    align: ALIGN.HWRAP,
    text: `${getCrashMessage()}\n\n${error_msg}`,
  });

  let show_dismiss = allow_dismiss || MODE_DEVELOPMENT && (
    (keyDown(KEYS.SHIFT)?1:0) +
    (keyDown(KEYS.CTRL)?1:0) +
    (keyDown(KEYS.ALT)?1:0) +
    (keyDown(KEYS.META_LEFT)?1:0) +
    (keyDown(KEYS.META_RIGHT)?1:0)
  ) >= 3; // TODO: also if it's a shader error?

  y = camera2d.y1() - PAD - BUTTON_H;

  function btn(text: string, hotkey?: number): boolean {
    let ret = buttonText({
      x, y,
      font_height: FONT_H,
      w: BUTTON_W,
      h: BUTTON_H,
      hotkey,
      text,
    });
    x += BUTTON_W + PAD;
    return Boolean(ret);
  }

  if (btn('Copy to Clipboard', KEYS.C)) {
    copyTextToClipboard(error_msg);
  }
  if (getAbilityExit()) {
    if (btn('Exit', show_dismiss ? undefined : KEYS.ESC)) {
      window.close();
    }
  }
  if (getAbilityReload()) {
    if (btn('Reload', KEYS.R)) {
      reloadSafe();
    }
  }

  if (show_dismiss) {
    if (btn('Dismiss', KEYS.ESC)) {
      errorFancyClear();
    }
  }
}

function errorFancyHandler(msg: string, is_fatal: boolean): void {
  errorReportSetFancyHandler(null); // do not call us again, fall back if another crash happens
  did_clear_platform_error_display = false;
  error_msg = msg;
  error_msg += `\nbuild=${BUILD_TIMESTAMP}`;
  is_active = true;
  pushOverrideState(errorFancyState, W, H);
}

export function errorFancyStartup(): void {
  errorReportSetFancyHandler(errorFancyHandler);
}
