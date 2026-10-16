import { actionEdge } from 'glov/client/actions';
import { AnimationSequencer, animationSequencerCreate } from 'glov/client/animation';
import { autoAtlas } from 'glov/client/autoatlas';
import { DEBUG, setState } from 'glov/client/engine';
import { ALIGN, fontStyle, fontStyleColored } from 'glov/client/font';
import { eatAllInput, mouseDownAnywhere } from 'glov/client/input';
import { scoresDraw } from 'glov/client/score_ui';
import { SPOT_NAV_DOWN, SPOT_NAV_UP } from 'glov/client/spot';
import { button, buttonText, drawRect, uiButtonHeight, uiButtonWidth, uiGetFont, uiTextHeight } from 'glov/client/ui';
import { game_height, game_width } from './globals';
import {
  canLoad,
  loadGame,
  newGameInit,
  queueTransition,
  Score,
  scoreSystem,
} from './main';
import { tickMusic } from './music';
import { optionsMenu } from './options';
import { PAL_GREEN, palette, palette_font } from './palette';

const { floor } = Math;

const MENU_VOLUME = 0.25;

export function titleMusic(): void {
  tickMusic('menu', MENU_VOLUME);
}

const SCORE_COLUMNS = [
  // widths are just proportional, scaled relative to `width` passed in
  { name: '', width: 4, align: ALIGN.HFIT | ALIGN.HRIGHT | ALIGN.VCENTER },
  { name: 'Name', width: 16, align: ALIGN.HFIT | ALIGN.VCENTER },
  { name: 'A', width: 8 },
  { name: 'B', width: 8 },
];

function myScoreToRow(row: unknown[], score: Score): void {
  row.push(`${score.a}`, `${score.b}`);
}

const style_title = fontStyle(null, {
  color: palette_font[0],
  outline_color: palette_font[3],
  outline_width: 2.5,
});

function stateScores(dt: number): void {
  titleMusic();
  // let black = palette[PAL_BLACK];
  // gl.clearColor(black[0], black[1], black[2], 1);
  const style_score = fontStyleColored(null, palette_font[7]);
  const style_me = fontStyleColored(null, palette_font[14]);
  const style_header = fontStyleColored(null, palette_font[10]);

  drawRect(0, 0, game_width, game_height, 1, palette[1]);

  let x = 0;
  let y = 2;
  const CHW = 8;
  const CHH = 9;
  let font = uiGetFont();

  font.draw({
    style: style_title,
    x: 0,
    y,
    w: game_width,
    text: 'HIGH SCORES',
    size: CHH,
    align: ALIGN.HCENTER,
  });
  y += CHH + 2;

  let w = game_width;
  let text_height = uiTextHeight();
  scoresDraw<Score>({
    score_system: scoreSystem(),
    allow_rename: true,
    x,
    width: w,
    y,
    height: game_height - y + 8,
    z: Z.UI,
    size: text_height,
    line_height: text_height + 2,
    level_index: 0,
    columns: SCORE_COLUMNS,
    scoreToRow: myScoreToRow,
    style_score,
    style_me,
    style_header,
    color_line: palette[3],
    color_me_background: palette[0],
    rename_button_size: 6,
    rename_button_offset: 0/text_height,
  });

  if (buttonText({
    x: 1,
    y: 1,
    w: CHW * 4,
    text: 'Back',
    hotaction: 'cancel',
  })) {
    queueTransition();
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    setState(stateTitle);
  }
}

let title_anim: AnimationSequencer | null = null;
let title_alpha = {
  title: 0,
  sub: 0,
  button: 0,
};
let inited_once = false;
function stateTitleInit(): void {
  if (inited_once) {
    return;
  }
  inited_once = true;
  title_anim = animationSequencerCreate();
  let t = 0;

  t = title_anim.add(0, 400, (progress) => {
    title_alpha.title = progress;
  });
  t = title_anim.add(t, 300, (progress) => {
    title_alpha.sub = progress;
  });
  title_anim.add(t, 300, (progress) => {
    title_alpha.button = progress;
  });
}

function stateTitle(dt: number): void {
  titleMusic();
  let font = uiGetFont();
  let text_height = uiTextHeight();

  let W = game_width;
  let H = game_height;

  if (title_anim && (mouseDownAnywhere() || actionEdge('accept') || DEBUG)) {
    title_anim.update(Infinity);
    title_anim = null;
  }
  if (title_anim) {
    if (!title_anim.update(dt)) {
      title_anim = null;
    } else {
      eatAllInput();
    }
  }

  let y = 30;

  if (0) {
    autoAtlas('gfx', 'title').draw({
      x: (game_width - 128) / 2,
      y: -8,
      w: 128,
      h: 80,
      color: [1, 1, 1, title_alpha.title],
    });
  } else {
    font.draw({
      color: palette_font[PAL_GREEN],
      alpha: title_alpha.title,
      size: text_height * 4,
      x: 0,
      y: H * 0.2,
      w: W,
      align: ALIGN.HCENTER,
      text: 'Game Title',
    });
  }

  font.draw({
    color: palette_font[0],
    alpha: title_alpha.sub,
    x: 0,
    y: H - text_height * 2,
    w: W,
    align: ALIGN.HCENTER | ALIGN.HWRAP,
    text: 'By Jimb Esser for Ludum Dare XX',
  });

  if (title_alpha.button) {
    let button_w = uiButtonWidth();
    let button_x = floor((W - button_w) / 2);
    let button_h = uiButtonHeight();
    let pad = 2;
    let button_param = {
      x: button_x,
      w: button_w,
      h: button_h,
      align: ALIGN.HCENTER,
      alpha: title_alpha.button,
    };

    y = game_height / 2 - 4;

    if (button({
      ...button_param,
      key: 'continue',
      y,
      text: 'Continue',
      disabled: !canLoad(),
      custom_nav: {
        [SPOT_NAV_UP]: 'lastbutton',
      },
      auto_focus: true,
    })) {
      queueTransition();
      loadGame();
    }
    y += button_h + pad;

    if (buttonText({
      ...button_param,
      key: 'newgame',
      y,
      custom_nav: {
        [SPOT_NAV_UP]: canLoad() ? 'continue' : 'lastbutton',
      },
      text: canLoad() ? 'New Game' : 'Start Game',
      auto_focus: !canLoad(),
    })) {
      queueTransition();
      newGameInit();
    }
    y += button_h + pad;

    if (buttonText({
      ...button_param,
      y,
      text: 'Options',
    })) {
      queueTransition();
      optionsMenu('title');
    }
    y += button_h + pad;

    if (buttonText({
      ...button_param,
      key: 'lastbutton',
      y,
      text: 'High Scores',
      custom_nav: {
        [SPOT_NAV_DOWN]: canLoad() ? 'continue' : 'newgame',
      },
    })) {
      queueTransition();
      setState(stateScores);
    }
    y += button_h + pad;
  }
}

export function titleInit(): void {
  stateTitleInit();
  setState(stateTitle);
}

export function hiScoresInit(): void {
  setState(stateScores);
}
