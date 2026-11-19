/* eslint dot-notation:off */
/* globals deps */
require('./require_deps');
require('../glov/client/require.js');

// Node built-in pass-throughs
deps.assert = require('assert');
deps['fs'] = require('fs');
deps['worker_threads'] = require('worker_threads');

// Package "exports" subpaths are not resolved by browserify, so reference the files directly
deps['@kmamal/sdl/worker'] = require('@kmamal/sdl/src/javascript/worker.js');
deps['@wasm-audio-decoders/ogg-vorbis'] = require('@wasm-audio-decoders/ogg-vorbis/dist/ogg-vorbis-decoder.min.js');
