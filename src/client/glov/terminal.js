/*global VMath: false */
/*global Z: false */
const glov_engine = require('./engine.js');
const glov_font = require('./font.js');

const { clamp } = require('../../common/util.js');

class CharInfo {
  constructor(fg, bg) {
    this.ch = ' ';
    this.fg = fg;
    this.bg = bg;
  }
}

class GlovTerminal {
  constructor(params) {
    params = params || {};
    this.w = params.w || 80;
    this.h = params.h || 25;
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
    this.font = params.font || glov_engine.font;
    this.buffer = new Array(this.h);
    for (let ii = 0; ii < this.h; ++ii) {
      this.buffer[ii] = new Array(this.w);
      for (let jj = 0; jj < this.w; ++jj) {
        this.buffer[ii][jj] = new CharInfo(this.fg, this.bg);
      }
    }
  }

  color(fg, bg) {
    this.fg = fg;
    this.bg = bg;
  }

  print(params) {
    let x = params.x || 0;
    let y = params.y || 0;
    let text = params.text || '';
    for (let ii = 0; ii < text.length; ++ii) {
      if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
        this.buffer[y][x].ch = text[ii];
        this.buffer[y][x].fg = this.fg;
        this.buffer[y][x].bg = this.bg;
      }
      x++;
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
    let ch = params.ch || ' ';
    let fill = params.fill || {
      fg: true,
      bg: true,
      ch: true,
    };
    for (let ii = y0; ii < y1; ++ii) {
      let line = this.buffer[ii];
      for (let jj = x0; jj < x1; ++jj) {
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
          text.push(line[jj].ch);
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
