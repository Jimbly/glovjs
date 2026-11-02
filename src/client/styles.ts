import { fontStyle } from 'glov/client/font';

export const style_floater = fontStyle(null, {
  color: 0xFFFFFFff,
  outline_width: 4,
  outline_color: 0x000000ff,
});

export const style_text = fontStyle(null, {
  color: 0xFFFFFFff,
  outline_width: 4,
  outline_color: 0x000000ff,
});
export const style_damage = style_text;
export const style_incoming_miss = style_text;
export const style_incoming_damage = style_text;

export const style_hotkey = fontStyle(style_text, {
  color: 0x80FF80ff,
});
