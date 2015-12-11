/// <reference path="../../typings/tsd.d.ts" />
import assert = require('assert');
import http = require('http');
import express = require('express');
import path = require('path');

// Actual app begins
var app = express();
app.use(express.static(path.join(__dirname, '../client/')));

var port = process.env.port || 3000;

var server: http.Server = app.listen(port, () => {
  console.log('Running server at http://localhost:' + port);
});
