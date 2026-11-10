// Persists the SDL window's position, size, and maximized state across runs.
//
// State is tracked purely from window events: the SDL window getters poll for
// events internally (and throw once the window is destroyed), so they are not
// safe to call from arbitrary points, notably while handling 'close'.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getStoragePrefix } from 'glov/client/local_storage';
import { SDLWindow } from './platform-sdl';
const sdl = require('@kmamal/sdl');

const { max, min, round } = Math;

// Wait for the window to settle before writing (and so that a maximize, whose
//   'move'/'resize' events may arrive before the 'maximize' event, is
//   recognized before its geometry would be recorded as the normal geometry).
const SAVE_DELAY = 500;
// node-sdl does not expose the window border sizes, so estimate the title bar
//   height (in unscaled pixels) when checking whether the window is on-screen.
const TITLE_BAR_HEIGHT = 31;
// Allow the window frame to be this many pixels off-screen on each side, to
//   absorb small errors in the title bar estimate and thin borders.
const EDGE_TOLERANCE = 4;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WindowState = Rect & {
  maximized: boolean;
};

type SDLDisplay = {
  geometry: Rect;
  usable: Rect;
  scale: number | null;
};

export type SDLWindowCreateOpts = Partial<Rect>;

function statePath(): string {
  let base: string;
  if (process.platform === 'win32') {
    base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  return path.join(base, getStoragePrefix(), 'window.json');
}

function isInt(v: unknown): v is number {
  return Number.isInteger(v) && Math.abs(v as number) < 2 ** 31;
}

function stateRead(): WindowState | null {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return null; // missing (first run) or unreadable
  }
  if (!data || !isInt(data.x) || !isInt(data.y) ||
    !isInt(data.width) || data.width <= 0 || !isInt(data.height) || data.height <= 0
  ) {
    return null;
  }
  return {
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    maximized: Boolean(data.maximized),
  };
}

let last_written = '';
function stateWrite(state: WindowState): void {
  let str = JSON.stringify(state);
  if (str === last_written) {
    return;
  }
  let filename = statePath();
  try {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    let tmp = `${filename}.tmp`;
    fs.writeFileSync(tmp, str);
    fs.renameSync(tmp, filename);
    last_written = str;
  } catch (e) {
    console.error(`Error saving window state to ${filename}:`, e);
  }
}

function intersectArea(a: Rect, b: Rect): number {
  let w = min(a.x + a.width, b.x + b.width) - max(a.x, b.x);
  let h = min(a.y + a.height, b.y + b.height) - max(a.y, b.y);
  return max(0, w) * max(0, h);
}

function titleBarHeight(displays: SDLDisplay[], x: number, y: number): number {
  if (process.platform !== 'win32') {
    // Other platforms' window coordinates are in unscaled points
    return TITLE_BAR_HEIGHT;
  }
  let display = displays.find(({ geometry: g }) => x >= g.x && x < g.x + g.width &&
    y >= g.y && y < g.y + g.height);
  return round(TITLE_BAR_HEIGHT * (display?.scale || 1));
}

// Is all of `rect` within the displays' usable areas?  (Displays do not
//   overlap, so it is if the areas of its intersections with them add up to its area.)
function fullyOnScreen(displays: SDLDisplay[], rect: Rect): boolean {
  let r: Rect = {
    x: rect.x + EDGE_TOLERANCE,
    y: rect.y + EDGE_TOLERANCE,
    width: rect.width - EDGE_TOLERANCE * 2,
    height: rect.height - EDGE_TOLERANCE * 2,
  };
  if (r.width <= 0 || r.height <= 0) {
    return false;
  }
  let covered = 0;
  for (let ii = 0; ii < displays.length; ++ii) {
    covered += intersectArea(r, displays[ii].usable);
  }
  return covered >= r.width * r.height;
}

// Returns options to pass to `sdl.video.createWindow()` to restore the saved
//   normal (un-maximized) geometry, and whether the window should then be maximized.
export function sdlWindowStateLoad(): { create_opts: SDLWindowCreateOpts; maximized: boolean } {
  let state = stateRead();
  if (!state) {
    return { create_opts: {}, maximized: false };
  }
  last_written = JSON.stringify(state);
  let displays: SDLDisplay[] = sdl.video.displays;
  let title_h = titleBarHeight(displays, state.x, state.y);
  // The saved position is of the client area, the title bar is above it
  let frame: Rect = {
    x: state.x,
    y: state.y - title_h,
    width: state.width,
    height: state.height + title_h,
  };
  let { width, height } = state;
  if (fullyOnScreen(displays, frame)) {
    return { create_opts: { x: state.x, y: state.y, width, height }, maximized: state.maximized };
  }
  // Some part is off-screen (e.g. a monitor was disconnected or the window was
  //   dragged partly off-screen): leave the position unset so SDL centers it,
  //   shrinking it if needed to fit on the primary display.
  let bounds = displays[0]?.usable;
  if (bounds) {
    width = min(width, bounds.width);
    height = min(height, bounds.height - title_h);
  }
  return { create_opts: { width, height }, maximized: state.maximized };
}

// Call immediately after creating the window (before maximizing it, if desired)
export function sdlWindowStateTrack(win: SDLWindow): void {
  let current: Rect = { x: win.x, y: win.y, width: win.width, height: win.height };
  let normal: Rect = { ...current };
  let maximized = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function commit(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // Note: fullscreen is not tracked (node-sdl does not expose events for it,
    //   and this app does not currently use fullscreen)
    if (!maximized) {
      normal = { ...current };
    }
    stateWrite({ ...normal, maximized });
  }

  function schedule(): void {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(commit, SAVE_DELAY);
    timer.unref();
  }

  win.on('move', function (e: Partial<Rect>) {
    current.x = e.x!;
    current.y = e.y!;
    schedule();
  });
  win.on('resize', function (e: Partial<Rect>) {
    current.width = e.width!;
    current.height = e.height!;
    schedule();
  });
  win.on('maximize', function () {
    maximized = true;
    schedule();
  });
  win.on('restore', function () {
    maximized = false;
    schedule();
  });
  win.on('close', commit);
}
