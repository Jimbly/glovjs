/* jshint browser:true*/

exports.storage_prefix = 'demo';

let _local_storage_sim = {};
export function get(key) {
  key = exports.storage_prefix + '_' + key;
  let ret;
  try {
    ret = localStorage[key];
  } catch (e) {
    ret = _local_storage_sim[key];
  }
  if (ret === 'undefined') {
    ret = undefined;
  }
  return ret;
}

export function set(key, value) {
  key = exports.storage_prefix + '_' + key;
  try {
    localStorage[key] = value;
  } catch (e) {
    _local_storage_sim[key] = value;
  }
}

export function setJSON(key, value) {
  set(key, JSON.stringify(value));
}

export function getJSON(key, def) {
  let value = get(key);
  try {
    return JSON.parse(value);
  } catch (e) {
  }
  return def;
}
