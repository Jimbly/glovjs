// yhint uses require() on the specified config file, but jshint's config file
// (.jshintrc) does not have a .json extension, so we can't just have one file.
// Additionally, .jshintrc does not support comments, so we put our jshint
// option changes here with comments and lazy-write out .jshintrc whenever yhint
// is run.

// Any changes from Yahoo default jshint rules should be commented.
var config = {
  // Options to enforce requirements
  "bitwise":                 false,
  "camelcase":               false,
  "curly":                   true,
  "eqeqeq":                  true,
  "es3":                     false,
  "forin":                   false, // JE: We're not using any third party libs that extend Object.prototype, should be safe in most cases
  "freeze":                  true, // JE: Don't extend built-in prototypes
  "immed":                   true,
  "indent":                  false,
  "latedef":                 true, // JE: Don't allow using things before they're defined
  "newcap":                  true, // JE: Require constructors to be capitalized for easier reading
  "nonbsp":                  true, // JE: Warn on non-breaking space character (Option+Space on Mac)
  "noarg":                   true,
  "noempty":                 false,
  "nonew":                   false,
  "plusplus":                false,
  "quotmark":                true, // JE: Be consistent
  "undef":                   true,
  "unused":                  true,
  "strict":                  false,
  "trailing":                true, // JE: No trailing whitespace, please
  "maxparams":               false,
  "maxdepth":                false,
  "maxstatements":           false,
  "maxcomplexity":           false,
  "maxlen":                  false,

  // Options to relax requirements
  "asi":                     false,
  "boss":                    false,
  "debug":                   false,
  "eqnull":                  false,
  "esnext":                  true, // JE: Yay.
  "evil":                    false,
  "expr":                    true,
  "funcscope":               false, // JE: Don't allow using things outside of their perceived scope
  "globalstrict":            false,
  "iterator":                false,
  "lastsemic":               false,
  "laxbreak":                false,
  "laxcomma":                false,
  "loopfunc":                false,
  "multistr":                false,
  "proto":                   false,
  "scripturl":               false,
  "smarttabs":               false,
  "shadow":                  false,
  "sub":                     false,
  "supernew":                false, // JE: Not sure why you'd want to allow this.
  "validthis":               false, // JE: Don't allow "this" outside of prototype functions. (maybe who cares?)

  "node":                    true, // JE: Default to this everywhere, we will manually flag browser files
};

// Lazy-update .jshintrc with non-comment version
var fs = require('fs');
var jshintrc = '.jshintrc';
var cur_config;
try {
  cur_config = fs.readFileSync(jshintrc, 'utf8');
} catch (ignore) {
}
var new_config = JSON.stringify(config, undefined, 2);
if (new_config !== cur_config) {
  try {
    fs.writeFileSync(jshintrc, new_config);
  } catch (ignore) {
  }
}

module.exports = config;
