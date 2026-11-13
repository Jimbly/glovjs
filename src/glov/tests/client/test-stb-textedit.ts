/* eslint import/order:off */
import 'glov/client/test'; // Must be first

import assert from 'assert';
import { KEYS, MOD_CTRL, MOD_SHIFT } from 'glov/client/input';
import {
  stb_textedit_char,
  stb_textedit_click,
  stb_textedit_cut,
  STB_TEXTEDIT_GETWIDTH_NEWLINE,
  stb_textedit_key,
  stb_textedit_key_from_input,
  stb_textedit_paste,
  STB_TexteditState,
  StbTexteditRow,
  StbTexteditString,
  texteditNewState,
} from 'glov/client/stb_textedit';

// Monospace layout: every character is 1 unit wide, rows are 1 unit tall and break after '\n'
function makeString(text: string, max_len?: number): StbTexteditString {
  return {
    text,
    layoutRow(r: StbTexteditRow, n: number): void {
      let end = this.text.indexOf('\n', n);
      end = end === -1 ? this.text.length : end + 1;
      r.x0 = 0;
      r.x1 = end - n;
      r.baseline_y_delta = 1;
      r.ymin = 0;
      r.ymax = 1;
      r.num_chars = end - n;
    },
    getWidth(n: number, i: number): number {
      return this.text[n + i] === '\n' ? STB_TEXTEDIT_GETWIDTH_NEWLINE : 1;
    },
    canInsert: max_len ? function (this: StbTexteditString, where: number, chars: string): boolean {
      return this.text.length + chars.length <= max_len;
    } : undefined,
  };
}

function type(str: StbTexteditString, state: STB_TexteditState, text: string): void {
  for (let ii = 0; ii < text.length; ++ii) {
    stb_textedit_char(str, state, text[ii]);
  }
}

function key(str: StbTexteditString, state: STB_TexteditState, code: number, mod?: number): void {
  stb_textedit_key(str, state, stb_textedit_key_from_input(code, mod || 0));
}

// Basic typing, cursor movement, deletion
{
  let str = makeString('');
  let state = texteditNewState(true);
  type(str, state, 'hello world');
  assert.equal(str.text, 'hello world');
  assert.equal(state.cursor, 11);
  key(str, state, KEYS.BACKSPACE);
  assert.equal(str.text, 'hello worl');
  key(str, state, KEYS.HOME);
  assert.equal(state.cursor, 0);
  key(str, state, KEYS.DEL);
  assert.equal(str.text, 'ello worl');
  key(str, state, KEYS.END);
  assert.equal(state.cursor, 9);
  key(str, state, KEYS.LEFT, MOD_CTRL);
  assert.equal(state.cursor, 5);
  key(str, state, KEYS.LEFT, MOD_CTRL);
  assert.equal(state.cursor, 0);
  key(str, state, KEYS.RIGHT, MOD_CTRL);
  assert.equal(state.cursor, 5);
  // single-line: newline rejected, up/down act as left/right
  key(str, state, KEYS.ENTER);
  assert.equal(str.text, 'ello worl');
  key(str, state, KEYS.DOWN);
  assert.equal(state.cursor, 6);
  key(str, state, KEYS.UP);
  assert.equal(state.cursor, 5);
}

// Selection, cut, paste, replace selection
{
  let str = makeString('abcdef');
  let state = texteditNewState(true);
  stb_textedit_click(str, state, 1.2, 0.5);
  assert.equal(state.cursor, 1);
  key(str, state, KEYS.RIGHT, MOD_SHIFT);
  key(str, state, KEYS.RIGHT, MOD_SHIFT);
  assert.equal(state.select_start, 1);
  assert.equal(state.select_end, 3);
  type(str, state, 'X');
  assert.equal(str.text, 'aXdef');
  key(str, state, KEYS.END, MOD_SHIFT | MOD_CTRL);
  assert.equal(stb_textedit_cut(str, state), true);
  assert.equal(str.text, 'aX');
  assert.equal(stb_textedit_cut(str, state), false);
  assert.equal(stb_textedit_paste(str, state, '1234'), true);
  assert.equal(str.text, 'aX1234');
  assert.equal(state.cursor, 6);
}

// Insert mode
{
  let str = makeString('abc');
  let state = texteditNewState(true);
  key(str, state, KEYS.INS);
  type(str, state, 'XY');
  assert.equal(str.text, 'XYc');
  key(str, state, KEYS.Z, MOD_CTRL);
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'abc');
}

// Max length via canInsert
{
  let str = makeString('', 3);
  let state = texteditNewState(true);
  type(str, state, 'abcdef');
  assert.equal(str.text, 'abc');
  assert.equal(state.cursor, 3);
}

// Multi-line up/down/line start/end
{
  let str = makeString('first line\nsecond\nthird line');
  let state = texteditNewState(false);
  stb_textedit_click(str, state, 8, 0.5); // "first li|ne"
  assert.equal(state.cursor, 8);
  key(str, state, KEYS.DOWN);
  assert.equal(state.cursor, 17); // end of "second" (before newline)
  key(str, state, KEYS.DOWN);
  assert.equal(state.cursor, 26); // preferred x restored: "third li|ne"
  key(str, state, KEYS.UP, MOD_SHIFT);
  assert.equal(state.select_start, 26);
  assert.equal(state.select_end, 17);
  key(str, state, KEYS.HOME);
  assert.equal(state.cursor, 11);
  key(str, state, KEYS.END);
  assert.equal(state.cursor, 17);
  key(str, state, KEYS.ENTER);
  assert.equal(str.text, 'first line\nsecond\n\nthird line');
  key(str, state, KEYS.HOME, MOD_CTRL);
  assert.equal(state.cursor, 0);
}

// Undo / redo
{
  let str = makeString('');
  let state = texteditNewState(true);
  type(str, state, 'abc');
  key(str, state, KEYS.BACKSPACE);
  key(str, state, KEYS.BACKSPACE);
  assert.equal(str.text, 'a');
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'ab');
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'abc');
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'ab');
  key(str, state, KEYS.Y, MOD_CTRL);
  assert.equal(str.text, 'abc');
  key(str, state, KEYS.Y, MOD_CTRL);
  assert.equal(str.text, 'ab');
  key(str, state, KEYS.Y, MOD_CTRL);
  key(str, state, KEYS.Y, MOD_CTRL); // nothing left to redo
  assert.equal(str.text, 'a');
  for (let ii = 0; ii < 10; ++ii) {
    key(str, state, KEYS.Z, MOD_CTRL);
  }
  assert.equal(str.text, '');
}

// Undo buffer overflow (exercises discard_undo / discard_redo)
{
  let str = makeString('');
  let state = texteditNewState(true);
  let history = [str.text];
  for (let ii = 0; ii < 300; ++ii) {
    if (ii % 3 === 2) {
      key(str, state, KEYS.HOME);
      key(str, state, KEYS.END, MOD_SHIFT);
      key(str, state, KEYS.DEL);
    } else {
      stb_textedit_paste(str, state, `chunk${ii}-`.repeat(5));
    }
    history.push(str.text);
  }
  // Undo as far as possible, checking each step matches a previous state
  let undos = 0;
  let last = str.text;
  for (;;) {
    key(str, state, KEYS.Z, MOD_CTRL);
    if (str.text === last) {
      break;
    }
    ++undos;
    assert.equal(str.text, history[history.length - 1 - undos]);
    last = str.text;
  }
  assert(undos > 0);
  // Redo everything back
  for (let ii = 0; ii < undos; ++ii) {
    key(str, state, KEYS.Y, MOD_CTRL);
  }
  assert.equal(str.text, history[history.length - 1]);
  assert.equal(state.undostate.undo_rec.length, 99);
}

// Undo restores the cursor to where it was before the change
{
  let str = makeString('abcdef');
  let state = texteditNewState(true);
  key(str, state, KEYS.RIGHT);
  key(str, state, KEYS.RIGHT);
  key(str, state, KEYS.DEL);
  assert.equal(str.text, 'abdef');
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'abcdef');
  assert.equal(state.cursor, 2); // before the restored character
  key(str, state, KEYS.Y, MOD_CTRL);
  assert.equal(str.text, 'abdef');
  assert.equal(state.cursor, 2);
  key(str, state, KEYS.Z, MOD_CTRL); // undo of the redo
  assert.equal(state.cursor, 2);
  key(str, state, KEYS.END);
  key(str, state, KEYS.BACKSPACE);
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'abcdef');
  assert.equal(state.cursor, 6); // after the restored character
  // Insert mode replacement
  key(str, state, KEYS.HOME);
  key(str, state, KEYS.INS);
  type(str, state, 'X');
  assert.equal(str.text, 'Xbcdef');
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'abcdef');
  assert.equal(state.cursor, 0);
}

// Ctrl+A, Ctrl+Backspace, Ctrl+Delete
{
  let str = makeString('hello big world');
  let state = texteditNewState(true);
  key(str, state, KEYS.A, MOD_CTRL);
  assert.equal(state.select_start, 0);
  assert.equal(state.select_end, 15);
  assert.equal(state.cursor, 15);
  key(str, state, KEYS.END);
  key(str, state, KEYS.BACKSPACE, MOD_CTRL);
  assert.equal(str.text, 'hello big ');
  assert.equal(state.cursor, 10);
  key(str, state, KEYS.BACKSPACE, MOD_CTRL);
  assert.equal(str.text, 'hello ');
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'hello big ');
  assert.equal(state.cursor, 10);
  key(str, state, KEYS.HOME);
  key(str, state, KEYS.DEL, MOD_CTRL);
  assert.equal(str.text, 'big ');
  assert.equal(state.cursor, 0);
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'hello big ');
  assert.equal(state.cursor, 0);
  // With a selection, deletes just the selection
  key(str, state, KEYS.RIGHT, MOD_SHIFT);
  key(str, state, KEYS.BACKSPACE, MOD_CTRL);
  assert.equal(str.text, 'ello big ');
  key(str, state, KEYS.A, MOD_CTRL);
  key(str, state, KEYS.DEL, MOD_CTRL);
  assert.equal(str.text, '');
  key(str, state, KEYS.BACKSPACE, MOD_CTRL); // nothing to delete
  key(str, state, KEYS.DEL, MOD_CTRL);
  assert.equal(str.text, '');
}

// Undo that must discard a redo record to make room for its redo characters
{
  let str = makeString('d'.repeat(500));
  let state = texteditNewState(true);
  key(str, state, KEYS.A, MOD_CTRL);
  key(str, state, KEYS.DEL); // 500 chars held in undo storage
  stb_textedit_paste(str, state, 'a'.repeat(300));
  stb_textedit_paste(str, state, 'b'.repeat(250));
  key(str, state, KEYS.Z, MOD_CTRL); // 250 chars held in redo storage
  assert.equal(str.text, 'a'.repeat(300));
  key(str, state, KEYS.Z, MOD_CTRL); // no room for another 300, discards the 'b' redo
  assert.equal(str.text, '');
  key(str, state, KEYS.Y, MOD_CTRL);
  assert.equal(str.text, 'a'.repeat(300));
  assert.equal(state.cursor, 300);
  key(str, state, KEYS.Y, MOD_CTRL); // 'b' redo was discarded
  assert.equal(str.text, 'a'.repeat(300));
  key(str, state, KEYS.Z, MOD_CTRL);
  key(str, state, KEYS.Z, MOD_CTRL);
  assert.equal(str.text, 'd'.repeat(500));
}
