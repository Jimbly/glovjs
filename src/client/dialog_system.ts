import assert from 'assert';
import {
  ALIGN,
  Font,
  FontStyle,
  fontStyle,
} from 'glov/client/font';
import {
  eatAllInput,
  inputClick,
  inputPadMode,
  inputTouchMode,
  keyDown,
  KEYS,
  mouseDownAnywhere,
  PAD,
  padButtonDown,
} from 'glov/client/input';
import {
  markdownAuto,
  markdownDims,
  markdownPrep,
} from 'glov/client/markdown';
import {
  MDASTNode,
  mdParse,
} from 'glov/client/markdown_parse';
import { Sprite } from 'glov/client/sprites';
import {
  buttonText,
  panel,
  PanelParam,
  suppressNewDOMElemWarnings,
  UIBox,
  uiButtonHeight,
  uiTextHeight,
} from 'glov/client/ui';
import { dataError } from 'glov/common/data_error';
import { WithRequired } from 'glov/common/types';
import { merge } from 'glov/common/util';
import {
  v2same,
  vec4,
} from 'glov/common/vmath';
import { CrawlerScriptAPI } from '../common/crawler_script';
import { JSVec2, JSVec3 } from '../common/crawler_state';
import { buildModeActive } from './crawler_build_mode';
import { crawlerMyEnt } from './crawler_entity_client';
import { crawlerScriptAPI } from './crawler_play';

const { ceil, min, round } = Math;

const FADE_TIME = 1000;
const MS_PER_CHARACTER = 12;
const MS_PER_CHARACTER_CENTERED = 6;

export type DialogButton = {
  label: string;
  cb?: string | (() => void);
};
export type DialogParam = {
  name?: string;
  text: string;
  font_style?: FontStyle;
  transient?: boolean;
  transient_long?: boolean;
  custom_render?: (param: PanelParam) => void;
  instant?: boolean;
  buttons?: DialogButton[];
  panel_sprite?: Sprite;
};

let active_dialog: DialogParam | null = null;
class DialogState {
  pos: JSVec2 = crawlerScriptAPI().pos.slice(0) as JSVec2;
  fade_time = 0;
  counter = 0;
  ff_down = true;
  buttons_vis = false;
}
let active_state: DialogState;


let temp_color = vec4(1, 1, 1, 1);

let style_default = fontStyle(null, { color: 0x000000ff });
function dialogDefaultTextStyle(param: DialogParam): FontStyle {
  return param.font_style || style_default;
}
type DialogTextStyleCB = (dialog: DialogParam) => FontStyle;
let text_style_cb: DialogTextStyleCB = dialogDefaultTextStyle;


type DialogNameRenderCB = (dialog: WithRequired<DialogParam, 'name'>, panel: PanelParam) => void;
let name_render_cb: DialogNameRenderCB | null = null;

function ff(): boolean {
  return keyDown(KEYS.SPACE) || keyDown(KEYS.ENTER) ||
    inputPadMode() && (
      padButtonDown(PAD.LEFT_TRIGGER) || padButtonDown(PAD.RIGHT_TRIGGER) ||
      padButtonDown(PAD.A) || padButtonDown(PAD.B)
    ) || mouseDownAnywhere() || inputClick();
}


export function dialogMoveLocked(): boolean {
  return Boolean(active_dialog && !active_dialog.transient);
}

function mdTruncate(tree: MDASTNode[], state: { cch: number }): string {
  let ret = [];
  for (let ii = 0; state.cch && ii < tree.length; ++ii) {
    let elem = tree[ii];
    if (elem.type === 'paragraph') {
      ret.push(mdTruncate(elem.content, state));
      if (!state.cch) {
        break;
      }
      --state.cch;
      ret.push('\n\n');
    } else if (elem.type === 'strong' || elem.type === 'em') {
      if (!--state.cch) {
        break;
      }
      ret.push(elem.type === 'strong' ? '**' : '*');
      ret.push(mdTruncate(elem.content, state));
      ret.push(elem.type === 'strong' ? '**' : '*');
    } else if (elem.type === 'text') {
      if (elem.content.length >= state.cch) {
        ret.push(elem.content.slice(0, state.cch));
        state.cch = 0;
        break;
      }
      ret.push(elem.content);
      state.cch -= elem.content.length;
    } else if (elem.type === 'renderable') {
      if (!--state.cch) {
        break;
      }
      ret.push(elem.content.orig_text);
    } else {
      // Some other markdown element, need to know how to truncate its contents
      //   and restore the wrapping formatting.
      assert(false);
    }
  }
  return ret.join('');
}

type DimsSplitRet = {
  w: number;
  h: number;
  tree: MDASTNode[];
};
let dims_split_cache: {
  text: string;
  ret: DimsSplitRet;
};
function dimsSplit(
  style: FontStyle,
  align: ALIGN,
  w: number,
  size: number,
  line_height: number,
  text: string
): DimsSplitRet {
  if (dims_split_cache && dims_split_cache.text === text) {
    return dims_split_cache.ret;
  }
  let md_param = {
    cache: {},
    font_style: style,
    w,
    text_height: size,
    line_height,
    text: text,
    align,
  };
  markdownPrep(md_param);
  let dims = markdownDims(md_param);
  let tree = mdParse(text);

  let ret: DimsSplitRet = {
    w: dims.w,
    h: dims.h,
    tree,
  };
  dims_split_cache = {
    text,
    ret,
  };
  return ret;
}


const HPAD = 4;
const BUTTON_HEAD = 4;
const BUTTON_PAD = 1;
export function dialogRun(dt: number, viewport: UIBox & { pad_top: number; pad_bottom: number },
  suppress_transient: boolean,
): boolean {
  if (buildModeActive()) {
    active_dialog = null;
  }
  let { x, y, w, h, z, pad_top, pad_bottom } = viewport;
  z = z || Z.DIALOG || Z.STATUS;
  if (!active_dialog) {
    return false;
  }
  let { transient, transient_long, custom_render, text, name, buttons, panel_sprite } = active_dialog;
  if (transient && suppress_transient) {
    active_dialog = null;
    return false;
  }
  if (name) {
    if (!name_render_cb) {
      text = `${name}: ${text}`;
    }
  }
  active_state.counter += dt;
  let { buttons_vis, counter } = active_state;
  if (transient && !active_state.fade_time) {
    let my_pos = crawlerMyEnt().getData<JSVec3>('pos')!;
    if (!v2same(my_pos, active_state.pos)) {
      active_state.fade_time = transient_long ? 3000 : FADE_TIME;
    }
  }
  let alpha = 1;
  if (active_state.fade_time) {
    if (dt >= active_state.fade_time) {
      active_dialog = null;
      return false;
    }
    active_state.fade_time -= dt;
    alpha = min(1, active_state.fade_time / FADE_TIME);
  }

  let num_buttons = buttons && buttons.length || 0;
  let buttons_h = num_buttons * uiButtonHeight() + (num_buttons ? BUTTON_HEAD + (num_buttons - 1) * BUTTON_PAD : 0);
  const text_height = uiTextHeight();
  let size = text_height;
  let line_height = size;
  let style = text_style_cb(active_dialog);
  let align = transient ? ALIGN.HCENTER|ALIGN.HWRAP : ALIGN.HLEFT|ALIGN.HWRAP;
  let dims = dimsSplit(style, align, w - HPAD * 2, size, line_height, text);
  y += h - dims.h - pad_bottom - buttons_h;
  let text_len = ceil(counter / (transient ? MS_PER_CHARACTER_CENTERED : MS_PER_CHARACTER));
  let text_definitely_full = text_len >= (text.length + 20);
  let text_to_draw = text;
  let text_full = text_definitely_full;
  if (!text_definitely_full) {
    let state = { cch: text_len };
    let truncated = mdTruncate(dims.tree, state);
    if (!state.cch) {
      // was truncated
      text_to_draw = truncated;
      suppressNewDOMElemWarnings();
    } else if (state.cch >= 20) {
      text_full = true;
    }
  }
  if (!transient) {
    if (!text_full && !active_state.ff_down) {
      if (ff()) {
        active_state.ff_down = true;
        text_full = true;
        active_state.counter += 10000000;
      }
    }
    if (active_state.ff_down) {
      // Eat these keys until released
      active_state.ff_down = ff();
    }
  }
  let yy = y;
  markdownAuto({
    font_style: style,
    text_height: size,
    line_height,
    x: x + HPAD,
    y: yy,
    z,
    w: w - HPAD * 2,
    align,
    text: text_to_draw,
    alpha,
  });
  yy = y + dims.h + BUTTON_HEAD;

  let active_dialog_non_null = active_dialog;
  if (text_full && !active_state.ff_down) {
    for (let ii = 0; ii < num_buttons; ++ii) {
      let button = buttons![ii];
      if (buttonText({
        auto_focus: ii === 0,
        focus_steal: ii === 0 && (num_buttons === 1 || !buttons_vis),
        text: button.label,
        x: x + 4,
        w: w - HPAD * 2,
        y: yy,
        z,
        markdown: true,
      })) {
        active_dialog = null;
        if (button.cb) {
          if (typeof button.cb === 'string') {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            dialog(button.cb);
          } else {
            button.cb();
          }
        }
      }
      yy += uiButtonHeight() + BUTTON_PAD;
    }
    active_state.buttons_vis = true;
  }

  temp_color[3] = alpha;
  let panel_param: PanelParam;
  if (transient && (dims.h === text_height || dims.h === line_height)) {
    let text_w = dims.w;
    panel_param = {
      x: x + round((w - text_w)/2) - HPAD,
      y: y - pad_top, z: z - 1,
      w: text_w + HPAD * 2,
      h: dims.h + pad_top + pad_bottom,
      color: temp_color,
      sprite: panel_sprite,
    };
  } else {
    panel_param = {
      x,
      y: y - pad_top, z: z - 1,
      w,
      h: dims.h + pad_top + pad_bottom + buttons_h,
      color: temp_color,
      sprite: panel_sprite,
    };
  }
  if (name) {
    name_render_cb?.(active_dialog_non_null as WithRequired<DialogParam, 'name'>, panel_param);
  }
  custom_render?.(panel_param);
  panel(panel_param);

  if (!transient) {
    eatAllInput();
  }

  viewport.h = (y - pad_top) - viewport.y;
  return true;
}

export function dialogPush(param: DialogParam): void {
  active_dialog = param;
  active_state = new DialogState();
  if (param.instant) {
    active_state.counter += 10000000;
  }
}

export function dialogReset(): void {
  active_dialog = null;
}

export type DialogFunc = (param: string, script_api: CrawlerScriptAPI) => void;
let DIALOGS: Partial<Record<string, DialogFunc>> = {
  sign: function (param: string) {
    dialogPush({
      name: '',
      text: param,
      transient: true,
    });
  },
  modal: function (param: string) {
    dialogPush({
      name: '',
      text: param,
      buttons: [{
        label: 'Okay',
      }],
    });
  },
  kbhint: function (param: string) {
    if (!inputTouchMode()) {
      dialogPush({
        name: '',
        text: param,
        transient: true,
      });
    }
  },
};
export function dialogRegister(data: Record<string, DialogFunc>): void {
  merge(DIALOGS, data);
}


export function dialog(id: string, param?: string): void {
  let dlg = DIALOGS[id];
  if (!dlg) {
    dataError(`Unknown dialog "${id}"`);
    return;
  }
  dlg(param || '', crawlerScriptAPI());
}

export function dialogStartup(param: {
  font: Font;
  text_style_cb?: DialogTextStyleCB;
  name_render_cb?: DialogNameRenderCB;
}): void {
  text_style_cb = param.text_style_cb || dialogDefaultTextStyle;
  name_render_cb = param.name_render_cb || null;
}
