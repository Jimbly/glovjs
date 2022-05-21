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
    do_reload: true,
  }];
  config.extra_index = [{
    name: 'multiplayer',
    defines: {
      PLATFORM: 'web',
      ENV: 'multiplayer',
    },
    zip: false,
  }];

  // Spine support
  // Note: Runtime requires a Spine license to use in any product.
  config.client_fsdata.push(
    'client/spine/**.atlas',
    'client/spine/**.skel',
    'client/spine/**.json',
  );
};
