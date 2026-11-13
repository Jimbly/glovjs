/* globals HTMLImageElement */
import type {
  ErrorCallback,
  VoidFunc,
} from 'glov/common/types';
import type { ROVec3 } from 'glov/common/vmath';
import type { FetchInternalParams } from './fetch';
import { CursorStyle } from './ui';

export type PlatformSoundPlayOpts = {
  volume: number;
  pos?: ROVec3;
  pan?: number;
};

// @see https://developer.mozilla.org/en-US/docs/Web/API/PannerNode
export type PannerAttr = {
  coneInnerAngle: number; // 360
  coneOuterAngle: number; // 360
  coneOuterGain: number; // 0
  distanceModel: 'inverse' | 'linear' | 'exponential'; // inverse
  maxDistance: number; // 10000
  refDistance: number; // 1
  rolloffFactor: number; // 1
  panningModel: 'HRTF' | 'equalpower'; // HRTF
};

export type PlatformSoundLoadOpts = {
  loop: boolean;
  streaming: boolean;
  panner: Readonly<Partial<PannerAttr>>;
};

export type PlatformSoundID = { _opaque: 'PlatformSoundID' };
export type PlatformSoundInstance = { _opaque: 'PlatformSoundInstance' };
export type PlatformSoundAPI = {
  listenerPos(pos: ROVec3): void;
  listenerOrientation(up: ROVec3, forward: ROVec3): void;

  load(
    filename: string,
    opts: PlatformSoundLoadOpts,
    cb: (err: string | null, id: PlatformSoundID) => void
  ): PlatformSoundID;
  loadFromDataURL?(
    dataurl: string,
    opts: PlatformSoundLoadOpts,
    cb: (err: string | null, id: PlatformSoundID) => void
  ): PlatformSoundID;
  unload(id: PlatformSoundID): void;
  resume(): void;
  canPlay(): boolean;

  soundDuration(id: PlatformSoundID): number;
  soundPlay(id: PlatformSoundID, opts: PlatformSoundPlayOpts): PlatformSoundInstance | null;
  instanceStop(sound: PlatformSoundInstance): void;
  instancePlaying(sound: PlatformSoundInstance): boolean;
  instanceLocation(sound: PlatformSoundInstance): number;
  instanceSeek(sound: PlatformSoundInstance, time: number): void;
  instanceVolume(sound: PlatformSoundInstance, vol: number): void;
  instancePan(sound: PlatformSoundInstance, pan: number): void;
  instancePos(sound: PlatformSoundInstance, new_pos: ROVec3): void;
  instanceOrientation(sound: PlatformSoundInstance, forward: ROVec3): void;
};

export type PlatformStartupParam = {
  antialias: boolean;
  high?: boolean;
  force_webgl2?: boolean;
  safearea_ignore_bottom?: boolean;
  tick: VoidFunc;
};

export type PlatformStartupRet = {
  good: boolean;
  antialias: boolean;
  antialias_unavailable: boolean;
  webgl2: boolean;
};

export type PlatformAdapter = {
  startup(param: PlatformStartupParam): PlatformStartupRet;
  checkResize(): void;
  requestFrame(user_time?: number): void;
  setEditBoxNearBottom(frame_index: number, required_padding_dom_coords: number): void;
  loadImageData(url: string, prefer_arraybuffer: boolean, done: ErrorCallback<HTMLImageElement | ArrayBuffer>): void;
  imageFromBuffer(buf: Uint8Array, done: ErrorCallback<HTMLImageElement>): void;
  getSoundAPI(): PlatformSoundAPI;
  fetch(params: FetchInternalParams, cb: ErrorCallback<unknown>): void;
  loadScript(url: string, cb: VoidFunc): void;
  clipboardWrite(text: string): boolean;
  clipboardRead(): string | null;
  cursorStyle(style: CursorStyle): void;
};
