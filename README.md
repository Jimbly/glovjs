Javascript libGlov framework
============================

* Files can be ES2015 (through Babel) or TypeScript.
* Server automatically restarts on any relevant file change
* Client automatically reloads on javascript or html change
* Client automatically dynamically reloads CSS file changes

Used SublimeText 3 packages (if using TypeScript):
* ArcticTypescript

Setup notes:
* To generate tsd.d.ts:
```
npm install -g tsd
tsd query node --action install --save
```
* to update: `tsd reinstall --save`

TODO:
* switch to TypeScript so that lint errors/etc go away and I get auto-complete
* build system path for images
* use spine for sequencing, or leave this until later?
* sprite load, update, draw functions
  - try out Turbulenz and use it's primitives?  spine runtime example seems simple enough! can use spine for sequencing
  https://github.com/EsotericSoftware/spine-runtimes/blob/master/spine-turbulenz/example/index.html

* TypeScript is not detecting unused var in ts_mod.ts, need a tshint?
* test not working on Windows
* test results to console on save?
* minify, bundle CSS
* bundle vendor .js files?
