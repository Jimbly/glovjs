/* globals FBInstant */
const urlhash = require('./urlhash.js');

export let ready = false;
let onreadycallbacks = [];
export function onready(callback) {
  if (ready) {
    return void callback();
  }
  onreadycallbacks.push(callback);
}
export function init() {
  if (!window.FBInstant) {
    return;
  }

  let left = 1;
  let fake_load_interval = setInterval(function () {
    left *= 0.9;
    FBInstant.setLoadingProgress(100-(left*100)>>0);
  },100);

  FBInstant.initializeAsync().then(function () {
    let entryPointData = FBInstant.getEntryPointData()||{};
    // let entryPointData = { querystring: { w: '4675', wg: '1' } }; // FRVR
    // let entryPointData = { querystring: { blueprint: 'RKWVAE26XS24Z' } }; // FRVR
    let querystring = entryPointData.querystring||{};
    for (let x in querystring) {
      urlhash.set(x, querystring[x]);
    }

    clearInterval(fake_load_interval);
    ready = true;
    FBInstant.startGameAsync().then(function () {
      onreadycallbacks.forEach((e) => e());
      onreadycallbacks = [];
    });
  }).catch(function (e) {
    console.warn('initializeAsync failed', e);
  });
}
