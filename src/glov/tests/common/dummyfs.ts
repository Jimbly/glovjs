import assert from 'assert';

import type { FSAPI, FilewatchCB } from 'glov/common/fsapi';
import type { DataObject } from 'glov/common/types';

export class DummyFS<DataType> implements FSAPI {
  files: Partial<Record<string, DataType>>;
  constructor(files: Partial<Record<string, DataType>>) {
    this.files = files;
  }

  getFileNames(directory: string): string[] {
    let ret = [];
    for (let key in this.files) {
      if (key.startsWith(directory)) {
        ret.push(key);
      }
    }
    return ret;
  }
  getFile<T>(filename: string, encoding: 'jsobj'): T;
  getFile(filename: string, encoding: 'buffer'): Buffer;
  getFile<T=Buffer>(filename: string, encoding: 'jsobj' | 'buffer'): T {
    assert(encoding === 'jsobj');
    let ret = this.files[filename];
    assert(ret);
    return ret as DataObject as T;
  }
  filewatchOn(ext_or_search: RegExp | string, cb: FilewatchCB): void {
    assert(false, 'Not implemented');
  }
}
