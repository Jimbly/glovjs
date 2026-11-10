import {
  PlatformSoundAPI,
  PlatformSoundID,
  PlatformSoundInstance,
  PlatformSoundLoadOpts,
  PlatformSoundPlayOpts,
} from 'glov/client/platform-adapter';
import { ROVec3 } from 'glov/common/vmath';

function listenerPos(pos: ROVec3): void {
  // TODO
}
function listenerOrientation(up: ROVec3, forward: ROVec3): void {
  // TODO
}

function load(
  filename: string,
  opts: PlatformSoundLoadOpts,
  cb: (err: string | null, id: PlatformSoundID) => void
): PlatformSoundID {
  setTimeout(function () {
    cb('Not supported', null as unknown as PlatformSoundID);
  });
  return null as unknown as PlatformSoundID;
}
function unload(id: PlatformSoundID): void {
  // TODO
}
function resume(): void {
  // Nothing
}
function canPlay(): boolean {
  // TODO
  return false;
}

function soundDuration(id: PlatformSoundID): number {
  // TODO
  return 0;
}
function soundPlay(id: PlatformSoundID, opts: PlatformSoundPlayOpts): PlatformSoundInstance | null {
  // TODO
  return null;
}
function instanceStop(sound: PlatformSoundInstance): void {
  // TODO
}
function instancePlaying(sound: PlatformSoundInstance): boolean {
  // TODO
  return false;
}
function instanceLocation(sound: PlatformSoundInstance): number {
  // TODO
  return 0;
}
function instanceSeek(sound: PlatformSoundInstance, time: number): void {
  // TODO
}
function instanceVolume(sound: PlatformSoundInstance, vol: number): void {
  // TODO
}
function instancePan(sound: PlatformSoundInstance, pan: number): void {
  // TODO
}
function instancePos(sound: PlatformSoundInstance, new_pos: ROVec3): void {
  // TODO
}
function instanceOrientation(sound: PlatformSoundInstance, forward: ROVec3): void {
  // TODO
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
  instanceSeek,
  instanceVolume,
  instancePan,
  instancePos,
  instanceOrientation,
};


export function sdlSoundGetAPI(): PlatformSoundAPI {
  return api;
}
