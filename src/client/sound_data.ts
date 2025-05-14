import { UISoundID } from 'glov/client/ui';

export const SOUND_DATA: Partial<Record<string, UISoundID | string | string[] | UISoundID[]>> = {
  // online multiplayer sounds, ignore these
  user_join: 'user_join',
  user_leave: 'user_leave',
  msg_in: 'msg_in',
  msg_err: 'msg_err',
  msg_out_err: 'msg_out_err',
  msg_out: 'msg_out',

  // UI sounds
  button_click: 'button_click',
  button_click2: { file: 'button_click', volume: 0.125 }, // touch movement controls - just hear footsteps
  // menus/general/etc
  rollover: { file: 'rollover', volume: 0.25 },

  // Game sounds - Examples
  // footstep: [{
  //   file: 'footstep/metal/metal_01',
  //   volume: 1,
  // }, {
  //   file: 'footstep/metal/metal_02',
  //   volume: 1,
  // }],
};
