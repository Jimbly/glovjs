const gb = require('glov-build');
const yamlproc = require('./yamlproc.js');

module.exports = function (config) {
  // Spine support
  // Note: Runtime requires a Spine license to use in any product.
  config.client_fsdata.push(
    'client/spine/**.atlas',
    'client/spine/**.skel',
    'client/spine/**.json',
  );

  config.client_static.push('client_json:client/levels/*.json');

  gb.task({
    name: 'walldefs',
    input: ['client/walls/**/*.walldef'],
    ...yamlproc({ auto_color: true }),
  });
  //config.extra_client_tasks.push('walldefs');
  config.client_fsdata.push('walldefs:**');
  config.server_fsdata.push('walldefs:**');
  config.fsdata_embed.push('.walldef');

  gb.task({
    name: 'celldefs',
    input: ['client/cells/**/*.celldef'],
    ...yamlproc({ auto_color: true }),
  });
  //config.extra_client_tasks.push('celldefs');
  config.client_fsdata.push('celldefs:**');
  config.server_fsdata.push('celldefs:**');
  config.fsdata_embed.push('.celldef');

  gb.task({
    name: 'entdefs',
    input: ['client/entities/**/*.entdef'],
    ...yamlproc({ auto_color: true }),
  });
  //config.extra_client_tasks.push('entdefs');
  config.client_fsdata.push('entdefs:**');
  config.server_fsdata.push('entdefs:**');
  config.fsdata_embed.push('.entdef');

  gb.task({
    name: 'vstyles',
    input: ['client/vstyles/**/*.vstyle'],
    ...yamlproc({ auto_color: true }),
  });
  //config.extra_client_tasks.push('vstyles');
  config.client_fsdata.push('vstyles:**');
  config.server_fsdata.push('vstyles:**');
  config.fsdata_embed.push('.vstyle');

  config.extra_index = [{
    name: 'itch',
    defines: {
      ...config.default_defines,
      PLATFORM: 'web',
    },
    zip: true,
  }];

  config.extra_server_tasks.push('server_fsdata');
};
