/*global VMath: false */
/*global Z: false */
/*eslint no-bitwise:off */
const glov_engine = require('./engine.js');
const glov_font = require('./font.js');

const { clamp } = require('../../common/util.js');

const mode_regex1 = /^((?:\d+;)*\d+m)/u;
const mode_regex2 = /(\d+)[;m]/gu;
const ESC = '\u001b';
const ansi_to_unicode = [
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,199,252,233,226,228,224,229,231,234,235,232,239,238,236,
  196,197,201,230,198,244,246,242,251,249,255,214,220,162,163,165,8359,402,225,
  237,243,250,241,209,170,186,191,8976,172,189,188,161,171,187,9617,9618,9619,
  9474,9508,9569,9570,9558,9557,9571,9553,9559,9565,9564,9563,9488,9492,9524,
  9516,9500,9472,9532,9566,9567,9562,9556,9577,9574,9568,9552,9580,9575,9576,
  9572,9573,9561,9560,9554,9555,9579,9578,9496,9484,9608,9604,9612,9616,9600,
  945,223,915,960,931,963,181,964,934,920,937,948,8734,966,949,8745,8801,177,
  8805,8804,8992,8993,247,8776,176,8729,183,8730,8319,178,9632,160
];

const ansi_to_vga = [
  0, // black
  4, // red
  2, // green
  6, // yellow
  1, // blue
  5, // magenta
  3, // cyan
  7, // white
];

function toch(ch) {
  if (typeof ch === 'string') {
    ch = ch.charCodeAt(0);
  }
  if (typeof ch === 'number') {
    return String.fromCharCode(ansi_to_unicode[ch] || ch);
  } else {
    return String(ch)[0] || ' ';
  }
}
const ATTR = {
  BLINK: 1,
  UNDERLINE: 2, // unimplemented
  REVERSE: 4, // unimplemented
};

class CharInfo {
  constructor(fg, bg, attr) {
    this.ch = ' ';
    this.fg = fg;
    this.bg = bg;
    this.attr = attr;
  }
}

class GlovTerminal {
  constructor(params) {
    params = params || {};
    this.x = 0;
    this.y = 0;
    this.w = params.w || 80;
    this.h = params.h || 25;
    this.saved_x = 0;
    this.saved_y = 0;
    this.palette = params.palette || [
      VMath.v4Build(0/64,0/64,0/63,1),
      VMath.v4Build(0/64,0/64,42/63,1),
      VMath.v4Build(0/64,42/64,0/63,1),
      VMath.v4Build(0/64,42/64,42/63,1),
      VMath.v4Build(42/64,0/64,0/63,1),
      VMath.v4Build(42/64,0/64,42/63,1),
      VMath.v4Build(42/64,21/64,0/63,1),
      VMath.v4Build(42/64,42/64,42/63,1),
      VMath.v4Build(21/64,21/64,21/63,1),
      VMath.v4Build(21/64,21/64,63/63,1),
      VMath.v4Build(21/64,63/64,21/63,1),
      VMath.v4Build(21/64,63/64,63/63,1),
      VMath.v4Build(63/64,21/64,21/63,1),
      VMath.v4Build(63/64,21/64,63/63,1),
      VMath.v4Build(63/64,63/64,21/63,1),
      VMath.v4Build(63/64,63/64,63/63,1),
    ];
    this.font_styles = [];
    for (let ii = 0; ii < this.palette.length; ++ii) {
      this.font_styles.push(glov_font.style(null, {
        color: glov_font.intColorFromVec4Color(this.palette[ii]),
      }));
    }
    this.char_height = params.char_height || 16;
    this.char_width = params.char_width || 9;
    this.fg = 7;
    this.bg = 0;
    this.attr = 0;
    this.font = params.font || glov_engine.font;
    this.buffer = new Array(this.h);
    this.auto_scroll = true;
    for (let ii = 0; ii < this.h; ++ii) {
      this.buffer[ii] = new Array(this.w);
      for (let jj = 0; jj < this.w; ++jj) {
        this.buffer[ii][jj] = new CharInfo(this.fg, this.bg, this.attr);
      }
    }
  }

  normal() {
    this.color(7, 0);
    this.attr = 0;
  }

  color(fg, bg) {
    if (typeof fg === 'number') {
      this.fg = fg;
    }
    if (typeof bg === 'number') {
      this.bg = bg;
    }
  }

  moveto(x, y) {
    if (typeof x === 'number') {
      this.x = x;
    }
    if (typeof y === 'number') {
      this.y = y;
    }
    this.checkwrap();
  }
  offset(x, y) {
    if (typeof x === 'number') {
      this.x += x;
    }
    if (typeof y === 'number') {
      this.y += y;
    }
    this.checkwrap();
  }
  autoScroll(b) {
    this.auto_scroll = b;
  }
  checkwrap() {
    if (this.x < 0) {
      this.x = 0;
    }
    if (this.x >= this.w) {
      this.x = 0;
      this.y++;
    }
    if (this.y >= this.h) {
      this.y = this.h - 1;
      if (this.auto_scroll) {
        let row = this.buffer[0];
        this.buffer = this.buffer.slice(1);
        this.buffer.push(row);
        for (let ii = 0; ii < row.length; ++ii) {
          row[ii].fg = this.fg;
          row[ii].bg = this.bg;
          row[ii].ch = ' ';
          row[ii].attr = 0;
        }
      }
    }
  }
  cr() {
    this.x = 0;
    this.checkwrap();
  }
  lf() {
    this.y++;
    this.checkwrap();
  }
  crlf() {
    this.x = 0;
    this.y++;
    this.checkwrap();
  }
  clear() {
    this.moveto(0, 0);
    this.fill({});
  }
  cleareol() {
    let line = this.buffer[this.y];
    for (let jj = this.x; jj < this.w; ++jj) {
      line[jj].ch = ' ';
      line[jj].attr = 0;
      line[jj].fg = this.fg;
      line[jj].bg = this.bg;
    }
    this.x = this.w; // probably?
    this.checkwrap();
  }

  print(params) {
    this.moveto(params.x, params.y);
    this.color(params.fg, params.bg);
    let text = params.text || '';
    if (text && !text.length) {
      text = [text];
    }
    if (typeof text === 'string') {
      text = text.split('');
    }
    text = text.map(toch).join('');
    for (let ii = 0; ii < text.length; ) {
      let ch = text[ii];
      let handled = false;
      if (ch === ESC && text[ii + 1] === '[') {
        // ANSI escape code
        handled = true;
        let code = text.slice(ii + 2, ii + 12);
        let m;
        if (code.match(/^\?7h/u)) {
          // screen mode, ignore
          ii += 5;
        } else if (code.match(/^2J/u)) {
          // clear screen and home cursor
          this.clear();
          ii += 4;
        } else if (code.match(/^s/u)) {
          // save pos
          this.saved_x = this.x;
          this.saved_y = this.y;
          ii += 3;
        } else if (code.match(/^u/u)) {
          // restore pos
          this.moveto(this.saved_x, this.saved_y);
          ii += 3;
        } else if (code.match(/^K/u)) {
          // clear to EOL
          this.cleareol();
          ii += 3;
        } else if ((m = code.match(/^(\d*)A/u))) {
          // move up
          this.offset(null, -Number(m[1] || '1'));
          ii += m[0].length + 2;
        } else if ((m = code.match(/^(\d*)B/u))) {
          // move down
          this.offset(null, Number(m[1] || '1'));
          ii += m[0].length + 2;
        } else if ((m = code.match(/^(\d*)C/u))) {
          // move right
          this.offset(Number(m[1] || '1'), null);
          ii += m[0].length + 2;
        } else if ((m = code.match(/^(\d*)D/u))) {
          // move left
          this.offset(-Number(m[1] || '1'), null);
          ii += m[0].length + 2;
        } else if ((m = code.match(/^(\d+)(?:;(\d+))?(H|f)/u))) {
          this.moveto(Number(m[2] || '1') - 1, Number(m[1]) - 1);
          ii += m[0].length + 2;
        } else if ((m = code.match(mode_regex1))) {
          let ii_save = ii;
          ii += m[0].length + 2;
          let sub_str = m[1];
          m = mode_regex2.exec(sub_str);
          do {
            let sub_code = Number(m[1]);
            if (sub_code >= 40) {
              this.color(null, ansi_to_vga[sub_code - 40]);
            } else if (sub_code >= 30) {
              this.color(ansi_to_vga[sub_code - 30] + (this.fg >= 8 ? 8 : 0), null);
            } else if (sub_code === 1) {
              if (this.fg < 8) {
                this.fg += 8;
              }
            } else if (sub_code === 0) {
              this.normal();
            } else if (sub_code === 4) {
              this.attr |= ATTR.UNDERLINE;
            } else if (sub_code === 5) {
              this.attr |= ATTR.BLINK;
            } else if (sub_code === 7) {
              this.attr |= ATTR.REVERSE;
            } else {
              // unhandled
              handled = false;
              ii = ii_save;
            }
            m = mode_regex2.exec(sub_str);
          } while (m);
        } else {
          // unhandled, advance past escape and print
          handled = false;
        }
      } else if (ch === '\n') {
        handled = true;
        ++ii;
        this.lf();
      } else if (ch === '\r') {
        handled = true;
        ++ii;
        this.cr();
      }
      if (!handled) {
        if (this.x >= 0 && this.x < this.w && this.y >= 0 && this.y < this.h) {
          this.buffer[this.y][this.x].ch = ch;
          this.buffer[this.y][this.x].attr = this.attr;
          this.buffer[this.y][this.x].fg = this.fg;
          this.buffer[this.y][this.x].bg = this.bg;
        }
        ++this.x;
        this.checkwrap();
        ++ii;
      }
    }
  }
  fill(params) {
    let x = params.x || 0;
    let y = params.y || 0;
    let w = params.w || this.w;
    let h = params.h || this.h;
    let x0 = clamp(x, 0, this.w);
    let x1 = clamp(x + w, 0, this.w);
    let y0 = clamp(y, 0, this.h);
    let y1 = clamp(y + h, 0, this.h);
    let fg = this.fg;
    let bg = this.bg;
    let attr = this.attr;
    let ch = toch(params.ch || ' ');
    let fill = params.fill || {
      attr: true,
      fg: true,
      bg: true,
      ch: true,
    };
    for (let ii = y0; ii < y1; ++ii) {
      let line = this.buffer[ii];
      for (let jj = x0; jj < x1; ++jj) {
        if (fill.attr) {
          line[jj].attr = attr;
        }
        if (fill.fg) {
          line[jj].fg = fg;
        }
        if (fill.bg) {
          line[jj].bg = bg;
        }
        if (fill.ch) {
          line[jj].ch = ch;
        }
      }
    }
  }

  render(params) {
    const { glov_ui } = glov_engine;
    const { w, h, buffer, char_width, char_height, palette } = this;
    const blink = glov_engine.getFrameTimestamp() % 1000 > 500;
    params = params || {};
    let x = params.x || 0;
    let y = params.y || 0;
    let z = params.z || Z.BACKGROUND;
    // Draw foreground text
    for (let ii = 0; ii < h; ++ii) {
      let jj = 0;
      let line = buffer[ii];
      while (jj < w) {
        while (jj < w && line[jj].ch === ' ') {
          ++jj;
        }
        if (jj === w) {
          continue;
        }
        // found first non-empty character
        let jj0 = jj;
        let fg = line[jj].fg;
        let text = [];
        while (jj < w && (line[jj].fg === fg || line[jj].ch === ' ')) {
          let ch = line[jj].ch;
          if (blink && (line[jj].attr & ATTR.BLINK)) {
            ch = ' ';
          }
          text.push(ch);
          ++jj;
        }
        text = text.join('');
        glov_engine.font.drawSized(this.font_styles[fg],
          x + jj0 * char_width, y + ii * char_height, z + 0.5,
          char_height, text);
      }
    }
    // Draw background rects
    // This could be made more efficient when the pattern is like:
    //   ABBA
    //   ABBA
    // Right now it draws 6 rects, could be done in 3
    let box_x0 = 0;
    let box_y0 = 0;
    let last_x;
    let last_y;
    let box_color = buffer[0][0].bg;
    function flush() {
      glov_ui.drawRect(box_x0 * char_width, box_y0 * char_height,
        (last_x + 1) * char_width, (last_y + 1) * char_height, z, palette[box_color]);
      if (box_y0 !== last_y && last_y !== w - 1) {
        // A was draw, draw B:
        // AAABB
        // AAA..
        glov_ui.drawRect(x + (last_x + 1) * char_width, y + box_y0 * char_height,
          x + w * char_width, y + last_y * char_height, z, palette[box_color]);
      }
    }
    for (let ii = 0; ii < h; ++ii) {
      let line = buffer[ii];
      for (let jj = 0; jj < w; ++jj) {
        let color = line[jj].bg;
        if (color !== box_color || box_x0 > jj) {
          flush();
          box_color = color;
          box_x0 = jj;
          box_y0 = ii;
        }
        last_x = jj;
        last_y = ii;
      }
    }
    flush();
  }
}

export function create(...args) {
  return new GlovTerminal(...args);
}
