/* eslint-disable @stylistic/indent, @stylistic/brace-style, curly, @stylistic/nonblock-statement-body-position */
/* eslint-disable @stylistic/keyword-spacing, @stylistic/space-in-parens, @stylistic/no-multi-spaces */
/* eslint-disable @stylistic/max-len, @stylistic/max-statements-per-line, @stylistic/no-multiple-empty-lines */
/* eslint-disable one-var, @stylistic/one-var-declaration-per-line, new-cap */
/* eslint-disable @typescript-eslint/no-use-before-define, operator-assignment */
//
// TypeScript port of stb_textedit.h for GLOV.js
//
// Ported from https://github.com/nothings/stb/blob/9600522de53973336fa033a289858a4354cbb04c/stb_textedit.h
//
// PORT NOTES
//
//   This port deliberately keeps the layout, naming, ordering, indentation and
//   comments of the original C so that upstream fixes can be applied by
//   comparing against stb_textedit.h. Differences from the C:
//
//   * The STB_TEXTEDIT_* #defines that the C user supplies before including
//     the implementation are in the "GLOV configuration" section below.
//   * STB_TEXTEDIT_STRING is the StbTexteditString interface: the string data
//     is a plain JavaScript string in `.text`, and STB_TEXTEDIT_CHARTYPE is a
//     single-UTF-16-code-unit string.
//   * The original's docs below still describe the C API: `int` flags are
//     `boolean`s, CHARTYPE pointers are `string`s, pointers into arrays are
//     indices (-1 for NULL), and struct copies are made explicitly.
//   * `goto retry` in stb_textedit_key is emulated with a loop.
//   * Lines changed for reasons other than syntax are marked "PORT:".
//
// USAGE (GLOV)
//
//   let state = new STB_TexteditState();
//   stb_textedit_initialize_state(state, is_single_line);
//   for each event in inputTextInputQueue():
//     if (event.type === 'key')
//       stb_textedit_key(str, state, stb_textedit_key_from_input(event.code, event.mod));
//     else
//       stb_textedit_char(str, state, String.fromCharCode(event.code));
//
// stb_textedit.h - v1.15  - public domain - Sean Barrett
// Development of this library was sponsored by RAD Game Tools
//
// This C header file implements the guts of a multi-line text-editing
// widget; you implement display, word-wrapping, and low-level string
// insertion/deletion, and stb_textedit will map user inputs into
// insertions & deletions, plus updates to the cursor position,
// selection state, and undo state.
//
// It is intended for use in games and other systems that need to build
// their own custom widgets and which do not have heavy text-editing
// requirements (this library is not recommended for use for editing large
// texts, as its performance does not scale and it has limited undo).
//
// Non-trivial behaviors are modelled after Windows text controls.
//
//
// LICENSE
//
// See end of file for license information.
//
//
// DEPENDENCIES
//
// Uses the C runtime function 'memmove', which you can override
// by defining STB_TEXTEDIT_memmove before the implementation.
// Uses no other functions. Performs no runtime allocations.
//
//
// VERSION HISTORY
//
//   1.15 (2026-11-08) various fixes
//   1.14 (2021-07-11) page up/down, various fixes
//   1.13 (2019-02-07) fix bug in undo size management
//   1.12 (2018-01-29) user can change STB_TEXTEDIT_KEYTYPE, fix redo to avoid crash
//   1.11 (2017-03-03) fix HOME on last line, dragging off single-line textfield
//   1.10 (2016-10-25) supress warnings about casting away const with -Wcast-qual
//   1.9  (2016-08-27) customizable move-by-word
//   1.8  (2016-04-02) better keyboard handling when mouse button is down
//   1.7  (2015-09-13) change y range handling in case baseline is non-0
//   1.6  (2015-04-15) allow STB_TEXTEDIT_memmove
//   1.5  (2014-09-10) add support for secondary keys for OS X
//   1.4  (2014-08-17) fix signed/unsigned warnings
//   1.3  (2014-06-19) fix mouse clicking to round to nearest char boundary
//   1.2  (2014-05-27) fix some RAD types that had crept into the new code
//   1.1  (2013-12-15) move-by-word (requires STB_TEXTEDIT_IS_SPACE )
//   1.0  (2012-07-26) improve documentation, initial public release
//   0.3  (2012-02-24) bugfixes, single-line mode; insert mode
//   0.2  (2011-11-28) fixes to undo/redo
//   0.1  (2010-07-08) initial version
//
// ADDITIONAL CONTRIBUTORS
//
//   Ulf Winklemann: move-by-word in 1.1
//   Fabian Giesen: secondary key inputs in 1.5
//   Martins Mozeiko: STB_TEXTEDIT_memmove in 1.6
//   Louis Schnellbach: page up/down in 1.14
//
//   Bugfixes:
//      Scott Graham
//      Daniel Keller
//      Omar Cornut
//      Dan Thompson
//
// USAGE
//
// This file behaves differently depending on what symbols you define
// before including it.
//
//
// Header-file mode:
//
//   If you do not define STB_TEXTEDIT_IMPLEMENTATION before including this,
//   it will operate in "header file" mode. In this mode, it declares a
//   single public symbol, STB_TexteditState, which encapsulates the current
//   state of a text widget (except for the string, which you will store
//   separately).
//
//   To compile in this mode, you must define STB_TEXTEDIT_CHARTYPE to a
//   primitive type that defines a single character (e.g. char, wchar_t, etc).
//
//   To save space or increase undo-ability, you can optionally define the
//   following things that are used by the undo system:
//
//      STB_TEXTEDIT_POSITIONTYPE         small int type encoding a valid cursor position
//      STB_TEXTEDIT_UNDOSTATECOUNT       the number of undo states to allow
//      STB_TEXTEDIT_UNDOCHARCOUNT        the number of characters to store in the undo buffer
//
//   If you don't define these, they are set to permissive types and
//   moderate sizes. The undo system does no memory allocations, so
//   it grows STB_TexteditState by the worst-case storage which is (in bytes):
//
//        [4 + 3 * sizeof(STB_TEXTEDIT_POSITIONTYPE)] * STB_TEXTEDIT_UNDOSTATECOUNT
//      +          sizeof(STB_TEXTEDIT_CHARTYPE)      * STB_TEXTEDIT_UNDOCHARCOUNT
//
//
// Implementation mode:
//
//   If you define STB_TEXTEDIT_IMPLEMENTATION before including this, it
//   will compile the implementation of the text edit widget, depending
//   on a large number of symbols which must be defined before the include.
//
//   The implementation is defined only as static functions. You will then
//   need to provide your own APIs in the same file which will access the
//   static functions.
//
//   The basic concept is that you provide a "string" object which
//   behaves like an array of characters. stb_textedit uses indices to
//   refer to positions in the string, implicitly representing positions
//   in the displayed textedit. This is true for both plain text and
//   rich text; even with rich text stb_truetype interacts with your
//   code as if there was an array of all the displayed characters.
//
// Symbols that must be the same in header-file and implementation mode:
//
//     STB_TEXTEDIT_CHARTYPE             the character type
//     STB_TEXTEDIT_POSITIONTYPE         small type that is a valid cursor position
//     STB_TEXTEDIT_UNDOSTATECOUNT       the number of undo states to allow
//     STB_TEXTEDIT_UNDOCHARCOUNT        the number of characters to store in the undo buffer
//
// Symbols you must define for implementation mode:
//
//    STB_TEXTEDIT_STRING               the type of object representing a string being edited,
//                                      typically this is a wrapper object with other data you need
//
//    STB_TEXTEDIT_STRINGLEN(obj)       the length of the string (ideally O(1))
//    STB_TEXTEDIT_LAYOUTROW(&r,obj,n)  returns the results of laying out a line of characters
//                                        starting from character #n (see discussion below)
//    STB_TEXTEDIT_GETWIDTH(obj,n,i)    returns the pixel delta from the xpos of the i'th character
//                                        to the xpos of the i+1'th char for a line of characters
//                                        starting at character #n (i.e. accounts for kerning
//                                        with previous char)
//    STB_TEXTEDIT_KEYTOTEXT(k)         maps a keyboard input to an insertable character
//                                        (return type is int, -1 means not valid to insert)
//    STB_TEXTEDIT_GETCHAR(obj,i)       returns the i'th character of obj, 0-based
//    STB_TEXTEDIT_NEWLINE              the character returned by _GETCHAR() we recognize
//                                        as manually wordwrapping for end-of-line positioning
//
//    STB_TEXTEDIT_DELETECHARS(obj,i,n)      delete n characters starting at i
//    STB_TEXTEDIT_INSERTCHARS(obj,i,c*,n)   insert n characters at i (pointed to by STB_TEXTEDIT_CHARTYPE*)
//
//    STB_TEXTEDIT_K_SHIFT       a power of two that is or'd in to a keyboard input to represent the shift key
//
//    STB_TEXTEDIT_K_LEFT        keyboard input to move cursor left
//    STB_TEXTEDIT_K_RIGHT       keyboard input to move cursor right
//    STB_TEXTEDIT_K_UP          keyboard input to move cursor up
//    STB_TEXTEDIT_K_DOWN        keyboard input to move cursor down
//    STB_TEXTEDIT_K_PGUP        keyboard input to move cursor up a page
//    STB_TEXTEDIT_K_PGDOWN      keyboard input to move cursor down a page
//    STB_TEXTEDIT_K_LINESTART   keyboard input to move cursor to start of line  // e.g. HOME
//    STB_TEXTEDIT_K_LINEEND     keyboard input to move cursor to end of line    // e.g. END
//    STB_TEXTEDIT_K_TEXTSTART   keyboard input to move cursor to start of text  // e.g. ctrl-HOME
//    STB_TEXTEDIT_K_TEXTEND     keyboard input to move cursor to end of text    // e.g. ctrl-END
//    STB_TEXTEDIT_K_DELETE      keyboard input to delete selection or character under cursor
//    STB_TEXTEDIT_K_BACKSPACE   keyboard input to delete selection or character left of cursor
//    STB_TEXTEDIT_K_UNDO        keyboard input to perform undo
//    STB_TEXTEDIT_K_REDO        keyboard input to perform redo
//
// Optional:
//    STB_TEXTEDIT_K_INSERT              keyboard input to toggle insert mode
//    STB_TEXTEDIT_IS_SPACE(ch)          true if character is whitespace (e.g. 'isspace'),
//                                          required for default WORDLEFT/WORDRIGHT handlers
//    STB_TEXTEDIT_MOVEWORDLEFT(obj,i)   custom handler for WORDLEFT, returns index to move cursor to
//    STB_TEXTEDIT_MOVEWORDRIGHT(obj,i)  custom handler for WORDRIGHT, returns index to move cursor to
//    STB_TEXTEDIT_K_WORDLEFT            keyboard input to move cursor left one word // e.g. ctrl-LEFT
//    STB_TEXTEDIT_K_WORDRIGHT           keyboard input to move cursor right one word // e.g. ctrl-RIGHT
//    STB_TEXTEDIT_K_LINESTART2          secondary keyboard input to move cursor to start of line
//    STB_TEXTEDIT_K_LINEEND2            secondary keyboard input to move cursor to end of line
//    STB_TEXTEDIT_K_TEXTSTART2          secondary keyboard input to move cursor to start of text
//    STB_TEXTEDIT_K_TEXTEND2            secondary keyboard input to move cursor to end of text
//
// Keyboard input must be encoded as a single integer value; e.g. a character code
// and some bitflags that represent shift states. to simplify the interface, SHIFT must
// be a bitflag, so we can test the shifted state of cursor movements to allow selection,
// i.e. (STB_TEXTEDIT_K_RIGHT|STB_TEXTEDIT_K_SHIFT) should be shifted right-arrow.
//
// You can encode other things, such as CONTROL or ALT, in additional bits, and
// then test for their presence in e.g. STB_TEXTEDIT_K_WORDLEFT. For example,
// my Windows implementations add an additional CONTROL bit, and an additional KEYDOWN
// bit. Then all of the STB_TEXTEDIT_K_ values bitwise-or in the KEYDOWN bit,
// and I pass both WM_KEYDOWN and WM_CHAR events to the "key" function in the
// API below. The control keys will only match WM_KEYDOWN events because of the
// keydown bit I add, and STB_TEXTEDIT_KEYTOTEXT only tests for the KEYDOWN
// bit so it only decodes WM_CHAR events.
//
// STB_TEXTEDIT_LAYOUTROW returns information about the shape of one displayed
// row of characters assuming they start on the i'th character--the width and
// the height and the number of characters consumed. This allows this library
// to traverse the entire layout incrementally. You need to compute word-wrapping
// here.
//
// Each textfield keeps its own insert mode state, which is not how normal
// applications work. To keep an app-wide insert mode, update/copy the
// "insert_mode" field of STB_TexteditState before/after calling API functions.
//
// API
//
//    void stb_textedit_initialize_state(STB_TexteditState *state, int is_single_line)
//
//    void stb_textedit_click(STB_TEXTEDIT_STRING *str, STB_TexteditState *state, float x, float y)
//    void stb_textedit_drag(STB_TEXTEDIT_STRING *str, STB_TexteditState *state, float x, float y)
//    int  stb_textedit_cut(STB_TEXTEDIT_STRING *str, STB_TexteditState *state)
//    int  stb_textedit_paste(STB_TEXTEDIT_STRING *str, STB_TexteditState *state, STB_TEXTEDIT_CHARTYPE *text, int len)
//    void stb_textedit_char(STB_TEXTEDIT_STRING *str, STB_TexteditState *state, STB_TEXTEDIT_CHARTYPE ch)
//    void stb_textedit_key(STB_TEXTEDIT_STRING *str, STB_TexteditState *state, STB_TEXEDIT_KEYTYPE key)
//
//    Each of these functions potentially updates the string and updates the
//    state.
//
//      initialize_state:
//          set the textedit state to a known good default state when initially
//          constructing the textedit.
//
//      click:
//          call this with the mouse x,y on a mouse down; it will update the cursor
//          and reset the selection start/end to the cursor point. the x,y must
//          be relative to the text widget, with (0,0) being the top left.
//
//      drag:
//          call this with the mouse x,y on a mouse drag/up; it will update the
//          cursor and the selection end point
//
//      cut:
//          call this to delete the current selection; returns true if there was
//          one. you should FIRST copy the current selection to the system paste buffer.
//          (To copy, just copy the current selection out of the string yourself.)
//
//      paste:
//          call this to paste text at the current cursor point or over the current
//          selection if there is one.
//
//      char:
//          (optional) call this for character input sent to the textfield. if the
//          framework you are using supplies you with a character or text event, it
//          makes sense to use this function.
//          make sure to set STB_TEXTEDIT_KEYTOTEXT to 0 for any key that generates
//          a corresponding character or text event.
//
//      key:
//          call this for keyboard inputs sent to the textfield. you can use it
//          for "key down" events or for "translated" key events. if you need to
//          do both (as in Win32), or distinguish Unicode characters from control
//          inputs, set a high bit to distinguish the two; then you can define the
//          various definitions like STB_TEXTEDIT_K_LEFT have the is-key-event bit
//          set, and make STB_TEXTEDIT_KEYTOCHAR check that the is-key-event bit is
//          clear. STB_TEXTEDIT_KEYTYPE defaults to int, but you can #define it to
//          anything other type you wante before including.
//
//
//   When rendering, you can read the cursor position and selection state from
//   the STB_TexteditState.
//
//
// Notes:
//
// This is designed to be usable in IMGUI, so it allows for the possibility of
// running in an IMGUI that has NOT cached the multi-line layout. For this
// reason, it provides an interface that is compatible with computing the
// layout incrementally--we try to make sure we make as few passes through
// as possible. (For example, to locate the mouse pointer in the text, we
// could define functions that return the X and Y positions of characters
// and binary search Y and then X, but if we're doing dynamic layout this
// will run the layout algorithm many times, so instead we manually search
// forward in one pass. Similar logic applies to e.g. up-arrow and
// down-arrow movement.)
//
// If it's run in a widget that *has* cached the layout, then this is less
// efficient, but it's not horrible on modern computers. But you wouldn't
// want to edit million-line files with it.



////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////
////
////   GLOV configuration (the #defines a C user provides)
////
////

import { KEYS } from './input';
import { MOD_CTRL, MOD_SHIFT } from './input_constants';

export type STB_TEXTEDIT_CHARTYPE = string; // always a single UTF-16 code unit
export type STB_TEXTEDIT_KEYTYPE = number;

// Keys are a QWERTY keyCode (from KEYS) with the input MOD_* flags shifted above it
const STB_TEXTEDIT_MOD_SHIFT = 16;
export function stb_textedit_key_from_input(code: number, mod: number): STB_TEXTEDIT_KEYTYPE
{
   return code | (mod << STB_TEXTEDIT_MOD_SHIFT);
}

export const STB_TEXTEDIT_K_SHIFT = MOD_SHIFT << STB_TEXTEDIT_MOD_SHIFT;
export const STB_TEXTEDIT_K_CONTROL = MOD_CTRL << STB_TEXTEDIT_MOD_SHIFT;

const STB_TEXTEDIT_K_LEFT = KEYS.LEFT;
const STB_TEXTEDIT_K_RIGHT = KEYS.RIGHT;
const STB_TEXTEDIT_K_UP = KEYS.UP;
const STB_TEXTEDIT_K_DOWN = KEYS.DOWN;
const STB_TEXTEDIT_K_PGUP = KEYS.PAGEUP;
const STB_TEXTEDIT_K_PGDOWN = KEYS.PAGEDOWN;
const STB_TEXTEDIT_K_LINESTART = KEYS.HOME;
const STB_TEXTEDIT_K_LINEEND = KEYS.END;
const STB_TEXTEDIT_K_TEXTSTART = KEYS.HOME | STB_TEXTEDIT_K_CONTROL;
const STB_TEXTEDIT_K_TEXTEND = KEYS.END | STB_TEXTEDIT_K_CONTROL;
const STB_TEXTEDIT_K_DELETE = KEYS.DEL;
const STB_TEXTEDIT_K_BACKSPACE = KEYS.BACKSPACE;
const STB_TEXTEDIT_K_UNDO = KEYS.Z | STB_TEXTEDIT_K_CONTROL;
const STB_TEXTEDIT_K_REDO = KEYS.Y | STB_TEXTEDIT_K_CONTROL;
const STB_TEXTEDIT_K_REDO2 = KEYS.Z | STB_TEXTEDIT_K_CONTROL | STB_TEXTEDIT_K_SHIFT;
const STB_TEXTEDIT_K_INSERT = KEYS.INS;
const STB_TEXTEDIT_K_WORDLEFT = KEYS.LEFT | STB_TEXTEDIT_K_CONTROL;
const STB_TEXTEDIT_K_WORDRIGHT = KEYS.RIGHT | STB_TEXTEDIT_K_CONTROL;
// GLOV extensions (not in the C)
const STB_TEXTEDIT_K_SELECTALL = KEYS.A | STB_TEXTEDIT_K_CONTROL;
const STB_TEXTEDIT_K_WORDBACKSPACE = KEYS.BACKSPACE | STB_TEXTEDIT_K_CONTROL;
const STB_TEXTEDIT_K_WORDDELETE = KEYS.DEL | STB_TEXTEDIT_K_CONTROL;
// No secondary bindings: these are values that real input can never produce
// (the C would leave them undefined and #ifdef out their cases)
const STB_TEXTEDIT_K_UNUSED = 1 << 30;
const STB_TEXTEDIT_K_LINESTART2 = STB_TEXTEDIT_K_UNUSED | 1;
const STB_TEXTEDIT_K_LINEEND2 = STB_TEXTEDIT_K_UNUSED | 2;
const STB_TEXTEDIT_K_TEXTSTART2 = STB_TEXTEDIT_K_UNUSED | 3;
const STB_TEXTEDIT_K_TEXTEND2 = STB_TEXTEDIT_K_UNUSED | 4;

const STB_TEXTEDIT_NEWLINE: STB_TEXTEDIT_CHARTYPE = '\n';

// getWidth() may return this for a newline character, in which case up/down will
// not place the cursor after it
export const STB_TEXTEDIT_GETWIDTH_NEWLINE = -1;

// Character input comes from stb_textedit_char(); the only key producing text is Enter
function STB_TEXTEDIT_KEYTOTEXT(key: STB_TEXTEDIT_KEYTYPE): number
{
   if (key === KEYS.ENTER || key === (KEYS.ENTER | STB_TEXTEDIT_K_SHIFT))
      return STB_TEXTEDIT_NEWLINE.charCodeAt(0);
   return -1;
}

function STB_TEXTEDIT_IS_SPACE(ch: STB_TEXTEDIT_CHARTYPE): boolean
{
   return (/\s/).test(ch);
}

// STB_TEXTEDIT_STRING
export interface StbTexteditString {
   text: string;

   // STB_TEXTEDIT_LAYOUTROW: fill in `r` for the row starting at character #n
   layoutRow(r: StbTexteditRow, n: number): void;

   // STB_TEXTEDIT_GETWIDTH: pixel delta from the xpos of the i'th character to
   // the xpos of the i+1'th char for the row starting at character #n
   getWidth(n: number, i: number): number;

   // Optional: return false to reject an insertion (e.g. for a maximum length)
   canInsert?(where: number, chars: string): boolean;
}

function STB_TEXTEDIT_STRINGLEN(obj: StbTexteditString): number
{
   return obj.text.length;
}

function STB_TEXTEDIT_LAYOUTROW(r: StbTexteditRow, obj: StbTexteditString, n: number): void
{
   obj.layoutRow(r, n);
}

function STB_TEXTEDIT_GETWIDTH(obj: StbTexteditString, n: number, i: number): number
{
   return obj.getWidth(n, i);
}

function STB_TEXTEDIT_GETCHAR(obj: StbTexteditString, i: number): STB_TEXTEDIT_CHARTYPE
{
   return obj.text.charAt(i);
}

function STB_TEXTEDIT_DELETECHARS(obj: StbTexteditString, i: number, n: number): void
{
   obj.text = obj.text.slice(0, i) + obj.text.slice(i + n);
}

function STB_TEXTEDIT_INSERTCHARS(obj: StbTexteditString, i: number, c: string, n: number): boolean
{
   c = c.slice(0, n);
   if (obj.canInsert && !obj.canInsert(i, c))
      return false;
   obj.text = obj.text.slice(0, i) + c + obj.text.slice(i);
   return true;
}

export function texteditNewState(single_line: boolean): STB_TexteditState {
  let state = new STB_TexteditState();
  stb_textedit_initialize_state(state, single_line);
  return state;
}

export function texteditHasSelection(s: STB_TexteditState): boolean {
  return STB_TEXT_HAS_SELECTION(s);
}

// For callers that validate (and may modify or reject) the result of edits
//   after they have been applied: replace the edits made since the text was
//   `valid_text` with a single change to `new_text`, so that undo never passes
//   through the rejected text.  The caller should set the cursor/selection afterwards.
// PORT: GLOV extension
export function texteditReplaceEdits(str: StbTexteditString, state: STB_TexteditState,
  valid_text: string, new_text: string
): void {
  // Every state in the undo history was valid, so undo back to the last valid one
  while (str.text !== valid_text && state.undostate.undo_point > 0)
    stb_text_undo(str, state);
  stb_textedit_flush_redo(state.undostate);
  if (str.text !== valid_text) {
    // History does not reach back to it (e.g. was too large to store)
    texteditClearUndo(state);
    str.text = valid_text;
    stb_textedit_clamp(str, state);
  }
  if (new_text === valid_text)
    return;
  let prefix = 0;
  while (prefix < valid_text.length && prefix < new_text.length && valid_text[prefix] === new_text[prefix])
    ++prefix;
  let suffix = 0;
  while (suffix < valid_text.length - prefix && suffix < new_text.length - prefix &&
    valid_text[valid_text.length - 1 - suffix] === new_text[new_text.length - 1 - suffix])
    ++suffix;
  // After the undos, the cursor is where it was before the edits, which is what undo should restore
  stb_text_makeundo_replace(str, state, prefix, valid_text.length - prefix - suffix, new_text.length - prefix - suffix);
  str.text = new_text;
  state.has_preferred_x = false;
}

export function texteditClearUndo(state: STB_TexteditState): void {
  stb_textedit_flush_redo(state.undostate);
  state.undostate.undo_point = 0;
  state.undostate.undo_char_point = 0;
}


////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////
////
////   Header-file mode
////
////

////////////////////////////////////////////////////////////////////////
//
//     STB_TexteditState
//
// Definition of STB_TexteditState which you should store
// per-textfield; it includes cursor position, selection state,
// and undo state.
//

const STB_TEXTEDIT_UNDOSTATECOUNT = 99;
const STB_TEXTEDIT_UNDOCHARCOUNT = 999;

class StbUndoRecord
{
   // private data
   where = 0;
   insert_length = 0;
   delete_length = 0;
   char_storage = 0;
   cursor = 0; // PORT: cursor position before the change, restored by undo
}

class StbUndoState
{
   // private data
   undo_rec: StbUndoRecord[] = [];
   undo_char: STB_TEXTEDIT_CHARTYPE[] = new Array(STB_TEXTEDIT_UNDOCHARCOUNT).fill('');
   undo_point = 0;
   redo_point = 0;
   undo_char_point = 0;
   redo_char_point = 0;
   constructor() {
      for (let i = 0; i < STB_TEXTEDIT_UNDOSTATECOUNT; ++i)
         this.undo_rec.push(new StbUndoRecord());
   }
}

class STB_TexteditState
{
   /////////////////////
   //
   // public data
   //

   cursor = 0;
   // position of the text cursor within the string

   select_start = 0;          // selection start point
   select_end = 0;
   // selection start and end point in characters; if equal, no selection.
   // note that start may be less than or greater than end (e.g. when
   // dragging the mouse, start is where the initial click was, and you
   // can drag in either direction)

   insert_mode = false;
   // each textfield keeps its own insert mode state. to keep an app-wide
   // insert mode, copy this value in/out of the app state

   row_count_per_page = 0;
   // page size in number of row.
   // this value MUST be set to >0 for pageup or pagedown in multilines documents.

   /////////////////////
   //
   // private data
   //
   cursor_at_end_of_line = false; // not implemented yet
   initialized = false;
   has_preferred_x = false;
   single_line = false;
   preferred_x = 0; // this determines where the cursor up/down tries to seek to along x
   undostate = new StbUndoState();
}
export type { STB_TexteditState };


////////////////////////////////////////////////////////////////////////
//
//     StbTexteditRow
//
// Result of layout query, used by stb_textedit to determine where
// the text in each row is.

// result of layout query
export class StbTexteditRow
{
   x0 = 0; x1 = 0;          // starting x location, end x location (allows for align=right, etc)
   baseline_y_delta = 0;  // position of baseline relative to previous row's baseline
   ymin = 0; ymax = 0;      // height of row above and below baseline
   num_chars = 0;
}


////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////
////
////   Implementation mode
////
////


// PORT: memmove() for the undo character buffer
function STB_TEXTEDIT_memmove_chars(arr: STB_TEXTEDIT_CHARTYPE[], dst: number, src: number, count: number): void
{
   arr.copyWithin(dst, src, src + count);
}

// PORT: memmove() for undo records, which must be copied by value, not by reference
function stb_undo_record_copy(dst: StbUndoRecord, src: StbUndoRecord): void
{
   dst.where = src.where;
   dst.insert_length = src.insert_length;
   dst.delete_length = src.delete_length;
   dst.char_storage = src.char_storage;
   dst.cursor = src.cursor;
}
function STB_TEXTEDIT_memmove_recs(arr: StbUndoRecord[], dst: number, src: number, count: number): void
{
   let i: number;
   if (dst < src) {
      for (i=0; i < count; ++i)
         stb_undo_record_copy(arr[dst+i], arr[src+i]);
   } else {
      for (i=count-1; i >= 0; --i)
         stb_undo_record_copy(arr[dst+i], arr[src+i]);
   }
}


/////////////////////////////////////////////////////////////////////////////
//
//      Mouse input handling
//

// traverse the layout to locate the nearest character to a display position
function stb_text_locate_coord(str: StbTexteditString, x: number, y: number): number
{
   let r = new StbTexteditRow();
   let n = STB_TEXTEDIT_STRINGLEN(str);
   let base_y = 0, prev_x: number;
   let i=0, k: number;

   r.x0 = r.x1 = 0;
   r.ymin = r.ymax = 0;
   r.num_chars = 0;

   // search rows to find one that straddles 'y'
   while (i < n) {
      STB_TEXTEDIT_LAYOUTROW(r, str, i);
      if (r.num_chars <= 0)
         return n;

      if (i===0 && y < base_y + r.ymin)
         return 0;

      if (y < base_y + r.ymax)
         break;

      i += r.num_chars;
      base_y += r.baseline_y_delta;
   }

   // below all text, return 'after' last character
   if (i >= n)
      return n;

   // check if it's before the beginning of the line
   if (x < r.x0)
      return i;

   // check if it's before the end of the line
   if (x < r.x1) {
      // search characters in row for one that straddles 'x'
      prev_x = r.x0;
      for (k=0; k < r.num_chars; ++k) {
         let w = STB_TEXTEDIT_GETWIDTH(str, i, k);
         if (x < prev_x+w) {
            if (x < prev_x+w/2)
               return k+i;
            else
               return k+i+1;
         }
         prev_x += w;
      }
      // shouldn't happen, but if it does, fall through to end-of-line case
   }

   // if the last character is a newline, return that. otherwise return 'after' the last character
   if (STB_TEXTEDIT_GETCHAR(str, i+r.num_chars-1) === STB_TEXTEDIT_NEWLINE)
      return i+r.num_chars-1;
   else
      return i+r.num_chars;
}

// API click: on mouse down, move the cursor to the clicked location, and reset the selection
export function stb_textedit_click(str: StbTexteditString, state: STB_TexteditState, x: number, y: number): void
{
   // In single-line mode, just always make y = 0. This lets the drag keep working if the mouse
   // goes off the top or bottom of the text
   if( state.single_line )
   {
      let r = new StbTexteditRow();
      STB_TEXTEDIT_LAYOUTROW(r, str, 0);
      y = r.ymin;
   }

   state.cursor = stb_text_locate_coord(str, x, y);
   state.select_start = state.cursor;
   state.select_end = state.cursor;
   state.has_preferred_x = false;
}

// API drag: on mouse drag, move the cursor and selection endpoint to the clicked location
export function stb_textedit_drag(str: StbTexteditString, state: STB_TexteditState, x: number, y: number): void
{
   let p = 0;

   // In single-line mode, just always make y = 0. This lets the drag keep working if the mouse
   // goes off the top or bottom of the text
   if( state.single_line )
   {
      let r = new StbTexteditRow();
      STB_TEXTEDIT_LAYOUTROW(r, str, 0);
      y = r.ymin;
   }

   if (state.select_start === state.select_end)
      state.select_start = state.cursor;

   p = stb_text_locate_coord(str, x, y);
   state.cursor = state.select_end = p;
}

/////////////////////////////////////////////////////////////////////////////
//
//      Keyboard input handling
//

// forward declarations
// (not needed: function declarations are hoisted)

class StbFindState
{
   x = 0; y = 0;    // position of n'th character
   height = 0; // height of line
   first_char = 0; length = 0; // first char of row, and length
   prev_first = 0;  // first char of previous row
}

// find the x/y location of a character, and remember info about the previous row in
// case we get a move-up event (for page up, we'll have to rescan)
function stb_textedit_find_charpos(find: StbFindState, str: StbTexteditString, n: number, single_line: boolean): void
{
   let r = new StbTexteditRow();
   let prev_start = 0;
   let z = STB_TEXTEDIT_STRINGLEN(str); // eslint-disable-line @typescript-eslint/no-unused-vars
   let i=0, first: number;

   // search rows to find the one that straddles character n
   find.y = 0;

   for(;;) {
      STB_TEXTEDIT_LAYOUTROW(r, str, i);

      // generally, the row that contains n is found if n is less than the next row start.
      // however, if n is at the end of the text there is no row past n, so another termination criterion is needed:
      // 1. either the row is empty (this catches z == 0 too)
      // 2. or the row does not have a trailing newline
      // neither of these conditions can be true for any row other than the last one.
      // to avoid checking all three conditions every iterations, the main conditions is loosened such that it includes n == z
      // the additional single_line check is only needed if someone accidentally pasted a newline character at the end in single line mode
      if (n <= i + r.num_chars) {
         if(n < i + r.num_chars || r.num_chars === 0 || STB_TEXTEDIT_GETCHAR(str, i + r.num_chars - 1) !== STB_TEXTEDIT_NEWLINE || single_line) {
            break;
         }
      }

      prev_start = i;
      i += r.num_chars;
      find.y += r.baseline_y_delta;
   }

   find.first_char = first = i;
   find.length = r.num_chars;
   find.height = r.ymax - r.ymin;
   find.prev_first = prev_start;

   // now scan to find xpos
   find.x = r.x0;
   for (i=0; first+i < n; ++i)
      find.x += STB_TEXTEDIT_GETWIDTH(str, first, i);
}

function STB_TEXT_HAS_SELECTION(s: STB_TexteditState): boolean { return s.select_start !== s.select_end; }

// make the selection/cursor state valid if client altered the string
function stb_textedit_clamp(str: StbTexteditString, state: STB_TexteditState): void
{
   let n = STB_TEXTEDIT_STRINGLEN(str);
   if (STB_TEXT_HAS_SELECTION(state)) {
      if (state.select_start > n) state.select_start = n;
      if (state.select_end   > n) state.select_end = n;
      // if clamping forced them to be equal, move the cursor to match
      if (state.select_start === state.select_end)
         state.cursor = state.select_start;
   }
   if (state.cursor > n) state.cursor = n;
}

// delete characters while updating undo
function stb_textedit_delete(str: StbTexteditString, state: STB_TexteditState, where: number, len: number): void
{
   stb_text_makeundo_delete(str, state, where, len);
   STB_TEXTEDIT_DELETECHARS(str, where, len);
   state.has_preferred_x = false;
}

// delete the section
function stb_textedit_delete_selection(str: StbTexteditString, state: STB_TexteditState): void
{
   stb_textedit_clamp(str, state);
   if (STB_TEXT_HAS_SELECTION(state)) {
      if (state.select_start < state.select_end) {
         stb_textedit_delete(str, state, state.select_start, state.select_end - state.select_start);
         state.select_end = state.cursor = state.select_start;
      } else {
         stb_textedit_delete(str, state, state.select_end, state.select_start - state.select_end);
         state.select_start = state.cursor = state.select_end;
      }
      state.has_preferred_x = false;
   }
}

// canoncialize the selection so start <= end
function stb_textedit_sortselection(state: STB_TexteditState): void
{
   if (state.select_end < state.select_start) {
      let temp = state.select_end;
      state.select_end = state.select_start;
      state.select_start = temp;
   }
}

// move cursor to first character of selection
function stb_textedit_move_to_first(state: STB_TexteditState): void
{
   if (STB_TEXT_HAS_SELECTION(state)) {
      stb_textedit_sortselection(state);
      state.cursor = state.select_start;
      state.select_end = state.select_start;
      state.has_preferred_x = false;
   }
}

// move cursor to last character of selection
function stb_textedit_move_to_last(str: StbTexteditString, state: STB_TexteditState): void
{
   if (STB_TEXT_HAS_SELECTION(state)) {
      stb_textedit_sortselection(state);
      stb_textedit_clamp(str, state);
      state.cursor = state.select_end;
      state.select_start = state.select_end;
      state.has_preferred_x = false;
   }
}

function is_word_boundary( str: StbTexteditString, idx: number ): boolean
{
   return idx > 0 ? (STB_TEXTEDIT_IS_SPACE( STB_TEXTEDIT_GETCHAR(str,idx-1) ) && !STB_TEXTEDIT_IS_SPACE( STB_TEXTEDIT_GETCHAR(str, idx) ) ) : true;
}

function stb_textedit_move_to_word_previous( str: StbTexteditString, c: number ): number
{
   --c; // always move at least one character
   while( c >= 0 && !is_word_boundary( str, c ) )
      --c;

   if( c < 0 )
      c = 0;

   return c;
}
const STB_TEXTEDIT_MOVEWORDLEFT = stb_textedit_move_to_word_previous;

function stb_textedit_move_to_word_next( str: StbTexteditString, c: number ): number
{
   const len = STB_TEXTEDIT_STRINGLEN(str);
   ++c; // always move at least one character
   while( c < len && !is_word_boundary( str, c ) )
      ++c;

   if( c > len )
      c = len;

   return c;
}
const STB_TEXTEDIT_MOVEWORDRIGHT = stb_textedit_move_to_word_next;

// update selection and cursor to match each other
function stb_textedit_prep_selection_at_cursor(state: STB_TexteditState): void
{
   if (!STB_TEXT_HAS_SELECTION(state))
      state.select_start = state.select_end = state.cursor;
   else
      state.cursor = state.select_end;
}

// API cut: delete selection
export function stb_textedit_cut(str: StbTexteditString, state: STB_TexteditState): boolean
{
   if (STB_TEXT_HAS_SELECTION(state)) {
      stb_textedit_delete_selection(str,state); // implicitly clamps
      state.has_preferred_x = false;
      return true;
   }
   return false;
}

// API paste: replace existing selection with passed-in text
function stb_textedit_paste_internal(str: StbTexteditString, state: STB_TexteditState, text: string, len: number): boolean
{
   // if there's a selection, the paste should delete it
   stb_textedit_clamp(str, state);
   stb_textedit_delete_selection(str,state);
   // try to insert the characters
   if (STB_TEXTEDIT_INSERTCHARS(str, state.cursor, text, len)) {
      stb_text_makeundo_insert(state, state.cursor, len);
      state.cursor += len;
      state.has_preferred_x = false;
      return true;
   }
   // note: paste failure will leave deleted selection, may be restored with an undo (see https://github.com/nothings/stb/issues/734 for details)
   return false;
}

// API char: process a character input
export function stb_textedit_char(str: StbTexteditString, state: STB_TexteditState, ch: STB_TEXTEDIT_CHARTYPE): void
{
   // can't add newline in single-line mode
   if (ch === STB_TEXTEDIT_NEWLINE && state.single_line)
      return;

   if (state.insert_mode && !STB_TEXT_HAS_SELECTION(state) && state.cursor < STB_TEXTEDIT_STRINGLEN(str)) {
      stb_text_makeundo_replace(str, state, state.cursor, 1, 1);
      STB_TEXTEDIT_DELETECHARS(str, state.cursor, 1);
      if (STB_TEXTEDIT_INSERTCHARS(str, state.cursor, ch, 1)) {
         ++state.cursor;
         state.has_preferred_x = false;
      }
   } else {
      stb_textedit_delete_selection(str,state); // implicitly clamps
      if (STB_TEXTEDIT_INSERTCHARS(str, state.cursor, ch, 1)) {
         stb_text_makeundo_insert(state, state.cursor, 1);
         ++state.cursor;
         state.has_preferred_x = false;
      }
   }
}

// API key: process a keyboard input
export function stb_textedit_key(str: StbTexteditString, state: STB_TexteditState, key: STB_TEXTEDIT_KEYTYPE): void
{
let retry = true; // PORT: emulates `retry:` label and `goto retry`
while (retry) { retry = false;
   switch (key) {
      default: {
         let c = STB_TEXTEDIT_KEYTOTEXT(key);
         if (c > 0) {
            let ch: STB_TEXTEDIT_CHARTYPE = String.fromCharCode(c);
            stb_textedit_char(str, state, ch);
         }
         break;
      }

      case STB_TEXTEDIT_K_INSERT:
         state.insert_mode = !state.insert_mode;
         break;

      case STB_TEXTEDIT_K_UNDO:
         stb_text_undo(str, state);
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_REDO2: // PORT: add extra redo binding
      case STB_TEXTEDIT_K_REDO:
         stb_text_redo(str, state);
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_LEFT:
         // if currently there's a selection, move cursor to start of selection
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_move_to_first(state);
         else
            if (state.cursor > 0)
               --state.cursor;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_RIGHT:
         // if currently there's a selection, move cursor to end of selection
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_move_to_last(str, state);
         else
            ++state.cursor;
         stb_textedit_clamp(str, state);
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_LEFT | STB_TEXTEDIT_K_SHIFT:
         stb_textedit_clamp(str, state);
         stb_textedit_prep_selection_at_cursor(state);
         // move selection left
         if (state.select_end > 0)
            --state.select_end;
         state.cursor = state.select_end;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_WORDLEFT:
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_move_to_first(state);
         else {
            state.cursor = STB_TEXTEDIT_MOVEWORDLEFT(str, state.cursor);
            stb_textedit_clamp( str, state );
         }
         break;

      case STB_TEXTEDIT_K_WORDLEFT | STB_TEXTEDIT_K_SHIFT:
         if( !STB_TEXT_HAS_SELECTION( state ) )
            stb_textedit_prep_selection_at_cursor(state);

         state.cursor = STB_TEXTEDIT_MOVEWORDLEFT(str, state.cursor);
         state.select_end = state.cursor;

         stb_textedit_clamp( str, state );
         break;

      case STB_TEXTEDIT_K_WORDRIGHT:
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_move_to_last(str, state);
         else {
            state.cursor = STB_TEXTEDIT_MOVEWORDRIGHT(str, state.cursor);
            stb_textedit_clamp( str, state );
         }
         break;

      case STB_TEXTEDIT_K_WORDRIGHT | STB_TEXTEDIT_K_SHIFT:
         if( !STB_TEXT_HAS_SELECTION( state ) )
            stb_textedit_prep_selection_at_cursor(state);

         state.cursor = STB_TEXTEDIT_MOVEWORDRIGHT(str, state.cursor);
         state.select_end = state.cursor;

         stb_textedit_clamp( str, state );
         break;

      case STB_TEXTEDIT_K_RIGHT | STB_TEXTEDIT_K_SHIFT:
         stb_textedit_prep_selection_at_cursor(state);
         // move selection right
         ++state.select_end;
         stb_textedit_clamp(str, state);
         state.cursor = state.select_end;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_DOWN:
      case STB_TEXTEDIT_K_DOWN | STB_TEXTEDIT_K_SHIFT:
      case STB_TEXTEDIT_K_PGDOWN:
      case STB_TEXTEDIT_K_PGDOWN | STB_TEXTEDIT_K_SHIFT: {
         let find = new StbFindState();
         let row = new StbTexteditRow();
         let i: number, j: number, sel = (key & STB_TEXTEDIT_K_SHIFT) !== 0;
         let is_page = (key & ~STB_TEXTEDIT_K_SHIFT) === STB_TEXTEDIT_K_PGDOWN;
         let row_count = is_page ? state.row_count_per_page : 1;

         if (!is_page && state.single_line) {
            // on windows, up&down in single-line behave like left&right
            key = STB_TEXTEDIT_K_RIGHT | (key & STB_TEXTEDIT_K_SHIFT);
            retry = true; break; // goto retry;
         }

         if (sel)
            stb_textedit_prep_selection_at_cursor(state);
         else if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_move_to_last(str, state);

         // compute current position of cursor point
         stb_textedit_clamp(str, state);
         stb_textedit_find_charpos(find, str, state.cursor, state.single_line);

         for (j = 0; j < row_count; ++j) {
            let x: number, goal_x = state.has_preferred_x ? state.preferred_x : find.x;
            let start = find.first_char + find.length;

            if (find.length === 0)
               break;

            // now find character position down a row
            state.cursor = start;
            STB_TEXTEDIT_LAYOUTROW(row, str, state.cursor);
            x = row.x0;
            for (i=0; i < row.num_chars; ++i) {
               let dx = STB_TEXTEDIT_GETWIDTH(str, start, i);
               if (dx === STB_TEXTEDIT_GETWIDTH_NEWLINE)
                  break;
               x += dx;
               if (x > goal_x)
                  break;
               ++state.cursor;
            }
            stb_textedit_clamp(str, state);

            state.has_preferred_x = true;
            state.preferred_x = goal_x;

            if (sel)
               state.select_end = state.cursor;

            // go to next line
            find.first_char = find.first_char + find.length;
            find.length = row.num_chars;
         }
         break;
      }

      case STB_TEXTEDIT_K_UP:
      case STB_TEXTEDIT_K_UP | STB_TEXTEDIT_K_SHIFT:
      case STB_TEXTEDIT_K_PGUP:
      case STB_TEXTEDIT_K_PGUP | STB_TEXTEDIT_K_SHIFT: {
         let find = new StbFindState();
         let row = new StbTexteditRow();
         let i: number, j: number, prev_scan: number, sel = (key & STB_TEXTEDIT_K_SHIFT) !== 0;
         let is_page = (key & ~STB_TEXTEDIT_K_SHIFT) === STB_TEXTEDIT_K_PGUP;
         let row_count = is_page ? state.row_count_per_page : 1;

         if (!is_page && state.single_line) {
            // on windows, up&down become left&right
            key = STB_TEXTEDIT_K_LEFT | (key & STB_TEXTEDIT_K_SHIFT);
            retry = true; break; // goto retry;
         }

         if (sel)
            stb_textedit_prep_selection_at_cursor(state);
         else if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_move_to_first(state);

         // compute current position of cursor point
         stb_textedit_clamp(str, state);
         stb_textedit_find_charpos(find, str, state.cursor, state.single_line);

         for (j = 0; j < row_count; ++j) {
            let  x: number, goal_x = state.has_preferred_x ? state.preferred_x : find.x;

            // if there's no previous row set cursor to start of the line
            if (find.prev_first === find.first_char) {
               state.cursor = find.first_char;
               stb_textedit_clamp(str, state);

               if (sel)
                  state.select_end = state.cursor;
               break;
            }

            // now find character position up a row
            state.cursor = find.prev_first;
            STB_TEXTEDIT_LAYOUTROW(row, str, state.cursor);
            x = row.x0;
            for (i=0; i < row.num_chars; ++i) {
               let dx = STB_TEXTEDIT_GETWIDTH(str, find.prev_first, i);
               if (dx === STB_TEXTEDIT_GETWIDTH_NEWLINE)
                  break;
               x += dx;
               if (x > goal_x)
                  break;
               ++state.cursor;
            }
            stb_textedit_clamp(str, state);

            state.has_preferred_x = true;
            state.preferred_x = goal_x;

            if (sel)
               state.select_end = state.cursor;

            // go to previous line
            // (we need to scan previous line the hard way. maybe we could expose this as a new API function?)
            prev_scan = find.prev_first > 0 ? find.prev_first - 1 : 0;
            while (prev_scan > 0 && STB_TEXTEDIT_GETCHAR(str, prev_scan - 1) !== STB_TEXTEDIT_NEWLINE)
               --prev_scan;
            find.first_char = find.prev_first;
            find.prev_first = prev_scan;
         }
         break;
      }

      case STB_TEXTEDIT_K_DELETE:
      case STB_TEXTEDIT_K_DELETE | STB_TEXTEDIT_K_SHIFT:
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_delete_selection(str, state);
         else {
            let n = STB_TEXTEDIT_STRINGLEN(str);
            if (state.cursor < n)
               stb_textedit_delete(str, state, state.cursor, 1);
         }
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_BACKSPACE:
      case STB_TEXTEDIT_K_BACKSPACE | STB_TEXTEDIT_K_SHIFT:
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_delete_selection(str, state);
         else {
            stb_textedit_clamp(str, state);
            if (state.cursor > 0) {
               stb_textedit_delete(str, state, state.cursor-1, 1);
               --state.cursor;
            }
         }
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_WORDBACKSPACE: // PORT: GLOV extension
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_delete_selection(str, state);
         else {
            stb_textedit_clamp(str, state);
            if (state.cursor > 0) {
               let start = STB_TEXTEDIT_MOVEWORDLEFT(str, state.cursor);
               stb_textedit_delete(str, state, start, state.cursor - start);
               state.cursor = start;
            }
         }
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_WORDDELETE: // PORT: GLOV extension
         if (STB_TEXT_HAS_SELECTION(state))
            stb_textedit_delete_selection(str, state);
         else {
            stb_textedit_clamp(str, state);
            if (state.cursor < STB_TEXTEDIT_STRINGLEN(str)) {
               let end = STB_TEXTEDIT_MOVEWORDRIGHT(str, state.cursor);
               stb_textedit_delete(str, state, state.cursor, end - state.cursor);
            }
         }
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_SELECTALL: // PORT: GLOV extension
         state.select_start = 0;
         state.cursor = state.select_end = STB_TEXTEDIT_STRINGLEN(str);
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_TEXTSTART2:
      case STB_TEXTEDIT_K_TEXTSTART:
         state.cursor = state.select_start = state.select_end = 0;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_TEXTEND2:
      case STB_TEXTEDIT_K_TEXTEND:
         state.cursor = STB_TEXTEDIT_STRINGLEN(str);
         state.select_start = state.select_end = 0;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_TEXTSTART2 | STB_TEXTEDIT_K_SHIFT:
      case STB_TEXTEDIT_K_TEXTSTART | STB_TEXTEDIT_K_SHIFT:
         stb_textedit_prep_selection_at_cursor(state);
         state.cursor = state.select_end = 0;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_TEXTEND2 | STB_TEXTEDIT_K_SHIFT:
      case STB_TEXTEDIT_K_TEXTEND | STB_TEXTEDIT_K_SHIFT:
         stb_textedit_prep_selection_at_cursor(state);
         state.cursor = state.select_end = STB_TEXTEDIT_STRINGLEN(str);
         state.has_preferred_x = false;
         break;


      case STB_TEXTEDIT_K_LINESTART2:
      case STB_TEXTEDIT_K_LINESTART:
         stb_textedit_clamp(str, state);
         stb_textedit_move_to_first(state);
         if (state.single_line)
            state.cursor = 0;
         else while (state.cursor > 0 && STB_TEXTEDIT_GETCHAR(str, state.cursor-1) !== STB_TEXTEDIT_NEWLINE)
            --state.cursor;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_LINEEND2:
      case STB_TEXTEDIT_K_LINEEND: {
         let n = STB_TEXTEDIT_STRINGLEN(str);
         stb_textedit_clamp(str, state);
         stb_textedit_move_to_last(str, state);
         if (state.single_line)
             state.cursor = n;
         else while (state.cursor < n && STB_TEXTEDIT_GETCHAR(str, state.cursor) !== STB_TEXTEDIT_NEWLINE)
             ++state.cursor;
         state.has_preferred_x = false;
         break;
      }

      case STB_TEXTEDIT_K_LINESTART2 | STB_TEXTEDIT_K_SHIFT:
      case STB_TEXTEDIT_K_LINESTART | STB_TEXTEDIT_K_SHIFT:
         stb_textedit_clamp(str, state);
         stb_textedit_prep_selection_at_cursor(state);
         if (state.single_line)
            state.cursor = 0;
         else while (state.cursor > 0 && STB_TEXTEDIT_GETCHAR(str, state.cursor-1) !== STB_TEXTEDIT_NEWLINE)
            --state.cursor;
         state.select_end = state.cursor;
         state.has_preferred_x = false;
         break;

      case STB_TEXTEDIT_K_LINEEND2 | STB_TEXTEDIT_K_SHIFT:
      case STB_TEXTEDIT_K_LINEEND | STB_TEXTEDIT_K_SHIFT: {
         let n = STB_TEXTEDIT_STRINGLEN(str);
         stb_textedit_clamp(str, state);
         stb_textedit_prep_selection_at_cursor(state);
         if (state.single_line)
             state.cursor = n;
         else while (state.cursor < n && STB_TEXTEDIT_GETCHAR(str, state.cursor) !== STB_TEXTEDIT_NEWLINE)
            ++state.cursor;
         state.select_end = state.cursor;
         state.has_preferred_x = false;
         break;
      }
   }
}
}

/////////////////////////////////////////////////////////////////////////////
//
//      Undo processing
//
// @OPTIMIZE: the undo/redo buffer should be circular

function stb_textedit_flush_redo(state: StbUndoState): void
{
   state.redo_point = STB_TEXTEDIT_UNDOSTATECOUNT;
   state.redo_char_point = STB_TEXTEDIT_UNDOCHARCOUNT;
}

// discard the oldest entry in the undo list
function stb_textedit_discard_undo(state: StbUndoState): void
{
   if (state.undo_point > 0) {
      // if the 0th undo state has characters, clean those up
      if (state.undo_rec[0].char_storage >= 0) {
         let n = state.undo_rec[0].insert_length, i: number;
         // delete n characters from all other records
         state.undo_char_point -= n;
         STB_TEXTEDIT_memmove_chars(state.undo_char, 0, n, state.undo_char_point);
         for (i=0; i < state.undo_point; ++i)
            if (state.undo_rec[i].char_storage >= 0)
               state.undo_rec[i].char_storage -= n; // @OPTIMIZE: get rid of char_storage and infer it
      }
      --state.undo_point;
      STB_TEXTEDIT_memmove_recs(state.undo_rec, 0, 1, state.undo_point);
   }
}

// discard the oldest entry in the redo list--it's bad if this
// ever happens, but because undo & redo have to store the actual
// characters in different cases, the redo character buffer can
// fill up even though the undo buffer didn't
function stb_textedit_discard_redo(state: StbUndoState): void
{
   let k = STB_TEXTEDIT_UNDOSTATECOUNT-1;

   if (state.redo_point <= k) {
      // if the k'th undo state has characters, clean those up
      if (state.undo_rec[k].char_storage >= 0) {
         let n = state.undo_rec[k].insert_length, i: number;
         // move the remaining redo character data to the end of the buffer
         state.redo_char_point += n;
         STB_TEXTEDIT_memmove_chars(state.undo_char, state.redo_char_point, state.redo_char_point-n, STB_TEXTEDIT_UNDOCHARCOUNT - state.redo_char_point);
         // adjust the position of all the other records to account for above memmove
         for (i=state.redo_point; i < k; ++i)
            if (state.undo_rec[i].char_storage >= 0)
               state.undo_rec[i].char_storage += n;
      }
      // now move all the redo records towards the end of the buffer; the first one is at 'redo_point'
      // PORT: the C moves one record too many (writing past the end of undo_rec); only k - redo_point remain
      STB_TEXTEDIT_memmove_recs(state.undo_rec, state.redo_point+1, state.redo_point, STB_TEXTEDIT_UNDOSTATECOUNT - state.redo_point - 1);
      // now move redo_point to point to the new one
      ++state.redo_point;
   }
}

function stb_text_create_undo_record(state: StbUndoState, numchars: number): StbUndoRecord | null
{
   // any time we create a new undo record, we discard redo
   stb_textedit_flush_redo(state);

   // if we have no free records, we have to make room, by sliding the
   // existing records down
   if (state.undo_point === STB_TEXTEDIT_UNDOSTATECOUNT)
      stb_textedit_discard_undo(state);

   // if the characters to store won't possibly fit in the buffer, we can't undo
   if (numchars > STB_TEXTEDIT_UNDOCHARCOUNT) {
      state.undo_point = 0;
      state.undo_char_point = 0;
      return null;
   }

   // if we don't have enough free characters in the buffer, we have to make room
   while (state.undo_char_point + numchars > STB_TEXTEDIT_UNDOCHARCOUNT)
      stb_textedit_discard_undo(state);

   return state.undo_rec[state.undo_point++];
}

// PORT: returns an index into undo_char, or -1 instead of NULL
// PORT: takes the current cursor position
function stb_text_createundo(state: StbUndoState, pos: number, insert_len: number, delete_len: number, cursor: number): number
{
   let r = stb_text_create_undo_record(state, insert_len);
   if (r === null)
      return -1;

   r.where = pos;
   r.cursor = cursor;
   r.insert_length = insert_len;
   r.delete_length = delete_len;

   if (insert_len === 0) {
      r.char_storage = -1;
      return -1;
   } else {
      r.char_storage = state.undo_char_point;
      state.undo_char_point += insert_len;
      return r.char_storage;
   }
}

function stb_text_undo(str: StbTexteditString, state: STB_TexteditState): void
{
   let s = state.undostate;
   let u = new StbUndoRecord(), r: StbUndoRecord;
   if (s.undo_point === 0)
      return;

   // we need to do two things: apply the undo record, and create a redo record
   stb_undo_record_copy(u, s.undo_rec[s.undo_point-1]);
   r = s.undo_rec[s.redo_point-1];
   r.char_storage = -1;

   r.insert_length = u.delete_length;
   r.delete_length = u.insert_length;
   r.where = u.where;

   if (u.delete_length) {
      // if the undo record says to delete characters, then the redo record will
      // need to re-insert the characters that get deleted, so we need to store
      // them.

      // there are three cases:
      //    there's enough room to store the characters
      //    characters stored for *redoing* don't leave room for redo
      //    characters stored for *undoing* don't leave room for redo
      // if the last is true, we have to bail

      if (s.undo_char_point + u.delete_length >= STB_TEXTEDIT_UNDOCHARCOUNT) {
         // the undo records take up too much character space; there's no space to store the redo characters
         r.insert_length = 0;
      } else {
         let i: number;

         // there's definitely room to store the characters eventually
         while (s.undo_char_point + u.delete_length > s.redo_char_point) {
            // should never happen:
            if (s.redo_point === STB_TEXTEDIT_UNDOSTATECOUNT)
               return;
            // there's currently not enough room, so discard a redo record
            stb_textedit_discard_redo(s);
         }
         r = s.undo_rec[s.redo_point-1];
         // PORT: r may now be a different (stale) record than the one filled in above
         r.insert_length = u.delete_length;
         r.delete_length = u.insert_length;
         r.where = u.where;

         r.char_storage = s.redo_char_point - u.delete_length;
         s.redo_char_point = s.redo_char_point - u.delete_length;

         // now save the characters
         for (i=0; i < u.delete_length; ++i)
            s.undo_char[r.char_storage + i] = STB_TEXTEDIT_GETCHAR(str, u.where + i);
      }

      // now we can carry out the deletion
      STB_TEXTEDIT_DELETECHARS(str, u.where, u.delete_length);
   }

   // check type of recorded action:
   if (u.insert_length) {
      // easy case: was a deletion, so we need to insert n characters
      STB_TEXTEDIT_INSERTCHARS(str, u.where, s.undo_char.slice(u.char_storage, u.char_storage + u.insert_length).join(''), u.insert_length);
      s.undo_char_point -= u.insert_length;
   }

   r.cursor = u.cursor; // PORT: preserved for undoing the redo
   // PORT: restore the cursor to where it was (the C uses `u.where + u.insert_length`,
   //   which is wrong for a forward delete)
   state.cursor = u.cursor;
   state.select_start = state.select_end = state.cursor;

   s.undo_point--;
   s.redo_point--;
}

function stb_text_redo(str: StbTexteditString, state: STB_TexteditState): void
{
   let s = state.undostate;
   let u: StbUndoRecord, r = new StbUndoRecord();
   if (s.redo_point === STB_TEXTEDIT_UNDOSTATECOUNT)
      return;

   // we need to do two things: apply the redo record, and create an undo record
   u = s.undo_rec[s.undo_point];
   stb_undo_record_copy(r, s.undo_rec[s.redo_point]);

   // we KNOW there must be room for the undo record, because the redo record
   // was derived from an undo record

   u.delete_length = r.insert_length;
   u.insert_length = r.delete_length;
   u.where = r.where;
   u.cursor = r.cursor; // PORT
   u.char_storage = -1;

   if (r.delete_length) {
      // the redo record requires us to delete characters, so the undo record
      // needs to store the characters

      if (s.undo_char_point + u.insert_length > s.redo_char_point) {
         u.insert_length = 0;
         u.delete_length = 0;
      } else {
         let i: number;
         u.char_storage = s.undo_char_point;
         s.undo_char_point = s.undo_char_point + u.insert_length;

         // now save the characters
         for (i=0; i < u.insert_length; ++i)
            s.undo_char[u.char_storage + i] = STB_TEXTEDIT_GETCHAR(str, u.where + i);
      }

      STB_TEXTEDIT_DELETECHARS(str, r.where, r.delete_length);
   }

   if (r.insert_length) {
      // easy case: need to insert n characters
      STB_TEXTEDIT_INSERTCHARS(str, r.where, s.undo_char.slice(r.char_storage, r.char_storage + r.insert_length).join(''), r.insert_length);
      s.redo_char_point += r.insert_length;
   }

   state.cursor = r.where + r.insert_length;
   state.select_start = state.select_end = state.cursor;

   s.undo_point++;
   s.redo_point++;
}

function stb_text_makeundo_insert(state: STB_TexteditState, where: number, length: number): void
{
   stb_text_createundo(state.undostate, where, 0, length, state.cursor);
}

function stb_text_makeundo_delete(str: StbTexteditString, state: STB_TexteditState, where: number, length: number): void
{
   let i: number;
   let p = stb_text_createundo(state.undostate, where, length, 0, state.cursor);
   if (p >= 0) {
      for (i=0; i < length; ++i)
         state.undostate.undo_char[p+i] = STB_TEXTEDIT_GETCHAR(str, where+i);
   }
}

function stb_text_makeundo_replace(str: StbTexteditString, state: STB_TexteditState, where: number, old_length: number, new_length: number): void
{
   let i: number;
   let p = stb_text_createundo(state.undostate, where, old_length, new_length, state.cursor);
   if (p >= 0) {
      for (i=0; i < old_length; ++i)
         state.undostate.undo_char[p+i] = STB_TEXTEDIT_GETCHAR(str, where+i);
   }
}

// reset the state to default
function stb_textedit_clear_state(state: STB_TexteditState, is_single_line: boolean): void
{
   state.undostate.undo_point = 0;
   state.undostate.undo_char_point = 0;
   state.undostate.redo_point = STB_TEXTEDIT_UNDOSTATECOUNT;
   state.undostate.redo_char_point = STB_TEXTEDIT_UNDOCHARCOUNT;
   state.select_end = state.select_start = 0;
   state.cursor = 0;
   state.has_preferred_x = false;
   state.preferred_x = 0;
   state.cursor_at_end_of_line = false;
   state.initialized = true;
   state.single_line = is_single_line;
   state.insert_mode = false;
   state.row_count_per_page = 0;
}

// API initialize
function stb_textedit_initialize_state(state: STB_TexteditState, is_single_line: boolean): void
{
   stb_textedit_clear_state(state, is_single_line);
}

export function stb_textedit_paste(str: StbTexteditString, state: STB_TexteditState, ctext: string, len: number = ctext.length): boolean
{
   return stb_textedit_paste_internal(str, state, ctext, len);
}

/*
------------------------------------------------------------------------------
This software is available under 2 licenses -- choose whichever you prefer.
------------------------------------------------------------------------------
ALTERNATIVE A - MIT License
Copyright (c) 2017 Sean Barrett
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
------------------------------------------------------------------------------
ALTERNATIVE B - Public Domain (www.unlicense.org)
This is free and unencumbered software released into the public domain.
Anyone is free to copy, modify, publish, use, compile, sell, or distribute this
software, either in source code form or as a compiled binary, for any purpose,
commercial or non-commercial, and by any means.
In jurisdictions that recognize copyright laws, the author or authors of this
software dedicate any and all copyright interest in the software to the public
domain. We make this dedication for the benefit of the public at large and to
the detriment of our heirs and successors. We intend this dedication to be an
overt act of relinquishment in perpetuity of all present and future rights to
this software under copyright law.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
------------------------------------------------------------------------------
*/
