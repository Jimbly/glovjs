class TestWorker {
  constructor(channel_worker, channel_id) {
    this.channel_worker = channel_worker;
    this.channel_id = channel_id;
    channel_worker.doMaintainClientList();
    channel_worker.doEmitJoinLeaveEvents();
  }
}

function createTestWorker(channel_worker, channel_id) {
  return new TestWorker(channel_worker, channel_id);
}

export function init(channel_server) {
  channel_server.addChannelWorker('test', createTestWorker);
}
