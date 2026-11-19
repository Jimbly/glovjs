import assert from 'assert';
import {
  PlatformSoundAPI,
  PlatformSoundID,
  PlatformSoundInstance,
  PlatformSoundLoadOpts,
  PlatformSoundPlayOpts,
} from 'glov/client/platform-adapter';
import { getURLBase } from 'glov/client/urlhash';
import { addHandler, numWorkers, workerCommSendMsg } from 'glov/client/worker_comm';
import { JSVec3, ROVec3 } from 'glov/common/vmath';
import type {
  SoundListenerMsg,
  SoundLoadedMsg,
  SoundLoadMsg,
  SoundPlayMsg,
  SoundReadyMsg,
  SoundVolumeMsg,
} from './platform-sdl-sound-worker';

const SOUND_WORKER = 0;

type LoadCallback = (err: string | null, id: PlatformSoundID) => void;

let audio_ready = false;
let last_id = 0;
let last_voice_id = 0;
let playing_voices: Partial<Record<number, true>> = {};
let load_callbacks: Partial<Record<number, LoadCallback>> = {};

function send<T>(msg: string, data: T): void {
  workerCommSendMsg<T>(SOUND_WORKER, msg, data);
}

let listener_pos: JSVec3 = [0, 0, 0];
let listener_up: JSVec3 = [0, 1, 0];
let listener_forward: JSVec3 = [0, 0, -1];
function sendListener(): void {
  let [ux, uy, uz] = listener_up;
  let [fx, fy, fz] = listener_forward;
  let right: JSVec3 = [
    fy * uz - fz * uy,
    fz * ux - fx * uz,
    fx * uy - fy * ux,
  ];
  let right_len = Math.hypot(...right);
  let up_len = Math.hypot(...listener_up);
  if (right_len < 1e-6) {
    // forward and up are parallel (or zero), orientation is undefined
    return;
  }
  send<SoundListenerMsg>('sound_listener', {
    pos: listener_pos,
    right: right.map((c) => c / right_len) as JSVec3,
    up: listener_up.map((c) => c / up_len) as JSVec3,
  });
}

function listenerPos(pos: ROVec3): void {
  listener_pos = [pos[0], pos[1], pos[2]];
  sendListener();
}
function listenerOrientation(up: ROVec3, forward: ROVec3): void {
  listener_up = [up[0], up[1], up[2]];
  listener_forward = [forward[0], forward[1], forward[2]];
  sendListener();
}

function load(
  filename: string,
  opts: PlatformSoundLoadOpts,
  cb: LoadCallback
): PlatformSoundID {
  let id = ++last_id;
  let psid = id as unknown as PlatformSoundID;
  let url_base = getURLBase();
  if (url_base && filename.startsWith(url_base)) {
    filename = filename.slice(url_base.length);
  }
  filename = filename.split('?')[0];
  assert(!filename.startsWith('http'));
  load_callbacks[id] = cb;
  // Note: ignoring opts.streaming, looping sounds (music) are always streamed from memory
  send<SoundLoadMsg>('sound_load', {
    id,
    path: `${window.application_root}${filename}`,
    loop: opts.loop,
  });
  return psid;
}

function unload(psid: PlatformSoundID): void {
  let id = psid as unknown as number;
  send<number>('sound_unload', id);
}

function resume(): void {
  // Nothing
}

function canPlay(): boolean {
  return audio_ready;
}

function soundDuration(psid: PlatformSoundID): number {
  // Not available on the main thread
  return 0;
}

type SoundInstance = {
  voice_id: number;
};

function soundPlay(psid: PlatformSoundID, opts: PlatformSoundPlayOpts): PlatformSoundInstance | null {
  if (!audio_ready) {
    return null;
  }
  let id = psid as unknown as number;
  let voice_id = ++last_voice_id;
  let seek = opts.seek ? (opts.seek as unknown as SoundInstance).voice_id : null;
  send<SoundPlayMsg>('sound_play', {
    sound_id: id,
    voice_id,
    volume: opts.volume,
    position: opts.pos ? [opts.pos[0], opts.pos[1], opts.pos[2]] : null,
    spread: 1,
    seek,
  });
  playing_voices[voice_id] = true;
  return {
    voice_id,
  } as unknown as PlatformSoundInstance;
}

function instanceStop(psi: PlatformSoundInstance): void {
  let sound = psi as unknown as SoundInstance;
  delete playing_voices[sound.voice_id];
  send<number>('sound_stop', sound.voice_id);
}

function instancePlaying(psi: PlatformSoundInstance): boolean {
  let sound = psi as unknown as SoundInstance;
  return Boolean(playing_voices[sound.voice_id]);
}

function instanceLocation(psi: PlatformSoundInstance): number {
  // Not available on the main thread
  return 0;
}

function instanceVolume(psi: PlatformSoundInstance, vol: number): void {
  let sound = psi as unknown as SoundInstance;
  send<SoundVolumeMsg>('sound_volume', {
    voice_id: sound.voice_id,
    volume: vol,
    fade_ms: 0,
  });
}

function instancePan(psi: PlatformSoundInstance, pan: number): void {
  // Not yet supported
}

function instancePos(psi: PlatformSoundInstance, new_pos: ROVec3): void {
  // Not yet supported
}

function instanceOrientation(psi: PlatformSoundInstance, forward: ROVec3): void {
  // Not yet supported
}


const api: PlatformSoundAPI = {
  listenerPos,
  listenerOrientation,
  load,
  unload,
  resume,
  canPlay,

  soundDuration,
  soundPlay,
  instanceStop,
  instancePlaying,
  instanceLocation,
  instanceVolume,
  instancePan,
  instancePos,
  instanceOrientation,
};

let inited = false;
function init(): void {
  inited = true;
  assert(numWorkers(), 'worker_comm.startup() must be called before the sound system is initialized');
  addHandler<SoundReadyMsg>('sound_ready', function (source, msg) {
    if (msg.err) {
      console.error(`Audio disabled, could not open playback device: ${msg.err}`);
    } else {
      audio_ready = true;
    }
  });
  addHandler<SoundLoadedMsg>('sound_loaded', function (source, msg) {
    let cb = load_callbacks[msg.id];
    delete load_callbacks[msg.id];
    cb?.(msg.err, msg.id as unknown as PlatformSoundID);
  });
  addHandler<number>('sound_voice_done', function (source, voice_id) {
    delete playing_voices[voice_id];
  });
  send('sound_init', null);
}

export function sdlSoundGetAPI(): PlatformSoundAPI {
  if (!inited) {
    init();
  }
  return api;
}
