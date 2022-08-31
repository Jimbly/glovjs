const assert = require('assert');
const { ChannelWorker } = require('./channel_worker.js');

class ChannelServerWorker extends ChannelWorker {
}
// Returns a function that forwards to a method of the same name on the ChannelServer
function channelServerBroadcast(name) {
  return (ChannelServerWorker.prototype[name] = function (src, data, resp_func) {
    assert(!resp_func.expecting_response); // this is a broadcast
    this.channel_server[name](data);
  });
}
function channelServerHandler(name) {
  return (ChannelServerWorker.prototype[name] = function (src, data, resp_func) {
    this.channel_server[name](data, resp_func);
  });
}

ChannelServerWorker.prototype.no_datastore = true; // No datastore instances created here as no persistence is needed

export function channelServerWorkerInit(channel_server) {
  channel_server.registerChannelWorker('channel_server', ChannelServerWorker, {
    autocreate: false,
    subid_regex: /^[a-zA-Z0-9-]+$/,
    handlers: {
      worker_create: channelServerHandler('handleWorkerCreate'),
      master_startup: channelServerBroadcast('handleMasterStartup'),
      master_stats: channelServerBroadcast('handleMasterStats'),
      restarting: channelServerBroadcast('handleRestarting'),
      chat_broadcast: channelServerBroadcast('handleChatBroadcast'),
      ping: channelServerBroadcast('handlePing'),
      eat_cpu: channelServerHandler('handleEatCPU'),
    },
  });
}
