import assert from 'assert';
import {
  vec4,
} from 'glov/common/vmath';
import * as engine from './engine';
import {
  ALIGN,
  Font,
  FontStyle,
  Text,
  fontStyleOutlined,
} from './font';
import { Box } from './geom_types';
import { mousePos } from './input';
import { getStringFromLocalizable } from './localization';
import {
  MDASTNode,
  RenderableContent,
  mdParse,
} from './markdown_parse';
import {
  spriteClipPause,
  spriteClipResume,
  spriteClipped,
  spriteClippedViewport,
} from './sprites';
import {
  drawRect2,
  getUIElemData,
  uiFontStyleNormal,
  uiGetFont,
  uiTextHeight,
} from './ui';
import type { TSMap, WithRequired } from 'glov/common/types';

const { floor, max } = Math;

// Exported opaque types
export type MarkdownCache = Record<string, never>;
export type MarkdownStateParam = { // Allocate as just `{ cache: {} }`
  cache?: MarkdownCache; // Allocate as just `cache: {}` if the caller wants to own the caching
};
export type MarkdownStateCached = WithRequired<MarkdownStateParam, 'cache'>;

export type MarkdownCustomRenderable = {
  type: string;
  data: unknown;
};
export type MarkdownParseParam = {
  text: Text;
  custom?: TSMap<MarkdownCustomRenderable>;
};

export type MarkdownLayoutParam = {
  font?: Font;
  font_style?: FontStyle;
  w?: number;
  h?: number;
  text_height?: number;
  indent?: number;
  align?: ALIGN;
};

export type MarkdownDrawParam = {
  x: number;
  y: number;
  z?: number;
  viewport?: Box | null;
};


// Internal, non-exported types
type MDCache = {
  parsed?: MDLayoutBlock[];
  layout?: {
    blocks: MDDrawBlock[]; // sorted by y
    dims: MarkdownDims;
    max_block_h: number;
  };
};
type MDState = {
  cache: MDCache;
};

type MDLayoutCalcParam = Required<MarkdownLayoutParam> & {
  cursor: {
    line_x0: number;
    x: number;
    y: number;
  };
};

type MDDrawParam = {
  x: number;
  y: number;
  z: number;
};

interface MDDrawBlock {
  dims: Box;
  draw(param: MDDrawParam): void;
}

interface MDLayoutBlock {
  layout(param: MDLayoutCalcParam): MDDrawBlock[];
}

class MDBlockParagraph implements MDLayoutBlock {
  private content: MDLayoutBlock[];
  constructor(content: MDASTNode[], param: MarkdownParseParam) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    this.content = mdASTToBlock(content, param);
  }
  layout(param: MDLayoutCalcParam): MDDrawBlock[] {
    let ret: MDDrawBlock[][] = [];
    for (let ii = 0; ii < this.content.length; ++ii) {
      ret.push(this.content[ii].layout(param));
    }
    if ((param.align & ALIGN.HWRAP) && param.cursor.x !== param.cursor.line_x0) {
      param.cursor.line_x0 = param.cursor.x = param.indent;
      param.cursor.y += param.text_height;
    }
    param.cursor.y += param.text_height * 0.5;
    return Array.prototype.concat.apply([], ret);
  }
}

class MDBlockBold implements MDLayoutBlock {
  private content: MDLayoutBlock[];
  constructor(content: MDASTNode[], param: MarkdownParseParam) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    this.content = mdASTToBlock(content, param);
  }
  layout(param: MDLayoutCalcParam): MDDrawBlock[] {
    // TODO (later): migrate to UIStyle and use a named "bold" style instead?
    // For now/as well: specify 3 font styles in param?
    let old_style = param.font_style;
    param.font_style = fontStyleOutlined(old_style, 0.75);

    let ret: MDDrawBlock[][] = [];
    for (let ii = 0; ii < this.content.length; ++ii) {
      ret.push(this.content[ii].layout(param));
    }
    param.font_style = old_style;
    return Array.prototype.concat.apply([], ret);
  }
}

type MDBlockTextLayout = {
  font: Font;
  font_style: FontStyle;
  x: number;
  y: number;
  w: number;
  h: number;
  // text_height: number; //  Any reason we'd have a h !== text_height?
  align: ALIGN;
  text: string;
};
const debug_color = vec4(0,0,0,0.5);
const NOT_WRAP = ~ALIGN.HWRAP;
class MDDrawBlockText implements MDDrawBlock {
  constructor(public dims: MDBlockTextLayout) {
  }
  draw(param: MDDrawParam): void {
    profilerStart('MDDrawBlockText::draw');
    let lp = this.dims;
    lp.font.drawSizedAligned(lp.font_style,
      param.x + lp.x, param.y + lp.y, param.z,
      lp.h, lp.align & NOT_WRAP, lp.w, lp.h, lp.text);
    if (engine.defines.MD) {
      let rect = {
        x: param.x + lp.x,
        y: param.y + lp.y,
        z: Z.TOOLTIP,
        w: lp.w, h: lp.h,
        color: debug_color,
      };
      // mouseOver, but ignoring anything capturing it
      let mp = mousePos();
      if (mp[0] >= rect.x && mp[0] <= rect.x + rect.w && mp[1] >= rect.y && mp[1] <= rect.y + rect.h) {
        let clip_pause = spriteClipped();
        if (clip_pause) {
          spriteClipPause();
        }
        drawRect2(rect);
        if (clip_pause) {
          spriteClipResume();
        }
      }
    }
    profilerStop();
  }
}

class MDBlockText implements MDLayoutBlock {
  constructor(private content: string, param: MarkdownParseParam) {
  }
  layout(param: MDLayoutCalcParam): MDDrawBlock[] {
    let w = Infinity;
    let indent = param.indent;
    let line_x0 = param.cursor.x;
    if (param.align & ALIGN.HWRAP) {
      // Adjust in case we're mid-line, or already inset
      let inset = param.cursor.x;
      w = param.w - inset;
      indent -= inset;
    }
    let ret: MDDrawBlock[] = [];
    param.font.wrapLines(
      param.font_style, w, indent, param.text_height, this.content.replace(/\n/g, ' '), param.align,
      (x0: number, linenum: number, line: string, x1: number) => {
        if (linenum > 0) {
          param.cursor.y += param.text_height;
          param.cursor.line_x0 = param.indent;
        }
        let layout_param: MDBlockTextLayout = {
          font: param.font,
          font_style: param.font_style,
          x: line_x0 + x0,
          y: param.cursor.y,
          h: param.text_height,
          w: x1 - x0,
          align: param.align,
          text: line,
        };
        ret.push(new MDDrawBlockText(layout_param));
      }
    );
    if (ret.length) {
      let tail = ret[ret.length - 1];
      param.cursor.x = tail.dims.x + tail.dims.w;
    }
    return ret;
  }
}

class MDBlockRenderable implements MDLayoutBlock {
  constructor(private content: RenderableContent, param: MarkdownParseParam) {
    // let custom = param.custom || {};
    // TODO
  }
  layout(param: MDLayoutCalcParam): MDDrawBlock[] {
    return [];
  }
}

let block_constructors = {
  paragraph: MDBlockParagraph,
  text: MDBlockText,
  strong: MDBlockBold,
  em: MDBlockBold,
  renderable: MDBlockRenderable,
};

function mdASTToBlock(tree: MDASTNode[], param: MarkdownParseParam): MDLayoutBlock[] {
  let blocks: MDLayoutBlock[] = [];
  let skip = 0;
  for (let ii = 0; ii < tree.length; ++ii) {
    if (skip) {
      --skip;
      continue;
    }
    let elem = tree[ii];
    if (elem.type === 'text') {
      // if this element type is text and the next type(s) are text, combine them
      let next_elem;
      while ((next_elem = tree[ii + skip + 1]) && next_elem.type === 'text') {
        elem.content += next_elem.content;
        ++skip;
      }
    }
    let Ctor = block_constructors[elem.type];
    // @ts-expect-error elem.content is an intersection of types, but generic constructor expects a union of types
    blocks.push(new Ctor(elem.content, param));
  }
  return blocks;
}

// Convert from text into a tree of blocks
export function markdownParse(param: MarkdownStateCached & MarkdownParseParam): void {
  let state = param as MDState;
  let { cache } = state;
  if (cache.parsed) {
    return;
  }
  profilerStartFunc();
  let tree: MDASTNode[] = mdParse(getStringFromLocalizable(param.text));
  let blocks = cache.parsed = mdASTToBlock(tree, param);
  cache.parsed = blocks;
  profilerStopFunc();
}

function cmpDimsY(a: MDDrawBlock, b: MDDrawBlock): number {
  let d = a.dims.y - b.dims.y;
  if (d !== 0) {
    return d;
  }
  d = a.dims.x - b.dims.x;
  if (d !== 0) {
    return d;
  }
  return 0;
}

// let each block determine their bounds and x/y/w/h values
export function markdownLayout(param: MarkdownStateCached & MarkdownLayoutParam): void {
  let state = param as MDState;
  let { cache } = state;
  if (cache.layout) {
    return;
  }
  profilerStartFunc();
  let calc_param: MDLayoutCalcParam = {
    w: param.w || 0,
    h: param.h || 0,
    text_height: param.text_height || uiTextHeight(),
    indent: param.indent || 0,
    align: param.align || 0,
    font: param.font || uiGetFont(),
    font_style: param.font_style || uiFontStyleNormal(),
    cursor: {
      line_x0: 0,
      x: 0,
      y: 0,
    },
  };
  let blocks = cache.parsed;
  assert(blocks);
  let draw_blocks: MDDrawBlock[] = [];
  let maxx = 0;
  let maxy = 0;
  let max_block_h = 0;
  for (let ii = 0; ii < blocks.length; ++ii) {
    let arr = blocks[ii].layout(calc_param);
    for (let jj = 0; jj < arr.length; ++jj) {
      let block = arr[jj];
      maxx = max(maxx, block.dims.x + block.dims.w);
      maxy = max(maxy, block.dims.y + block.dims.h);
      max_block_h = max(max_block_h, block.dims.h);
      draw_blocks.push(block);
    }
  }
  draw_blocks.sort(cmpDimsY);
  cache.layout = {
    blocks: draw_blocks,
    dims: {
      w: maxx,
      h: maxy,
    },
    max_block_h,
  };
  profilerStopFunc();
}

// TODO: parse & layout can be one exported call, no reason to be separate?

export type MarkdownDims = {
  w: number;
  h: number;
};
export function markdownDims(param: MarkdownStateCached): MarkdownDims {
  let state = param as MDState;
  let { cache } = state;
  let { layout } = cache;
  assert(layout);
  return layout.dims;
}

// Find the index of the first block whose y is after the specified value
function bsearch(blocks: MDDrawBlock[], y: number): number {
  let start = 0;
  let end = blocks.length - 1;

  while (start < end) {
    let mid = floor((start + end) / 2);

    if (blocks[mid].dims.y <= y) {
      // mid is not eligible, exclude it, look later
      start = mid + 1;
    } else {
      // mid is eligible, include it, look earlier
      end = mid;
    }
  }

  return end;
}

export function markdownDraw(param: MarkdownStateCached & MarkdownDrawParam): void {
  profilerStartFunc();
  let state = param as MDState;
  let { cache } = state;
  let { layout } = cache;
  assert(layout);
  let { x, y } = param;
  let draw_param: MDDrawParam = {
    x,
    y,
    z: param.z || Z.UI,
  };
  let { viewport } = param;
  if (!viewport && spriteClipped()) {
    viewport = spriteClippedViewport();
  }
  let { blocks, max_block_h } = layout;
  let idx0 = 0;
  let idx1 = blocks.length - 1;
  if (viewport) {
    // TODO: need to expand viewport (just vertically?) and "draw" any elements
    //   that might receive focus despite being scrolled out of view.
    // Also probably need a little padding for things like dropshadows on
    //   fonts that extend past bounds?
    idx0 = bsearch(blocks, viewport.y - y - max_block_h);
    idx1 = bsearch(blocks, viewport.y + viewport.h - y);
  }

  for (let ii = idx0; ii <= idx1; ++ii) {
    let block = blocks[ii];
    let { dims } = block;
    if (!viewport || (
      // exact viewport check (in case block h is smaller than max_block_h)
      x + dims.x + dims.w >= viewport.x && x + dims.x < viewport.x + viewport.w &&
      y + dims.y + dims.h >= viewport.y && y + dims.y < viewport.y + viewport.h
    )) {
      block.draw(draw_param);
    }
  }
  profilerStopFunc();
}

type MarkdownAutoParam = MarkdownStateParam & MarkdownParseParam & MarkdownLayoutParam & MarkdownDrawParam;

function mdcAlloc(): MDCache {
  return {};
}

export function markdownAuto(param: MarkdownAutoParam): MarkdownDims {
  profilerStartFunc();
  let state = param as MarkdownStateCached as MDState;
  assert(!param.custom || state.cache); // any advanced parameters require the caller handling the caching
  let auto_cache = !state.cache;
  if (auto_cache) {
    profilerStart('auto_cache');
    // If there's time in here, if the string is long, is primary just the object lookup
    // It can be completely alleviated just by not re-creating the same string each frame, though!
    let text = param.text = getStringFromLocalizable(param.text);
    let cache_key = [
      'mdc',
      param.w || 0,
      param.h || 0,
      param.text_height || uiTextHeight(),
      param.indent || 0,
      param.align || 0,
    ].join(':');
    state.cache = getUIElemData(cache_key, { key: text }, mdcAlloc);
    profilerStop();
  }
  let param2 = param as MarkdownAutoParam & MarkdownStateCached;

  markdownParse(param2);
  markdownLayout(param2);
  let dims = markdownDims(param2);
  markdownDraw(param2);

  if (auto_cache) {
    delete param.cache;
  }
  profilerStopFunc();
  return dims;
}
