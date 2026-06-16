/* eslint import/order:off */
import 'glov/client/test'; // Must be first

import assert from 'assert';
import {
  markdownPrep,
  MarkdownPrepParam,
  TestMDCache,
} from 'glov/client/markdown';
import { uiStyleAlloc, uiStyleSetCurrent } from 'glov/client/uistyle';
import {
  ALIGN,
  Font,
  fontCreate,
  fontTestInit,
} from 'glov/client/font';
import { markdownImageRegister } from 'glov/client/markdown_renderables';
import { Sprite, Texture } from 'glov/client/sprites';
import { TSMap } from 'glov/common/types';

fontTestInit();

uiStyleSetCurrent(uiStyleAlloc({
  text_height: 1,
}));

const dummy_texture = {
  width: 1,
  height: 1,
} as Texture;
const dummy_sprite = {
  isLazyLoad() {
    return false;
  },
  texs: [dummy_texture],
} as Sprite;

markdownImageRegister('foo', {
  sprite: dummy_sprite,
});

let char_infos = [];
for (let c = 32; c < 127; ++c) {
  char_infos.push({
    c,
    x0: 1, y0: 1, xpad: 0, w: 1, h: 1,
  });
}
let font_info = {
  font_size: 1,
  imageW: 128,
  imageH: 128,
  spread: 2,
  noFilter: 1,
  channels: 1,
  char_infos,
};

let font = fontCreate(font_info, dummy_texture);
assert.equal(font.getStringWidth(null, 1, '12345'), 5);
assert.equal(font.getStringWidth(null, 1, 'FOO_BAR Here is '), 16);

const RENDER: TSMap<string> = {
  MDRImg: '☐☐☐☐☐☐',
};

function renderResult(cache: TestMDCache): string {
  assert(cache.layout);
  let result = cache.layout;
  let buf: string[][] = [];
  for (let ii = 0; ii < result.blocks.length; ++ii) {
    let block = result.blocks[ii];
    let dims = block.dims;
    let text = (dims as { text?: string }).text;
    if (!text) {
      text = (RENDER[block.constructor.name] || block.constructor.name).slice(0, dims.w);
    }
    for (let yy = dims.y; yy < dims.y + dims.h; ++yy) {
      let row = buf[yy] = buf[yy] || [];
      while (row.length < dims.x) {
        row.push(' ');
      }
      for (let xx = 0; xx < dims.w; ++xx) {
        let c = dims.w >= text.length ? text[xx] || ' ' :
          text[Math.round(xx / dims.w * text.length)];
        row[dims.x + xx] = c;
      }
    }
  }
  return buf.map((row) => row.join('')).join('\n');
}

function layout(w: number, text: string, align?: ALIGN): string {
  let prep_param: MarkdownPrepParam = {
    cache: {},
    w,
    align: align === undefined ? ALIGN.HWRAP : align,
    text,
    font: font as Font,
  };
  markdownPrep(prep_param);
  let cache = prep_param.cache as TestMDCache;
  assert(cache.layout);
  // console.log(cache.layout.blocks.map((a) => {
  //   return {
  //     x: a.dims.x,
  //     y: a.dims.y,
  //     w: a.dims.w,
  //     h: a.dims.h,
  //     type: a.constructor.name,
  //     t: (a.dims as { text?: string }).text,
  //   };
  // }));
  for (let ii = 0; ii < cache.layout.blocks.length; ++ii) {
    let dims = cache.layout.blocks[ii].dims;
    assert(isFinite(dims.x));
    assert(isFinite(dims.y));
    assert(isFinite(dims.w));
    assert(isFinite(dims.h));
  }
  return renderResult(cache);
}

layout(40, 'FOO_BAR Here is [img=foo] [gt=ACCESS_AREA text="Access Areas"]' +
    ' [p=1] [img=foo scale=3 nostretch] [world=1234/info] [emoji=smile] and an *em**b**tag*.');

function trimRight(s: string): string {
  return s.trimRight();
}

function test(text: string, expected: string, align?: ALIGN): void {
  assert.equal(expected[0], '\n');
  expected = expected.slice(1).trimRight();
  let s = text.split('\n');
  let first = s[0];
  text = s.slice(1).join('\n');
  let result = layout(6 + first.length, text, align);
  result = result.split('\n').map(trimRight).join('\n');

  if (result !== expected) {
    console.log('===result===');
    console.log(result);
    console.log('==expected==');
    console.log(expected);
    console.log('============');
  }
  assert.equal(result, expected);
}

// bold blocks have children
test(`=====
abcd efgh*ijkl*mn`,`
abcd
efghijklmn`);

// color blocks are just inserted
test(`=====
abcd efgh[c=green]ijkl[/c]mn`,`
abcd
efghijklmn`);

test(`=====
abcd efgh *ijkl*mn`,`
abcd efgh
ijklmn`);

test(`=
0[c=red]1234567*8*`,`
0
1234567
8`);
// TODO: the above should hard-wrap the unbreakable line and be:
// test(`=
// 0[c=red]1234567*8*`,`
// 0123456
// 78`);

test(`=====
hi there`,`
 hi there
`, ALIGN.HWRAP | ALIGN.HCENTER);

test(`=====
hi there extra long line`,`
 hi there
extra long
   line
`, ALIGN.HWRAP | ALIGN.HCENTER);

test(`=====
hithereextralongline`,`
hithereextr
 alongline
`, ALIGN.HWRAP | ALIGN.HCENTER);

test(`=====
hithereextralong line`,`
hiheeetrlog
   line
`, ALIGN.HWRAP | ALIGN.HCENTER | ALIGN.HFIT);

// TODO: this should hard-wrap like above
// test(`=====
// hithere**extralong** line`,`
// hiheeetrlog
//    line
// `, ALIGN.HWRAP | ALIGN.HCENTER | ALIGN.HFIT);
