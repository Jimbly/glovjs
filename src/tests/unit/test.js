/*global describe,it*/

var expect = require('chai').expect;

describe('#mod', () => {
  var mod = require('../../common/js_mod.js');
  it('test', () => {
    expect(mod.test()).to.equal(1);
  });

  it('let', () => {
    expect(mod.uselet()).to.equal(1);
  });

  it('const', () => {
    expect(mod.useconst()).to.equal(1);
  });
});

describe('#ts_mod', () => {
  var mod = require('../../common/ts_mod.js');
  it('test', () => {
    expect(mod.test()).to.equal(1);
  });

  it('let', () => {
    expect(mod.uselet()).to.equal(1);
  });

  it('const', () => {
    expect(mod.useconst()).to.equal(1);
  });
});
