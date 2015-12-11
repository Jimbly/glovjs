/// <reference path="../../typings/tsd.d.ts" />
import assert = require('assert');
import http = require('http');
import express = require('express');
import path = require('path');

// Check using both ES2015 and TypeScript modules
var js_mod = require('../common/js_mod');
import ts_mod = require('../common/ts_mod');
console.log('jsmod: ' + js_mod.uselet() + ', tsmod: ' + ts_mod.uselet());

// Actual app begins
var app = express();
app.use(express.static(path.join(__dirname, '../client/')));

var port = process.env.port || 3000;

var server: http.Server = app.listen(port, () => {
  console.log('Running server at http://localhost:' + port);
});
