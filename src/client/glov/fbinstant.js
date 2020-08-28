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

export function fbGetLoginInfo(cb) {
  onready(() => {
    window.FBInstant.player.getSignedPlayerInfoAsync().then((result) => {
      if (cb) {
        cb(null, {
          signature: result.getSignature(),
          display_name: window.FBInstant.player.getName(),
        });
        cb = null;
      }
    }).catch((err) => {
      if (cb) {
        cb(err);
        cb = null;
      }
    });
  });
}

let fb_friends = {};
// Returns a display name if the user_id is a Facebook friend
export function fbFriendName(user_id) {
  return fb_friends[user_id];
}

// TODO: Expects an array of valid user IDs:
// cb(null, ['fb$1234', 'fb$4567']);
export function fbGetFriends(cb) {
  onready(() => {
    window.FBInstant.player.getConnectedPlayersAsync().then((players) => {
      let list = players.map((player) => {
        let user_id = `fb$${player.getID()}`;
        fb_friends[user_id] = player.getName();
        return user_id;
      });
      if (cb) {
        cb(null, list);
        cb = null;
      }
    }).catch((err) => {
      if (cb) {
        cb(err);
        cb = null;
      }
    });
  });
}
