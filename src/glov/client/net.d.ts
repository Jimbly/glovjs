import type * as cmd_parse_mod from 'glov/common/cmd_parse';
import type { Packet } from 'glov/common/packet';
import type {
  ChannelDataClients,
  DataObject,
  ErrorCallback,
  NetErrorCallback,
  NetResponseCallbackCalledBySystem,
  PresenceEntry,
  TSMap,
  UnimplementedData,
  VoidFunc,
} from 'glov/common/types';

// Note: Partial definition, needs more filled in
export type SubscriptionManager = {
  readonly auto_create_user: boolean;
  readonly no_auto_login: boolean;
  readonly allow_anon: boolean;
  loggedIn(): string | false;
  getDisplayName(): string | null;

  on(key: 'chat_broadcast', cb: (data: { src: string; msg: string })=> void): void;
  on(key: 'restarting', cb: (data: boolean)=> void): void;
  on(key: 'disconnect', cb: VoidFunc): void;
  on(key: 'connect', cb: (is_reconnect: boolean) => void): void;
  on(key: 'login', cb: VoidFunc): void;
  on(key: 'logout', cb: VoidFunc): void;
  on(key: 'login_fail', cb: (err: string) => void): void;
  //on(key: string, cb: (data: unknown)=> void): void;

  onLogin(cb: VoidFunc): void; // like `.on('login', cb)`, but also fires immediately if appropriate
  onceConnected(cb: VoidFunc): void; // like `.once('connect', cb), but also fires immediately if appropriate

  getChannel(channel_id: string, do_subscribe: boolean): ClientChannelWorker;
  getChannelImmediate(channel_id: string, timeout?: number): ClientChannelWorker;
  getMyUserChannel(): ClientChannelWorker | null;
  sendCmdParse(cmd: string, resp_func: NetResponseCallbackCalledBySystem): void;
  serverLog(type: string, data: string | DataObject): void;

  onChannelMsg<T=unknown>(channel_type: string, msg: string, cb: (data: T, resp_func: ErrorCallback) => void): void;
  // TODO: more specific channel event handler types (also for `ClientChannelWorker::on` below)
  onChannelEvent<T=unknown>(channel_type: string, msg: string, cb: (data: T) => void): void;
};

type CmdParse = ReturnType<typeof cmd_parse_mod.create>;

export type NetInitParam = Partial<{
  ver: number;
  no_packet_debug: boolean;
  path: string;
  client_app: string;
  cmd_parse: CmdParse;
  engine: unknown;
  auto_create_user: boolean;
  no_auto_login: boolean;
  allow_anon: boolean;
}>;

export function netBuildString(): string;
export function netInit(param?: NetInitParam): string;
export function netPostInit(cb: VoidFunc): void;
export function netDisconnectedRaw(): boolean;
export function netDisconnected(): boolean;
export function netForceDisconnect(): void;
export function netClient(): UnimplementedData;
export function netClientId(): string;
export function netUserId(): string | false;
export function netSubs(): SubscriptionManager;

export type ClientChannelWorkerData = {
  public?: unknown & {
    clients?: ChannelDataClients;
  };
};

export interface ClientChannelWorker<DataType extends ClientChannelWorkerData=ClientChannelWorkerData> {
  // Note: type of `cb` here is incorrect (only correct for some `channel_data` events but should be optional key/value)
  on(key: string, cb: (data: DataObject, key: string, value: DataObject) => void): void;
  removeListener(key: string, cb: (data: DataObject, key: string, value: DataObject) => void): void;
  onSubscribe(cb: (data: unknown) => void): void;
  onceSubscribe(cb: ((data: DataObject) => void) | VoidFunc): void;
  numSubscriptions(): number;
  isFullySubscribed(): boolean;
  unsubscribe(): void;
  getChannelData<T>(key: string, default_value: T): T;
  getChannelData(key: string): unknown;
  getChannelID(): string;
  setChannelData(key: string, value: unknown, skip_predict?: boolean, resp_func?: NetErrorCallback): void;
  onMsg<T=unknown>(msg: string, cb: (data: T, resp_func: ErrorCallback) => void): void;
  removeMsgHandler<T=unknown>(msg: string, cb: (data: T, resp_func: ErrorCallback) => void): void;
  pak(msg: string): Packet;
  send<R=never, P=null>(msg: string, data: P, resp_func: NetErrorCallback<R>): void;
  send(msg: string, data?: unknown, resp_func?: NetErrorCallback): void;
  cmdParse<T=string>(cmd: string, resp_func: NetErrorCallback<T>): void;
  readonly data: DataType;
  readonly channel_id: string;
  readonly channel_type: string;
  readonly channel_subid: string;
}

export interface UserChannel extends ClientChannelWorker {
  presence_data: TSMap<PresenceEntry>;
}
