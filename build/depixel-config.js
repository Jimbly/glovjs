module.exports = function (gb) {
  let config = {
    depixel_scales: {
      'demo/*.png': 8,
      'utumno/*.png': 8,
    },
    depixel_msaa_scales: {
      '**/*.png': 4,
    },
    depixel_input_excludes: [], // e.g. '!demo/foo**.png'
    tiling_expand_pix: 4,
    tiling_expand_rules: [
      // auto rules:
      //   if alpha on all 4 sides, do both alpha (will break with UI frames)
      //   otherwise, if alpha on either vert side, do vert_clamp; same for horiz
      //   otherwise, wrap
      '**/*chest*:balpha',
      '**/*wall*:hwrap,vclamp',
      '**/*solid*:hwrap,vclamp',
      '**/*door*:hwrap,vclamp',
      '**/*stairs*:hwrap,vclamp',
      '**/*arch*:hwrap,vclamp',
      '**/*exit*:hwrap,vclamp',
      '**/*enter*:hwrap,vclamp',
      '**/*return*:hwrap,vclamp',
      '**/*brick_dark*:hwrap,vclamp',
      '**/*lair*:hwrap,vclamp',
    ],
    tiling_input: ['depixel-atlas-prep:**'],
  };
  // eslint-disable-next-line n/global-require
  require('./depixel-config.project.js')(config, gb);
  return config;
};
