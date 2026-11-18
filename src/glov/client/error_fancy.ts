import type { ROVec4 } from 'glov/common/vmath';
import { getCrashMessage } from './bootstrap';
import * as camera2d from './camera2d';
import { getAbilityExit, getAbilityReload, MODE_DEVELOPMENT } from './client_config';
import {
  lastFrameCompletedSuccessfully,
  popOverrideState,
  pushOverrideState,
  reloadSafe,
} from './engine';
import {
  errorReportClear,
  errorReportSetFancyHandler,
} from './error_report';
import { ALIGN, fontStyle } from './font';
import { keyDown, KEYS } from './input';
import { spriteQueueRaw, Texture } from './sprites';
import { textureCreateForCapture } from './textures';
import { buttonText, copyTextToClipboard, uiGetFont } from './ui';

const W = 1000;
const H = 1000;
const SCREENSHOT_X = 300;
const SCREENSHOT_Y = 300;
const FONT_H = 28;
const PAD = 10;
const BUTTON_H = 100;
const BUTTON_W = Math.floor((W - PAD * 4) / 3);

let style_text = fontStyle(null, {
  color: 0xFFFFFFff,
  outline_width: 2.5,
  outline_color: 0x000000DD,
});

let last_frame_tex: Texture | null = null;

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
  if (last_frame_tex) {
    last_frame_tex.destroy();
    last_frame_tex = null;
  }
  // run between frames for most likely to work
  setTimeout(function () {
    errorReportClear();
    popOverrideState();
    errorReportSetFancyHandler(errorFancyHandler); // eslint-disable-line @typescript-eslint/no-use-before-define
  }, 1);
}

function drawLastFrame(tex: Texture, x: number, y: number, z: number, w: number, h: number, color: ROVec4): void {
  // align lower right
  let disp_aspect = w / h;
  let tex_aspect = tex.src_width / tex.src_height;
  if (disp_aspect > tex_aspect) {
    let disp_w = h * tex_aspect;
    x += w - disp_w;
    w = disp_w;
  } else {
    let disp_h = w / tex_aspect;
    y += h - disp_h;
    h = disp_h;
  }
  spriteQueueRaw([tex], x, y, z, w, h, 0, 1, 1, 0, color);
}

// likely black if the platform did not preserve the drawing buffer (mobile)
function captureLastFrame(): void {
  if (last_frame_tex || !window.gl) {
    return;
  }
  try {
    last_frame_tex = textureCreateForCapture('error_fancy_last_frame', false);
    last_frame_tex.captureStart(gl.drawingBufferWidth, gl.drawingBufferHeight);
    last_frame_tex.captureEnd(true, false);
  } catch (e) {
    // don't let a capture failure prevent displaying the error
    console.error(e);
    try {
      last_frame_tex?.destroy();
    } catch (e2) {
      // ignore
    }
    last_frame_tex = null;
  }
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
    style: style_text,
    x, y, w,
    size: FONT_H,
    align: ALIGN.HWRAP,
    text: `${getCrashMessage()}\n\n${error_msg}`,
  });

  if (last_frame_tex) {
    drawLastFrame(last_frame_tex, SCREENSHOT_X, SCREENSHOT_Y, Z.UI - 1,
      camera2d.x1() - SCREENSHOT_X, camera2d.y1() - SCREENSHOT_Y,
      [1, 1, 1, 0.5]);
  }

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
  captureLastFrame();
}

export function errorFancyStartup(): void {
  errorReportSetFancyHandler(errorFancyHandler);
}
