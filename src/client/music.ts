import assert from 'assert';
import { isInBackground, onEnterBackground } from 'glov/client/engine';
import * as settings from 'glov/client/settings';
import { GlovSoundSetUp, soundLoad, soundPlay, soundResumed } from 'glov/client/sound';
import type { TSMap } from 'glov/common/types';

let last_music_ref: GlovSoundSetUp | null;
let last_music_name: string | null = null;
let last_music_fading_out = false;
let playing_music_name: string | null = null;
let loading_music: TSMap<true> = {};
let loaded_music: TSMap<true> = {};
const FADE_OUT_CHANGE = 500;
const FADE_OUT_SILENCE = 5000;
const FADE_UP = 2500;
export function tickMusic(music_name: string | null): void {
  // if (!music_name && optionsMenuVisible()) {
  //   music_name = 'music_menu';
  // }
  if (!settings.volume || !settings.volume_music || isInBackground()) {
    music_name = null;
  }
  if (music_name) {
    music_name = `music/${music_name}`;
  }
  if (music_name && !loading_music[music_name]) {
    loading_music[music_name] = true;
    soundLoad(music_name, { loop: true }, function () {
      loaded_music[music_name!] = true;
    });
  }
  if (!soundResumed()) {
    return;
  }
  if (playing_music_name !== music_name) {
    if (last_music_ref) {
      if (last_music_ref.playing() && last_music_name === music_name) {
        assert(playing_music_name === null);
        assert(last_music_fading_out);
        // already playing the right music, it's just fading out
        last_music_ref.fade(1, FADE_UP);
        playing_music_name = last_music_name;
        last_music_fading_out = false;
      } else {
        if (!last_music_fading_out) {
          last_music_fading_out = true;
          last_music_ref.fade(0, music_name ? FADE_OUT_CHANGE : FADE_OUT_SILENCE);
          playing_music_name = null;
        }
        if (!last_music_ref.playing()) {
          last_music_ref = null;
          last_music_name = null;
        }
      }
    }
    if (!last_music_ref) { // finished fading out, can start something new
      if (music_name && loaded_music[music_name]) {
        last_music_ref = soundPlay(music_name, {
          volume: 0.01,
          as_music: true,
        });
        last_music_fading_out = false;
        if (last_music_ref) {
          last_music_ref.fade(1, FADE_UP);
          last_music_name = music_name;
          playing_music_name = music_name;
        }
      }
    }
  }
}

onEnterBackground(function () {
  tickMusic(null);
});
