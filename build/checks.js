const args = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const JSON5 = require('json5');

module.exports = function (filename) {
  if (fs.readFileSync(filename, 'utf8').indexOf('\r\n') !== -1) {
    // CRLF Line endings currently break gulp-ifdef, mess up with git diff/log/blame, and
    //   cause unnecessary diffs when pushing builds to production servers.
    console.error('ERROR: Windows line endings detected');
    console.error('Check your git config and make sure core.autocrlf is false:\n' +
      '  git config --get core.autocrlf\n' +
      '  git config --global --add core.autocrlf false\n' +
      '    (or --local if you want it on for other projects)');
    // eslint-disable-next-line no-throw-literal
    process.exit(-1);
  }

  function prettyInterface() {
    // eslint-disable-next-line global-require
    const console_api = require('console-api');
    console_api.setPalette(console_api.palettes.desaturated);
    let project_name = 'glov';
    try {
      let pkg = JSON5.parse(fs.readFileSync('./package.json', 'utf8'));
      if (pkg && pkg.name) {
        project_name = pkg.name;
      }
    } catch (e) {
      // ignored, use default
    }
    console_api.setTitle(args.title || `build ${args._ || filename} | ${project_name}`);
  }
  prettyInterface();
};
