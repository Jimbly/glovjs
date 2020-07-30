// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const fs = require('fs');
const FileStore = require('fs-store').FileStore;
const mkdirp = require('mkdirp');
const path = require('path');
const { callEach, clone } = require('../../common/util.js');

class DataStoreOneFile {
  constructor(store_path) {
    this.root_store = new FileStore(store_path);
  }
  setAsync(obj_name, value, cb) {
    setImmediate(() => {
      let obj;
      if (Buffer.isBuffer(value)) {
        obj = value.toString('utf8');
      } else {
        obj = value;
      }
      this.root_store.set(obj_name, obj);
      cb();
    });
  }
  getAsync(obj_name, default_value, cb) {
    setImmediate(() => {
      let obj = this.root_store.get(obj_name, default_value);
      cb(null, obj);
    });
  }
  getAsyncBuffer(obj_name, cb) {
    this.getAsync(obj_name, '', null, function (err, value) {
      if (!err && value !== null) {
        value = Buffer.from(value, 'utf8');
      }
      return cb(err, value);
    });
  }
  unload(obj_name) { // eslint-disable-line class-methods-use-this
    // doing nothing, as we're not loading individualf iles
  }
}

class DataStore {
  constructor(store_path) {
    this.path = store_path;
    this.stores = {};
    this.bin_queue = {};
    this.mkdirs = {};
    this.mkdir(store_path);
  }
  mkdir(store_path) {
    if (this.mkdirs[store_path]) {
      return;
    }
    mkdirp.sync(store_path);
    this.mkdirs[store_path] = true;
  }
  getStore(obj_name) {
    let store = this.stores[obj_name];
    if (!store) {
      let store_path = path.join(this.path, `${obj_name}.json`);
      this.mkdir(path.dirname(store_path));
      store = this.stores[obj_name] = new FileStore(store_path);
    }
    return store;
  }
  unload(obj_name) {
    let store = this.stores[obj_name];
    assert(store);
    delete this.stores[obj_name];
  }

  setAsyncBufferInternal(obj_name, value, cb) {
    if (this.bin_queue[obj_name]) {
      this.bin_queue[obj_name].value = value;
      this.bin_queue[obj_name].cbs.push(cb);
      return;
    }
    let store = this.getStore(obj_name);

    let onFinish;
    let startWrite = () => {
      // save separately, update reference
      let old_ext = store.get('bin');
      let bin_ext = old_ext && old_ext === 'b1' ? 'b2' : 'b1';
      let path_base = path.join(this.path, obj_name);
      let bin_path = `${path_base}.${bin_ext}`;
      this.bin_queue[obj_name] = { cbs: [] };
      fs.writeFile(bin_path, value, function (err) {
        if (err) {
          // Shouldn't ever happen, out of disk space, maybe?
          return void onFinish(err);
        }
        store.set('bin', bin_ext);
        store.set('data', null);
        // Could also delete the old bin file after the flush, but safer to keep it around
        store.onFlush(onFinish);
      });
    };
    let cur_cbs = [cb];
    onFinish = (err) => {
      let queued = this.bin_queue[obj_name];
      let { cbs } = queued;
      delete this.bin_queue[obj_name];
      callEach(cur_cbs, null, err);
      if (cbs.length) {
        value = queued.value;
        cur_cbs = cbs;
        startWrite();
      }
    };
    startWrite();
  }

  setAsync(obj_name, value, cb) {
    assert.equal(typeof cb, 'function');
    setImmediate(() => {
      if (Buffer.isBuffer(value)) {
        return void this.setAsyncBufferInternal(obj_name, value, cb);
      }
      let store = this.getStore(obj_name);
      assert(!store.get('bin'));
      store.set('data', clone(value));
      cb();
    });
  }
  getAsync(obj_name, default_value, cb) {
    setImmediate(() => {
      let store = this.getStore(obj_name);
      assert(!store.get('bin'));
      let obj = store.get('data', default_value);
      cb(null, obj && obj !== default_value ? clone(obj) : obj);
    });
  }
  getAsyncBuffer(obj_name, cb) {
    assert(!this.bin_queue[obj_name]); // Currently being set
    setImmediate(() => {
      let store = this.getStore(obj_name);
      let bin_ext = store.get('bin');
      if (bin_ext) {
        let path_base = path.join(this.path, `${obj_name}.${bin_ext}`);
        return void fs.readFile(path_base, cb);
      }
      // No binary file, is there an old text object stored here?
      let obj = store.get('data', null);
      if (obj !== null) {
        assert.equal(typeof obj, 'string'); // Could maybe JSON.stringify and return that if something else?
        return void cb(null, Buffer.from(obj, 'utf8'));
      }
      cb(null, null);
    });
  }

  // Buffer or string, for migration utilities
  getAsyncAuto(obj_name, cb) {
    assert(!this.bin_queue[obj_name]); // Currently being set
    setImmediate(() => {
      let store = this.getStore(obj_name);
      let bin_ext = store.get('bin');
      if (bin_ext) {
        let path_base = path.join(this.path, `${obj_name}.${bin_ext}`);
        return void fs.readFile(path_base, cb);
      }
      // No binary file
      cb(null, store.get('data', null));
    });
  }

}

// Init the type of datastore system
export function create(store_path, one_file) {
  if (one_file) {
    return new DataStoreOneFile(store_path);
  }

  // Defaults to FileStore (this will be the behaviour in local environment)
  console.info('[DATASTORE] Local FileStore in use');
  return new DataStore(store_path);
}
