JavaScript GLOV.js framework
============================

**Demos**
* General feature test: [glovjs-playground](http://jimbly.github.io/glovjs/playground/)
* Terminal module test: [glovjs-terminal](http://jimbly.github.io/glovjs/terminal/)

**Projects using this framework**
* [Worlds FRVR](https://worlds.frvr.com/)
* [Most of my Ludum Dare entries](http://www.dashingstrike.com/games.html#ld)

**Notes**
* Files can be ES2020 (through Babel)
* Server automatically restarts on any relevant file change
* Client automatically reloads on javascript or html change
* Client automatically dynamically reloads CSS, texture, etc file changes
* Client .js and vendor files all bundled and minified
* Source maps created for debugging, even on minified builds
* Limited static-fs supported for embedding non-.js files into source, glov/webfs preferred to get dynamic reloads
* Much functionality derived from libGlov (open source C/C++ games framework)

Useful SublimeText 3 packages
* SublimeLinter
* SublimeLinter-eslint (requires `npm i -g eslint`)

Start with: `npm start` (after running `npm i` once)

Build distributable files with: `npm run-script build`

Feature demo is index.html (`main.js`), multiplayer demo (requires server) is the built index_multiplayer.html (references `multiplayer.js`)

Notes:
* The engine API (glov/*) is subject to change occasionally, it often changes with each Ludum Dare in which I use this engine ^_^, though it's been fairly stable for the last couple years.
* To use MP3 audio files, convert all .wav to .mp3 at the end of development, call engine.startup with `{ sound: { ext_list: ['mp3', 'wav'] } }`
* Before publishing a project, edit the meta tags in index.html, place a 1200x630px cover image for use on Facebook and Twitter shares.


Test-Driven Development support
===============================

Examples: [test-util.ts](https://github.com/Jimbly/glovjs/blob/master/src/glov/tests/common/test-util.ts), [test-load_bias_map.ts](https://github.com/Jimbly/glovjs/blob/master/src/glov/tests/server/test-load_bias_map.ts)

Though TDD is often not a good fit with a lot of game development, it's still sometimes quite useful when working on various subsystems, as long as it's relatively painless to integrate and maintain.

Adding a new test:
* Create a new file with a name starting with `test-` in the appropriate `tests/` folder, this would be one of `src/client/tests/`, `src/common/tests/`, `src/server/tests/` or the `src/glov/` equivalent if testing an engine module.
  * Any files _not_ starting with `test-` are not ran by the test runner (e.g. helper modules used across multiple tests)
* The only requirement within a test file is to `import 'glov/[client|server]/test'`, this will trigger the code such that test dependencies are automatically tracked and the appropriate tests will be re-ran when a dependency changes.  `glov/client/test` also includes some minimal mocking of a browser-like environment so that front-end modules can be imported without crashing (this may be expanded over time, but is preferrably kept minimal to avoid the multi-second penalty per test that some fully featured browser mocking entails).
* Tests are simply executed via Node.js and are considered to fail if there is any output to `stderr` or if the process returns an error code (so, any crash or error message will trigger a test failure)
* In the test file itself, there's nothing magical, simply write the code you want ran in the test (e.g. trigger failures with `assert()`)
* Tests can be TypeScript or JavaScript - using TypeScript can help you "test" your interfaces (if writing the tests before any actual consumer of the code), however if you're testing a module's handling of bad parameters or things along those lines, it may be simpler to simply have the test written in JavaScript.

Individual tests are ran through the build system with all of the inherent features/advantages/caveats therein:
* Test are ran on the post-Babel (post-TypeScript) files, so should catch any issues that may arise from that process
  * For any tests in a `common/` folder, these same test will be ran twice, once in the client context, once in the server context, since the Babelified files are potentially quite different.
* Tests _only_ run when their dependencies change (and only if the build system knows it was a dependency)
  * If any build task has failed, it's error message is repeated at the end of the build process even if it didn't immediately run, so you will keep seeing the test errors until they are resolved
  * If you're changing a file and your test is not re-running, check to ensure you `import`'d `glov/server/test`, perhaps the dependencies were not being tracked
* Tests automatically time out after 5 seconds, though ideally each test should take mere milliseconds.  If a test is timing out, it's most likely that some resource was left active and Node.js was not exiting cleanly (e.g. a `setInterval` or similar).

