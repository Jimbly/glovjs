module.exports = function (config) {
  config.bundles = [{
    entrypoint: 'worker',
    deps: 'worker_deps',
    is_worker: true,
    do_version: null,
  },{
    entrypoint: 'app',
    deps: 'app_deps',
    is_worker: false,
    do_version: 'client/app.ver.json',
  }];
  config.extra_index = [{
    name: 'multiplayer',
    defines: {
      FACEBOOK: false,
      ENV: 'multiplayer',
    },
    zip: false,
  }];
};
