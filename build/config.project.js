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
    zip: false,
  }, {
    // example .zip for itch.io publishing
    name: 'itch',
    defines: {
      ...config.default_defines,
      PLATFORM: 'web',
    },
    zip: true,
  });

  // Change defaults for testing texture compression logic
  // Remove the exclusion
  config.client_png = config.client_png.filter((a) => {
    return a !== '!client/img/texproc/*.png';
  });
  config.astc_in_dev = true; // default off for perf reasons
  // config.client_png.push('!client/img/texproc/8K*');
  // Not using these currently, though
  config.client_png.push('!client/img/texproc/32K*');

  // Spine support
  // Note: Runtime requires a Spine license to use in any product.
  config.client_fsdata.push(
    'client/spine/**.atlas',
    'client/spine/**.skel',
    'client/spine/**.json',
  );
};
