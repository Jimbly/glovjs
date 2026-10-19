const { ansi, padRight } = require('../common/ansi.js');
const { capitalize, clamp } = require('../common/util');
const { actionEdge } = require('./actions');
const engine = require('./engine.js');
const input = require('./input.js');
const { KEYS } = require('./input.js');
const settings = require('./settings');
const { settingsSet } = require('./settings');
const { terminalCreate } = require('./terminal.js');

const { round } = Math;

let opts;
let settings_terminal;
let base_terminal;
let settings_up = false;
export function terminalSettingsVisible() {
  return settings_up;
}

const MODEMS = [
  { baud: 2400, label: 'Hayes Smartmodem 2400bps' },
  { baud: 9600, label: 'Motorola V.3225 9600bps' },
  { baud: 28800, label: 'USR Sportster V.34 28.8kbps' },
  { baud: Infinity, label: 'NULL' },
];

export function terminalSettingsShow() {
  settings_up = true;
}

function settingsOverlay(dt) {
  if (input.keyDownEdge(KEYS.O)) {
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
    let item_ids = [];
    let item_names = [];
    function item(id, name) {
      item_ids.push(id);
      item_names.push(padRight(name, 34));
    }
    if (opts.modem) {
      item('modem', `${opts.modem}: ${MODEMS[modem_idx].label}`);
    }
    if (opts.display) {
      item('display', `${opts.display}: ${engine.getViewportPostprocess() ? 'CRT' : 'LCD'}`);
    }
    if (opts.sound) {
      item('sound', `${opts.sound}: ${round(settings.volume_sound * 10)}`);
    }
    if (opts.music) {
      item('music', `${opts.music}: ${round(settings.volume_music * 10)}`);
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
        engine.setViewportPostprocess(!engine.getViewportPostprocess());
        break;
      case 'sound': {
        let v = clamp(round(settings.volume_sound * 10) + settings_terminal.menu_select_delta, 0, 10) / 10;
        settingsSet('volume_sound', v);
      } break;
      case 'music': {
        let v = clamp(round(settings.volume_music * 10) + settings_terminal.menu_select_delta, 0, 10) / 10;
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

export function terminalSettingsInit(terminal, opts_in) {
  opts = opts_in || {};
  opts.sound = opts.sound ?? terminal.sounds;
  opts.music = opts.music ?? terminal.sounds;
  let num_items = 1;
  ['modem', 'display', 'sound', 'music'].forEach(function (key) {
    opts[key] = opts[key] ?? true;
    if (opts[key] === true) {
      opts[key] = capitalize(key);
    }
    if (opts[key]) {
      ++num_items;
    }
  });
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

  engine.addTickFunc(settingsOverlay);
}
