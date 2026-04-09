module.exports = function (config) {
  // just defaults
  config.tiling_expand_rules = [
    // auto rules:
    //   if alpha on all 4 sides, do both alpha (will break with UI frames)
    //   otherwise, if alpha on either vert side, do vert_clamp; same for horiz
    //   otherwise, wrap
    ...config.tiling_expand_rules,
  ];
};
