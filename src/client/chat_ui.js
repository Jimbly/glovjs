// Portions Copyright 2020 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT
const assert = require('assert');
const camera2d = require('./glov/camera2d.js');
const { cmd_parse } = require('./glov/cmds.js');
const engine = require('./glov/engine.js');
const glov_font = require('./glov/font.js');
const input = require('./glov/input.js');
const { link } = require('./glov/link.js');
const local_storage = require('./glov/local_storage.js');
const { ceil, floor, max, min } = Math;
const net = require('./glov/net.js');
const { profanityFilter, profanityStartup } = require('./glov/words/profanity.js');
const { scrollAreaCreate } = require('./glov/scroll_area.js');
const settings = require('./glov/settings.js');
const ui = require('./glov/ui.js');
const { clamp, matchAll } = require('../common/util.js');
const { vec4, v3copy } = require('./glov/vmath.js');

const FADE_START_TIME = [10000, 1000];
const FADE_TIME = [1000, 500];

const INDENT = 80;

settings.register({
  chat_auto_unfocus: {
    default_value: 0,
    type: cmd_parse.TYPE_INT,
    range: [0,1],
    help: 'Automatically unfocus chat after sending a message',
  },
});

settings.register({
  profanity_filter: {
    default_value: 1,
    type: cmd_parse.TYPE_INT,
    range: [0,1],
    help: 'Filter profanity in chat',
  },
});

function CmdHistory() {
  assert(local_storage.storage_prefix !== 'demo'); // wrong initialization order
  this.entries = new Array(50);
  this.idx = local_storage.getJSON('console_idx'); // where we will next insert
  if (typeof this.idx !== 'number' || this.idx < 0 || this.idx >= this.entries.length) {
    this.idx = 0;
  } else {
    for (let ii = 0; ii < this.entries.length; ++ii) {
      this.entries[ii] = local_storage.getJSON(`console_e${ii}`);
    }
  }
  this.resetPos();
}
CmdHistory.prototype.setHist = function (idx, text) {
  this.entries[idx] = text;
  local_storage.setJSON(`console_e${idx}`, text);
};
CmdHistory.prototype.add = function (text) {
  if (!text) {
    return;
  }
  let idx = this.entries.indexOf(text);
  if (idx !== -1) {
    // already in there, just re-order
    let target = (this.idx - 1 + this.entries.length) % this.entries.length;
    while (idx !== target) {
      let next = (idx + 1) % this.entries.length;
      this.setHist(idx, this.entries[next]);
      idx = next;
    }
    this.setHist(target, text);
    return;
  }
  this.setHist(this.idx, text);
  this.idx = (this.idx + 1) % this.entries.length;
  local_storage.setJSON('console_idx', this.idx);
  this.resetPos();
};
CmdHistory.prototype.unadd = function (text) {
  // upon error, do not store this string in our history
  let idx = (this.idx - 1 + this.entries.length) % this.entries.length;
  if (this.entries[idx] !== text) {
    return;
  }
  this.idx = idx;
  local_storage.setJSON('console_idx', this.idx);
  this.resetPos();
};
CmdHistory.prototype.resetPos = function () {
  this.hist_idx = this.idx;
  this.edit_line = '';
};
CmdHistory.prototype.prev = function (cur_text) {
  if (this.hist_idx === this.idx) {
    // if first time goine backwards, stash the current edit line
    this.edit_line = cur_text;
  }
  let idx = (this.hist_idx - 1 + this.entries.length) % this.entries.length;
  let text = this.entries[idx];
  if (idx === this.idx || !text) {
    // wrapped around, or got to empty
    return this.entries[this.hist_idx] || '';
  }
  this.hist_idx = idx;
  return text || '';
};
CmdHistory.prototype.next = function (cur_text) {
  if (this.hist_idx === this.idx) {
    return cur_text || '';
  }
  let idx = (this.hist_idx + 1) % this.entries.length;
  this.hist_idx = idx;
  if (this.hist_idx === this.idx) {
    // just got back to head
    let ret = this.edit_line;
    this.edit_line = '';
    return ret || '';
  }
  return this.entries[idx] || '';
};

function ChatUI(params) {
  assert.equal(typeof params, 'object');
  assert.equal(typeof params.max_len, 'number');
  this.edit_text_entry = ui.createEditBox({
    placeholder: 'Chat',
    initial_focus: false,
    auto_unfocus: true,
    max_len: params.max_len,
    text: '',
  });
  this.channel = null;

  this.on_join = this.onMsgJoin.bind(this);
  this.on_leave = this.onMsgLeave.bind(this);
  this.on_chat = this.onMsgChat.bind(this);
  this.handle_cmd_parse = this.handleCmdParse.bind(this);
  this.handle_cmd_parse_error = this.handleCmdParseError.bind(this);
  cmd_parse.setDefaultHandler(this.handle_cmd_parse_error);
  this.msgs = [];
  this.total_lines = 0;
  this.max_lines = params.max_lines || 8; // Max shown when chat not active
  this.max_messages = params.max_messages || 1000; // Size of history kept
  this.max_len = params.max_len;
  this.font_height = params.font_height || ui.font_height;
  this.w = params.w || engine.game_width / 2;
  this.h = params.h || engine.game_height / 2; // excluding text entry
  this.scroll_area = scrollAreaCreate();
  this.history = new CmdHistory();
  this.get_roles = null; // returns object for testing cmd access permissions
  this.url_match = params.url_match; // runs `/url match[1]` if clicked
  this.url_info = params.url_info; // Optional for grabbing the interesting portion of the URL for tooltip and /url

  this.styles = {
    def: glov_font.style(null, {
      color: 0xBBBBBBff,
      outline_width: 1.0,
      outline_color: 0x000000ff,
    }),
    error: glov_font.style(null, {
      color: 0xDD0000ff,
      outline_width: 1.0,
      outline_color: 0x000000ff,
    }),
    link: glov_font.style(null, {
      color: 0x5040FFff,
      outline_width: 1.0,
      outline_color: 0x000000ff,
    }),
    link_hover: glov_font.style(null, {
      color: 0x0000FFff,
      outline_width: 1.0,
      outline_color: 0x000000ff,
    }),
  };

  net.subs.on('admin_msg', (msg) => {
    ui.playUISound('msg_err');
    this.addChat(msg, 'error');
  });
}

ChatUI.prototype.addMsgInternal = function (msg, style) {
  let elem = { msg, style, timestamp: Date.now() };
  elem.numlines = ui.font.numLines(this.styles.def, this.w, INDENT, this.font_height, msg);
  this.total_lines += elem.numlines;
  this.msgs.push(elem);
  if (this.msgs.length > this.max_messages * 1.25) {
    this.msgs.splice(0, this.msgs.length - this.max_messages);
    this.total_lines = 0;
    for (let ii = 0; ii < this.msgs.length; ++ii) {
      this.total_lines += this.msgs[ii].numlines;
    }
  }
};

ChatUI.prototype.addChat = function (msg, style) {
  console.log(msg);
  this.addMsgInternal(msg, style);
};
ChatUI.prototype.addChatFiltered = function (msg, style) {
  console.log(msg);
  if (settings.profanity_filter) {
    msg = profanityFilter(msg);
  }
  this.addMsgInternal(msg, style);
};
ChatUI.prototype.onMsgJoin = function (data) {
  if (data.client_id !== net.client.id) {
    ui.playUISound('user_join');
  }
  this.addChatFiltered(`${data.display_name} joined the channel`);
};
ChatUI.prototype.onMsgLeave = function (data) {
  ui.playUISound('user_leave');
  this.addChatFiltered(`${data.display_name} left the channel`);
};
ChatUI.prototype.onMsgChat = function (data) {
  if (data.client_ids.id !== net.client.id) {
    ui.playUISound('msg_in');
  }
  this.addChatFiltered(`[${data.client_ids.display_name}] ${data.msg}`);
};

ChatUI.prototype.runLate = function () {
  this.did_run_late = true;
  if (input.keyDownEdge(input.KEYS.RETURN)) {
    this.edit_text_entry.focus();
  }
  if (input.keyDownEdge(input.KEYS.SLASH) ||
    input.keyDownEdge(input.KEYS.NUMPAD_DIVIDE)
  ) {
    this.edit_text_entry.focus();
    this.edit_text_entry.setText('/');
  }
};

ChatUI.prototype.handleCmdParseError = function (err, resp) {
  if (err) {
    this.addChat(`[error] ${err}`);
  }
};

ChatUI.prototype.handleCmdParse = function (err, resp) {
  if (err) {
    this.addChat(`[error] ${err}`);
  } else if (resp) {
    this.addChat(`[system] ${(typeof resp === 'string') ? resp : JSON.stringify(resp)}`);
  }
};

ChatUI.prototype.setGetRoles = function (fn) {
  this.get_roles = fn;
};

let access_dummy = { access: null };
ChatUI.prototype.getAccessObj = function () {
  if (!this.get_roles) {
    return {};
  }
  access_dummy.access = this.get_roles();
  return access_dummy;
};

ChatUI.prototype.cmdParse = function (str, on_error) {
  let handleResult = on_error ?
    (err, resp) => {
      this.handle_cmd_parse(err, resp);
      if (on_error && err) {
        on_error(err);
      }
    } :
    this.handle_cmd_parse;
  cmd_parse.handle(this.getAccessObj(), str, function (err, resp) {
    if (err && cmd_parse.was_not_found) {
      // forward to server
      net.subs.sendCmdParse(str, handleResult);
    } else {
      handleResult(err, resp);
    }
  });
};

ChatUI.prototype.cmdParseInternal = function (str) {
  cmd_parse.handle(this.getAccessObj(), str, this.handle_cmd_parse_error);
};

function pad2(str) {
  return `0${str}`.slice(-2);
}
function conciseDate(dt) {
  return `${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())
  }:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
}
let help_font_style = glov_font.styleColored(null, 0x000000ff);
let help_font_style_cmd = glov_font.style(help_font_style, {
  outline_width: 0.5,
  outline_color: 0x000000FF,
});
let help_rollover_color = vec4(0, 0, 0, 0.25);
let help_rollover_color2 = vec4(0, 0, 0, 0.125);
const TOOLTIP_MIN_PAGE_SIZE = 20;
let tooltip_page = 0;
let tooltip_last = '';
let tooltip_panel_color = vec4();
function drawHelpTooltip(param) {
  assert(Array.isArray(param.tooltip));
  let tooltip = param.tooltip;
  let num_pages = 1;
  let h = param.font_height;
  let eff_tooltip_pad = ui.tooltip_pad * 0.5;
  let num_per_page = min(TOOLTIP_MIN_PAGE_SIZE, max(1, floor((param.y - camera2d.y0() - eff_tooltip_pad) / h) - 1));
  if (tooltip.length > 20) {
    let text = tooltip.join('\n');
    if (text !== tooltip_last) {
      tooltip_page = 0;
      tooltip_last = text;
    }
    num_pages = ceil(tooltip.length / num_per_page);
    tooltip = tooltip.slice(tooltip_page * num_per_page, (tooltip_page + 1) * num_per_page);
  } else {
    tooltip_page = 0;
    tooltip_last = '';
  }
  let w = param.tooltip_width;
  let x = param.x;
  let z = param.z || Z.TOOLTIP;
  let text_x = x + eff_tooltip_pad;
  let text_w = w - eff_tooltip_pad * 2;
  let tooltip_y1 = param.y;

  let alpha = 1;
  let vis_h = eff_tooltip_pad * 2 + h * tooltip.length;
  if (!param.do_selection && num_pages === 1 && input.mouseOver({
    x,
    y: tooltip_y1 - vis_h,
    w,
    h: vis_h,
  })) {
    alpha = 0.15;
  }
  let style = help_font_style;
  if (alpha !== 1) {
    style = glov_font.styleAlpha(style, alpha);
  }

  let y = tooltip_y1 - eff_tooltip_pad;
  let ret = null;
  if (num_pages > 1) {
    y -= h;
    ui.font.drawSizedAligned(help_font_style,
      text_x, y, z+1, h, glov_font.ALIGN.HCENTER,
      text_w, 0,
      `Page ${tooltip_page + 1} / ${num_pages}`);
    let pos = { x, y, w, h };
    if (input.mouseUpEdge(pos)) { // up instead of down to prevent canvas capturing focus
      tooltip_page = (tooltip_page + 1) % num_pages;
    } else if (input.mouseOver(pos)) {
      ui.drawRect(x, y, x + w, y + h, z + 0.5, help_rollover_color);
    }
  }
  for (let ii = tooltip.length - 1; ii >= 0; --ii) {
    let line = tooltip[ii];
    y -= h;
    let idx = line.indexOf(' ');
    if (line[0] === '/' && idx !== -1 && param.do_selection) {
      // is a command
      let cmd = line.slice(0, idx);
      let help = line.slice(idx);
      let cmd_w = ui.font.drawSized(help_font_style_cmd,
        text_x, y, z+1, h, cmd);
      ui.font.drawSizedAligned(help_font_style,
        text_x + cmd_w, y, z+1, h, glov_font.ALIGN.HFIT,
        text_w - cmd_w, 0,
        help);
      let pos = { x, y, w, h };
      if (input.mouseUpEdge(pos)) { // up instead of down to prevent canvas capturing focus
        ret = cmd.slice(1);
      } else if (input.mouseOver(pos)) {
        ui.drawRect(x, y, text_x + cmd_w + 4, y + h, z + 0.5, help_rollover_color);
        ui.drawRect(text_x + cmd_w + 4, y, x + w, y + h, z + 0.5, help_rollover_color2);
      }
    } else {
      ui.font.drawSizedAligned(style,
        text_x, y, z+1, h, glov_font.ALIGN.HFIT,
        text_w, 0,
        line);
    }
  }
  y -= eff_tooltip_pad;
  let pixel_scale = ui.tooltip_panel_pixel_scale * 0.5;

  v3copy(tooltip_panel_color, ui.color_panel);
  tooltip_panel_color[3] = alpha;
  ui.panel({
    x, y, z, w,
    h: tooltip_y1 - y,
    pixel_scale,
    color: tooltip_panel_color,
  });
  return ret;
}

ChatUI.prototype.isFocused = function () {
  return this.edit_text_entry && this.edit_text_entry.isFocused();
};

const SPACE_ABOVE_ENTRY = 8;
ChatUI.prototype.run = function (opts) {
  opts = opts || {};
  if (net.client.disconnected) {
    ui.font.drawSizedAligned(
      glov_font.style(null, {
        outline_width: 2,
        outline_color: 0x000000ff,
        color: 0xDD2020ff
      }),
      camera2d.x0(), camera2d.y0(), Z.DEBUG,
      ui.font_height, glov_font.ALIGN.HVCENTER, camera2d.w(), camera2d.h() * 0.20,
      `Connection lost, attempting to reconnect (${(net.client.timeSinceDisconnect()/1000).toFixed(0)})...`);
  }

  if (!this.did_run_late) {
    this.runLate();
  }
  this.did_run_late = false;
  let x = camera2d.x0() + 10;
  let y0 = camera2d.y1();
  let y = y0;
  let w = this.w;
  let was_focused = this.edit_text_entry && this.edit_text_entry.isFocused();
  let z = was_focused ? Z.CHAT_FOCUSED : Z.CHAT;
  let is_focused = false;
  let font_height = this.font_height;
  let anything_visible = false;
  let hide_light = (opts.hide || engine.defines.NOUI || !net.subs.loggedIn()) &&
    !(this.edit_text_entry && this.edit_text_entry.isFocused()) ?
    1 : // must be numerical, used to index fade values
    0;
  let help_tooltip_up = false;
  if (!(ui.modal_dialog || ui.menu_up || hide_light)) {
    anything_visible = true;
    if (was_focused && input.touch_mode) {
      // expand chat when focused on touch devices
      w = camera2d.x1() - x - 24;
      let font_scale = 4;
      let aspect = camera2d.screenAspect();
      if (aspect > 2) { // scale up to font scale of 8
        font_scale = 4 + 4 * min((aspect - 2) / 8, 1);
      }
      font_height *= font_scale;
    }
    y -= 16 + font_height;
    if (!was_focused && opts.pointerlock && input.pointerLocked()) {
      // do not show edit box
      ui.font.drawSizedAligned(this.styles.def, x, y, z + 1, font_height, glov_font.ALIGN.HFIT, w, 0,
        '<Press Enter to chat>');
    } else {
      if (was_focused) {
        // Do auto-complete logic *before* edit box, so we can eat TAB without changing focus
        // Eat tab even if there's nothing to complete, for consistency
        let pressed_tab = input.keyDownEdge(input.KEYS.TAB);
        if (pressed_tab) {
          this.edit_text_entry.focus();
        }
        let cur_text = this.edit_text_entry.getText();
        if (cur_text) {
          if (cur_text[0] === '/') {
            // do auto-complete
            let autocomplete = cmd_parse.autoComplete(cur_text.slice(1), this.getAccessObj().access);
            if (autocomplete && autocomplete.length) {
              let first = autocomplete[0];
              let auto_text = [];
              for (let ii = 0; ii < autocomplete.length; ++ii) {
                let elem = autocomplete[ii];
                auto_text.push(`/${elem.cmd} - ${elem.help}`);
              }
              let do_selection = false; // should we allow clicking in the tooltip?
              if (autocomplete.length === 1 &&
                first.cname &&
                cmd_parse.canonical(cur_text.slice(1)).slice(0, first.cname.length) === first.cname
              ) {
                // we've typed something that matches the first one
                if (first.usage) {
                  auto_text = first.usage.split('\n');
                } else {
                  auto_text = [first.help];
                }
              } else {
                do_selection = true;
              }
              let tooltip_y = y;
              // check if last message is an error, if so, tooltip above that.
              let last_msg = this.msgs[this.msgs.length - 1];
              if (last_msg) {
                let msg = last_msg.msg;
                if (msg && msg.slice(0, 7) === '[error]') {
                  let numlines = last_msg.numlines;
                  tooltip_y -= font_height * numlines + SPACE_ABOVE_ENTRY;
                }
              }

              help_tooltip_up = true;
              let selected = drawHelpTooltip({
                x, y: tooltip_y,
                tooltip_width: max(w, engine.game_width * 0.8),
                tooltip: auto_text,
                do_selection,
                font_height: min(font_height, camera2d.w() / 30),
              });
              if (do_selection) {
                // auto-completes to something different than we have typed
                // Do not use ENTER as well, because sometimes a hidden command is a sub-string of a shown command?
                if (pressed_tab || selected) {
                  this.edit_text_entry.setText(`/${selected || first.cmd} `);
                }
              }
            }
          }
        } else {
          this.history.resetPos();
        }
        if (input.keyDownEdge(input.KEYS.UP)) {
          this.edit_text_entry.setText(this.history.prev(cur_text));
        }
        if (input.keyDownEdge(input.KEYS.DOWN)) {
          this.edit_text_entry.setText(this.history.next(cur_text));
        }
      }
      let input_height = font_height;
      let input_width = w;
      if (input.touch_mode && !was_focused) {
        y -= font_height * 2;
        input_height = font_height * 3;
        input_width = font_height * 6;
      }
      let res = this.edit_text_entry.run({
        x, y, w: input_width, font_height: input_height, pointer_lock: opts.pointerlock
      });
      is_focused = this.edit_text_entry.isFocused();
      if (res === this.edit_text_entry.SUBMIT) {
        let text = this.edit_text_entry.getText().trim();
        if (text) {
          this.edit_text_entry.setText('');
          if (text[0] === '/') {
            if (text[1] === '/') { // common error of starting with //foo because chat was already focused
              text = text.slice(1);
            }
            this.history.add(text);
            this.cmdParse(text.slice(1), () => {
              ui.playUISound('msg_out_err');
              if (!this.edit_text_entry.getText()) {
                this.history.unadd(text);
                this.edit_text_entry.setText(text);
              }
              if (!is_focused) { // was auto-unfocused
                this.edit_text_entry.focus();
              }
            });
          } else {
            if (!net.client.connected) {
              this.addChat('[error] Cannot chat: Disconnected');
            } else if (!this.channel || !net.subs.loggedIn()) {
              this.addChat('[error] Cannot chat: Must be logged in');
            } else if (text.length > this.max_len) {
              this.addChat('[error] Chat message too long');
            } else {
              this.channel.send('chat', { msg: text }, { broadcast: true }, (err) => {
                if (err) {
                  this.addChat(`[error] ${err}`);
                  // if (!this.edit_text_entry.getText()) {
                  //   this.edit_text_entry.setText(text);
                  // }
                }
              });
            }
          }
          ui.playUISound('msg_out'); // after cmdParse may have adjust volume
          if (settings.chat_auto_unfocus) {
            is_focused = false;
            ui.focusCanvas();
          }
        } else {
          is_focused = false;
          ui.focusCanvas();
        }
      }
      if (opts.pointerlock && is_focused && input.pointerLocked()) {
        // Gained focus undo pointerlock
        input.pointerLockExit();
      }
      if (is_focused && was_focused && input.mouseDownEdge({ peek: true })) {
        // On touch, tapping doesn't always remove focus from the edit box!
        // Maybe this logic should be in the editbox logic?
        ui.focusCanvas();
      }
    }
  }
  y -= SPACE_ABOVE_ENTRY;

  let { url_match, url_info, styles } = this;
  let self = this;
  // Slightly hacky: uses `x` and `y` from the higher scope
  function drawChatLine(msg, alpha) {
    let line = msg.msg;
    let numlines = msg.numlines;
    let is_url = url_match && matchAll(line, url_match);
    is_url = is_url && is_url.length === 1 && is_url[0];
    let url_label = is_url;
    if (is_url && url_info) {
      let m = is_url.match(url_info);
      if (m) {
        url_label = m[1];
      }
    }
    let h = font_height * numlines;
    let click;
    if (is_url) {
      click = link({ x, y, w, h, url: is_url, internal: true });
    }
    let mouseover = input.mouseOver({ x, y, w, h, peek: true }) && !input.mousePosIsTouch();
    let style = styles[msg.style || (is_url ? mouseover ? 'link_hover' : 'link' : 'def')];
    ui.font.drawSizedWrapped(glov_font.styleAlpha(style, alpha), x, y, z + 1, w, INDENT, font_height, line);
    if (mouseover) {
      ui.drawTooltip({
        x, y, z: Z.TOOLTIP - 5,
        tooltip_above: true,
        tooltip_width: 350,
        tooltip_pad: ui.tooltip_pad * 0.5,
        tooltip: is_url ?
          `Click to open ${url_label}` :
          `Received at ${conciseDate(new Date(msg.timestamp))}\nRight-click to copy`,
        pixel_scale: ui.tooltip_panel_pixel_scale * 0.5,
      });
    }
    // mouseDownEdge because by the time the Up happens, the chat text might not be here anymore
    click = click || input.mouseDownEdge({ x, y, w, h });
    if (click) {
      if (click.button === 2) {
        ui.provideUserString('Chat Text', is_url ? 'URL' : 'Text', is_url || line);
      } else if (is_url) {
        self.cmdParseInternal(`url ${url_label}`);
      }
    }
    anything_visible = true;
  }


  let now = Date.now();
  if (is_focused) {
    // within scroll area, just draw visible parts
    let scroll_internal_h = this.total_lines * font_height;
    let scroll_external_h = min(this.h, scroll_internal_h);
    this.scroll_area.begin({
      x, y: y - scroll_external_h, z,
      w: this.w + 8,
      h: scroll_external_h,
      background_color: null,
      auto_scroll: true,
    });
    let x_save = x;
    let y_save = y;
    x = 0;
    y = 0;
    for (let ii = 0; ii < this.msgs.length; ++ii) {
      let msg = this.msgs[ii];
      drawChatLine(msg, 1);
      y += font_height * msg.numlines;
    }
    this.scroll_area.end(scroll_internal_h);
    x = x_save;
    y = y_save - scroll_external_h;
  } else {
    // Just recent entries, fade them out over time
    let { max_lines } = this;
    for (let ii = 0; ii < this.msgs.length; ++ii) {
      let msg = this.msgs[this.msgs.length - ii - 1];
      let age = now - msg.timestamp;
      let alpha = 1 - clamp((age - FADE_START_TIME[hide_light]) / FADE_TIME[hide_light], 0, 1);
      if (!alpha) {
        break;
      }
      let numlines = msg.numlines;
      if (numlines > max_lines && ii) {
        break;
      }
      max_lines -= numlines;
      let h = font_height * numlines;
      y -= h;
      drawChatLine(msg, alpha);
    }
  }

  if (!anything_visible && (ui.modal_dialog || ui.menu_up || hide_light)) {
    return;
  }
  let border = 8;
  ui.drawRect(camera2d.x0(), y - border, x + w + border + 8, y0, z, [0.3,0.3,0.3,0.75]);
  if (was_focused && !help_tooltip_up) {
    input.mouseConsumeClicks({
      x: camera2d.x0(),
      y: y - border,
      w: x + w + border + 8 - camera2d.x0(),
      h: y0 - (y - border),
    });
  }
};

ChatUI.prototype.setChannel = function (channel) {
  if (channel === this.channel) {
    return;
  }
  if (this.channel) {
    this.addChat(`Left channel ${this.channel.channel_id}`);
    this.channel.removeMsgHandler('chat', this.on_chat);
    this.channel.removeMsgHandler('join', this.on_join);
    this.channel.removeMsgHandler('leave', this.on_leave);
  }
  this.channel = channel;
  if (this.channel) {
    channel.onMsg('chat', this.on_chat);
    channel.onMsg('join', this.on_join);
    channel.onMsg('leave', this.on_leave);
    this.addChat(`Joined channel ${this.channel.channel_id}`);
    channel.onceSubscribe((data) => {
      let clients = data && data.public && data.public.clients;
      if (clients) {
        let here = [];
        for (let client_id in clients) {
          if (client_id === net.client.id) {
            continue;
          }
          let client = clients[client_id];
          if (client.ids) {
            here.push(client.ids.display_name || client.ids.user_id || client_id);
          }
        }
        if (here.length) {
          this.addChatFiltered(`Other users already here: ${here.join(', ')}`);
        }
      }
    });
  }
};

export function create(params) {
  profanityStartup();
  return new ChatUI(params);
}
