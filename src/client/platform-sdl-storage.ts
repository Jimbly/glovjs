// No imports except types and localStorage, need 0% chance of registering settings, etc before our hook
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { filewatchTriggerChange } from 'glov/client/filewatch';
import {
  getStoragePrefix,
  localStorageAddExternalStore,
} from 'glov/client/local_storage';
import {
  DataObject,
  ErrorCallback,
  TSMap,
  VoidFunc,
} from 'glov/common/types';
import { forwardSlashes } from 'glov/common/util';
import { asyncSeries } from 'glov-async';

const MAX_RETRIES = 10;
let MAX_BACKUPS: number;
const BACKUP_KEEP_TIME = 5*60*1000;

let storage_root: string; // no trailing slash
let files_root: string;
let user_storage_key: string; // `local` or Steam ID3
let user_file_prefix: string; // user-${user_storage_key}-

let inited = false;
export function storagePostInit(): void {
  assert(inited);
}

let after_init_cbs: (() => void)[] | null = [];

let data_store: TSMap<string | DataObject> = Object.create(null);

let flush_queue: string[] = [];
let flush_in_progress = false;
let shutting_down = false;

let suppress_changes: Partial<Record<string, true>> = Object.create(null);

function localAppDataPath(): string {
  let base: string;
  if (process.platform === 'win32') {
    base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  return forwardSlashes(path.join(base, getStoragePrefix()));
}

function prefixUserFile(output_file: string): string {
  let parsed = path.parse(output_file);
  if (parsed.base.startsWith('user-')) {
    assert(!parsed.base.startsWith(user_file_prefix));
    output_file = `${parsed.dir}/${user_file_prefix}${parsed.base.slice('user-'.length)}`;
  }
  return output_file;
}

let on_flush_finish: VoidFunc | undefined;

function flushStep(): void {
  if (!flush_queue.length || flush_in_progress) {
    if (on_flush_finish) {
      let cb = on_flush_finish;
      on_flush_finish = undefined;
      cb();
    }
    return;
  }
  flush_in_progress = true;
  let file = flush_queue.shift()!;
  let data = data_store[file];
  if (data !== undefined && file.endsWith('.json') && !file.includes('files/')) {
    data = JSON.stringify(data, undefined, 2);
  }
  assert(data === undefined || typeof data === 'string');
  let output_file: string;
  let files_id: string | null = null;
  let backup_path: string | null = null;
  if (file.startsWith('files/')) {
    files_id = file.slice('files/'.length);
    suppress_changes[files_id] = true;
    output_file = `${files_root}/${files_id}`;
    backup_path = `${localAppDataPath()}/backups/files/${files_id}`;
  } else {
    output_file = `${storage_root}/${file}`;
    backup_path = prefixUserFile(`${localAppDataPath()}/backups/${file}`);
  }
  output_file = prefixUserFile(output_file);
  let temp_file_temp = `${output_file}.tmp`;
  let temp_file_backup = `${output_file}.bak`;
  type NextFn = (err?: unknown) => void;
  type OpFn = (next: NextFn) => void;
  function retry(fn: OpFn): OpFn {
    return function (next: NextFn): void {
      let retries = 0;
      function doit(): void {
        fn(function (err) {
          if (!err) {
            return next(err);
          }
          ++retries;
          if (retries === MAX_RETRIES) {
            console.log(`Operation failed, retries exhausted, failing: ${err}`);
            return next(err);
          }
          console.log(`Operation failed, retrying: ${err}`);
          setTimeout(doit, 250);
        });
      }
      doit();
    };
  }
  function deleteFile(filename: string): OpFn {
    return retry((next: NextFn) => {
      fs.exists(filename, function (exists) {
        if (!exists) {
          return next();
        }
        fs.unlink(filename, next);
      });
    });
  }
  function renameFile(oldname: string, newname: string): OpFn {
    return retry((next: NextFn) => {
      fs.exists(oldname, function (exists) {
        if (!exists) {
          return next();
        }
        fs.rename(oldname, newname, next);
      });
    });
  }
  asyncSeries([
    retry(function mkdir(next) {
      if (file.includes('/') && data !== undefined) {
        fs.mkdir(path.dirname(output_file), { recursive: true }, next);
      } else {
        next();
      }
    }),
    deleteFile(temp_file_temp),
    retry(function writeFileToTemp(next) {
      assert(data === undefined || typeof data === 'string');
      if (data === undefined) {
        // writing nothing
        fs.unlink(output_file, function (err) {
          if (err) {
            console.error(`Ignoring error unlinking "${output_file}"`, err);
          }
          next();
        });
      } else {
        fs.writeFile(temp_file_temp, data, next);
      }
    }),
    deleteFile(temp_file_backup),
    renameFile(output_file, temp_file_backup),
    renameFile(temp_file_temp, output_file),
    function deleteBackup(next) {
      if (files_id) {
        deleteFile(temp_file_backup)(next);
      } else {
        // settings, etc, leave 1 backup in-place
        next();
      }
    },
    retry(function mkdirBackups(next) {
      if (data === undefined || !backup_path) {
        return next();
      }
      fs.mkdir(path.dirname(backup_path), { recursive: true }, next);
    }),
    retry(function cycleBackups(next) {
      if (data === undefined || !backup_path) {
        return next();
      }
      fs.stat(`${backup_path}.001`, function (err, stat) {
        if (!err && (Date.now() - stat.mtime.getTime()) < BACKUP_KEEP_TIME) {
          // file exists, and is recent, just overwrite the current backup, no cycling
          return next();
        }
        function vacate(idx: number, next: NextFn): void {
          let fn = idx ? `${backup_path}.00${idx}` : backup_path!;
          fs.exists(fn, function (exists) {
            if (!exists) {
              return next();
            }
            if (idx === MAX_BACKUPS) {
              fs.unlink(fn, next);
            } else {
              vacate(idx + 1, function () {
                fs.rename(fn, `${backup_path}.00${idx+1}`, next);
              });
            }
          });
        }
        vacate(0, next);
      });
    }),
    retry(function writeFileToBackups(next) {
      assert(data === undefined || typeof data === 'string');
      if (data === undefined || !backup_path) {
        return next();
      }
      fs.writeFile(backup_path, data, next);
    }),
  ], function (err) {
    flush_in_progress = false;
    setImmediate(flushStep);
    if (files_id) {
      delete suppress_changes[files_id];
    }
    if (err) {
      throw err;
    }
  });
}

function flushFile(file: string): void {
  if (flush_queue.includes(file)) {
    return;
  }
  flush_queue.push(file);
  setImmediate(flushStep);
}

function restoreFromBaks(): void {
  for (let key in data_store) {
    if (key.endsWith('.bak')) {
      let base_name = key.slice(0, -4);
      if (!data_store[base_name]) {
        console.log(`[STORAGE] Found .bak file "${key}" without matching source, restoring...`);
        data_store[base_name] = data_store[key];
      }
      delete data_store[key];
    }
  }
}

function initDone(): void {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  storageRegister();
  console.log(`[STORAGE] Storage initialized, ${Object.keys(data_store).length} files loaded`);
  let cbs = after_init_cbs!;
  after_init_cbs = null;
  for (let ii = 0; ii < cbs.length; ++ii) {
    cbs[ii]();
  }
}

// Could be exported if needed
function storageWhenReady(cb: () => void): void {
  if (after_init_cbs) {
    after_init_cbs.push(cb);
  } else {
    cb();
  }
}

function scanStorage(): void {
  let left = 0;
  function done(): void {
    --left;
    if (!left) {
      restoreFromBaks();
      initDone();
    }
  }
  function scanDir(dir: string, recursive: boolean): void {
    ++left;
    let disk_dir: string;
    if (dir.startsWith('files')) {
      let subdir = dir.slice('files/'.length);
      disk_dir = `${files_root}${subdir ? '/' : ''}${subdir}`;
    } else {
      disk_dir = `${storage_root}${dir ? '/' : ''}${dir}`;
    }
    fs.readdir(disk_dir, function (err, files: string[]) {
      if (err) {
        throw err;
      }
      files.forEach(function (filename) {
        if (filename[0] === '.') {
          return;
        }
        let file_disk_dir = `${disk_dir}/${filename}`;
        let file_dir: string;
        if (filename.startsWith(user_file_prefix)) {
          file_dir = `${dir}${dir ? '/' : ''}user-${filename.slice(user_file_prefix.length)}`;
        } else if (filename.startsWith('user-')) {
          // old data, ignore
          return;
        } else {
          file_dir = `${dir}${dir ? '/' : ''}${filename}`;
        }
        ++left;
        fs.stat(file_disk_dir, function (err, stats) {
          if (err) {
            console.error(`Error statting ${file_disk_dir}`, err);
            return done();
          }
          if (stats.isDirectory()) {
            if (recursive) {
              scanDir(file_dir, recursive);
            }
            return done();
          }
          fs.readFile(file_disk_dir, 'utf8', function (err, data) {
            if (err) {
              console.error(`Error reading ${file_disk_dir}`, err);
              return done();
            }
            if ((filename.endsWith('.json') || filename.endsWith('.json.bak')) && !dir.includes('files')) {
              try {
                data = JSON.parse(data);
              } catch (e) {
                console.error(`Error parsing ${file_disk_dir}`, e);
                return done();
              }
            }
            data_store[file_dir] = data;
            done();
          });
        });
      });
      done();
    });
  }
  scanDir('', false);
  scanDir('files', false);
}


export function storageSetKey(storage_key: string): void {
  assert(!inited);
  user_storage_key = storage_key;

}

export type StorageParams = {
  max_backups: number;
};

export function storageStartup(params: StorageParams, next: VoidFunc): void {
  assert(!inited);
  inited = true; // invalid to call storageSetKey after this line
  MAX_BACKUPS = params.max_backups || 3; // QP2A: 9
  assert(MAX_BACKUPS <= 9); // needs code changes otherwise

  storageWhenReady(next);

  user_storage_key = user_storage_key || 'local';
  let application_root = window.application_root;
  assert(application_root.endsWith('/data/'));
  storage_root = `${application_root.slice(0, -('/data/'.length))}/user`;

  user_file_prefix = `user-${user_storage_key}-`;
  files_root = `${storage_root}/files/${user_storage_key}`;
  console.log(`[STORAGE] Using storage path: "${storage_root}"`);
  let files_changing: Partial<Record<string, true>> = Object.create(null);
  let files_changed: Partial<Record<string, true>> = Object.create(null);
  function handleFileChange(filename: string, new_contents: string | undefined): void {
    let file_dir = `files/${filename}`;
    let old_data = data_store[file_dir];
    if (old_data === new_contents) {
      return;
    }
    console.log(`[STORAGE] Detected ${new_contents ? 'change to' : 'delete of'} "${filename}"`);
    data_store[file_dir] = new_contents;
    let m = file_dir.match(/^files\/(.+)\.(txt|json)$/);
    assert(m);
    filewatchTriggerChange(`${m[1]}.localStorage`);
  }
  function onFileChange(event_type: string, filename: string | null): void {
    if (!filename) {
      return;
    }
    if (!filename.match(/^([^/\\]+)\.(txt|json)$/)) {
      return;
    }
    if (suppress_changes[filename]) {
      return;
    }
    if (files_changing[filename]) {
      files_changed[filename] = true;
      return;
    }
    delete files_changed[filename];
    files_changing[filename] = true;
    fs.readFile(`${files_root}/${filename}`, 'utf8', function (err, data?: string) {
      delete files_changing[filename];
      if (files_changed[filename]) {
        // Another changed happened, start over
        return void onFileChange(event_type, filename);
      }
      if (err || !data) {
        handleFileChange(filename, undefined);
      } else {
        handleFileChange(filename, data);
      }
    });
  }
  function mkdirIfNotExist(folder: string, next: (err?: unknown) => void): void {
    fs.exists(folder, function (exists) {
      if (exists) {
        return next();
      }
      fs.mkdir(folder, { recursive: true }, next);
    });
  }
  mkdirIfNotExist(storage_root, function (err) {
    if (err) {
      console.error(`Failed to create storage directory "${storage_root}":`, err);
      storage_root = forwardSlashes(`${localAppDataPath()}/glov-user`);
      console.error(`Using fallback storage directory "${storage_root}"`);
      if (!fs.existsSync(storage_root)) {
        fs.mkdirSync(storage_root);
      }
      files_root = `${storage_root}/files/${user_storage_key}`;
    }
    mkdirIfNotExist(files_root, function (err) {
      if (err) {
        console.error(`Failed to create storage directory "${files_root}":`, err);
      }
      fs.watch(files_root, 'utf8', onFileChange);
      scanStorage();
    });
  });

}


function storageSetFile(
  file: string,
  value: string | undefined,
): void {
  assert(value === undefined || typeof value === 'string');
  let full_path: string;
  let key: string;
  if (file.startsWith('files')) {
    full_path = forwardSlashes(path.resolve(files_root, file.slice('files/'.length)));
    key = `files/${forwardSlashes(path.relative(files_root, full_path))}`;
  } else {
    // this path should never be hit
    full_path = forwardSlashes(path.resolve(storage_root, file));
    key = forwardSlashes(path.relative(storage_root, full_path));
  }
  assert(full_path.startsWith(files_root), 'storage-set-file received invalid path' +
    ` ${JSON.stringify(file)}, resolved to ${JSON.stringify(full_path)}`);
  if (data_store[key] === value) {
    return;
  }
  if (value === undefined) {
    delete data_store[key];
  } else {
    data_store[key] = value;
  }
  flushFile(key);
}

function storageSetJSON(file: string, field: string, value: unknown): void {
  assert(file.endsWith('.json'));
  let obj = data_store[file];
  if (obj) {
    assert(typeof obj === 'object');
  } else {
    data_store[file] = obj = {};
  }
  if (obj[field] === value) {
    return;
  }
  if (value === undefined) {
    delete obj[field];
  } else {
    obj[field] = value;
  }

  flushFile(file);
}

function settingsFile(key: string): string | null {
  if (
    key.startsWith('flag_') || // ui_test
    [
      'cmd_parse_leaderboardmode', // QP2A
      'cmd_parse_delayederror', // QP2A
      'demo_migrate_done', // QP2A
      'demo_migrate_avail', // QP2A
      'cmd_parse_gfxmode', // moraff
      'cmd_parse_fovmode', // moraff
      'cmd_parse_heighteffect', // moraff
    ].includes(key)
  ) {
    return 'user-settings.json';
  } else if (
    key.startsWith('window-') || // sdl-window-state
    [
      'cmd_parse_maxfps_2',
      'cmd_parse_useanimationframe',
      'cmd_parse_volume',
      'cmd_parse_volumemusic',
      'cmd_parse_volumesound',
      'cmd_parse_volumebeeps', // QP2A
      'cmd_parse_pixelperfect', // QP2A
    ].includes(key)
  ) {
    return 'device-settings.json';
  } else if (
    key.startsWith('lt.') || // QP2A
    key.match(/^p.+\.\d+$/) || // QP2A
    key.startsWith('win_count') || // QP2A
    key.startsWith('ach.') || // QP2A
    key === 'cmd_parse_solitaire_unlocked' // QP2A
  ) {
    return 'user-stats.json';
  } else if (
    key.startsWith('uitest.') || // ui_test
    key.match(/^c.+\.\d+$/) || // QP2A
    key.match(/^z.+\.best$/) || // QP2A
    key.match(/^z.+\.oldbest$/) || // QP2A
    key.startsWith('savedgame_') // crawlers
  ) {
    return 'file';
  }
  return 'local-storage.json';
}

function filenameForKey(key: string): string {
  // QP2A let ext = key.startsWith('z') ? 'json' : 'txt';
  let ext = 'json';
  return `files/${key}.${ext}`;
}

function storageRegister(): void {
  localStorageAddExternalStore({
    test: function (key: string): boolean {
      return Boolean(settingsFile(key));
    },
    get: function (key: string): string | undefined {
      let settings_file = settingsFile(key);
      assert(settings_file);
      if (settings_file === 'file') {
        let entry = data_store[filenameForKey(key)] as string | undefined;
        return entry;
      }
      let obj = data_store[settings_file] as TSMap<string> | undefined;
      if (!obj) {
        return undefined;
      }
      return obj[key];
    },
    set: function (key: string, value: string | undefined): void {
      if (shutting_down) {
        console.error(`localStorage write after shutdown "${key}"="${value}"`);
        return;
      }
      let settings_file = settingsFile(key);
      assert(settings_file);
      if (settings_file === 'file') {
        let filename = filenameForKey(key);
        storageSetFile(filename, value);
        return;
      }
      storageSetJSON(settings_file, key, value);
    },
  });
}

export function storageShutdown(next: VoidFunc): void {
  assert(!shutting_down);
  shutting_down = true;
  if (flush_in_progress || flush_queue.length) {
    on_flush_finish = next;
  } else {
    next();
  }
}


let demo_migrate: null | {
  demo_files_root: string;
  files: string[];
} = null;

// Returns number of files found in demo folder
export function demoMigrateAvail(): number {
  // TODO: this is fairly QP2A-specific
  // QP2ATODO: use Steamworks::apps.appInstallDir(demo_app_id)
  let demo_storage_root = path.resolve(storage_root, '../../GameName Demo/user');
  let demo_files_root = files_root.replace(storage_root, demo_storage_root);
  assert(demo_files_root !== files_root);
  console.log(`[DemoMigrate] Looking for demo files in ${demo_files_root}...`);
  try {
    if (!fs.existsSync(demo_files_root)) {
      console.log('[DemoMigrate] Folder not found.');
      return 0;
    }
    let files = fs.readdirSync(demo_files_root);
    let solution_files = files.filter((a) => a.endsWith('.txt')).length;
    console.log(`[DemoMigrate] ${solution_files} solutions, ${files.length} total files available to migrate`);
    demo_migrate = {
      demo_files_root,
      files,
    };
    return solution_files;
  } catch (e) {
    console.log('[DemoMigrate] Ignoring error:');
    console.error(e);
  }
  return 0;
}

export type DemoMigrateResult = {
  skipped: number;
  copied: number;
};

export function demoMigrateExec(next: ErrorCallback<DemoMigrateResult>): void {
  assert(demo_migrate);
  let { demo_files_root, files } = demo_migrate;
  let migrate_ret: DemoMigrateResult;
  try {
    let ret = 0;
    let skipped = 0;
    for (let ii = 0; ii < files.length; ++ii) {
      let file = files[ii];
      let source_path = `${demo_files_root}/${file}`;
      let dest_path = `${files_root}/${file}`;
      if (fs.existsSync(dest_path)) {
        // already exists, ignore
        ++skipped;
      } else {
        console.log(`[DemoMigrate] Copying ${source_path} to ${dest_path}...`);
        fs.copyFileSync(source_path, dest_path, fs.constants.COPYFILE_EXCL);
        ++ret;
      }
    }
    console.log(`[DemoMigrate] Copied ${ret} files, skipped ${skipped} files that already existed in destination`);
    migrate_ret = {
      copied: ret,
      skipped,
    };
  } catch (e) {
    return next(e);
  }
  next(null, migrate_ret);
}
