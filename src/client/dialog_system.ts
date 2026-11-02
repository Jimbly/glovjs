import assert from 'assert';
import { actionDown, ActionKey } from 'glov/client/actions';
import {
  ALIGN,
  Font,
  FontStyle,
  fontStyle,
} from 'glov/client/font';
import {
  ANY,
  eatAllInput,
  inputClick,
  inputPadMode,
  inputTouchMode,
  keyDown,
  KEYS,
  keyUpEdge,
  mouseDownAnywhere,
  padButtonDown,
  padButtonUpEdge,
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
  playUISound,
  suppressNewDOMElemWarnings,
  UIBox,
  uiButtonHeight,
  uiFontStyleNormal,
  uiGetFont,
  uiTextHeight,
} from 'glov/client/ui';
import { dataError } from 'glov/common/data_error';
import { TSMap, WithRequired } from 'glov/common/types';
import { merge } from 'glov/common/util';
import {
  v2manhattanDist,
  vec4,
} from 'glov/common/vmath';
import { CrawlerScriptAPI } from '../common/crawler_script';
import { JSVec3 } from '../common/crawler_state';
import { buildModeActive } from './crawler_build_mode';
import { crawlerMyEnt } from './crawler_entity_client';
import { crawlerScriptAPI } from './crawler_play';
import { FONT_HEIGHT } from './globals';
import { GameSoundID } from './sound_data';

const { ceil, max, min, round } = Math;

const FADE_TIME = 1000;
const MS_PER_CHARACTER = 12;
const MS_PER_CHARACTER_CENTERED = 6;

let font: Font;

export type DialogButton = {
  label: string;
  cb?: string | (() => void);
  // hotkeys?: number[]; // deprecated: use actions
  hotactions?: ActionKey[];
  sound?: GameSoundID;
};
export type DialogParam = {
  name?: string;
  image?: Sprite; // single float-left image
  image_height?: number;
  text: string;
  font_style?: FontStyle;
  transient?: boolean;
  transient_long?: boolean;
  transient_dist?: number; // don't treat as moved until we've moved than this dist (default 0)
  auto_fade?: number; // for a transient, automatically start fading after this much time
  custom_render?: (param: PanelParam) => void;
  instant?: boolean;
  buttons?: DialogButton[];
  panel_sprite?: Sprite;
  flags?: TSMap<boolean>;
};

let active_dialog: DialogParam | null = null;
class DialogState {
  pos = crawlerMyEnt().getData<JSVec3>('pos')!.slice(0) as JSVec3;
  floor_id = crawlerMyEnt().getData<number>('floor');
  fade_time = 0;
  counter = 0;
  ff_down = true;
  buttons_vis = false;
}
let active_state: DialogState;


let temp_color = vec4(1, 1, 1, 1);

let style_default = fontStyle(null, { color: 0x000000ff });
let panel_sprite_default: Sprite | undefined;
let panel_pixel_scale: number | undefined;
function dialogDefaultTextStyle(param: DialogParam): FontStyle {
  return param.font_style || style_default;
}
type DialogTextStyleCB = (dialog: DialogParam) => FontStyle;
let text_style_cb: DialogTextStyleCB = dialogDefaultTextStyle;

export function dialogTextStyle(): FontStyle {
  return style_default;
}


type DialogNameRenderCB = (dialog: WithRequired<DialogParam, 'name'>, panel: PanelParam) => void;
let name_render_cb: DialogNameRenderCB | null = null;

function ff(): boolean {
  return Boolean(actionDown('accept') || actionDown('cancel') || actionDown('move_mod') ||
    mouseDownAnywhere() || inputClick());
}

export function dialogActive(): boolean {
  return Boolean(active_dialog);
}

export function dialogMoveLocked(): boolean {
  return Boolean(active_dialog && !active_dialog.transient);
}

export function dialogFlag(flag: string): boolean {
  return Boolean(active_dialog && active_dialog.flags && active_dialog.flags[flag]);
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
  w: number;
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
  if (dims_split_cache && dims_split_cache.text === text && dims_split_cache.w === w) {
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
    w,
    text,
    ret,
  };
  return ret;
}

export function pressAnyKey(): boolean {
  return Boolean(
    inputClick() ||
    keyUpEdge(ANY) ||
    padButtonUpEdge(ANY)
  );
}

export function anyKeyDown(): boolean {
  return Boolean(
    mouseDownAnywhere() ||
    keyDown(ANY) ||
    padButtonDown(ANY)
  );
}

const BUTTON_PAD = 1;
let seen_no_key_down = false;
export function dialogRun(
  dt: number,
  viewport: UIBox & {
    pad_lr: number;
    pad_top: number;
    pad_bottom: number;
    pad_bottom_with_buttons: number;
    pad_image?: number;
  },
  suppress_transient: boolean,
): boolean {
  if (buildModeActive()) {
    active_dialog = null;
  }
  let { x, y, w, h, z, pad_top, pad_bottom, pad_bottom_with_buttons, pad_lr, pad_image } = viewport;
  const HPAD = pad_lr; // default 4
  const BUTTON_HEAD = HPAD;
  z = z || Z.DIALOG || Z.STATUS;
  if (!active_dialog) {
    seen_no_key_down = false;
    return false;
  }
  if (!anyKeyDown()) {
    seen_no_key_down = true;
  }
  let {
    transient,
    transient_long,
    transient_dist,
    custom_render,
    text,
    name,
    buttons,
    panel_sprite,
    image,
    image_height,
    auto_fade,
  } = active_dialog;
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
    let my_floor = crawlerMyEnt().getData<number>('floor')!;
    transient_dist = transient_dist || 0;
    if (
      v2manhattanDist(my_pos, active_state.pos) > transient_dist ||
      active_state.floor_id !== my_floor
    ) {
      active_state.fade_time = transient_long ? 3000 : FADE_TIME;
    }
  }
  if (auto_fade && !active_state.fade_time && (counter >= auto_fade || seen_no_key_down && anyKeyDown())) {
    active_state.fade_time = FADE_TIME;
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
  let just_pak = num_buttons === 1 && !buttons![0].label;
  if (num_buttons && !just_pak) {
    pad_bottom = pad_bottom_with_buttons;
  }
  let button_h = uiButtonHeight();
  let button_w = w - HPAD * 2;
  let button_align: ALIGN | undefined;
  if (num_buttons === 1) {
    let button_label_lines = font.numLines(uiFontStyleNormal(), button_w, 0,
      uiTextHeight(), buttons![0].label);
    if (button_label_lines > 1) {
      button_align = ALIGN.HWRAP | ALIGN.HVCENTER;
      button_h = button_h - FONT_HEIGHT + FONT_HEIGHT * button_label_lines;
    }
  }
  let buttons_h = just_pak ? 0 :
    (num_buttons * button_h + (num_buttons ? BUTTON_HEAD + (num_buttons - 1) * BUTTON_PAD : 0));
  const text_height = uiTextHeight();
  let size = text_height;
  let line_height = size;

  let image_h = image ? image_height || line_height : 0;
  let image_w = image ? image.getAspect() * image_h : 0;
  let left_indent = image_w ? image_w + (pad_image || pad_lr) : 0;

  let style = text_style_cb(active_dialog);
  let align = transient ? ALIGN.HCENTER|ALIGN.HWRAP : ALIGN.HLEFT|ALIGN.HWRAP;
  let dims = dimsSplit(style, align, w - HPAD * 2 - left_indent, size, line_height, text);
  let text_h = max(dims.h, image_h);
  y += h - text_h - pad_bottom - buttons_h;
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
  if (image) {
    image.draw({
      x: x + HPAD,
      y: yy,
      z,
      w: image_w,
      h: image_h,
      color: [1,1,1,alpha],
    });
  }
  markdownAuto({
    font,
    font_style: style,
    text_height: size,
    line_height,
    x: x + HPAD + left_indent,
    y: yy,
    z,
    w: w - HPAD * 2 - left_indent,
    align,
    text: text_to_draw,
    alpha,
  });
  yy = y + text_h + BUTTON_HEAD;

  let active_dialog_non_null = active_dialog;
  if (text_full && !active_state.ff_down) {
    if (just_pak) {
      // just "press any key"
      let button = buttons![0];
      if (pressAnyKey()) {
        playUISound(button.sound || 'button_click');
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
      yy += button_h + BUTTON_PAD;
    } else {
      for (let ii = 0; ii < num_buttons; ++ii) {
        let button = buttons![ii];
        let hotkeys = [];
        if (ii < 10) {
          hotkeys.push(KEYS['1'] + ii);
        }
        // if (button.hotkeys) {
        //   hotkeys = hotkeys.concat(button.hotkeys);
        // }
        let hotactions: ActionKey[] = [];
        if (button.hotactions) {
          hotactions = hotactions.concat(button.hotactions);
        }
        if (num_buttons === 1) {
          hotactions.push('accept', 'cancel');
        }

        if (buttonText({
          auto_focus: ii === 0,
          focus_steal: ii === 0 && (num_buttons === 1 || !buttons_vis) && inputPadMode(),
          text: button.label,
          x: x + HPAD,
          w: button_w,
          h: button_h,
          y: yy,
          z,
          align: button_align,
          markdown: true,
          hotactions,
          hotkeys,
          sound: button.sound,
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
        yy += button_h + BUTTON_PAD;
      }
    }
    active_state.buttons_vis = true;
  }

  temp_color[3] = alpha;
  let panel_param: PanelParam;
  if (transient && (text_h === text_height || text_h === line_height)) {
    let text_w = dims.w;
    panel_param = {
      x: x + round((w - text_w)/2) - HPAD,
      y: y - pad_top, z: z - 1,
      w: text_w + HPAD * 2,
      h: text_h + pad_top + pad_bottom,
      color: temp_color,
      sprite: panel_sprite || panel_sprite_default,
      pixel_scale: panel_pixel_scale,
    };
  } else {
    panel_param = {
      x,
      y: y - pad_top, z: z - 1,
      w,
      h: text_h + pad_top + pad_bottom + buttons_h,
      color: temp_color,
      sprite: panel_sprite || panel_sprite_default,
      pixel_scale: panel_pixel_scale,
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
    if (param.auto_fade) {
      param.auto_fade += 10000000;
    }
  }
}

export function dialogReset(): void {
  active_dialog = null;
}

export function dialogFade(): void {
  assert(active_dialog && active_dialog.transient);
  active_state.fade_time = min(active_state.fade_time, FADE_TIME) || FADE_TIME;
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

export function dialogExists(id: string): boolean {
  return Boolean(DIALOGS[id]);
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
  style_default?: FontStyle;
  panel_sprite_default?: Sprite;
  panel_pixel_scale?: number;
  text_style_cb?: DialogTextStyleCB;
  name_render_cb?: DialogNameRenderCB;
}): void {
  font = param.font || uiGetFont();
  text_style_cb = param.text_style_cb || dialogDefaultTextStyle;
  name_render_cb = param.name_render_cb || null;
  style_default = param.style_default || style_default;
  panel_sprite_default = param.panel_sprite_default;
  panel_pixel_scale = param.panel_pixel_scale;
}
