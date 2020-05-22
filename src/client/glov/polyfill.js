/* eslint no-extend-native:off,no-var:off,func-style:off,no-invalid-this:off */

// TypedArray.slice - not supported on IE, some older Safari
if (!Uint8Array.prototype.slice) {
  Object.defineProperty(Uint8Array.prototype, 'slice', {
    value: function (begin, end) {
      // PERFTODO: If we use this on any significant audience, this can be likely
      // way faster by not making a temporary Array in the middle
      return new Uint8Array(Array.prototype.slice.call(this, begin, end));
    }
  });
  Object.defineProperty(Int8Array.prototype, 'slice', {
    value: function (begin, end) {
      return new Int8Array(Array.prototype.slice.call(this, begin, end));
    }
  });
  Object.defineProperty(Int32Array.prototype, 'slice', {
    value: function (begin, end) {
      return new Int32Array(Array.prototype.slice.call(this, begin, end));
    }
  });
  Object.defineProperty(Float32Array.prototype, 'slice', {
    value: function (begin, end) {
      return new Float32Array(Array.prototype.slice.call(this, begin, end));
    }
  });
}

if (!Int32Array.prototype.join) {
  Object.defineProperty(Int32Array.prototype, 'join', {
    value: function (delim) {
      return Array.prototype.join.call(this, delim);
    }
  });
}

if (!Uint8Array.prototype.fill) {
  var fill = function (value, begin, end) {
    if (end === undefined) {
      end = this.length;
    }
    for (var ii = begin || 0; ii < end; ++ii) {
      this[ii] = value;
    }
    return this;
  };
  Object.defineProperty(Uint8Array.prototype, 'fill', {
    value: fill
  });
  Object.defineProperty(Int16Array.prototype, 'fill', {
    value: fill
  });
  Object.defineProperty(Int32Array.prototype, 'fill', {
    value: fill
  });
  Object.defineProperty(Uint32Array.prototype, 'fill', {
    value: fill
  });
}

if (!Int16Array.prototype.sort) {
  var cmpDefault = function (a, b) {
    return a - b;
  };
  var sort = function (cmp) {
    Array.prototype.sort.call(this, cmp || cmpDefault);
  };
  Object.defineProperty(Int16Array.prototype, 'sort', {
    value: sort
  });
}
