import assert from 'assert';
import type { TSMap } from 'glov/common/types';
import {
  addTickFunc,
  isInBackground,
  onEnterBackground,
} from './engine';
import * as settings from './settings';
import {
  GlovSoundSetUp,
  soundLoad,
  soundMusicOverrideVolume,
  soundPlay,
  soundResumed
} from './sound';

let inited = false;

function defaultDimmer(): number {
  return 0;
}
let dimmer: () => number;

function defaultCrossFadeTest(m1: string, m2: string): boolean {
  let a1 = m1.split('_');
  if (a1.length > 1) {
    a1.pop();
  }
  let a2 = m2.split('_');
  if (a2.length > 1) {
    a2.pop();
  }
  return a1.join('_') === a2.join('_');

}
let crossFadeTest: (m1: string, m2: string) => boolean;

let music_volume: number;
let last_music_ref: GlovSoundSetUp | null;
let last_music_name: string | null = null;
let last_music_fading_out = false;
let playing_music_name: string | null = null;
let loading_music: TSMap<true> = {};
let loaded_music: TSMap<true> = {};

export function musicTimestamp(): number {
  if (!last_music_ref) {
    return 0;
  }
  return last_music_ref.location();
}


let desired_music_name: string | null = null;
let desired_override_volume: number | undefined;
export function musicSet(music_name: string | null, override_volume?: number): void {
  assert(inited, 'musicStartup() not called');
  desired_music_name = music_name;
  desired_override_volume = override_volume;
}

const FADE_OUT_CHANGE = 500;
const FADE_OUT_SILENCE = 5000;
const FADE_CROSS = 100;
const FADE_UP = 2500;
function tickMusic(): void {
  let music_name = desired_music_name;
  let override_volume = desired_override_volume;
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

  soundMusicOverrideVolume(1 - dimmer());

  if (playing_music_name !== music_name) {
    let cross = false;
    let cross_loc = 0;
    if (last_music_ref) {
      if (last_music_ref.playing() && last_music_name === music_name) {
        assert(playing_music_name === null);
        assert(last_music_fading_out);
        // already playing the right music, it's just fading out
        last_music_ref.fade(music_volume, FADE_UP/music_volume);
        playing_music_name = last_music_name;
        last_music_fading_out = false;
      } else {
        cross = music_name && playing_music_name && crossFadeTest(playing_music_name, music_name) || false;
        if (cross && !loaded_music[music_name!]) {
          // wait for it to load
        } else {
          if (!last_music_fading_out) {
            last_music_fading_out = true;
            if (cross) {
              cross_loc = last_music_ref.location();
            }
            last_music_ref.fade(0,
              cross ? FADE_CROSS/music_volume :
              music_name ? FADE_OUT_CHANGE/music_volume :
              FADE_OUT_SILENCE/music_volume);
            playing_music_name = null;
            if (cross) {
              last_music_ref = null;
              last_music_name = null;
            }
          }
        }
        if (last_music_ref && !last_music_ref.playing()) {
          last_music_ref = null;
          last_music_name = null;
        }
      }
    }
    if (!last_music_ref) { // finished fading out, can start something new
      if (music_name && loaded_music[music_name]) {
        last_music_ref = soundPlay(music_name, {
          volume: 0.001,
          as_music: true,
        });
        if (cross_loc && last_music_ref) {
          last_music_ref.location(cross_loc);
        }
        last_music_fading_out = false;
        if (last_music_ref) {
          last_music_ref.fade(override_volume || music_volume, cross ? FADE_CROSS/music_volume : FADE_UP/music_volume);
          last_music_name = music_name;
          playing_music_name = music_name;
        }
      }
    }
  }
}

onEnterBackground(function () {
  musicSet(null);
  tickMusic();
});

export type MusicStartupParam = {
  dimmer?: () => number; // 0 = full volume, 1 = muted
  crossFadeTest?: (m1: string, m2: string) => boolean;
  base_volume?: number;
};

export function musicStartup(param?: MusicStartupParam): void {
  param = param || {};
  dimmer = param.dimmer || defaultDimmer;
  crossFadeTest = param.crossFadeTest || defaultCrossFadeTest;
  music_volume = param.base_volume || 1;
  addTickFunc(tickMusic);
  inited = true;
}
