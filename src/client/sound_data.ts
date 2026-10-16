import { GlovSoundPlayOpts } from 'glov/client/sound';
import { playUISound, UISoundID } from 'glov/client/ui';

export const SOUND_DATA = {
  // online multiplayer sounds, ignore these
  user_join: 'user_join',
  user_leave: 'user_leave',
  msg_in: 'msg_in',
  msg_err: 'msg_err',
  msg_out_err: 'msg_out_err',
  msg_out: 'msg_out',

  // UI sounds
  button_click: { file: 'button_click', volume: 0.5 },
  // menus/general/etc
  rollover: { file: 'rollover', volume: 0.25 },

  // game_event: 'game_event',

} satisfies Partial<Record<string, UISoundID | string | string[] | UISoundID[]>>;

export type GameSoundID = keyof typeof SOUND_DATA;

export function validSoundID(test: string): test is GameSoundID {
  return Boolean((SOUND_DATA as Partial<Record<string, unknown>>)[test]);
}

export function playSound(sound_id: GameSoundID, volume_or_opts?: number | GlovSoundPlayOpts): void {
  playUISound(sound_id, volume_or_opts);
}
