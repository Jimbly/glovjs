// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const { ChannelWorker } = require('./channel_worker.js');

class DefaultUserWorker extends ChannelWorker {
  constructor(channel_server, channel_id) {
    super(channel_server, channel_id);
    this.user_id = this.channel_subid; // 1234
  }
  cmdRename(new_name, resp_func) {
    if (!new_name) {
      return resp_func('Missing name');
    }
    this.setChannelData('public.display_name', new_name);
    return resp_func(null, 'Successfully renamed');
  }
  handleLogin(src, data, resp_func) {
    if (!data.password) {
      return resp_func('missing password');
    }

    if (!this.getChannelData('private.password')) {
      this.setChannelData('private.password', data.password);
      this.setChannelData('public.display_name', this.user_id);
    }
    if (this.getChannelData('private.password') !== data.password) {
      return resp_func('invalid password');
    }
    return resp_func(null, {
      display_name: this.getChannelData('public.display_name'),
    });
  }
  handleSetChannelData(src, key, value) {
    if (!this.defaultHandleSetChannelData(src, key, value)) {
      return false;
    }
    assert(src);
    assert(src.type);
    if (src.type !== 'client') {
      // from another channel, accept it
      return true;
    }
    // Only allow changes from own client!
    if (src.user_id !== this.user_id) {
      return false;
    }
    return true;
  }
}

class ChannelServerWorker extends ChannelWorker {
}

export function init(channel_server) {
  channel_server.registerChannelWorker('user', DefaultUserWorker, {
    autocreate: true,
    cmds: {
      rename: DefaultUserWorker.prototype.cmdRename,
    },
    handlers: {
      login: DefaultUserWorker.prototype.handleLogin,
    },
  });
  channel_server.registerChannelWorker('channel_server', ChannelServerWorker, {
    autocreate: false,
  });
}
