import type { DataObject, TSMap } from 'glov/common/types';

let asset_mappings = typeof window === 'undefined' ?
  {} :
  (window as unknown as DataObject).glov_asset_mappings as TSMap<string>;
let asset_dir = asset_mappings && asset_mappings.asset_dir || '';

export function locateAsset(name: string): string {
  if (!asset_mappings) {
    // shouldn't happen, but this should be safe as a fallback
    return name;
  }
  let m = asset_mappings[name];
  if (!m) {
    return name;
  }
  let ret = `${asset_dir}/${m}`;
  let idx = name.lastIndexOf('.');
  if (idx !== -1) {
    ret += name.slice(idx);
  }
  return ret;
}

// Called in development before doing any reloads (as we don't reload asset_mappings)
export function locateAssetDisableHashing(): void {
  asset_mappings = {};
}

export function unlocatePaths(s: string | null | undefined): string {
  let reverse_lookup = Object.create(null);
  for (let key in asset_mappings) {
    reverse_lookup[asset_mappings[key]!] = key;
  }
  return String(s).replace(new RegExp(`${asset_dir}/([a-zA-Z0-9]+)\\.\\w+`, 'g'), function (match, hash) {
    let m = reverse_lookup[hash];
    return m || match;
  });
}
