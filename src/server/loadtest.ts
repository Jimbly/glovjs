// Run in dev with: npx nodemon -w dist/game/build.dev/ dist/game/build.dev/server/loadtest.js --master

import assert from 'assert';
import * as http from 'http';
import express from 'express';
import { dotPropSet } from 'glov/common/dot-prop';
import { shuffleArray } from 'glov/common/rand_alea';
import { quietMessagesSet } from 'glov/server/channel_server'; // before channel_worker
import { ChannelData, ChannelWorker } from 'glov/server/channel_worker';
import { requestIsLocalHost } from 'glov/server/request_utils';
import * as glov_server from 'glov/server/server';

import type { Express, NextFunction, Request, Response } from 'express'; // eslint-disable-line no-duplicate-imports
import type { Packet } from 'glov/common/packet';
import type { DataObject, HandlerCallback, HandlerSource, TSMap } from 'glov/common/types';
import type { ChannelServer } from 'glov/server/channel_server'; // eslint-disable-line no-duplicate-imports
import type { Mexchange } from 'glov/server/exchange';

const { floor, min, random } = Math;

const argv = require('minimist')(process.argv.slice(2));

quietMessagesSet(['loadtest_report', 'set_channel_data']);

let app = express();
let server = http.createServer(app);

const LOAD_TEST_REPORT_TIME = 1000;

type LoadTestStats = {
  sent: number;
};

export type GlovServerStartupOptions = {
  app: Express;
  server: http.Server;
  exchange?: Mexchange;
};

let startup_options = {
  app,
  server,
};

glov_server.startup(startup_options);

type LoadTestOpts = {
  max_rate: number; // Per second
  parallel: number;
};
type LoadTestConf = {
  on: boolean;
  opts: LoadTestOpts;
};
type LoadTestChannelData = ChannelData<DataObject, LoadTestConf>;

const MASTER_REPORT_TIME = 2000;

class LoadTestMasterWorker extends ChannelWorker {
  declare data: LoadTestChannelData;
  targets: TSMap<number> = {};
  target_list: string[] = [];
  stats: LoadTestStats = {
    sent: 0,
  };
  last_report_time: number = Date.now();
  constructor(channel_server: ChannelServer, channel_id: string, channel_data: ChannelData) {
    super(channel_server, channel_id, channel_data);

    this.data.public.on = true;
    this.data.public.opts = {
      max_rate: 0,
      parallel: 4,
    };
  }

  tick(): void {
    let expiry = Date.now() - LOAD_TEST_REPORT_TIME * 4;
    let dirty = false;
    for (let key in this.targets) {
      let last_seen = this.targets[key]!;
      if (last_seen < expiry) {
        this.log(`Expiring load test worker for not reporting in: ${key}`);
        delete this.targets[key];
        dirty = true;
      }
    }
    if (dirty) {
      this.target_list = Object.keys(this.targets);
    }
    let now = Date.now();
    if (now - this.last_report_time > MASTER_REPORT_TIME) {
      let dt = now - this.last_report_time;
      this.last_report_time = now;
      let sent = this.stats.sent;
      this.log(`Load test stats: ${(sent * 1000 / dt).toFixed(0)} msgs/sec`);
      this.stats = {
        sent: 0,
      };
    }
  }
}
LoadTestMasterWorker.prototype.no_datastore = true;
LoadTestMasterWorker.prototype.require_login = false;
LoadTestMasterWorker.prototype.auto_destroy = false;
LoadTestMasterWorker.registerServerHandler('loadtest_report', function (
  this: LoadTestMasterWorker,
  src: HandlerSource, pak: Packet, resp_func: HandlerCallback<string[]>
) {
  let { channel_id } = src;
  let stats = pak.readJSON<LoadTestStats>() as TSMap<number>;
  for (let key in stats) {
    (this.stats as TSMap<number>)[key]! += stats[key]!;
  }
  if (!this.targets[channel_id]) {
    this.log(`New loadtest worker: ${channel_id}`);
    this.target_list.push(channel_id);
  }
  this.targets[channel_id] = Date.now();
  resp_func(null, this.target_list);
});
LoadTestMasterWorker.registerServerHandler('loadtest_on', function (
  this: LoadTestMasterWorker,
  src: HandlerSource, pak: Packet, resp_func: HandlerCallback<string>
) {
  pak.readJSON();
  this.setChannelData('public.on', true);
  resp_func();
});
LoadTestMasterWorker.registerServerHandler('loadtest_off', function (
  this: LoadTestMasterWorker,
  src: HandlerSource, pak: Packet, resp_func: HandlerCallback<string>
) {
  pak.readJSON();
  this.setChannelData('public.on', false);
  resp_func();
});
LoadTestMasterWorker.registerServerHandler('loadtest_opts', function (
  this: LoadTestMasterWorker,
  src: HandlerSource, pak: Packet, resp_func: HandlerCallback<string>
) {
  let new_opts = pak.readJSON() as DataObject;
  let opts = this.data.public.opts as DataObject;
  for (let key in new_opts) {
    opts[key] = Number(new_opts[key]);
  }
  this.setChannelData('public.opts', opts);
  resp_func();
});

let channel_server = glov_server.channel_server;

channel_server.registerChannelWorker('ltm', LoadTestMasterWorker, {
  autocreate: true,
  subid_regex: /^(master)$/,
});

function apiToMaster(api: string): void {
  app.get(`/${api}`, function (req: Request, res: Response, next: NextFunction) {
    if (!requestIsLocalHost(req)) {
      return next();
    }

    let pak = channel_server.pakAsChannelServer('ltm.master', `loadtest_${api}`);
    pak.writeJSON(req.query);
    return pak.send(function (err: string, result: string) {
      if (err) {
        return void next(err);
      }
      res.end(result || 'OK');
    });
  });
}
apiToMaster('on');
apiToMaster('off');
apiToMaster('opts');

let loadtest_conf: LoadTestConf | null = null;
let loadtest_targets: string[] = [];

class LoadTestClientWorker extends ChannelWorker {
  workerOnChannelData(
    source: HandlerSource, key: string, data: unknown,
  ): void {
    assert.equal(source.channel_id, 'ltm.master');
    if (!key) {
      loadtest_conf = (data as LoadTestChannelData).public;
    } else if (key.startsWith('public')) {
      dotPropSet(loadtest_conf, key.slice('public.'.length), data);
    }
    this.log('New loadtest conf', loadtest_conf);
  }
}
LoadTestClientWorker.prototype.no_datastore = true;
LoadTestClientWorker.prototype.require_login = false;
LoadTestClientWorker.prototype.auto_destroy = false;
channel_server.registerChannelWorker('ltc', LoadTestClientWorker, {
  autocreate: false,
  subid_regex: /^[a-zA-Z0-9-]+$/,
});

let test_worker: LoadTestClientWorker = channel_server.createChannelLocal(`ltc.${channel_server.csuid}`);
test_worker.subscribeOther('ltm.master', ['*']);

let local_stats: LoadTestStats = {
  sent: 0,
};

function loadTestReport(): void {
  let pak = channel_server.pakAsChannelServer('ltm.master', 'loadtest_report');
  pak.writeJSON(local_stats);
  local_stats ={
    sent: 0,
  };
  pak.send(function (err: string, result: string[]) {
    if (err) {
      console.error('Error reporting to master:', err);
    } else {
      let last_targets = loadtest_targets.slice();
      loadtest_targets = result;
      if (loadtest_targets.length > 1) {
        // Don't send to self, except if we're the only one (for development testing)
        loadtest_targets = loadtest_targets.filter((a) => a !== test_worker.channel_id);
      }
      if (last_targets.join() !== loadtest_targets.join() && loadtest_targets.length < 8) {
        console.log(`Current targets: ${loadtest_targets}`);
      }
    }
    setTimeout(loadTestReport, LOAD_TEST_REPORT_TIME);
  });
}

setTimeout(loadTestReport, LOAD_TEST_REPORT_TIME);


let sends_available = 0;
type TargetStatus = {
  valid: boolean;
  in_flight: number;
  send_scheduled: boolean;
};
function sendPing(status: TargetStatus, channel_id: string): void {
  ++status.in_flight;
  --sends_available;
  test_worker.setChannelDataOnOther(channel_id, 'private.dummy', random(), function (err) {
    if (err) {
      console.error(`Error sending to ${channel_id}: ${err}`);
    }
    --status.in_flight;
    ++local_stats.sent;
    if (status.valid && !status.send_scheduled && status.in_flight < loadtest_conf!.opts.parallel &&
      sends_available && loadtest_conf && loadtest_conf!.on
    ) {
      status.send_scheduled = true;
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      setImmediate(sendPingsToTarget.bind(null, status, channel_id));
    }
  });
}
function sendPingsToTarget(status: TargetStatus, channel_id: string): void {
  if (!status.valid) {
    return;
  }
  let to_send = loadtest_conf!.opts.parallel - status.in_flight;
  to_send = min(to_send, sends_available);
  for (let ii = 0; ii < to_send; ++ii) {
    sendPing(status, channel_id);
  }
  status.send_scheduled = false;
}
let target_status: TSMap<TargetStatus> = {};
let LOAD_TEST_TICK_TIME = 100;
let last_tick_time = Date.now();
let sends_remainder = 0;
let rand = {
  range: function (mx: number): number {
    return floor(random() * mx);
  }
};
function loadTestTick(): void {
  let now = Date.now();
  let dt = now - last_tick_time;
  last_tick_time = now;
  if (loadtest_conf && loadtest_conf.on) {
    // Update rate limit
    if (loadtest_conf.opts.max_rate) {
      let delta = dt / 1000 * loadtest_conf.opts.max_rate + sends_remainder;
      let delta_int = floor(delta);
      sends_available += delta_int;
      sends_remainder = delta - delta_int;
      sends_available = min(sends_available, loadtest_conf.opts.max_rate);
    } else {
      sends_available = Infinity;
    }
    // do it
    let seen: TSMap<true> = {};
    let order = [];
    for (let ii = 0; ii < loadtest_targets.length; ++ii) {
      order.push(ii);
    }
    shuffleArray(rand, order);
    for (let ii = 0; ii < loadtest_targets.length; ++ii) {
      let target = loadtest_targets[order[ii]];
      seen[target] = true;
      let status = target_status[target];
      if (!status) {
        status = target_status[target] = {
          in_flight: 0,
          valid: true,
          send_scheduled: false,
        };
      }
      if (!status.send_scheduled) {
        sendPingsToTarget(status, target);
      }
    }
    for (let target in target_status) {
      let status = target_status[target]!;
      if (!seen[target]) {
        status.valid = false;
        if (!status.in_flight) {
          console.log(`Cleaned up old loadtest target ${target}`);
          delete target_status[target];
        }
      }
    }
  }

  setTimeout(loadTestTick, LOAD_TEST_TICK_TIME);
}
setTimeout(loadTestTick, LOAD_TEST_TICK_TIME);


let port = argv.port || process.env.port || 3007;

server.listen(port, () => {
  console.info(`Running server at http://localhost:${port}`);
});
