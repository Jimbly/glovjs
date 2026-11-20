/* eslint dot-notation:off */
/* globals deps */
require('./require_deps');
require('../glov/client/require.js');

// Node built-in pass-throughs
deps.assert = require('assert');
deps['fs'] = require('fs');
deps['worker_threads'] = require('worker_threads');

deps['@kmamal/sdl'] = require('@kmamal/sdl');
// Package "exports" subpaths are not resolved by browserify, so reference the file directly
deps['@wasm-audio-decoders/ogg-vorbis'] = require('@wasm-audio-decoders/ogg-vorbis/dist/ogg-vorbis-decoder.min.js');
