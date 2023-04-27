
import assert from 'assert';
import { chatUICreate } from 'glov/client/chat_ui';
import * as engine from 'glov/client/engine';
import { netClient, netSubs } from 'glov/client/net';
import * as ui from 'glov/client/ui';
import * as urlhash from 'glov/client/urlhash';
import { ClientChannelWorker, NetErrorCallback } from 'glov/common/types';
import { CrawlerJoinPayload } from '../common/crawler_entity_common';
import { JSVec3 } from '../common/crawler_state';
import { buildModeOnBuildOp } from './crawler_build_mode';
import {
  crawlerEntitiesOnEntStart,
  crawlerEntityManagerOnline,
} from './crawler_entity_client';
import {
  crawlerController,
  crawlerGameState,
  crawlerPlayInitHybridBuild,
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
let chat_ui: ChatUI | null = null;

let want_offline_build: boolean = false;

function effectiveDesiredChannel(): string | null {
  if (want_offline_build) {
    return 'build';
  }
  return desired_channel;
}

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
  if (effectiveDesiredChannel() !== current_channel) {
    return true;
  }
  if (effectiveDesiredChannel() === 'local') {
    return false;
  }
  return netSubs() && Boolean(!netClient().connected && effectiveDesiredChannel());
}

type JoinData = {
  room: ClientChannelWorker;
  channel_subid: string;
  pos?: JSVec3; // only set if joining for hybrid/offline build
  floor_id?: number;
};

function defaultSendJoin(join_data: JoinData, cb: NetErrorCallback): void {
  let payload: CrawlerJoinPayload = {};
  if (join_data.pos) {
    assert(typeof join_data.floor_id === 'number');
    payload.pos = join_data.pos;
    payload.floor_id = join_data.floor_id;
  }
  join_data.room.send('ent_join', payload, cb);
}
let join_func: typeof defaultSendJoin;

let join_data: JoinData | null = null;
function join(channel_subid: string, for_offline_build: boolean): ClientChannelWorker {
  assert(channel_subid);
  assert(!current_channel || current_channel === 'local');
  let room = netSubs().getChannel(`${channel_type}.${channel_subid}`, true);
  room.onceSubscribe(() => {
    if (for_offline_build) {
      crawlerPlayInitHybridBuild(room);
    } else {
      crawlerPlayInitOnlineEarly(room);
    }
  });

  join_data = {
    room,
    channel_subid,
  };
  if (for_offline_build) {
    join_data.floor_id = crawlerGameState().floor_id;
    let { last_pos, last_rot } = crawlerController();
    join_data.pos = [last_pos[0], last_pos[1], last_rot];
  }
  join_func(join_data, function (err) {
    if (err) {
      last_err = err;
      state = STATE_NONE;
    }
  });
  return room;
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
  if (state === STATE_NONE) {
    let eff_desired_channel = effectiveDesiredChannel();
    if (!eff_desired_channel) {
      engine.setState(lobby_state);
      return;
    }
  }
  let eff_connected = current_channel === 'local' || netSubs().loggedIn() && netClient().connected;
  if (eff_connected) {
    if (state === STATE_NONE && eff_connected) {
      let eff_desired_channel = effectiveDesiredChannel();
      if (!eff_desired_channel) {
        engine.setState(lobby_state);
        return;
      }
      state = STATE_JOINING;
      join(eff_desired_channel, want_offline_build);
    }

    if (state === STATE_JOINED) {
      if (effectiveDesiredChannel() !== current_channel) {
        state = STATE_LEAVING;
        assert(current_channel);
        leave(current_channel);
      } else {
        crawlerPlayInitOnlineLate(want_offline_build);
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
  if (crawlerEntityManagerOnline()) {
    crawlerEntityManagerOnline().reinit({}); // Also need to remove anything hanging around in case we switch to hybrid
  }
  crawlerPlayInitOffline();
}

export function crawlerCommStart(): void {
  if (engine.stateActive(crawlerCommHandshake)) {
    return;
  }
  want_offline_build = false; // TODO: auto-start build mode?
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

export function crawlerCommStartBuildComm(): ClientChannelWorker {
  assert.equal(desired_channel, 'local');
  want_offline_build = true;
  let eff_desired = effectiveDesiredChannel();
  assert(eff_desired);

  engine.setState(crawlerCommHandshake);
  let room = netSubs().getChannel(`${channel_type}.${eff_desired}`, false);
  return room;
}


export function crawlerCommStartup(param: {
  channel_type?: string;
  lobby_state: EngineState;
  title_func: (value: string) => string;
  join_func?: typeof defaultSendJoin;
  chat_ui?: ChatUI;
}): void {
  channel_type = param.channel_type || 'crawl';
  lobby_state = param.lobby_state;
  title_func = param.title_func;
  join_func = param.join_func || defaultSendJoin;
  chat_ui = param.chat_ui || null;
  desired_channel = urlhash.get('c') || null;
  if (netSubs()) {
    netSubs().on('connect', crawlerCommReconnect);
    crawlerEntityManagerOnline().on('ent_start', onEntStart);
    crawlerEntityManagerOnline().on('ent_ready', onEntReady);
    netSubs().onChannelMsg(param.channel_type, 'floorchange_ack', crawlerCommOnFloorchangeAck);
    netSubs().onChannelMsg(param.channel_type, 'build_op', buildModeOnBuildOp);
  }
}
