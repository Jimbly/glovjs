
import assert from 'assert';
import { chatUICreate } from 'glov/client/chat_ui';
import * as engine from 'glov/client/engine';
import { netClient, netSubs } from 'glov/client/net';
import * as ui from 'glov/client/ui';
import * as urlhash from 'glov/client/urlhash';
import { ClientChannelWorker, NetErrorCallback } from 'glov/common/types';
import { buildModeOnBuildOp } from './crawler_build_mode';
import {
  crawlerEntitiesOnEntStart,
  crawlerEntityManagerOnline,
} from './crawler_entity_client';
import {
  crawlerController,
  crawlerPlayInitOffline,
  crawlerPlayInitOnlineEarly,
  crawlerPlayInitOnlineLate,
} from './crawler_play';

export type ChatUI = ReturnType<typeof chatUICreate>;

const STATE_NONE = 'none';
const STATE_JOINING = 'joining';
const STATE_JOINED = 'joined';
const STATE_LEAVING = 'leaving';

let desired_channel: string | null = null;
let current_channel: string | null = null;
let state = STATE_NONE;
let crawler_room: ClientChannelWorker | null = null;
let last_err: string | null = null;

let channel_type: string;
export type EngineState = (dt: number) => void;
let lobby_state: EngineState;
let play_state: EngineState;
let chat_ui: ChatUI | null = null;

export function crawlerRoom(): ClientChannelWorker | null {
  return crawler_room;
}

export function crawlerCommChannelSubID(): string | null {
  return current_channel;
}

export function getChatUI(): ChatUI {
  assert(chat_ui);
  return chat_ui;
}

export function crawlerCommWant(): boolean {
  if (desired_channel !== current_channel) {
    return true;
  }
  if (desired_channel === 'local') {
    return false;
  }
  return !netClient().connected;
}

function defaultSendJoin(room: ClientChannelWorker, cb: NetErrorCallback): void {
  room.send('ent_join', null, cb);
}
let join_func: typeof defaultSendJoin;

let join_data: { room: ClientChannelWorker; channel_subid: string } | null = null;
function join(channel_subid: string): void {
  assert(channel_subid);
  assert(!current_channel);
  let room = netSubs().getChannel(`${channel_type}.${channel_subid}`, true);
  room.onceSubscribe(() => {
    crawlerPlayInitOnlineEarly(room);
  });

  join_data = {
    room,
    channel_subid,
  };
  join_func(room, function (err) {
    if (err) {
      last_err = err;
      state = STATE_NONE;
    }
  });
}

function onEntStart(): void {
  assert(join_data);
  let { channel_subid, room } = join_data;
  join_data = null;
  current_channel = channel_subid;
  crawler_room = room;
  if (chat_ui) {
    chat_ui.setChannel(crawler_room);
  }
  crawlerEntitiesOnEntStart();
}

function onEntReady(): void {
  if (state === STATE_JOINING) {
    assert(current_channel);
    state = STATE_JOINED;
  }
}

function leave(channel_subid: string): void {
  assert(channel_subid);
  if (channel_subid !== 'local') {
    if (chat_ui) {
      chat_ui.setChannel(null);
    }
    netSubs().unsubscribe(`${channel_type}.${channel_subid}`);
  }
  current_channel = null;
  state = STATE_NONE;
}

function crawlerCommReconnect(): void {
  if (current_channel) {
    leave(current_channel);
  }
}

function crawlerCommHandshake(): void {

  if (netSubs().loggedIn() && netClient().connected) {
    if (state === STATE_NONE && netSubs().loggedIn() && netClient().connected) {
      if (!desired_channel) {
        engine.setState(lobby_state);
        return;
      }
      state = STATE_JOINING;
      join(desired_channel);
    }

    if (state === STATE_JOINED) {
      if (desired_channel !== current_channel) {
        state = STATE_LEAVING;
        assert(current_channel);
        leave(current_channel);
      } else {
        engine.setState(play_state);
        crawlerPlayInitOnlineLate();
      }
    }
  }

  let x = 20;
  let y = 20;
  ui.print(null, x, y, Z.UI, 'Negotiating connection...');
  y += ui.font_height;
  if (last_err) {
    ui.print(null, x, y, Z.UI, `Error: ${last_err}`);
  }

}

function startLocalCrawl(): void {
  current_channel = 'local';
  state = STATE_JOINED;
  crawlerPlayInitOffline();
}

export function crawlerCommStart(): void {
  if (desired_channel === 'local') {
    startLocalCrawl();
  } else {
    engine.setState(crawlerCommHandshake);
  }
}

let title_func: (value: string) => string;
urlhash.register({
  key: 'c',
  change: (newvalue: string) => {
    if (newvalue !== desired_channel) {
      desired_channel = newvalue || null;
      crawlerCommStart();
    }
  },
  title: (value: string) => title_func(value),
  push: true,
});

function crawlerCommOnFloorchangeAck(): void {
  crawlerController().onFloorChangeAck();
}


export function crawlerCommStartup(param: {
  channel_type?: string;
  lobby_state: EngineState;
  play_state: EngineState;
  title_func: (value: string) => string;
  join_func?: typeof defaultSendJoin;
  chat_ui?: ChatUI;
}): void {
  channel_type = param.channel_type || 'crawl';
  lobby_state = param.lobby_state;
  play_state = param.play_state;
  title_func = param.title_func;
  join_func = param.join_func || defaultSendJoin;
  chat_ui = param.chat_ui || null;
  desired_channel = urlhash.get('c') || null;
  netSubs().on('connect', crawlerCommReconnect);
  crawlerEntityManagerOnline().on('ent_start', onEntStart);
  crawlerEntityManagerOnline().on('ent_ready', onEntReady);
  netSubs().onChannelMsg(param.channel_type, 'floorchange_ack', crawlerCommOnFloorchangeAck);
  netSubs().onChannelMsg(param.channel_type, 'build_op', buildModeOnBuildOp);
}
