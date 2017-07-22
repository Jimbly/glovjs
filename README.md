Javascript libGlov framework
============================

* Files can be ES6 (through Babel)
* Server automatically restarts on any relevant file change
* Client automatically reloads on javascript or html change
* Client automatically dynamically reloads CSS file changes

Used SublimeText 3 packages
* SublimeLinter
* SublimeLinter-jshint (requires `npm i -g jshint`)

TODO:
* input
  * dragging?
  * onMouseDown not firing, because isHovering is not set because of my handler changes?
* use spine for sequencing, or leave this until later?
* cleaner window resize handling (have to be checking this each frame anyway?)

* minify, bundle CSS
* bundle vendor .js files?
