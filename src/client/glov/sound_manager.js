// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const { defaults } = require('../../common/util.js');
const { abs, floor, max, min, random } = Math;
const { Howl } = require('howler');

const DEFAULT_FADE_RATE = 0.001;

let sounds = {};
let num_loading = 0;

const default_params = {
  ext_list: ['mp3', 'wav'], // (recommended) try loading .mp3 versions first, then fallback to .wav
  //  also covers all browsers: ['webm', 'mp3']
  sound_on: true,
  music_on: true,
};
class SoundManager {
  constructor(params) {
    params = defaults(params || {}, default_params);
    for (let key in default_params) {
      this[key] = params[key];
    }

    this.last_played = {};
    this.global_timer = 0;

    // Music
    this.fade_rate = DEFAULT_FADE_RATE;
    this.music = []; // 0 is current, 1 is previous (fading out)
    for (let ii = 0; ii < 2; ++ii) {
      this.music.push({
        id: null,
        current_volume: 0,
        target_volume: 0,
      });
    }
  }

  loadSound(base, for_music_cb) {
    if (Array.isArray(base)) {
      assert(!for_music_cb);
      for (let ii = 0; ii < base.length; ++ii) {
        this.loadSound(base[ii]);
      }
      return;
    }
    let key = base;
    if (sounds[key]) {
      if (for_music_cb) {
        for_music_cb();
      }
      return;
    }
    let m = base.match(/^(.*)\.(mp3|ogg|wav|webm)$/u);
    let preferred_ext;
    if (m) {
      base = m[1];
      preferred_ext = m[2];
    }
    let src = `sounds/${base}`;
    let srcs = [];
    if (preferred_ext) {
      srcs.push(`${src}.${preferred_ext}`);
    }
    for (let ii = 0; ii < this.ext_list.length; ++ii) {
      let ext = this.ext_list[ii];
      if (ext !== preferred_ext) {
        srcs.push(`${src}.${ext}`);
      }
    }
    // Try loading desired sound types one at a time.
    // Cannot rely on Howler's built-in support for this because it only continues
    //   through the list on *some* load errors, not all :(.
    function tryLoad(idx) {
      if (idx === srcs.length) {
        console.error(`Error loading sound ${base}: All fallbacks exhausted, giving up`);
        return;
      }
      ++num_loading;
      let once = false;
      let sound = new Howl({
        src: srcs.slice(idx),
        html5: Boolean(for_music_cb),
        loop: Boolean(for_music_cb),
        volume: 0,
        onload: function () {
          if (!once) {
            --num_loading;
            once = true;
            sounds[key] = sound;
            if (for_music_cb) {
              for_music_cb();
            }
          }
        },
        onloaderror: function (id, err, extra) {
          if (idx === srcs.length - 1) {
            console.error(`Error loading sound ${srcs[idx]}: ${err}`);
          } else {
            console.log(`Error loading sound ${srcs[idx]}: ${err}, trying fallback...`);
          }
          if (!once) {
            --num_loading;
            once = true;
            tryLoad(idx + 1);
          }
        },
      });
    }
    tryLoad(0);
  }

  tick(dt) {
    this.global_timer += dt;
    // Do music fading
    // Cannot rely on Howler's fading because starting a fade when one is in progress
    //   messes things up, as well causes snaps in volume :(
    let max_fade = dt * this.fade_rate;
    for (let ii = 0; ii < this.music.length; ++ii) {
      let mus = this.music[ii];
      if (!mus.sound) {
        continue;
      }
      let target = this.music_on ? mus.target_volume : 0;
      if (mus.current_volume !== target) {
        let delta = target - mus.current_volume;
        let fade_amt = min(abs(delta), max_fade);
        if (delta < 0) {
          mus.current_volume = max(target, mus.current_volume - fade_amt);
        } else {
          mus.current_volume = min(target, mus.current_volume + fade_amt);
        }
        mus.sound.volume(mus.current_volume, mus.id);
        if (!mus.target_volume && !mus.current_volume) {
          mus.sound.stop(mus.id);
          mus.sound = null;
        }
      }
    }
  }

  resume() { // eslint-disable-line class-methods-use-this
    // Not needed for Howler by default
  }

  play(soundname, volume) {
    volume = volume || 1;
    if (!this.sound_on) {
      return null;
    }
    if (Array.isArray(soundname)) {
      soundname = soundname[floor(random() * soundname.length)];
    }
    let sound = sounds[soundname];
    if (!sound) {
      return null;
    }
    let last_played_time = this.last_played[soundname] || -9e9;
    if (this.global_timer - last_played_time < 45) {
      return null;
    }

    let id = sound.play();
    sound.volume(volume, id);
    this.last_played[soundname] = this.global_timer;
    return {
      stop: sound.stop.bind(sound, id),
    };
  }

  playMusic(soundname, volume, transition) {
    if (!this.music_on) {
      return;
    }
    if (volume === undefined) {
      volume = 1;
    }
    transition = transition || SoundManager.DEFAULT;
    this.loadSound(soundname, () => {
      let sound = sounds[soundname];
      assert(sound);
      if (this.music[0].sound === sound) {
        // Same sound, just adjust volume, if required
        this.music[0].target_volume = volume;
        if (!transition) {
          if (!volume) {
            sound.stop(this.music[0].id);
            this.music[0].sound = null;
          } else {
            sound.volume(volume, this.music[0].id);
          }
        }
        return;
      }
      // fade out previous music, if any
      if (this.music[0].current_volume) {
        if (transition & SoundManager.FADE_OUT) {
          // swap to position 1, start fadeout
          let temp = this.music[1];
          this.music[1] = this.music[0];
          this.music[0] = temp;
          this.music[1].target_volume = 0;
        }
      }
      if (this.music[0].sound) {
        this.music[0].sound.stop(this.music[0].id);
      }
      this.music[0].sound = sound;
      this.music[0].id = sound.play();
      this.music[0].target_volume = volume;
      let start_vol = (transition & SoundManager.FADE_IN) ? 0 : volume;
      sound.volume(start_vol, this.music[0].id);
      this.music[0].current_volume = start_vol;
    });
  }

  loading() { // eslint-disable-line class-methods-use-this
    return num_loading;
  }
}

SoundManager.DEFAULT = SoundManager.prototype.DEFAULT = 0;
SoundManager.FADE_OUT = SoundManager.prototype.FADE_OUT = 1;
SoundManager.FADE_IN = SoundManager.prototype.FADE_IN = 2;
SoundManager.FADE = SoundManager.prototype.FADE = SoundManager.prototype.FADE_OUT + SoundManager.prototype.FADE_IN;


export function create(params) {
  return new SoundManager(params);
}
