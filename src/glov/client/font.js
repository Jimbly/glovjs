// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
/* eslint no-bitwise:off, @typescript-eslint/no-shadow:off */

exports.style = fontStyle; // eslint-disable-line @typescript-eslint/no-use-before-define
exports.styleColored = fontStyleColored; // eslint-disable-line @typescript-eslint/no-use-before-define
exports.styleAlpha = fontStyleAlpha; // eslint-disable-line @typescript-eslint/no-use-before-define
exports.create = fontCreate; // eslint-disable-line @typescript-eslint/no-use-before-define

export const ALIGN = {
  HLEFT: 0,
  HCENTER: 1,
  HRIGHT: 2,
  HMASK: 3,

  VTOP: 0 << 2,
  VCENTER: 1 << 2,
  VBOTTOM: 2 << 2,
  VMASK: 3 << 2,

  HFIT: 1 << 4,
  HWRAP: 1 << 5,

  HCENTERFIT: 1 | (1 << 4),
  HRIGHTFIT: 2 | (1 << 4),
  HVCENTER: 1 | (1 << 2), // to avoid doing bitwise ops elsewhere
  HVCENTERFIT: 1 | (1 << 2) | (1 << 4), // to avoid doing bitwise ops elsewhere
};

// line wrapping epsilon, don't wrap non-deterministically if scale and
//  character widths are factors of display width.  Also allow a width
//  calculated from .wrapLines() to be used as a width passed to draw*aligned()
export const EPSILON = 0.0000000001;

/* eslint-disable import/order */
const assert = require('assert');
const camera2d = require('./camera2d.js');
const { transformX, transformY } = require('./camera2d.js');
const engine = require('./engine.js');
const geom = require('./geom.js');
const { getStringFromLocalizable } = require('./localization.js');
const { ceil, cos, floor, sin, max, min, round, sqrt } = Math;
// const settings = require('./settings.js');
const { shaderCreate, shadersPrelink } = require('./shaders.js');
const sprites = require('./sprites.js');
const { BLEND_ALPHA, BLEND_PREMULALPHA, spriteChainedStart, spriteChainedStop, spriteDataAlloc } = sprites;
const { textureLoad } = require('./textures.js');
const { clamp } = require('glov/common/util.js');
const {
  v3scale,
  v3set,
  vec4,
  v4copy,
  v4scale,
} = require('glov/common/vmath.js');

/*

font_style = glov_font.style(null, {
  color: 0xFFFFFFff,
  outline_width: 0,
  outline_color: 0x00000000,
  glow_xoffs: 0,
  glow_yoffs: 0,
  glow_inner: 0,
  glow_outer: 0,
  glow_color: 0x000000ff,
});

 */

// typedef struct FontCharInfo {
//   int c;
//   float x0;
//   float y0;
//   int w;
//   int h;
//   int imgIdx;
// } FontCharInfo;

// typedef struct FontInfo {
//   AS_NAME(CharInfo) FontCharInfo **char_infos;
//   int font_size;
//   float x0;
//   float y0;
//   int imageW;
//   int imageH;
//   int spread;
// } FontInfo;

// export const COLOR_MODE = {
//   SINGLE: 0,
//   GRADIENT: 1,
// };

const ALIGN_NEEDS_WIDTH = ALIGN.HMASK | ALIGN.HFIT;


// typedef struct GlovFontStyle
// {
//   // These members will never be changed (safe to initialize with GlovFontStyle foo = {1.0, 0xfff, etc};
//   float outline_width;
//   U32 outline_color;
//   // Glow: can be used for a dropshadow as well
//   //   inner can be negative to have the glow be less opaque (can also just change the alpha of the glow color)
//   //   a glow would be e.g. (0, 0, -1, 5)
//   //   a dropshadow would be e.g. (3.25, 3.25, -2.5, 5)
//   float glow_xoffs;
//   float glow_yoffs;
//   float glow_inner;
//   float glow_outer;
//   U32 glow_color;
//   U32 color; // upper left, or single color
//   // U32 colorUR; // upper right
//   // U32 colorLR; // lower right
//   // U32 colorLL; // lower left
//   // GlovFontColorMode color_mode;
// } GlovFontStyle;

/* Default GlovFontStyle:
  font_style = {
    outline_width: 0, outline_color: 0x00000000,
    glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: 0x00000000,
    color: 0xFFFFFFff
  };

  // font_style = {
  //   outline_width: 0, outline_color: 0x00000000,
  //   glow_xoffs: 0, glow_yoffs: 0, glow_inner: 0, glow_outer: 0, glow_color: 0x00000000,
  //   // Color gradient: UL, UR, LR, LL
  //   color: 0xFFFFFFff, colorUR: 0xFFFFFFff, colorLR: 0x000000ff, colorLL: 0x000000ff,
  //   color_mode: glov_font.COLOR_MODE.GRADIENT,
  // };
*/

function GlovFontStyle() {
  // Not calling `vec4()` directly, since this constructor may be called during
  //   initialization before our local `vec4` has been assigned.
  this.color_vec4 = new Float32Array([1,1,1,1]); // Matches GlovFontStyle.prototype.color below
}
GlovFontStyle.prototype.outline_width = 0;
GlovFontStyle.prototype.outline_color = 0x00000000;
GlovFontStyle.prototype.glow_xoffs = 0;
GlovFontStyle.prototype.glow_yoffs = 0;
GlovFontStyle.prototype.glow_inner = 0;
GlovFontStyle.prototype.glow_outer = 0;
GlovFontStyle.prototype.glow_color = 0x00000000;
GlovFontStyle.prototype.color = 0xFFFFFFff;
// GlovFontStyle.prototype.colorUR = 0;
// GlovFontStyle.prototype.colorLR = 0;
// GlovFontStyle.prototype.colorLL = 0;
// GlovFontStyle.prototype.color_mode = COLOR_MODE.SINGLE;
GlovFontStyle.prototype.hash = 0; // filled dynamically

export const font_shaders = {};

export function intColorFromVec4Color(v) {
  return ((v[0] * 255 | 0) << 24) |
    ((v[1] * 255 | 0) << 16) |
    ((v[2] * 255 | 0) << 8) |
    ((v[3] * 255 | 0));
}

export function vec4ColorFromIntColor(v, c) {
  v[0] = ((c >> 24) & 0xFF) / 255;
  v[1] = ((c >> 16) & 0xFF) / 255;
  v[2] = ((c >> 8) & 0xFF) / 255;
  v[3] = (c & 0xFF) / 255;
  return v;
}

function vec4ColorFromIntColorPreMultiplied(v, c) {
  let a = v[3] = (c & 0xFF) / 255;
  a *= (1/255);
  v[0] = ((c >> 24) & 0xFF) * a;
  v[1] = ((c >> 16) & 0xFF) * a;
  v[2] = ((c >> 8) & 0xFF) * a;
}

export const glov_font_default_style = new GlovFontStyle();

export function fontStyle(font_style, fields) {
  let ret = new GlovFontStyle();
  let { color_vec4 } = ret;
  if (font_style) {
    for (let f in font_style) {
      ret[f] = font_style[f];
    }
  }
  for (let f in fields) {
    ret[f] = fields[f];
  }
  ret.color_vec4 = color_vec4; // Restore
  vec4ColorFromIntColor(ret.color_vec4, ret.color);
  ret.hash = 0;
  return ret;
}

export function fontStyleColored(font_style, color) {
  return fontStyle(font_style, {
    color
  });
}

export function fontStyleOutlined(font_style, outline_width, outline_color) {
  let parent = font_style || glov_font_default_style;
  outline_color = outline_color || parent.color;
  return fontStyle(font_style, {
    outline_width,
    outline_color,
  });
}

export function fontStyleBold(font_style, outline_width) {
  let parent = font_style || glov_font_default_style;
  let outline_color = parent.color;
  if (font_style.outline_width) {
    // move to glow
    let glow_w = outline_width + font_style.outline_width;
    return fontStyle(font_style, {
      outline_width,
      outline_color,
      glow_xoffs: 0,
      glow_yoffs: 0,
      glow_color: font_style.outline_color,
      glow_inner: glow_w - 0.25,
      glow_outer: glow_w + 0.25,
    });
  } else {
    // just add outline
    return fontStyle(font_style, {
      outline_width,
      outline_color,
    });
  }

}

function colorAlpha(color, alpha) {
  alpha = clamp(round((color & 0xFF) * alpha), 0, 255);
  return color & 0xFFFFFF00 | alpha;
}

export function fontStyleAlpha(font_style, alpha) {
  return fontStyle(font_style, {
    color: colorAlpha((font_style || glov_font_default_style).color, alpha),
    outline_color: colorAlpha((font_style || glov_font_default_style).outline_color, alpha),
    glow_color: colorAlpha((font_style || glov_font_default_style).glow_color, alpha),
  });
}

// Returns a Float64, so pretty much anything is fine
export function fontStyleHash(style) {
  if (!style.hash) {
    style.hash = style.color +
      style.outline_width * 1007 +
      style.outline_color * 3 +
      style.glow_xoffs * 10007 +
      style.glow_yoffs * 100007 +
      style.glow_inner * 1000007 +
      style.glow_outer * 10000007 +
      style.glow_color * 7;
  }
  return style.hash;
}


let tech_params = null;
let tech_params_dirty = false;
let tech_params_cache = [];
let tech_params_cache_idx = 0;
let tech_params_pool = [];
let tech_params_pool_idx = 0;
let temp_color = vec4();
let geom_stats;

let dsp = {}; // drawScaled param

function techParamsAlloc() {
  if (tech_params_pool_idx === tech_params_pool.length) {
    tech_params_pool.push({
      param0: vec4(),
      outline_color: vec4(),
      glow_color: vec4(),
      glow_params: vec4(),
    });
  }
  tech_params = tech_params_pool[tech_params_pool_idx++];
}

function fontStartup() {
  if (tech_params) {
    return;
  }

  geom_stats = geom.stats;

  techParamsAlloc();
}

function techParamsSet(param, value) {
  let tpv = tech_params[param];
  // not dirty, if anything changes, we need a new object!
  if (!tech_params_dirty) {
    if (tpv[0] !== value[0] || tpv[1] !== value[1] || tpv[2] !== value[2] || tpv[3] !== value[3]) {
      // clone old values before modifying
      let old_tech_params = tech_params;
      techParamsAlloc();
      v4copy(tech_params.param0, old_tech_params.param0);
      v4copy(tech_params.outline_color, old_tech_params.outline_color);
      v4copy(tech_params.glow_color, old_tech_params.glow_color);
      v4copy(tech_params.glow_params, old_tech_params.glow_params);
      geom_stats.font_params++;
      tech_params_dirty = true;
      tpv = tech_params[param];
    } else {
      // identical, do nothing
      return;
    }
  }
  if (tech_params_dirty) {
    // just set
    tpv[0] = value[0];
    tpv[1] = value[1];
    tpv[2] = value[2];
    tpv[3] = value[3];
    // return;
  }
}

const SHADER_KEYS = ['param0', 'outline_color', 'glow_color', 'glow_params'];
function sameTP(as) {
  for (let jj = 0; jj < 4; ++jj) {
    let key = SHADER_KEYS[jj];
    let v1 = tech_params[key];
    let v2 = as[key];
    for (let ii = 0; ii < 4; ++ii) {
      if (v1[ii] !== v2[ii]) {
        return false;
      }
    }
  }
  return true;
}

function techParamsGet() {
  if (!tech_params_dirty) {
    return tech_params;
  }
  tech_params_dirty = false;
  for (let ii = 0; ii < tech_params_cache.length; ++ii) {
    if (sameTP(tech_params_cache[ii])) {
      // Found a match in the cache, use that instead
      if (tech_params === tech_params_pool[tech_params_pool_idx-1]) {
        // and this was just pulled off the pool, put it back on
        tech_params_pool_idx--;
      }
      tech_params = tech_params_cache[ii];
      if (tech_params_cache_idx === ii) {
        // about to be overwritten
        tech_params_cache_idx = (tech_params_cache_idx + 1) % 4;
      }
      --geom_stats.font_params;
      return tech_params;
    }
  }
  tech_params_cache[tech_params_cache_idx] = tech_params;
  tech_params_cache_idx = (tech_params_cache_idx + 1) % 4;
  return tech_params;
}

function GlovFont(font_info, texture_name) {
  assert(font_info.font_size !== 0); // Got lost somewhere

  this.texture = textureLoad({
    url: `img/${texture_name}.png`,
    filter_min: font_info.noFilter ? gl.NEAREST : gl.LINEAR,
    filter_mag: font_info.noFilter ? gl.NEAREST : gl.LINEAR,
    wrap_s: gl.CLAMP_TO_EDGE,
    wrap_t: gl.CLAMP_TO_EDGE,
  });
  this.textures = [this.texture];
  this.integral = Boolean(font_info.noFilter); // TODO: often only want this for pixely = strict modes?
  this.hard_cutoff = this.integral; // Maybe only if also pixely-strict?

  this.font_info = font_info;
  this.font_size = font_info.font_size;
  this.inv_font_size = 1 / font_info.font_size;
  this.shader = font_shaders.font_aa;
  this.tex_w = font_info.imageW;
  this.tex_h = font_info.imageH;

  // Calculate inverse scale, fixup 0s
  for (let ii = 0; ii < font_info.char_infos.length; ++ii) {
    let char_info = font_info.char_infos[ii];
    char_info.scale = 1 / (char_info.sc || 1);
    char_info.w = char_info.w || 0;
  }

  // build lookup
  this.char_infos = [];
  for (let ii = 0; ii < font_info.char_infos.length; ++ii) {
    let char_info = font_info.char_infos[ii];
    this.char_infos[char_info.c] = char_info;
    char_info.xpad = char_info.xpad || 0;
    char_info.yoffs = char_info.yoffs || 0;
    char_info.w_pad_scale = (char_info.w + char_info.xpad) * char_info.scale;
  }
  this.replacement_character = this.infoFromChar(0xFFFD);
  if (!this.replacement_character) {
    this.replacement_character = this.infoFromChar(63); // '?'
  }
  this.whitespace_character = this.infoFromChar(13);

  this.default_style = new GlovFontStyle();
  this.applied_style = new GlovFontStyle();

  fontStartup();
}

// General draw functions return width
// Pass NULL for style to use default style
// If the function takes a color, this overrides the color on the style
GlovFont.prototype.drawSizedColor = function (style, x, y, z, size, color, text) {
  return this.drawSized(fontStyleColored(style, color), x, y, z, size, text);
};
GlovFont.prototype.drawSized = function (style, x, y, z, size, text) {
  dsp.style = style;
  dsp.x = x;
  dsp.y = y;
  dsp.z = z;
  dsp.xsc = size * this.inv_font_size;
  dsp.ysc = size * this.inv_font_size;
  dsp.text = text;
  return this.drawScaled();
};

GlovFont.prototype.drawSizedAligned = function (style, x, y, z, size, align, w, h, text) {
  profilerStartFunc();
  text = getStringFromLocalizable(text);

  if (align & ALIGN.HWRAP) {
    let drawn_height = this.drawSizedAlignedWrapped(style, x, y, z, 0, size, align & ~ALIGN.HWRAP, w, h, text);
    profilerStopFunc();
    return drawn_height;
  }
  let x_size = size;
  let y_size = size;
  if (align & ALIGN_NEEDS_WIDTH) {
    let width = this.getStringWidth(style, x_size, text);
    if ((align & ALIGN.HFIT) && width > w + EPSILON) {
      let scale = w / width;
      x_size *= scale;
      width = w;
      // Additionally, if we're really squishing things horizontally, shrink the font size
      // and offset to be centered.
      if (scale < 0.5) {
        if ((align & ALIGN.VMASK) !== ALIGN.VCENTER && (align & ALIGN.VMASK) !== ALIGN.VBOTTOM) {
          // Offset to be roughly centered in the original line bounds
          y += (y_size - (y_size * scale * 2)) * 0.5;
        }
        y_size *= scale * 2;
      }
    }
    switch (align & ALIGN.HMASK) { // eslint-disable-line default-case
      case ALIGN.HCENTER:
        x += (w - width) * 0.5;
        if (this.integral) {
          x = round(x);
        }
        break;
      case ALIGN.HRIGHT:
        x += w - width;
        break;
    }
  }
  switch (align & ALIGN.VMASK) { // eslint-disable-line default-case
    case ALIGN.VCENTER:
      y += (h - y_size) * 0.5;
      if (this.integral) {
        y = round(y);
      }
      break;
    case ALIGN.VBOTTOM:
      y += h - y_size;
      break;
  }

  let xsc = x_size * this.inv_font_size;
  let ysc = y_size * this.inv_font_size;
  dsp.style = style;
  dsp.x = x;
  dsp.y = y;
  dsp.z = z;
  dsp.xsc = xsc;
  dsp.ysc = ysc;
  dsp.text = text;
  let drawn_width = this.drawScaled();
  profilerStopFunc();
  return drawn_width;
};

function endsWord(char_code) {
  return char_code === 32 || // ' '
    char_code === 0 || // end of string
    char_code === 10 || // '\n'
    char_code === 9; // '\t'
}

// Attempts to split as evenly as possible into this many lines
function splitLines(text, num_lines) {
  let ret = [];
  // Do last line first so first lines do not get HFIT squishing applied
  for (let ii = num_lines - 1; ii > 0; --ii) {
    let lines_left = ii + 1;
    let desired_len = floor(text.length / lines_left);
    let max_len = ceil(1.5 * desired_len);

    let split_point = text.length - desired_len;
    for (let idx = split_point; idx >= text.length - max_len; --idx) {
      let c = text.charCodeAt(idx);
      if (endsWord(c) || c === 45) { // '-'
        split_point = idx + 1;
        break;
      }
    }
    ret[ii] = text.slice(split_point);
    text = text.slice(0, split_point);
  }
  ret[0] = text;
  return ret;
}

let tile_state = 0;
let chained_outside = false;

GlovFont.prototype.drawSizedAlignedWrapped = function (style, x, y, z, indent, size, align, w, h, text) {
  text = getStringFromLocalizable(text);
  assert(w > 0);
  assert(typeof h !== 'string'); // Old API did not have `indent` parameter
  let lines = [];
  let line_xoffs = [];
  lines.length = this.wrapLines(style, w, indent, size, text, align, (xoffs, linenum, line) => {
    line_xoffs[linenum] = xoffs;
    lines[linenum] = line;
  });

  if ((align & ALIGN.HFIT) && h) {
    if (lines.length * size > h) {
      // also fit within the vertical bounds

      let by_linebreak = text.split('\n');
      if (by_linebreak.length > 1) {
        // input has carriage returns, just HFIT each line
        size = min(size, h / by_linebreak.length);
        lines = by_linebreak;
        for (let ii = 0; ii < lines.length; ++ii) {
          line_xoffs[ii] = ii === 0 ? 0 : indent;
        }
      } else {
        let text_width = 0;
        for (let ii = 0; ii < by_linebreak.length; ++ii) {
          text_width = max(text_width, this.getStringWidth(style, size, by_linebreak[ii]));
        }
        let text_area = text_width * size * by_linebreak.length;
        let bounds_area = w * h;
        let required_scale = min(sqrt(min(1, bounds_area / text_area)), h / size / by_linebreak.length);
        size *= required_scale;
        // determine number of lines at that scale (round down)
        let scaled_max_lines = max(1, floor(h / size));
        // split into that many lines
        // try wrapLines, if it produces too many lines, do another split method
        lines = [];
        line_xoffs = [];
        lines.length = this.wrapLines(style, w, indent, size, text, align, (xoffs, linenum, line) => {
          line_xoffs[linenum] = xoffs;
          lines[linenum] = line;
        });
        if (lines.length > scaled_max_lines) {
          // need to do something else
          lines = splitLines(text, scaled_max_lines);
          for (let ii = 0; ii < lines.length; ++ii) {
            line_xoffs[ii] = ii === 0 ? 0 : indent;
          }
        }
      }
      // draw each line with HFIT below
    }
  }

  let yoffs = 0;
  let height = size * lines.length;
  let valign = align & ALIGN.VMASK;
  switch (valign) { // eslint-disable-line default-case
    case ALIGN.VCENTER:
      yoffs = (h - height) / 2;
      if (this.integral) {
        yoffs |= 0;
      }
      break;
    case ALIGN.VBOTTOM:
      yoffs = h - height;
      break;
  }
  align &= ~ALIGN.VMASK;

  chained_outside = true;
  tile_state = 0;
  spriteChainedStart();
  for (let ii = 0; ii < lines.length; ++ii) {
    let line = lines[ii];
    if (line && line.trim()) {
      this.drawSizedAligned(style, x + line_xoffs[ii], y + yoffs, z, size, align, w - line_xoffs[ii], 0, line);
    }
    yoffs += size;
  }
  chained_outside = false;
  spriteChainedStop();
  return valign === ALIGN.VBOTTOM ? height : yoffs;
};

// returns height
GlovFont.prototype.drawSizedColorWrapped = function (style, x, y, z, w, indent, size, color, text) {
  return this.drawScaledWrapped(fontStyleColored(style, color), x, y, z, w,
    indent, size * this.inv_font_size, size * this.inv_font_size, text);
};
GlovFont.prototype.drawSizedWrapped = function (style, x, y, z, w, indent, size, text) {
  return this.drawScaledWrapped(style, x, y, z, w,
    indent, size * this.inv_font_size, size * this.inv_font_size, text);
};

let default_size = 24;
export function fontSetDefaultSize(h) {
  default_size = h;
}

let font_rot = 0;
let font_rot_cos = 0;
let font_rot_sin = 0;
let font_rot_origin_x = 0;
let font_rot_origin_y = 0;
export function fontRotate(rot, rot_origin_x, rot_origin_y) {
  font_rot = rot;
  font_rot_cos = cos(rot);
  font_rot_sin = sin(rot);
  font_rot_origin_x = transformX(rot_origin_x);
  font_rot_origin_y = transformY(rot_origin_y);
}

GlovFont.prototype.draw = function (param) {
  let { style, color, alpha, x, y, z, size, w, h, align, text, indent, rot } = param;
  if (color) {
    style = fontStyleColored(style, color);
  }
  if (alpha !== undefined) {
    style = fontStyleAlpha(style, alpha);
  }
  indent = indent || 0;
  size = size || default_size;
  z = z || Z.UI;
  if (rot) {
    // TODO: x/y should be calculated w.r.t. w/h if align is specified
    fontRotate(rot, x, y);
  }
  let ret;
  if (align) {
    if (align & ALIGN.HWRAP) {
      ret = this.drawSizedAlignedWrapped(style, x, y, z, indent, size, align & ~ALIGN.HWRAP, w, h, text);
    } else {
      ret = this.drawSizedAligned(style, x, y, z, size, align, w || 0, h || 0, text);
    }
  } else {
    ret = this.drawSized(style, x, y, z, size, text);
  }
  if (rot) {
    fontRotate(0);
  }
  return ret;
};

// line_cb(x0, int linenum, const char *line, x1)
GlovFont.prototype.wrapLines = function (style, w, indent, size, text, align, line_cb) {
  assert(typeof style !== 'number'); // old API did not have `style` parameter
  this.applyStyle(style);
  return this.wrapLinesScaled(w, indent, size * this.inv_font_size, text, align, line_cb);
};

GlovFont.prototype.numLines = function (style, w, indent, size, text) {
  return this.wrapLines(style, w, indent, size, text, 0);
};

GlovFont.prototype.dims = function (style, w, indent, size, text) {
  let max_x1 = 0;
  function lineCallback(ignored1, ignored2, line, x1) {
    max_x1 = max(max_x1, x1);
  }
  let numlines = this.wrapLines(style, w, indent, size, text, 0, lineCallback);
  return {
    w: max_x1,
    h: numlines * size,
    numlines,
  };
};

let unicode_replacement_chars;
GlovFont.prototype.infoFromChar = function (c) {
  let ret = this.char_infos[c];
  if (ret) {
    return ret;
  }
  if (c >= 9 && c <= 13) { // characters that String.trim() strip
    return this.whitespace_character;
  }
  if (unicode_replacement_chars) {
    let ascii = unicode_replacement_chars[c];
    if (ascii) {
      ret = this.char_infos[ascii];
      if (ret) {
        return ret;
      }
    }
  }
  // no char info, not whitespace, show replacement even if ascii, control code
  return this.replacement_character;
};

const strip_opts_default = {
  tab: true,
  newline: true,
};
GlovFont.prototype.stripUnprintable = function (text, opts) {
  opts = opts || strip_opts_default;
  text = getStringFromLocalizable(text);
  for (let ii = text.length - 1; ii >= 0; --ii) {
    let code = text.charCodeAt(ii);
    let strip = false;
    if (code === 10) {
      strip = opts.newline ? ' ' : false;
    } else if (code === 9) {
      strip = opts.tab ? ' ' : false;
    } else if (code >= 10 && code <= 13) {
      strip = ' ';
    } else if (!this.char_infos[code]) {
      strip = '?';
    }
    if (strip) {
      text = `${text.slice(0, ii)}${strip}${text.slice(ii + 1)}`;
    }
  }
  return text;
};

GlovFont.prototype.getCharacterWidth = function (style, x_size, c) {
  assert.equal(typeof c, 'number');
  this.applyStyle(style);
  let char_info = this.infoFromChar(c);
  let xsc = x_size * this.inv_font_size;
  let x_advance = this.calcXAdvance(xsc);
  if (char_info) {
    return char_info.w_pad_scale * xsc + x_advance;
  }
  return 0;
};

GlovFont.prototype.getStringWidth = function (style, x_size, text) {
  text = getStringFromLocalizable(text);

  this.applyStyle(style);
  let ret=0;
  let xsc = x_size * this.inv_font_size;
  let x_advance = this.calcXAdvance(xsc);
  for (let ii = 0; ii < text.length; ++ii) {
    let c = text.charCodeAt(ii);
    let char_info = this.infoFromChar(c);
    if (char_info) {
      ret += char_info.w_pad_scale * xsc + x_advance;
    }
  }
  return ret;
};

GlovFont.prototype.truncateToWidth = function (style, x_size, max_width, text) {
  text = getStringFromLocalizable(text);

  this.applyStyle(style);
  let ret=0;
  let xsc = x_size * this.inv_font_size;
  let x_advance = this.calcXAdvance(xsc);
  let elipsis_width = this.getStringWidth(style, x_size, '...');
  let max_without_elipsis = max_width - elipsis_width;
  let truncate_ret = 0;
  for (let ii = 0; ii < text.length; ++ii) {
    let c = text.charCodeAt(ii);
    let char_info = this.infoFromChar(c);
    if (char_info) {
      ret += char_info.w_pad_scale * xsc + x_advance;
      if (!truncate_ret && ret > max_without_elipsis) {
        truncate_ret = ii;
      }
      if (ret > max_width) {
        return `${text.slice(0, truncate_ret)}...`;
      }
    }
  }
  return text;
};

GlovFont.prototype.getSpaceSize = function (xsc) {
  let space_info = this.infoFromChar(32); // ' '
  return (space_info ? (space_info.w + space_info.xpad) * space_info.scale : this.font_size) * xsc;
};

// line_cb(x0, int linenum, const char *line, x1)
GlovFont.prototype.wrapLinesScaled = function (w, indent, xsc, text, align, line_cb) {
  text = getStringFromLocalizable(text);
  assert(typeof align !== 'function'); // Old API had one less parameter
  const len = text.length;
  const max_word_w = w - indent + EPSILON;
  // "fit" mode: instead of breaking the too-long word, output it on a line of its own
  const hard_wrap_mode_fit = align & ALIGN.HFIT;
  const x_advance = this.calcXAdvance(xsc);
  const space_size = this.getSpaceSize(xsc) + x_advance;
  let idx = 0;
  let line_start = 0;
  let line_x0 = 0;
  let line_x1 = 0;
  let line_end = -1;
  let word_start = 0;
  let word_x0 = 0;
  let word_w = 0;
  let word_slice = -1;
  let word_slice_w = 0;
  let linenum = 0;

  function flushLine() {
    if (line_end !== -1 && line_cb) {
      line_cb(line_x0, linenum, text.slice(line_start, line_end), line_x1);
    }
    linenum++;
    line_x0 = indent;
    line_x1 = -1;
    line_start = word_start;
    line_end = -1;
    word_x0 = line_x0;
  }

  do {
    let c = idx < len ? text.charCodeAt(idx) || 0xFFFD : 0;
    if (endsWord(c)) {
      if (word_start !== idx) {
        let need_line_flush = false;
        // flush word, take care of space on next loop
        if (word_x0 + word_w <= w + EPSILON) {
          // fits fine, add to line, start new word
        } else if (word_w > max_word_w && !hard_wrap_mode_fit) {
          // even just this word alone won't fit, needs a hard wrap
          // output what fits on this line, then continue to next line
          need_line_flush = true;
          if (word_slice === -1) {
            // not even a single letter fits on this line
            if (line_end !== -1) {
              // wrap to a new line if not already
              flushLine();
            }
            // just output one letter, start new word from second letter
            idx = line_start + 1;
            word_w = max_word_w; // underestimate
          } else {
            // output what fits on this line so far
            idx = word_slice;
            word_w = word_slice_w;
          }
        } else {
          // won't fit, but fits on next line, soft wrap
          if (line_end !== -1 || indent < 0 && line_x0 !== indent) {
            flushLine();
          }
        }
        //addWord();
        line_end = idx;
        line_x1 = word_x0 + word_w;
        word_x0 = line_x1;
        word_w = 0;
        word_start = idx;
        word_slice = -1;

        if (need_line_flush) {
          flushLine();
        }

        // we're now either still pointing at the space, or rewound to an earlier point
        continue;
      } else if (c) {
        // process the space
        word_start = idx + 1;
        word_x0 += space_size;
        if (c === 10) { // \n
          flushLine();
        }
      }
    } else {
      let char_info = this.infoFromChar(c);
      if (char_info) {
        let char_w = char_info.w_pad_scale * xsc + x_advance;
        word_w += char_w;
        if (word_x0 + word_w <= w + EPSILON) { // would partially fit up to and including this letter
          word_slice = idx + 1;
          word_slice_w = word_w;
        }
      }
    }
    ++idx;
  } while (idx <= len);
  if (line_end !== -1) {
    line_x1 = word_x0; // include size of trailing whitespace
    flushLine();
  } else if (word_x0 !== line_x1) {
    line_x1 = word_x0; // include size of trailing whitespace, if any
    if (line_cb) {
      line_cb(line_x0, linenum, '', line_x1);
    }
  }

  return linenum;
};

GlovFont.prototype.drawScaledWrapped = function (style, x, y, z, w, indent, xsc, ysc, text) {
  if (text === null || text === undefined) {
    text = '(null)';
  }
  assert(w > 0);
  this.applyStyle(style);
  // This function returns height instead of width, so leave the maximum width encountered here for caller
  this.last_width = 0;
  dsp.style = style;
  dsp.z = z;
  dsp.xsc = xsc;
  dsp.ysc = ysc;
  let num_lines = this.wrapLinesScaled(w, indent, xsc, text, 0, (xoffs, linenum, line, x1) => {
    dsp.x = x + xoffs;
    dsp.y = y + this.font_size * ysc * linenum;
    dsp.text = line;
    this.drawScaled();
    this.last_width = max(this.last_width, x1);
  });
  return num_lines * this.font_size * ysc;
};

GlovFont.prototype.calcXAdvance = function (xsc) {
  // Assume called: applyStyle(style);

  // scale all supplied values by this so that if we swap in a font with twice the resolution (and twice the spread)
  //   things look almost identical, just crisper
  let font_texel_scale = this.font_size / 32;
  // As a compromise, -2 bias here seems to work well
  let x_advance = round(xsc * font_texel_scale * max(this.applied_style.outline_width - 2, 0));
  // As a compromise, there's a -3 bias in there, so it only kicks in under extreme circumstances
  x_advance = max(x_advance, xsc * font_texel_scale *
    max(this.applied_style.glow_outer - this.applied_style.glow_xoffs - 3, 0));
  return x_advance;
};

//////////////////////////////////////////////////////////////////////////
// Main implementation

const temp_vec4_param0 = vec4();
const temp_vec4_glow_params = vec4();
const padding4 = vec4();
const padding_in_font_space = vec4();
GlovFont.prototype.drawScaled = function () {
  let { style, x: _x, y, z, xsc, ysc, text } = dsp;
  profilerStartFunc();
  text = getStringFromLocalizable(text);
  let x = _x;
  assert(isFinite(x));
  assert(isFinite(y));
  assert(isFinite(z));
  let font_info = this.font_info;
  // Debug: show expect area of glyphs
  // require('./ui.js').drawRect(_x, y,
  //   _x + xsc * font_size * 20, y + ysc * font_size,
  //   1000, [1, 0, 1, 0.5]);
  y += (font_info.y_offset || 0) * ysc;
  let texs = this.textures;
  if (text === null || text === undefined) {
    text = '(null)';
  }
  const len = text.length;
  if (xsc === 0 || ysc === 0) {
    profilerStopFunc();
    return 0;
  }

  geom_stats.font_calls++;

  this.applyStyle(style);

  let blend_mode = engine.defines.NOPREMUL ? BLEND_ALPHA : BLEND_PREMULALPHA;

  const avg_scale_font = (xsc + ysc) * 0.5;
  const camera_xscale = camera2d.data[4];
  const camera_yscale = camera2d.data[5];
  let avg_scale_combined = (xsc * camera_xscale + ysc * camera_yscale) * 0.5;
  // Not doing this here, because render_scale_all is not currently reflected in camera_x/yscale
  // avg_scale_combined *= settings.render_scale_all;

  // scale all supplied values by this so that if we swap in a font with twice the resolution (and twice the spread)
  //   things look almost identical, just crisper
  let x_advance = this.calcXAdvance(xsc);
  let font_texel_scale = this.font_size / 32;
  if (!chained_outside) {
    tile_state = 0;
  }

  let applied_style = this.applied_style;

  // Calculate anti-aliasing values
  let delta_per_source_pixel = 0.5 / font_info.spread;
  let delta_per_dest_pixel = delta_per_source_pixel / avg_scale_combined;
  let value = v3set(temp_vec4_param0,
    1 / delta_per_dest_pixel, // AA Mult and Outline Mult
    -0.5 / delta_per_dest_pixel + 0.5, // AA Add
    // Outline Add
    min(0, -0.5 / delta_per_dest_pixel + 0.5 + applied_style.outline_width*font_texel_scale*avg_scale_combined),
    // 0, // Unused
  );
  let padding1 = max(0, applied_style.outline_width*font_texel_scale*avg_scale_font);
  const outer_scaled = applied_style.glow_outer*font_texel_scale;
  let glow_xoffs = applied_style.glow_xoffs*font_texel_scale*xsc;
  let glow_yoffs = applied_style.glow_yoffs*font_texel_scale*ysc;
  padding4[0] = max(outer_scaled*xsc - glow_xoffs, padding1);
  padding4[2] = max(outer_scaled*xsc + glow_xoffs, padding1);
  padding4[1] = max(outer_scaled*ysc - glow_yoffs, padding1);
  padding4[3] = max(outer_scaled*ysc + glow_yoffs, padding1);

  if (this.hard_cutoff) {
    value[0] *= 512;
    value[1] = value[1] * 512 - 255.5;
    value[2] = value[2] * 512 - 255.5;
  }
  techParamsSet('param0', value);

  let value2 = temp_vec4_glow_params;
  // Glow mult
  if (applied_style.glow_outer) {
    value2[2] = 1 / ((applied_style.glow_outer - applied_style.glow_inner) * delta_per_source_pixel * font_texel_scale);
    value2[3] = min(0, -(0.5 - applied_style.glow_outer * delta_per_source_pixel * font_texel_scale) /
      ((applied_style.glow_outer - applied_style.glow_inner) * delta_per_source_pixel * font_texel_scale));
  } else {
    // Avoid sending `Infinity` to GPU
    value2[2] = value2[3] = 0;
  }

  v4scale(padding_in_font_space, padding4, 1 / avg_scale_font);
  for (let ii = 0; ii < 4; ++ii) {
    if (padding_in_font_space[ii] > font_info.spread) {
      // Not enough buffer
      let sc = font_info.spread / padding_in_font_space[ii];
      padding4[ii] *= sc;
      padding_in_font_space[ii] *= sc;
    }
  }

  // Choose appropriate z advance so that character are drawn left to right (or RTL if the glow is on the other side)
  // same Z should be drawn in queue order, so not needed
  const z_advance = applied_style.glow_xoffs < 0 ? -0.0001 : 0; // 0.0001;
  if (!z_advance) {
    if (!chained_outside) {
      spriteChainedStart();
    }
  } else {
    if (chained_outside) {
      spriteChainedStop();
    }
  }

  const has_glow_offs = applied_style.glow_xoffs || applied_style.glow_yoffs;
  if (!has_glow_offs) {
    value2[0] = value2[1] = 0;
    techParamsSet('glow_params', value2);
    techParamsGet();
  }

  // For non-1:1 aspect ration rendering, need to scale our coordinates' padding differently in each axis
  let rel_x_scale = xsc / avg_scale_font;
  let rel_y_scale = ysc / avg_scale_font;

  let sort_y = transformY(y);
  let color = applied_style.color_vec4;
  let shader = this.shader;
  let turx;
  let tury;
  let tllx;
  let tlly;

  for (let i=0; i<len; i++) {
    const c = text.charCodeAt(i);
    if (c === 9) { // '\t'.charCodeAt(0)) {
      let tabsize = xsc * this.font_size * 4;
      x = ((((x - _x) / tabsize) | 0) + 1) * tabsize + _x;
    } else {
      let char_info = this.infoFromChar(c);
      if (char_info) {
        let char_scale = char_info.scale;
        let xsc2 = xsc * char_scale;
        if (char_info.w) {
          let ysc2 = ysc * char_scale;
          let pad_scale = 1 / char_scale;
          let tile_width = this.tex_w;
          let tile_height = this.tex_h;
          // Lazy update params here
          if (has_glow_offs && char_scale !== tile_state) {
            value2[0] = -applied_style.glow_xoffs * font_texel_scale * pad_scale / tile_width;
            value2[1] = -applied_style.glow_yoffs * font_texel_scale * pad_scale / tile_height;
            techParamsSet('glow_params', value2);
            if (!z_advance) {
              spriteChainedStop();
              spriteChainedStart();
            }
            techParamsGet();
            tile_state = char_scale;
          }

          let u0 = (char_info.x0 - padding_in_font_space[0] * pad_scale) / tile_width;
          let u1 = (char_info.x0 + char_info.w + padding_in_font_space[2] * pad_scale) / tile_width;
          let v0 = (char_info.y0 - padding_in_font_space[1] * pad_scale) / tile_height;
          let v1 = (char_info.y0 + char_info.h + padding_in_font_space[3] * pad_scale) / tile_height;

          let w = char_info.w * xsc2 + (padding4[0] + padding4[2]) * rel_x_scale;
          let h = char_info.h * ysc2 + (padding4[1] + padding4[3]) * rel_y_scale;

          let xx = x - rel_x_scale * padding4[0];
          let yy = y - rel_y_scale * padding4[1] + char_info.yoffs * ysc2;
          // Below is inlined/optimized version of:
          // spriteQueueRaw(
          //   texs,
          //   xx, yy,
          //   z + z_advance * i, w, h,
          //   u0, v0, u1, v1,
          //   color,
          //   shader, tech_params, blend_mode).y = sort_y;

          let y1 = yy + h;
          let x1 = xx + w;
          let zz = z + z_advance * i;

          let tulx = transformX(xx);
          let tuly = transformY(yy);
          let tlrx = transformX(x1);
          let tlry = transformY(y1);
          if (font_rot) {
            let tw = tlrx - tulx;
            let th = tlry - tuly;
            let relxoffs = tulx - font_rot_origin_x;
            let relyoffs = tuly - font_rot_origin_y;
            tulx = font_rot_origin_x + relxoffs * font_rot_cos - relyoffs * font_rot_sin;
            tuly = font_rot_origin_y + relxoffs * font_rot_sin + relyoffs * font_rot_cos;
            let cosw = font_rot_cos * tw;
            let sinw = font_rot_sin * tw;
            let sinh = font_rot_sin * th;
            let cosh = font_rot_cos * th;
            turx = tulx + cosw;
            tury = tuly + sinw;
            tllx = tulx - sinh;
            tlly = tuly + cosh;
            tlrx = tulx + cosw - sinh;
            tlry = tuly + sinw + cosh;
          } else {
            turx = tlrx;
            tury = tuly;
            tllx = tulx;
            tlly = tlry;
          }

          let elem = spriteDataAlloc(texs, shader, tech_params, blend_mode);
          let data = elem.data;
          data[0] = tulx;
          data[1] = tuly;
          data[2] = color[0];
          data[3] = color[1];
          data[4] = color[2];
          data[5] = color[3];
          data[6] = u0;
          data[7] = v0;

          data[8] = tllx;
          data[9] = tlly;
          data[10] = color[0];
          data[11] = color[1];
          data[12] = color[2];
          data[13] = color[3];
          data[14] = u0;
          data[15] = v1;

          data[16] = tlrx;
          data[17] = tlry;
          data[18] = color[0];
          data[19] = color[1];
          data[20] = color[2];
          data[21] = color[3];
          data[22] = u1;
          data[23] = v1;

          data[24] = turx;
          data[25] = tury;
          data[26] = color[0];
          data[27] = color[1];
          data[28] = color[2];
          data[29] = color[3];
          data[30] = u1;
          data[31] = v0;

          elem.x = tulx;
          elem.y = sort_y;
          elem.queue(zz);

          // require('./ui.js').drawRect(xx, yy, x1, y1, 1000, [i & 1, (i & 2)>>1, (i & 4)>>2, 0.5]);
        }

        x += (char_info.w + char_info.xpad) * xsc2 + x_advance;
      }
    }
  }
  if (!z_advance) {
    if (!chained_outside) {
      spriteChainedStop();
    }
  } else {
    if (chained_outside) {
      spriteChainedStart();
    }
  }
  profilerStopFunc();
  return x - _x;
};

GlovFont.prototype.determineShader = function () {
  let outline = this.applied_style.outline_width && (this.applied_style.outline_color & 0xff);
  let glow = this.applied_style.glow_outer > 0 && (this.applied_style.glow_color & 0xff);
  if (outline) {
    if (glow) {
      this.shader = font_shaders.font_aa_outline_glow;
    } else {
      this.shader = font_shaders.font_aa_outline;
    }
  } else if (glow) {
    this.shader = font_shaders.font_aa_glow;
  } else {
    this.shader = font_shaders.font_aa;
  }
};

GlovFont.prototype.applyStyle = function (style) {
  if (!style) {
    style = this.default_style;
  }
  if (engine.defines.NOPREMUL) {
    // outline
    vec4ColorFromIntColor(temp_color, style.outline_color);
    techParamsSet('outline_color', temp_color);

    // glow
    vec4ColorFromIntColor(temp_color, style.glow_color);
    techParamsSet('glow_color', temp_color);
  } else {
    // outline
    vec4ColorFromIntColorPreMultiplied(temp_color, style.outline_color);
    techParamsSet('outline_color', temp_color);

    // glow
    vec4ColorFromIntColorPreMultiplied(temp_color, style.glow_color);
    techParamsSet('glow_color', temp_color);
  }

  // everything else
  this.applied_style.outline_width = style.outline_width;
  this.applied_style.outline_color = style.outline_color;
  this.applied_style.glow_xoffs = style.glow_xoffs;
  this.applied_style.glow_yoffs = style.glow_yoffs;
  this.applied_style.glow_inner = style.glow_inner;
  this.applied_style.glow_outer = style.glow_outer;
  this.applied_style.glow_color = style.glow_color;
  this.applied_style.color = style.color;
  if (engine.defines.NOPREMUL) {
    v4copy(this.applied_style.color_vec4, style.color_vec4);
  } else {
    let alpha = this.applied_style.color_vec4[3] = style.color_vec4[3];
    v3scale(this.applied_style.color_vec4, style.color_vec4, alpha);
  }
  // this.applied_style.colorUR = style.colorUR;
  // this.applied_style.colorLR = style.colorLR;
  // this.applied_style.colorLL = style.colorLL;
  // this.applied_style.color_mode = style.color_mode;

  // if (this.applied_style.color_mode === COLOR_MODE.SINGLE) {
  //   this.applied_style.colorUR = this.applied_style.colorLL = this.applied_style.colorLR = this.applied_style.color;
  // }

  this.determineShader();
};

// Replicate constants and utility functions on all font instances as well
// GlovFont.prototype.COLOR_MODE = COLOR_MODE;
GlovFont.prototype.ALIGN = ALIGN;
GlovFont.prototype.style = fontStyle;
GlovFont.prototype.styleAlpha = fontStyleAlpha;
GlovFont.prototype.styleColored = fontStyleColored;

function fontShadersInit() {
  if (font_shaders.font_aa) {
    return;
  }
  font_shaders.font_aa = shaderCreate('shaders/font_aa.fp');
  font_shaders.font_aa_glow = shaderCreate('shaders/font_aa_glow.fp');
  font_shaders.font_aa_outline = shaderCreate('shaders/font_aa_outline.fp');
  font_shaders.font_aa_outline_glow = shaderCreate('shaders/font_aa_outline_glow.fp');
  shadersPrelink(sprites.sprite_vshader, font_shaders.font_aa);
  shadersPrelink(sprites.sprite_vshader, font_shaders.font_aa_glow);
  shadersPrelink(sprites.sprite_vshader, font_shaders.font_aa_outline);
  shadersPrelink(sprites.sprite_vshader, font_shaders.font_aa_outline_glow);
}

export function fontCreate(font_info, texture_name) {
  fontShadersInit();
  return new GlovFont(font_info, texture_name);
}

export function fontTick() {
  tech_params_cache_idx = 0;
  tech_params_cache.length = 0;
  tech_params_pool_idx = 0;
  techParamsAlloc();
}

export function fontSetReplacementChars(replacement_chars) {
  unicode_replacement_chars = replacement_chars;
}
