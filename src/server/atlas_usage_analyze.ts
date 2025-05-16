import assert from 'assert';
import type { TSMap } from 'glov/common/types';
import { serverFSAPI } from 'glov/server/serverfs';
import { CellDesc, crawlerLoadData, CrawlerVisuals, getCellDescs, getWallDescs } from '../common/crawler_state';

let atlases: TSMap<TSMap<string[]>> = {};

function add(atlas: string, tile: string | string[], where: string): void {
  let at = atlases[atlas] = atlases[atlas] || {};
  if (!Array.isArray(tile)) {
    tile = [tile];
  }
  for (let ii = 0; ii < tile.length; ++ii) {
    let arr = at[tile[ii]] = at[tile[ii]] || [];
    if (!arr.includes(where)) {
      arr.push(where);
    }
  }
}

crawlerLoadData(serverFSAPI());
const descs = {
  walls: getWallDescs(),
  cells: getCellDescs(),
};
(['walls', 'cells'] as const).forEach((label) => {
  let desc = descs[label];
  let key = '';
  function flag(vr: CrawlerVisuals): void {
    for (let pass in vr) {
      let list = vr[pass]!;
      for (let ii = 0; ii < list.length; ++ii) {
        let elem = list[ii];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let opts = elem.opts as any;
        if (opts.atlas) {
          add(opts.atlas, opts.tile, `${label}:${key}`);
        }
      }
    }
  }
  for (key in desc) {
    let def = desc[key]!;
    flag(def.visuals_runtime);
    let celldef = def as CellDesc;
    if (celldef.visuals_visited_runtime) {
      flag(celldef.visuals_visited_runtime);
    }
    if (celldef.corners_runtime) {
      for (let cornertype in celldef.corners_runtime) {
        flag(celldef.corners_runtime[cornertype]!);
      }
    }
  }
});

let fs = serverFSAPI();
let filenames = fs.getFileNames('entities').filter((a) => a.endsWith('.entdef'));
for (let ii = 0; ii < filenames.length; ++ii) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ent_desc = fs.getFile(filenames[ii], 'jsobj') as any;
  let traits = ent_desc.traits || [];
  for (let jj = 0; jj < traits.length; ++jj) {
    let trait = traits[jj];
    if (trait.sprite_data) {
      let atlas = trait.sprite_data.atlas;
      assert(trait.anim_data);
      for (let akey in trait.anim_data) {
        let rec = trait.anim_data[akey];
        assert(rec && Array.isArray(rec.frames));
        for (let kk = 0; kk < rec.frames.length; ++kk) {
          assert(typeof rec.frames[kk] === 'string');
          add(atlas, rec.frames[kk], `ent:${filenames[ii]}`);
        }
      }
    }
  }
}

let for_display: typeof atlases = {};
for (let key2 in atlases) {
  for_display[key2] = atlases[key2];
}
// checked/verified:
delete for_display.default; // need to not prune this one anyway
delete for_display.demo; // too small too matter
// add others here: delete for_display.whitebox;
// console.log(for_display);

// next: display the _unused_ ones, then can add an "ignore" filter to autoatlas

let auto_atlases = fs.getFileNames('').filter((a) => a.endsWith('.auat'));
let unused: TSMap<true> = {};
auto_atlases.forEach(function (atlas_name) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = fs.getFile(atlas_name, 'jsobj') as any;
  atlas_name = atlas_name.slice(1).slice(0, -5);
  let at = atlases[atlas_name];
  if (atlas_name === 'default' || atlas_name === 'pixely' || atlas_name === 'map') {
    // silently ignore/include all, they're for UI / tiny
  } else if (!at) {
    console.log(`UNREFERENCED ATLAS "${atlas_name}"`);
  } else {
    for (let ii = 0; ii < data.tiles.length; ++ii) {
      let tilename = data.tiles[ii][0];
      if (!at[tilename]) {
        unused[`${atlas_name}:${tilename}`] = true;
      }
    }
  }
});
console.log(Object.keys(unused));

let count = 0;
for (let key in atlases) {
  count += Object.keys(atlases[key]!).length;
}
console.log(`${count} total used`);
