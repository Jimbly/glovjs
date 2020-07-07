/* eslint callback-return:off */

const { deepEqual } = require('../../common/util.js');

function DataStoreMirror(readwrite_ds, write_ds) {
  this.readwrite_ds = readwrite_ds;
  this.write_ds = write_ds;
}

DataStoreMirror.prototype.unload = function (obj_name) {
  this.readwrite_ds.unload(obj_name);
  this.write_ds.unload(obj_name);
};

DataStoreMirror.prototype.setAsync = function (obj_name, value, cb) {
  let err_ret = null;
  let left = 2;
  function onDone(err) {
    if (err) {
      err_ret = err;
    }
    if (!--left) {
      cb(err_ret);
    }
  }
  this.readwrite_ds.setAsync(obj_name, value, onDone);
  this.write_ds.setAsync(obj_name, value, onDone);
};

DataStoreMirror.prototype.getAsync = function (obj_name, default_value, cb) {
  let left = 2;
  let err_ret = [];
  let data_ret = [];
  function onDone(idx, err, data) {
    err_ret[idx] = err;
    data_ret[idx] = data;
    if (!--left) {
      // Do data checks
      if (Boolean(err_ret[0]) !== Boolean(err_ret[1])) {
        console.error(`DATASTOREMIRROR Error Mismatch on ${obj_name}, err_rw:`, err_ret[0], ', err_w:', err_ret[1]);
      } else if (!err_ret[0]) {
        // Both read data, should be identical
        if (!deepEqual(data_ret[0], data_ret[1])) {
          console.error(`DATASTOREMIRROR Data Mismatch on ${obj_name}:`);
          console.error(`  d0: ${JSON.stringify(data_ret[0])}`);
          console.error(`  d1: ${JSON.stringify(data_ret[1])}`);
        }
      }

      // Trust readwrite_ds and return to caller
      cb(err_ret[0], data_ret[0]);
    }
  }
  this.readwrite_ds.getAsync(obj_name, default_value, onDone.bind(null, 0));
  this.write_ds.getAsync(obj_name, default_value, onDone.bind(null, 1));
};

DataStoreMirror.prototype.getAsyncBuffer = function (obj_name, cb) {
  let left = 2;
  let err_ret = [];
  let data_ret = [];
  function onDone(idx, err, data) {
    err_ret[idx] = err;
    data_ret[idx] = data;
    if (!--left) {
      // Do data checks
      if (Boolean(err_ret[0]) !== Boolean(err_ret[1])) {
        console.error(`DATASTOREMIRROR Error Mismatch on ${obj_name} (Buffer), err_rw:`,
          err_ret[0], ', err_w:', err_ret[1]);
      } else if (!err_ret[0]) {
        // Both read data, should be identical
        if (data_ret[0].compare(data_ret[1]) !== 0) {
          console.error(`DATASTOREMIRROR Data Mismatch on ${obj_name} (Buffer)`);
          console.error(`  d0: ${JSON.stringify(data_ret[0].toString())}`);
          console.error(`  d1: ${JSON.stringify(data_ret[1].toString())}`);
        }
      }

      // Trust readwrite_ds and return to caller
      cb(err_ret[0], data_ret[0]);
    }
  }
  this.readwrite_ds.getAsyncBuffer(obj_name, onDone.bind(null, 0));
  this.write_ds.getAsyncBuffer(obj_name, onDone.bind(null, 1));
};

export function create(readwrite_ds, write_ds) {
  return new DataStoreMirror(readwrite_ds, write_ds);
}
