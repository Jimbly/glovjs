import type { FriendData } from './friends_data';
import type { Packet } from './packet';
import type { Vec4 } from './vmath';

/**
 * Data object type to be used when handling an object that contains some type of (possible unknown) information.
 * @template T - The type of information held by the object, defaults to unknown.
 */
export type DataObject = Partial<Record<string, unknown>>;

/**
 * Error callback accepting an error as the first parameter and a result as the second parameter.
 * Both parameters are optional.
 *
 * @template T - The result type, defaults to never (no result)
 * @template E - The error type, defaults to unknown
 * @param err - The error parameter
 * @param result - The result parameter
 */
export type ErrorCallback<T = never, E = unknown> = (
  err?: E | undefined | null,
  result?: T extends (never | void) ? never : (T | undefined | null)
) => void;

/**
 * Error callback accepting an (string) error as the first parameter and a result as the second parameter.
 * Will only be called as cb(string) or cb(null, result)
 *
 * @template T - The result type, defaults to never (no result)
 * @param err - The error parameter
 * @param result - The result parameter
 */
export type NetErrorCallback<T = never> = (
  err: string | null,
  result?: T
) => void;

type NetResponseCallbackFn<T = never, E = unknown> = (
  err?: E | undefined | null,
  result?: T extends (never | void) ? never : (T | undefined | null),
  resp_func?: NetErrorCallback
) => void;
/**
 * Callback function type passed to any network message handlers: can use it to
 * send back a packet, an error, a result, as well as register a function to be
 * called in response to your response.
 */
export interface NetResponseCallback<T = never> extends NetResponseCallbackFn<T, string> {
  pak: () => Packet;
}

/**
 * Helper type to make a new type that has specific members marked as required.
 * Example: WithRequired<CmdDef, 'cmd' | 'help'>
 */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/**
 * Helper type to get the type of the value of entries in a Partial<Record<>>/dictionary,
 * excluding the value of `undefined` from the Partial<>
 */
export type DefinedValueOf<T> = Exclude<T[keyof T], undefined>;

// TODO: Implement the types below and move them to the appropriate files

/**
 * CmdParse data
 */
export type CmdRespFunc = ErrorCallback<string | unknown, string | null>;
export interface CmdDef {
  cmd?: string;
  help?: string;
  usage?: string;
  prefix_usage_with_help?: boolean;
  access_show?: string[];
  access_run?: string[];
  func: (str: string, resp_func: CmdRespFunc) => void;
}

/**
 * Client presence data
 */
export interface ClientPresenceData {
  active: number;
  state: string;
  payload: unknown;
}
/**
 * Server presence data
 */
export interface ServerPresenceData {
  id: number;
  active: number;
  state: string;
  payload: unknown;
}

/*
 * Chat message data
 */
export interface ChatMessageData {
  id: string | undefined;
  msg: string;
  flags: number;
  ts: number;
  display_name: string | undefined;
}
/*
 * Chat history data
 */
export interface ChatHistoryData {
  idx: number;
  msgs: ChatMessageData[];
}

/*
 * Friends command response
 */
export type FriendCmdResponse = { msg: string; friend: FriendData };

/**
 * Server worker handler callback
 */
export type HandlerCallback<T = never> = ErrorCallback<T, string>;

/**
 * Server worker handler source
 */
export interface HandlerSource {
  channel_id: string;
  id: string;
  type: string;
}

/**
 * Server client worker handler source
 */
export interface ClientHandlerSource extends HandlerSource {
  type: 'client';
  user_id?: string;
  display_name?: string;
  access?: true;
  direct?: true;
  sysadmin?: true;
}
export function isClientHandlerSource(src: HandlerSource): src is ClientHandlerSource {
  return src.type === 'client';
}

export interface ChatIDs extends ClientHandlerSource {
  style?: string;
}

export interface ClientChannelWorker {
  on: (key: string, cb: (data: DataObject, key: string, value: DataObject) => void) => void;
  removeListener: (key: string, cb: (data: DataObject, key: string, value: DataObject) => void) => void;
  onSubscribe: (cb: (data: unknown) => void) => void;
  onceSubscribe: (cb: ((data: DataObject) => void) | (() => void)) => void;
  numSubscriptions: () => number;
  unsubscribe: () => void;
  getChannelData: <T>(key: string, default_value: T) => T;
  pak: (msg: string) => Packet;
  send: (msg: string, data?: unknown, resp_func?: NetErrorCallback) => void;
  readonly data: {
    public?: unknown;
  };
}

export interface UserChannel extends ClientChannelWorker {
  presence_data: Partial<Record<string, ServerPresenceData>>;
}

// TODO: Delete this type and all usages of it.
// It is being used as a placeholder for data types that are not yet implemented.
export type UnimplementedData = DataObject;

/**
 * Client Sprite class
 */
export interface SpriteUIData {
  widths: number[]; heights: number[];
  wh: number[]; hw: number[];
  rects: Vec4[];
  aspect: number[] | null;
  total_w: number; total_h: number;
}
export interface SpriteDrawParams {
  x: number; y: number; z?: number;
  w?: number; h?: number;
  frame?: number;
  rot?: number;
  uvs?: number[];
  color?: Vec4;
  shader?: unknown;
  shader_params?: Partial<Record<string, number[]>>;
}
export interface Sprite {
  uidata?: SpriteUIData;
  uvs: number[];
  draw: (params: SpriteDrawParams) => void;
  drawDualTint: (params: SpriteDrawParams & { color1: Vec4 }) => void;
}
export interface UISprite extends Sprite {
  uidata: SpriteUIData;
}
/**
 * Client Sprite creation parameters
 */
export type SpriteParam = UnimplementedData;
