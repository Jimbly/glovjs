!function n(o,i,s){function u(e,r){if(!i[e]){if(!o[e]){var t="function"==typeof require&&require;if(!r&&t)return t(e,!0);if(f)return f(e,!0);throw(t=new Error("Cannot find module '"+e+"'")).code="MODULE_NOT_FOUND",t}t=i[e]={exports:{}},o[e][0].call(t.exports,function(r){return u(o[e][1][r]||r)},t,t.exports,n,o,i,s)}return i[e].exports}for(var f="function"==typeof require&&require,r=0;r<s.length;r++)u(s[r]);return u}({1:[function(r,e,t){"use strict";r("../glov/client/require.js"),deps.assert=r("assert")},{"../glov/client/require.js":2,assert:3}],2:[function(r,e,t){"use strict";var n="undefined"==typeof window?self:window,o=n.deps=n.deps||{};n.require=function(r){if(!o[r])throw new Error("Cannot find module '"+r+"' (add it to deps.js or equivalent)");return o[r]}},{}],3:[function(r,e,t){"use strict";function n(r,e){if(!r)throw e=e||(void 0===r||!1===r?"":JSON.stringify(r)),new Error("Assertion failed"+(e?": "+e:""))}e.exports=n,e.exports.ok=n,e.exports.equal=function(r,e){if(r!==e)throw new Error('Assertion failed: "'+r+'"==="'+e+'"')}},{}]},{},[1]);

(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict"
var worker=require("../glov/client/worker_thread.js")
worker.addHandler("test",function(){console.log("Worker Test!")})

},{"../glov/client/worker_thread.js":3}],2:[function(require,module,exports){
"use strict"
var typedarrays=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array]
if(!Uint8Array.prototype.slice){typedarrays.forEach(function(ArrayType){Object.defineProperty(ArrayType.prototype,"slice",{value:function value(begin,end){if(end===undefined){end=this.length}if(end<0){end=this.length-end}begin=begin||0
if(begin>=this.length){begin=this.length-1}if(end>this.length){end=this.length}if(end<begin){end=begin}var len=end-begin
var ret=new ArrayType(len)
for(var ii=0;ii<len;++ii){ret[ii]=this[begin+ii]}return ret}})})}function cmpDefault(a,b){return a-b}var replacements={join:function join(delim){return Array.prototype.join.call(this,delim)},fill:function fill(value,begin,end){if(end===undefined){end=this.length}for(var ii=begin||0;ii<end;++ii){this[ii]=value}return this},sort:function sort(cmp){Array.prototype.sort.call(this,cmp||cmpDefault)}}
var _loop=function _loop(key){if(!Uint8Array.prototype[key]){typedarrays.forEach(function(ArrayType){Object.defineProperty(ArrayType.prototype,key,{value:replacements[key]})})}}
for(var key in replacements){_loop(key)}if(!String.prototype.endsWith){Object.defineProperty(String.prototype,"endsWith",{value:function value(test){return this.slice(-test.length)===test}})
Object.defineProperty(String.prototype,"startsWith",{value:function value(test){return this.slice(0,test.length)===test}})}if(!String.prototype.includes){Object.defineProperty(String.prototype,"includes",{value:function value(search,start){return this.indexOf(search,start)!==-1}})}if(!Array.prototype.includes){Object.defineProperty(Array.prototype,"includes",{value:function value(search,start){return this.indexOf(search,start)!==-1}})}if(!Object.values){Object.values=function values(obj){return Object.keys(obj).map(function(k){return obj[k]})}}if(!Math.sign){Math.sign=function sign(a){return a<0?-1:a>0?1:0}}

},{}],3:[function(require,module,exports){
"use strict"
exports.addHandler=addHandler
exports.debugmsg=debugmsg
exports.endWork=endWork
exports.sendmsg=sendmsg
exports.startWork=startWork
require("./polyfill.js")
var assert=require("assert")
function sendmsg(id,data,transfer){postMessage({id:id,data:data},transfer)}function debugmsg(msg,clear){sendmsg("debugmsg",{msg:msg,clear:clear})}var handlers=[]
function addHandler(id,cb){assert(!handlers[id])
handlers[id]=cb}var time_work=0
var time_idle=0
var batch_timing=[]
var last_report_time=Date.now()
var timing_enabled=false
function reportTiming(now){if(now-last_report_time>100){var elapsed=time_work+time_idle
assert(elapsed<=now-last_report_time+10)
sendmsg("timing",{time_work:time_work,time_idle:time_idle,elapsed:elapsed,batches:batch_timing})
last_report_time=now
time_idle=time_work=0
batch_timing.length=0}}var last_work_end=last_report_time
var last_work_start=0
function startWork(){var now=Date.now()
var idle_time=now-last_work_end
if(timing_enabled){batch_timing.push(idle_time)}time_idle+=idle_time
last_work_start=now}function endWork(){var now=Date.now()
last_work_end=now
var batch_time=now-last_work_start
time_work+=batch_time
if(timing_enabled){batch_timing.push(batch_time)
reportTiming(now)}}onmessage=function onmessage(evt){startWork()
evt=evt.data
if(evt instanceof Object&&evt.id){assert(handlers[evt.id])
try{handlers[evt.id](evt.data)}catch(e){sendmsg("error",{message:e.message||String(e),stack:e.stack})}}else{console.log("worker (worker thread) unhandled message",evt)}endWork()}
addHandler("busy",function(data){var start=Date.now()
var a=1
var b=1
while(Date.now()-start<data){var c=a+b
a=b
b=c}sendmsg("busy_done",null)})
addHandler("timing_enable",function(data){timing_enabled=data})
sendmsg("log","WebWorker communication initialized")

},{"./polyfill.js":2,"assert":undefined}]},{},[1])




//# sourceMappingURL=worker.bundle.js.map
