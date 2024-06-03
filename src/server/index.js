import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as express from 'express';
import * as express_static_gzip from 'express-static-gzip';
import { permTokenWorkerInit } from 'glov/server/perm_token_worker';
import { setupRequestHeaders } from 'glov/server/request_utils';
import * as glov_server from 'glov/server/server';
import minimist from 'minimist';
import { entTestWorkerInit } from './enttest_worker';
import { multiplayerWorkerInit } from './multiplayer_worker';

const argv = minimist(process.argv.slice(2));

let app = express();
let server = http.createServer(app);

let server_https;
if (argv.dev) {
  if (fs.existsSync('debugkeys/localhost.crt')) {
    let https_options = {
      cert: fs.readFileSync('debugkeys/localhost.crt'),
      key: fs.readFileSync('debugkeys/localhost.key'),
    };
    server_https = https.createServer(https_options, app);
  }
}
setupRequestHeaders(app, {
  dev: argv.dev,
  allow_map: true,
});

app.use(express_static_gzip(path.join(__dirname, '../client/'), {
  enableBrotli: true,
  orderPreference: ['br'],
}));

app.use(express_static_gzip('data_store/public', {
  enableBrotli: true,
  orderPreference: ['br'],
}));

glov_server.startup({
  app,
  server,
  server_https,
});

// Opt-in to the permissions token system (Note: make sure config/server.json:forward_depth is correct!)
permTokenWorkerInit(glov_server.channel_server, app);

multiplayerWorkerInit(glov_server.channel_server);
entTestWorkerInit(glov_server.channel_server);

let port = argv.port || process.env.port || 3000;

server.listen(port, () => {
  console.info(`Running server at http://localhost:${port}`);
});
if (server_https) {
  let secure_port = argv.sport || process.env.sport || (port + 100);
  server_https.listen(secure_port, () => {
    console.info(`Running server at https://localhost:${secure_port}`);
  });
}
