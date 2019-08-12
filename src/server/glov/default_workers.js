class DefaultUserWorker {
  constructor(channel_worker, channel_id) {
    this.channel_worker = channel_worker;
    this.channel_id = channel_id;
    this.user_id = channel_worker.channel_subid;
    channel_worker.cmdRegister('rename', this.cmdRename.bind(this));
  }
  cmdRename(new_name, resp_func) {
    if (!new_name) {
      return resp_func('Missing name');
    }
    this.channel_worker.setChannelData('public.display_name', new_name);
    return resp_func(null, 'Successfully renamed');
  }
  handleSetChannelData(client/*, key, value*/) {
    if (!client) {
      // during login, the server
      return true;
    }
    if (client.is_channel_worker) {
      // from a channel, accept it
      return true;
    }
    // Only allow changes from own client!
    if (client.ids.user_id !== this.user_id) {
      return false;
    }
    return true;
  }
}

export function createDefaultUserWorker(channel_worker, channel_id) {
  return new DefaultUserWorker(channel_worker, channel_id);
}
