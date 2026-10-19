import { ansi, padRight } from '../common/ansi';
import { capitalize, clamp } from '../common/util';
import { actionEdge } from './actions';
import {
  addTickFunc,
  getViewportPostprocess,
  setViewportPostprocess,
} from './engine';
import {
  keyDownEdge,
  KEYS,
} from './input';
import {
  settingsGet,
  settingsSet,
} from './settings';
import {
  Terminal,
  terminalCreate,
} from './terminal';

const { round } = Math;
export type TerminalSettingsEntries = 'sound' | 'music' | 'display' | 'modem';
export type TerminalSettingsParams = Record<TerminalSettingsEntries, string | false | true>;

let opts: TerminalSettingsParams;
let settings_terminal: Terminal;
let base_terminal: Terminal;
let settings_up = false;
export function terminalSettingsVisible(): boolean {
  return settings_up;
}

const MODEMS = [
  { baud: 2400, label: 'Hayes Smartmodem 2400bps' },
  { baud: 9600, label: 'Motorola V.3225 9600bps' },
  { baud: 28800, label: 'USR Sportster V.34 28.8kbps' },
  { baud: Infinity, label: 'NULL' },
];

export function terminalSettingsShow(): void {
  settings_up = true;
}

function settingsOverlay(dt: number): void {
  if (keyDownEdge(KEYS.O)) {
    settings_up = !settings_up;
  }
  if (settings_up) {
    settings_terminal.print({
      fg: 6+8,
      x: 10, y: 0,
      text: 'TERMINAL OPTIONS'
    });
    let modem_idx = 0;
    for (let ii = 0; ii < MODEMS.length; ++ii) {
      if (MODEMS[ii].baud === base_terminal.baud) {
        modem_idx = ii;
      }
    }
    let item_ids: (TerminalSettingsEntries | 'exit')[] = [];
    let item_names: string[] = [];
    function item(id: (TerminalSettingsEntries | 'exit'), name: string): void {
      item_ids.push(id);
      item_names.push(padRight(name, 34));
    }
    if (opts.modem) {
      item('modem', `${opts.modem}: ${MODEMS[modem_idx].label}`);
    }
    if (opts.display) {
      item('display', `${opts.display}: ${getViewportPostprocess() ? 'CRT' : 'LCD'}`);
    }
    if (opts.sound) {
      item('sound', `${opts.sound}: ${round(settingsGet('volume_sound') * 10)}`);
    }
    if (opts.music) {
      item('music', `${opts.music}: ${round(settingsGet('volume_music') * 10)}`);
    }
    item('exit', `Exit ${ansi.yellow.bright('[O]')}ptions`);
    let sel = settings_terminal.menu({
      x: 0, y: 1,
      color_sel: { fg: 7, bg: 0 },
      color_unsel: { fg: 7+8, bg: 1 },
      color_execute: { fg: 1, bg: 6+8 },
      pre_sel: ' ■ ',
      pre_unsel: '   ',
      key: 'terminal_settings',
      allow_leftright: true,
      items: item_names
    });
    let sel_id = item_ids[sel];
    switch (sel_id) {
      case 'modem':
        modem_idx = (modem_idx + settings_terminal.menu_select_delta + MODEMS.length) % MODEMS.length;
        base_terminal.baud = MODEMS[modem_idx].baud;
        break;
      case 'display':
        setViewportPostprocess(!getViewportPostprocess());
        break;
      case 'sound': {
        let v = clamp(round(settingsGet('volume_sound') * 10) + settings_terminal.menu_select_delta, 0, 10) / 10;
        settingsSet('volume_sound', v);
      } break;
      case 'music': {
        let v = clamp(round(settingsGet('volume_music') * 10) + settings_terminal.menu_select_delta, 0, 10) / 10;
        settingsSet('volume_music', v);
      } break;
      default:
        // Nothing
    }
    if (sel_id === 'exit' || actionEdge('cancel')) {
      settings_up = false;
    }

    settings_terminal.render();
  }
}

export function terminalSettingsInit(terminal: Terminal, opts_in?: Partial<TerminalSettingsParams>): void {
  let opts_partial = opts_in || {};
  opts_partial.sound = opts_partial.sound ?? terminal.sounds;
  opts_partial.music = opts_partial.music ?? terminal.sounds;
  let num_items = 1;
  (['modem', 'display', 'sound', 'music'] as const).forEach(function (key) {
    opts_partial[key] = opts_partial[key] ?? true;
    if (opts_partial[key] === true) {
      opts_partial[key] = capitalize(key);
    }
    if (opts_partial[key]) {
      ++num_items;
    }
  });
  opts = opts_partial as TerminalSettingsParams;
  base_terminal = terminal;
  settings_terminal = terminalCreate({
    auto_scroll: false,
    baud: 0,
    x: 10 * terminal.char_width,
    y: 2 * terminal.char_height,
    char_width: terminal.char_width,
    char_height: terminal.char_height,
    z: Z.DEBUG,
    w: 38,
    h: num_items + 3,
    draw_cursor: false,
  });
  settings_terminal.color(7+8, 1);
  settings_terminal.clear();
  settings_terminal.color(null, 0);
  settings_terminal.fill({
    x: 0, y: settings_terminal.h-1, w: 1, h: 1,
  });
  settings_terminal.fill({
    x: settings_terminal.w-1, y: 0, w: 1, h: 1,
  });
  settings_terminal.color(8, 0);
  settings_terminal.fill({
    x: 1, y: settings_terminal.h-1, w: settings_terminal.w-1, h: 1,
    ch: '▓',
  });
  settings_terminal.fill({
    x: settings_terminal.w-1, y: 1, w: 1, h: settings_terminal.h-2,
    ch: '▓',
  });

  addTickFunc(settingsOverlay);
}
