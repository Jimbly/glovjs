module.exports = {
  targets: [
    'node22-win32-x64',
    'node22-linux-x64',
    'node22-macos-x64',
    'node22-macos-arm64'
  ],
  bytecode: false,
  fallbackToSource: true,
  public: true,
  // SEA makes larger outputs, cannot patch in icon and change subsystem,
  //   however it can be used to make a universal binary, and is maybe less
  //   fragile going forward.
  sea: false,
  outputPath: '../build.pkg/exes/'
};
