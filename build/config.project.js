module.exports = function (config) {
  config.bundles.push({
    entrypoint: 'worker',
    deps: 'worker_deps',
    is_worker: true,
    do_version: null,
  });
  config.extra_index.push({
    name: 'multiplayer',
    defines: {
      PLATFORM: 'web',
      ENV: 'multiplayer',
    },
    zip: false,
  }, {
    name: 'entity',
    defines: {
      PLATFORM: 'web',
      ENV: 'entity',
    },
    zip: true,
  });

  // Spine support
  // Note: Runtime requires a Spine license to use in any product.
  config.client_fsdata.push(
    'client/spine/**.atlas',
    'client/spine/**.skel',
    'client/spine/**.json',
  );
};
