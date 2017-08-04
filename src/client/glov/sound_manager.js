/*global TurbulenzEngine: true */
/*global math_device: false */
/*global Camera: false */

let sounds = {};
let num_loading = 0;
class SoundManager {
  constructor(listenerTransform) {
    if (!listenerTransform) {
      const camera = Camera.create(math_device);
      const look_at_position = math_device.v3Build(0.0, 0.0, 0.0);
      const worldUp = math_device.v3BuildYAxis();
      const camera_position = math_device.v3Build(0.0, 0.0, 1.0);
      camera.lookAt(look_at_position, worldUp, camera_position);
      camera.updateViewMatrix();
      listenerTransform = camera.matrix;
    }
    let soundDeviceParameters = {
      linearDistance : false
    };
    this.soundDevice = TurbulenzEngine.createSoundDevice(soundDeviceParameters);
    this.soundDevice.listenerTransform = listenerTransform;

    this.channels = [];
    for (let ii = 0; ii < 16; ++ii) {
      this.channels[ii] = this.soundDevice.createSource({
        position : [0, 0, 0],
        relative : false,
        pitch : 1.0,
      });
    }
    this.channel = 0;
    this.last_played = {};
    this.global_timer = Date.now();

    this.sound_loop = this.soundDevice.createSource({
      position : [0, 0, 0],
      relative : false,
      pitch : 1.0,
      looping: true,
    });
  }

  loadSound(base, cb) {
    if (Array.isArray(base)) {
      for (let ii = 0; ii < base.length; ++ii) {
        this.loadSound(base[ii], cb);
      }
      return;
    }
    let src = 'sounds/' + base;
    // if (this.soundDevice.isSupported('FILEFORMAT_WAV')) {
    src += '.wav';
    // } else {
    //   src += '.ogg';
    // }
    ++num_loading;
    this.soundDevice.createSound({
      src: src,
      onload: function (sound) {
        --num_loading;
        if (sound) {
          sounds[base] = sound;
          if (cb) {
            cb();
          }
        }
      }
    });
  }

  tick() {
    this.global_timer = Date.now();
  }

  play(soundname) {
    if (!sounds[soundname]) {
      return;
    }
    let last_played_time = this.last_played[soundname] || -9e9;
    if (this.global_timer - last_played_time < 45) {
      return;
    }
    this.channels[this.channel++].play(sounds[soundname]);
    this.last_played[soundname] = this.global_timer;
    if (this.channel === this.channels.length) {
      this.channel = 0;
    }
  }

  playLooping(soundname) {
    this.loadSound(soundname, () => {
      if (!sounds[soundname]) {
        return;
      }
      this.sound_loop.play(sounds[soundname]);
    });
  }

  loading() {
    return num_loading;
  }
}

export function create(listenerTransform) {
  return new SoundManager(listenerTransform);
}
