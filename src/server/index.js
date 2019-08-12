const express = require('express');
const http = require('http');
const path = require('path');
const glov_server = require('./glov/server.js');
// const test_worker = require('./test_worker.js');

let app = express();
let server = new http.Server(app);
app.use(express.static(path.join(__dirname, '../client/')));

glov_server.startup({ server });

// test_worker.init(glov_server.channel_server);

let port = process.env.port || 3000;

server.listen(port, () => {
  console.log(`Running server at http://localhost:${port}`);
});
