/*eslint global-require:off, @typescript-eslint/no-use-before-define:["error", { "functions": false }]*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

import * as fs from 'fs';
import * as engine from 'glov/client/engine';
import * as input from 'glov/client/input';
const { floor, random, min } = Math;
import * as net from 'glov/client/net';
import { ansi, padRight, terminalCreate } from 'glov/client/terminal';
import { terminalSettingsInit, terminalSettingsShow } from 'glov/client/terminal_settings';
import * as ui from 'glov/client/ui';


window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
const game_width = 720;
const game_height = 400;

let ansi_files = [
  fs.readFileSync(`${__dirname}/ans/data0.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data5.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data1.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data4.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data2.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data6.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data7.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data3.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/data8.ans`, 'binary'),
  fs.readFileSync(`${__dirname}/ans/animated.ans`, 'binary'),
];

export function main() {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    net.init({ engine });
  }

  if (!engine.startup({
    game_width,
    game_height,
    pixely: 'strict',
    viewport_postprocess: true,
    font: {
      info: require('./img/font/vga_16x1.json'),
      texture: 'font/vga_16x1',
    },
    pixel_aspect: (640/480) / (720 / 400),
    show_fps: false,
  })) {
    return;
  }

  const terminal = terminalCreate({
    z: Z.BACKGROUND + 1,
  });
  // const font = engine.font;

  // Perfect sizes for pixely modes
  ui.scaleSizes(13 / 32);
  ui.setFontHeight(16);

  // Cache KEYS
  const KEYS = input.KEYS;

  let auto_advance = true;
  let term_idx = 0;
  let terminal_countdown = 0;

  function ansiArt(dt) {
    if (input.keyDownEdge(KEYS.ESCAPE)) {
      engine.setState(menuInit);
    }
    if (input.keyDownEdge(KEYS.LEFT)) {
      auto_advance = false;
      terminal_countdown = 0;
      term_idx--;
    }
    if (input.keyDownEdge(KEYS.RIGHT)) {
      auto_advance = false;
      terminal_countdown = 0;
      term_idx++;
    }
    let baud_save = terminal.baud;
    terminal.baud = (input.keyDown(KEYS.SPACE) || input.keyDown(KEYS.ESCAPE)) ? Infinity : baud_save;
    if (!terminal_countdown || dt >= terminal_countdown) {
      if (term_idx === undefined) {
        term_idx = 0;
      }
      if (auto_advance) {
        term_idx = min((term_idx || 0), ansi_files.length) + 1;
      }
      if (term_idx > ansi_files.length || term_idx <= 0) {
        // random fill
        if (!ansiArt.terminal_inited) {
          ansiArt.terminal_inited = true;
          // randomish fill
          terminal.autoScroll(false);
          terminal.moveto(0,0);
          function getch(ii, jj) { //eslint-disable-line no-inner-declarations
            return 176 + floor(random() * (224-176));
            // return 32 + ((ii * 7 + jj) % (255 - 32));
          }
          for (let ii = 0; ii < 25; ++ii) {
            let str = [ii === 0 ? '╓' : ii === 24 ? '╚' : '║']; // ║╓─╖╚═╝
            for (let jj = 1; jj < 79; ++jj) {
              if (ii === 0) {
                str.push('─');
              } else if (ii === 24) {
                str.push('═');
              } else {
                str.push(getch(ii, jj));
              }
            }
            str.push(ii === 0 ? '╖' : ii === 24 ? '╝' : '║');
            terminal.print({ x: 0, y: ii, text: str, fg: 8, bg: 0 });
          }
          terminal.moveto(0, 0);
        }

        terminal.color(floor(random() * 16), floor(random() * 8));
        let x = 1 + floor(random() * 78);
        let y = 1 + floor(random() * 23);
        terminal.fill({
          x,
          y,
          w: min(79 - x, 1 + floor(random() * 10)),
          h: min(24 - y, 1 + floor(random() * 8)),
          ch: 32 + floor(random() * (255 - 32)),
        });
        terminal_countdown = 100;
      } else {
        // scroll through ansi files
        terminal.color(7,0);
        terminal.clear();
        let data = ansi_files[term_idx - 1];
        terminal.print({ x: 0, y: 0, text: data });
        terminal_countdown = auto_advance ? 1500 : 1000000000;
      }
    } else {
      terminal_countdown -= dt;
    }

    terminal.render();
    terminal.baud = baud_save;
  }

  let rpgdata;
  const RPG_BODY_W = 60-2;
  const RPG_STATUS_W = 20-2;
  const RPG_STATUS_H = 3;
  const RPG_STATUS_X = RPG_BODY_W + 2;
  let rpgsubview;
  function rpgText(text) {
    terminal.subViewPush(rpgsubview);
    terminal.print({
      text: text,
    });
    terminal.subViewPop();
  }
  const RPG_STATES = {
    town: {
      enter: function () {
        rpgText('You stand in the town square, ready for adventure!  Or,\r\nperhaps, a break.\r\n');
      },
      menu: {
        '[1] Visit the Inn': 'inn',
        '[2] Fight a Monster': 'fight',
      },
    },
    inn: {
      enter: function () {
        rpgText('You rest, and are healed.\r\n\r\n');
        rpgdata.hp = rpgdata.maxhp;
        rpgState('town');
      },
    },
    fight: {
      enter: function () {
        rpgText('You head into the forest to fight...\r\n');
        let damage = floor(random() * random() * 50);
        if (damage) {
          rpgText(`You take ${ansi.red(damage)} damage.\r\n`);
          rpgdata.hp -= damage;
        } else {
          rpgText('You escape unscathed.\r\n');
        }
        let gp = floor(random() * 20);
        rpgText(`You find ${ansi.yellow.bright(gp)} GP.\r\n`);
        rpgdata.gp += gp;
        rpgText('\r\n');
        rpgState('town');
      },
    },
  };
  function rpgState(state) {
    let st = RPG_STATES[state];
    rpgdata.state = state;

    st.enter();
    if (rpgdata.state !== state) {
      // already left
      return;
    }
    terminal.subViewPush(rpgsubview);
    if (st.menu) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (let key in st.menu) {
        terminal.print({ text: '\n' });
      }
      terminal.print({ text: '> ' });
    }

    terminal.subViewPop();
    rpgdata.menu_cursor_x = rpgsubview.cursor_x;
    rpgdata.menu_cursor_y = rpgsubview.cursor_y;
    rpgdata.menu_x = rpgsubview.x;
    rpgdata.menu_y = rpgsubview.cursor_y - Object.keys(st.menu).length;
  }
  function rpgInit() {
    rpgdata = {
      hp: 100,
      maxhp: 100,
      gp: 0,
    };
    rpgsubview = {
      x: 1, y: 1, w: RPG_BODY_W, h: 23,
      cursor_x: 1, cursor_y: 1,
    };
    terminal.color(7,0);
    terminal.clear();

    terminal.color(4,0);
    terminal.cells({
      x: 0, y: 0, ws: [RPG_BODY_W], hs: [23], charset: 1,
      header: ' THE RPG ',
    });
    terminal.color(2,0);
    terminal.cells({
      x: RPG_STATUS_X, y: 0, ws: [RPG_STATUS_W], hs: [RPG_STATUS_H], charset: 0,
      header: ' Status ',
    });
    terminal.color(7,0);
    rpgState('town');
  }
  function rpg(dt) {

    function drawStatus() {
      let health_percent = rpgdata.hp / rpgdata.maxhp;
      let health_color = health_percent < 0.5 ? 'red' : 'green';
      terminal.print({
        x: RPG_STATUS_X + 2,
        y: 1,
        fg: 2,
        text: padRight(`HP: ${ansi[health_color].bright(`${rpgdata.hp} / ${rpgdata.maxhp}`)}  `, RPG_STATUS_W - 2),
      });
      terminal.print({
        x: RPG_STATUS_X + 2,
        y: 2,
        fg: 2,
        text: padRight(`GP: ${ansi.yellow.bright(rpgdata.gp)}  `, RPG_STATUS_W - 2),
      });
    }

    drawStatus();

    let st = RPG_STATES[rpgdata.state];
    if (st && st.menu) {
      if (!st.menu_keys) {
        st.menu_keys = Object.keys(st.menu);
      }
      let ret = terminal.menu({
        pre_sel: ' ■ ',
        pre_unsel: '   ',
        x: rpgdata.menu_x,
        y: rpgdata.menu_y,
        items: st.menu_keys,
      });
      terminal.moveto(rpgdata.menu_cursor_x, rpgdata.menu_cursor_y);
      if (ret !== -1) {
        rpgText(`${st.menu_keys[ret]}\r\n`);
        // TODO: transition to new state
        rpgState(st.menu[st.menu_keys[ret]]);
      }
    }

    terminal.render();
  }

  const MENU_W = 20;
  const MENU_X = (80 - MENU_W) / 2;
  const MENU_Y = 5;
  function menu(dt) {
    let sel = terminal.menu({
      x: MENU_X,
      y: 5,
      items: [
        'ANSI Art ',
        'An RPG ',
        `${ansi.yellow.bright('[O]')}ptions `,
      ],
    });

    switch (sel) { // eslint-disable-line default-case
      case 0:
        engine.setState(ansiArt);
        break;
      case 1:
        rpgInit();
        engine.setState(rpg);
        break;
      case 2:
        terminalSettingsShow();
        break;
    }

    terminal.render();
  }

  function menuInit(dt) {
    terminal.baud = 9600;
    terminal.color(7,0);
    terminal.clear();
    terminalSettingsInit(terminal);

    terminal.cells({
      x: MENU_X - 2, y: MENU_Y - 1, ws: [MENU_W], hs: [3], charset: 2,
      header: ' MENU ',
    });

    engine.setState(menu);
    menu(dt);
  }

  engine.setState(menuInit);
}
