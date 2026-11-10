import { Rec } from 'glov/common/types';
import { ROVec3 } from 'glov/common/vmath';
import { is_firefox, is_itch_app } from './browser';
import {
  PannerAttr,
  PlatformSoundAPI,
  PlatformSoundID,
  PlatformSoundInstance,
  PlatformSoundLoadOpts,
  PlatformSoundPlayOpts,
} from './platform-adapter';

interface HowlerGlobal {
  usingWebAudio: boolean;
  manualUnlock(): void;
  noAudio: boolean;
  safeToPlay: boolean;

  // If spatial plugin is loaded:
  pos(x: number, y: number, z: number): void;
  orientation(x: number, y: number, z: number, xUp: number, yUp: number, zUp: number): void;
}

type JimblyHowlerPlayOpts = { // Note: this parameter does not exist in the base Howler
  volume?: number;
  stereo?: number;
  pos?: ROVec3;
  orientation?: ROVec3;
};
interface HowlSound {
  play(sprite?: string | number, opts?: JimblyHowlerPlayOpts): number;
  stop(id?: number): HowlSound;
  volume(vol?: number, id?: number): void;
  seek(seek?: number, id?: number): HowlSound | number;
  playing(id?: number): boolean;
  ended(id?: number): boolean;
  duration(id?: number): number;

  // If spatial plugin is loaded:
  stereo(pan: number, id: number): void;
  pos(x: number, y: number, z: number, id: number): void;
  orientation(x: number, y: number, z: number, id: number): void;
  pannerAttr(o: PannerAttr, id: number): void;
}

const mod_howler = require('@jimbly/howler/src/howler.core.js');
const Howl = mod_howler.Howl;
const Howler: HowlerGlobal = mod_howler.Howler;
require('@jimbly/howler/src/plugins/howler.spatial.js');

let last_id = 0;
let sounds: Rec<number, HowlSound> = {};

function listenerPos(pos: ROVec3): void {
  Howler.pos(pos[0], pos[1], pos[2]);
}
function listenerOrientation(up: ROVec3, forward: ROVec3): void {
  Howler.orientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
}

function loadFromDataURL(
  dataurl: string,
  opts: PlatformSoundLoadOpts,
  cb: (err: string | null, id: PlatformSoundID) => void
): PlatformSoundID {
  let id = ++last_id;
  let psid = id as unknown as PlatformSoundID;
  let sound: HowlSound = new Howl({
    ...opts.panner,
    src: dataurl,
    html5: false,
    loop: opts.loop,
    volume: 0,
    onload: function () {
      sounds[id] = sound;
      cb(null, psid);
    },
    onloaderror: function (id_unused: unknown, err: string, extra: unknown) {
      cb(err || 'Unknown error', psid);
    },
  });
  sounds[id] = sound;
  return psid;
}

function load(
  filename: string,
  opts: PlatformSoundLoadOpts,
  cb: (err: string | null, id: PlatformSoundID) => void
): PlatformSoundID {
  if (opts.streaming && (is_firefox || is_itch_app)) {
    // TODO: Figure out workaround and fix!
    //   On slow connections, sounds set to streaming sometimes never load on Firefox,
    //   possibly related to preload options or something ('preload=meta' not guaranteed to fire 'canplay')
    // Additionally, HTML5 audio simply fails from within the Itch.io app
    opts.streaming = false;
  }

  let id = ++last_id;
  let psid = id as unknown as PlatformSoundID;

  let once = false;
  let sound: HowlSound = new Howl({
    ...opts.panner,
    src: filename,
    html5: opts.streaming,
    loop: opts.loop,
    volume: 0,
    onload: function () {
      if (!once) {
        once = true;
        sounds[id] = sound;
        cb(null, psid);
      }
    },
    onloaderror: function (id_unused: unknown, err: string, extra: unknown) {
      if (!once) {
        once = true;
        cb(err || 'Unknown error', psid);
      }
    },
  });
  return psid;
}

function unload(psid: PlatformSoundID): void {
  let id = psid as unknown as number;
  delete sounds[id];
}

function resume(): void {
  // Actual context resuming handled internally by Howler, except for gamepad
  //   which calls soundResume, so let's poke howler to unlock.
  Howler.manualUnlock();
}

function canPlay(): boolean {
  return !Howler.noAudio && Howler.safeToPlay;
}

function soundDuration(psid: PlatformSoundID): number {
  let id = psid as unknown as number;
  let howl = sounds[id];
  if (!howl) {
    return 0;
  }
  return howl.duration();
}

type SoundInstance= {
  howl: HowlSound;
  id: number;
};
function soundPlay(psid: PlatformSoundID, opts: PlatformSoundPlayOpts): PlatformSoundInstance | null {
  let id = psid as unknown as number;
  let howl = sounds[id];
  if (!howl) {
    return null;
  }
  let howler_id = howl.play(undefined, {
    volume: opts.volume,
    pos: opts.pos,
    stereo: opts.pan,
  });
  return {
    howl,
    id: howler_id,
  } as unknown as PlatformSoundInstance;
}

function instanceStop(psi: PlatformSoundInstance): void {
  let sound = psi as unknown as SoundInstance;
  sound.howl.stop(sound.id);
}

function instancePlaying(psi: PlatformSoundInstance): boolean {
  let sound = psi as unknown as SoundInstance;
  // return sound.howl.playing(id); // not reliable if it hasn't started yet? :(
  return !sound.howl.ended(sound.id);
}

function instanceLocation(psi: PlatformSoundInstance): number {
  let sound = psi as unknown as SoundInstance;
  let v = sound.howl.seek(undefined, sound.id);
  if (typeof v !== 'number') {
    // Howler sometimes returns `self` from `seek()`
    return 0;
  }
  return v;
}

function instanceSeek(psi: PlatformSoundInstance, time: number): void {
  let sound = psi as unknown as SoundInstance;
  sound.howl.seek(time, sound.id);
}

function instanceVolume(psi: PlatformSoundInstance, vol: number): void {
  let sound = psi as unknown as SoundInstance;
  sound.howl.volume(vol, sound.id);
}

function instancePan(psi: PlatformSoundInstance, pan: number): void {
  let sound = psi as unknown as SoundInstance;
  sound.howl.stereo(pan, sound.id);
}

function instancePos(psi: PlatformSoundInstance, new_pos: ROVec3): void {
  let sound = psi as unknown as SoundInstance;
  sound.howl.pos(new_pos[0], new_pos[1], new_pos[2], sound.id);
}

function instanceOrientation(psi: PlatformSoundInstance, forward: ROVec3): void {
  let sound = psi as unknown as SoundInstance;
  sound.howl.orientation(forward[0], forward[1], forward[2], sound.id);
}


const api: PlatformSoundAPI = {
  listenerPos,
  listenerOrientation,
  loadFromDataURL,
  load,
  unload,
  resume,
  canPlay,

  soundDuration,
  soundPlay,
  instanceStop,
  instancePlaying,
  instanceLocation,
  instanceSeek,
  instanceVolume,
  instancePan,
  instancePos,
  instanceOrientation,
};

export function webSoundGetAPI(): PlatformSoundAPI {
  return api;
}
