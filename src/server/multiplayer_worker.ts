import { Packet } from 'glov/common/packet';
import { HandlerSource, NetResponseCallback } from 'glov/common/types';
import { ChannelServer } from 'glov/server/channel_server';
import { ChannelWorker } from 'glov/server/channel_worker';
import { chattableWorkerInit } from 'glov/server/chattable_worker';

class MultiplayerWorker extends ChannelWorker {
  // constructor(channel_server, channel_id, channel_data) {
  //   super(channel_server, channel_id, channel_data);
  // }
  test_bin?: Uint8Array;
}
MultiplayerWorker.prototype.maintain_client_list = true;
MultiplayerWorker.prototype.emit_join_leave_events = true;
MultiplayerWorker.prototype.require_login = false;
MultiplayerWorker.prototype.auto_destroy = true;

chattableWorkerInit(MultiplayerWorker);

MultiplayerWorker.registerClientHandler('bin_get', function (
  this: MultiplayerWorker,
  src: HandlerSource,
  pak: Packet,
  resp_func: NetResponseCallback
): void {
  let resp = resp_func.pak();
  resp.writeBuffer(this.test_bin || new Uint8Array(0));
  resp.send();
});

MultiplayerWorker.registerClientHandler('bin_set', function (
  this: MultiplayerWorker,
  src: HandlerSource,
  pak: Packet,
  resp_func: NetResponseCallback
): void {
  let buf = pak.readBuffer(false);
  if (buf.length > 100) {
    return void resp_func('Too big');
  }
  this.test_bin = buf;
  resp_func();
});

export function multiplayerWorkerInit(channel_server: ChannelServer): void {
  channel_server.registerChannelWorker('multiplayer', MultiplayerWorker, {
    autocreate: true,
    subid_regex: /^.+$/,
  });
}
