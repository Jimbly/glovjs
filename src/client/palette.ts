import { fontStyle, fontStyleColored, vec4ColorFromIntColor } from 'glov/client/font';
import { vec4 } from 'glov/common/vmath';

export const palette_font = [
  0x040405FF,
  0x1d28ccFF,
  0x487617FF,
  0x17bbd3FF,
  0x8e1c3eFF,
  0x823dbaFF,
  0xb96c3dFF,
  0x8a8a99FF,
  0x4a4842FF,
  0x8294edFF,
  0x69ba36FF,
  0x9fe4fcFF,
  0xe93d4cFF,
  0xef75ffFF,
  0xedd14bFF,
  0xfffffeFF,
];

export const palette = palette_font.map((hex) => {
  return vec4ColorFromIntColor(vec4(), hex);
});

export const PAL_BLACK = 0;
export const PAL_BLUE_DARK = 1;
export const PAL_GREEN_DARK = 2;
export const PAL_CYAN_DARK = 3;
export const PAL_RED_DARK = 4;
export const PAL_MAGENTA_DARK = 5;
export const PAL_ORANGE = 6;
export const PAL_GREY = 7;
export const PAL_GREY2 = 8;
export const PAL_BLUE = 9;
export const PAL_GREEN = 10;
export const PAL_CYAN = 11;
export const PAL_RED = 12;
export const PAL_MAGENTA = 13;
export const PAL_YELLOW = 14;
export const PAL_WHITE = 15;
export const PAL_BORDER = 0;

export const font_style_default = fontStyle(null, {
  color: palette_font[PAL_WHITE],
});

export const font_styles = palette_font.map((hex) => {
  return fontStyleColored(font_style_default, hex);
});
