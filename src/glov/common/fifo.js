// FIFO queue implemented as a doubly-linked list (e.g. allows removal of any element)

const assert = require('assert');

let last_queue_id = 0;
function FIFO() {
  this.head = null;
  this.tail = null;
  this.count = 0;
  this.nkey = `n${++last_queue_id}`;
  this.pkey = `p${last_queue_id}`;
}
FIFO.prototype.length = function () {
  return this.count;
};
FIFO.prototype.add = function (item) {
  assert(!item[this.nkey]);
  assert(!item[this.pkey]);
  item[this.pkey] = this.tail;
  if (this.tail) {
    this.tail[this.nkey] = item;
    this.tail = item;
  } else {
    this.head = this.tail = item;
  }
  ++this.count;
};
FIFO.prototype.remove = function (item) {
  let prev = item[this.pkey];
  let next = item[this.nkey];
  if (prev) {
    prev[this.nkey] = next;
    item[this.pkey] = null;
  } else {
    assert.equal(this.head, item);
    assert(item !== next);
    this.head = next;
  }
  if (next) {
    next[this.pkey] = prev;
    item[this.nkey] = null;
  } else {
    assert.equal(this.tail, item);
    this.tail = prev;
  }
  --this.count;
};
FIFO.prototype.contains = function (item) {
  return this.head === item || item[this.pkey];
};
FIFO.prototype.peek = function () {
  return this.head;
};
FIFO.prototype.pop = function () {
  if (!this.count) {
    return null;
  }
  assert(this.head);
  let head = this.head;
  this.remove(head);
  return head;
};
FIFO.prototype.size = function () {
  return this.count;
};

export function fifoCreate() {
  return new FIFO();
}
