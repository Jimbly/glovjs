import assert from 'assert';
import { asyncSeries } from 'glov-async';
import { DataObject } from 'glov/common/types';
import {
  empty,
  once,
} from 'glov/common/util';
import 'glov/server/test';

asyncSeries([
  function testOnce(next) {
    let called = false;
    function foo(): void {
      assert(!called);
      called = true;
    }
    let bar = once(foo);
    bar();
    bar();
    assert(called);
    next();
  },
  function testMisc(next) {
    assert(empty({}));
    assert(!empty({ foo: 'bar' }));
    assert(empty([] as unknown as DataObject));
    assert(!empty([1] as unknown as DataObject));
    next();
  },
  function testEmpty(next) {
    class Foo {
      bar: string;
      constructor() {
        this.bar = 'baz';
      }
    }
    assert(!empty(new Foo() as unknown as DataObject));
    class Foo2 {
      declare bar: string;
    }
    assert(empty(new Foo2() as unknown as DataObject));
    class Foo3 {
      bar!: string;
    }
    assert(!empty(new Foo3() as unknown as DataObject));
    class Foo4 {
      bar?: string;
    }
    assert(!empty(new Foo4() as unknown as DataObject));
    next();
  },
], function (err) {
  if (err) {
    throw err;
  }
});