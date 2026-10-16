const gb = require('glov-build');
const ldtkproc = require('./ldtk');

module.exports = function (config) {
  config.extra_index.push({
    name: 'itch',
    defines: {
      ...config.default_defines,
      PLATFORM: 'itch',
    },
    zip: true,
    wrapper: 'itchlaunch.html',
  });
  config.extra_client_html = ['client/itchlaunch.html'];

  if (0) {
    gb.task({
      name: 'ldtkproc',
      input: ['ldtk/**/*.ldtkl'],
      ...ldtkproc(),
    });
    config.client_fsdata.push('ldtkproc:**');
    config.fsdata_embed.push('.ldtkl');
  }
};
