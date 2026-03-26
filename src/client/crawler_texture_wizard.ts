import assert from 'assert';
import { autoAtlas, autoAtlasOnImage } from 'glov/client/autoatlas';
import { editBox } from 'glov/client/edit_box';
import { filewatchOn } from 'glov/client/filewatch';
import { ALIGN, fontStyleColored } from 'glov/client/font';
import { KEYS } from 'glov/client/input';
import {
  button,
  buttonText,
  checkbox,
  panel,
  uiButtonHeight,
  uiButtonWidth,
  uiGetFont,
  uiTextHeight,
} from 'glov/client/ui';
import { webFSAPI, webFSExists, webFSGetFile } from 'glov/client/webfs';
import { TSMap } from 'glov/common/types';
import {
  CellDesc,
  CrawlerVisuals,
  getCellDescs,
  getWallDescs,
} from '../common/crawler_state';
import { crawlerRoom } from './crawler_play';
import { crawlerRenderViewportGet } from './crawler_render';

const { floor } = Math;

const ATLASES = [
  'demo',
  'utumno',
];

let inited = false;
let all_images: TSMap<boolean>;
let dirty = false;
function textureWizardInit(): void {
  if (inited) {
    return;
  }
  inited = true;
  all_images = Object.create(null);

  ATLASES.forEach(function (atlas_name) {
    autoAtlasOnImage(atlas_name, function (img_name: string) {
      if (img_name === 'def') {
        return;
      }
      let key = `${atlas_name}/${img_name}`;
      all_images[key] = true;
      dirty = true;
    });
  });
  function setDirty(): void {
    dirty = true;
  }
  filewatchOn(/^atlases\/ignored/, setDirty);
  filewatchOn('.walldef', setDirty);
  filewatchOn('.celldef', setDirty);
  filewatchOn('.vstyle', setDirty);
}

type IgnoreFile = {
  tiles: string[];
};

let unused: string[] = [];
function textureWizardFindUnused(): void {
  dirty = false;
  let used = Object.create(null);

  let ignore_file = webFSGetFile('atlases/ignored', 'jsobj') as IgnoreFile;
  for (let ii = 0; ii < ignore_file.tiles.length; ++ii) {
    used[ignore_file.tiles[ii]] = true;
  }

  function add(atlas: string, tile: string | string[], where: string): void {
    if (!Array.isArray(tile)) {
      tile = [tile];
    }
    for (let ii = 0; ii < tile.length; ++ii) {
      let key = `${atlas}/${tile[ii]}`;
      used[key] = true;
    }
  }

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

  let fs = webFSAPI();
  let filenames = fs.getFileNames('entities').filter((a) => a.endsWith('.entdef'));
  for (let ii = 0; ii < filenames.length; ++ii) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ent_desc = fs.getFile(filenames[ii], 'jsobj') as any;
    let traits = ent_desc.traits || [];
    for (let jj = 0; jj < traits.length; ++jj) {
      let trait = traits[jj];
      if (trait.sprite_data) {
        let atlas = trait.sprite_data.atlas;
        if (!atlas) {
          continue;
        }
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

  unused = Object.keys(all_images).filter(function (key) {
    return !used[key];
  });
}

const PAD = 4;
let selected = 0;
const MODES = ['wall', 'door', 'floor'/*, 'detail'*/, 'ent'] as const;
let selected_mode: typeof MODES[number] = '' as 'wall';
let target_name = '';
let flags: TSMap<boolean> = {};

export function crawlerTextureWizard(): void {
  textureWizardInit();
  if (dirty) {
    textureWizardFindUnused();
  }
  if (!unused.length) {
    return;
  }

  let viewport = crawlerRenderViewportGet();
  const x0 = viewport.x + PAD;
  const y0 = viewport.y + PAD;
  const x1 = viewport.x + viewport.w - PAD;
  const y1 = viewport.y + viewport.h - PAD;
  let x = x0;
  let y = y0;
  let w = x1 - x0;
  let left_col = w * 0.25;

  let z = Z.MODAL - 10;
  const font = uiGetFont();
  const button_height = uiButtonHeight();
  const button_width = uiButtonWidth();
  for (let ii = 0; ii < unused.length && y + button_height < viewport.y + viewport.h - PAD; ++ii) {
    let key = unused[ii];
    if (button({
      img: autoAtlas(...(key.split('/') as [string, string])),
      x, y, z,
      w: left_col,
      disabled: selected === ii,
      align: ALIGN.HLEFT | ALIGN.HFIT | ALIGN.VCENTER,
      text: key,
    })) {
      selected = ii;
      target_name = '';
      flags = {};
    }
    y += button_height;
  }

  let selected_key = unused[selected];
  if (selected_key) {
    let [atlas, img] = selected_key.split('/');
    x = x0 + left_col + PAD;
    w = x1 - x;
    y = y0;
    font.draw({
      x, y, z,
      w: w - button_width - PAD,
      align: ALIGN.HFIT,
      text: `File: ${selected_key}`,
    });
    if (buttonText({
      x: x1 - button_width,
      y, z,
      text: 'Ignore',
    })) {
      crawlerRoom().send('texture_wizard_ignore', { key: selected_key });
    }
    y += button_height + PAD;
    let sub_w = floor((w - PAD * 3) / 4);
    MODES.forEach(function (mode, idx) {
      if (buttonText({
        x: x + (sub_w + PAD) * idx,
        y, z, w: sub_w,
        text: mode,
        disabled: selected_mode === mode,
      }) || !selected_mode) {
        selected_mode = mode;
        target_name = '';
        flags = {};
        if (selected_mode === 'wall') {
          flags.solid = true;
        } else if (selected_mode === 'ent') {
          flags.enemy = true;
        }
      }
    });
    y += button_height + PAD;

    if (!target_name) {
      target_name = `${atlas}_${img}`;
      if (selected_mode === 'ent') {
        target_name = `entities/${target_name}.entdef`;
      } else if (selected_mode === 'floor') {
        target_name = `cells/${target_name}.celldef`;
      } else {
        target_name = `walls/${target_name}.walldef`;
      }
    }
    target_name = editBox({
      x, y, z,
      w,
    }, target_name).text;
    y += button_height;
    let disabled = false;
    if (webFSExists(target_name)) {
      font.draw({
        x, y, z,
        color: 0xFF8080ff,
        text: 'File already exists!',
      });
      y += uiTextHeight() + PAD;
      disabled = true;
    }

    function flag(field: string): void {
      flags[field] = checkbox(Boolean(flags[field]), {
        font_style_normal: fontStyleColored(null, 0xFFFFFFff),
        x, y, z,
        text: field,
      });
      y += button_height;
    }

    if (selected_mode !== 'door' && selected_mode !== 'ent') {
      flag('solid');
    }
    if (selected_mode === 'ent') {
      flag('enemy');
    }
    y += PAD;

    let data = ['---'];
    if (selected_mode === 'ent') {
      data.push('traits:');
      if (flags.enemy) {
        data.push(
          '- id: enemy',
          '- id: stats_default',
          '  hp: 10',
        );
      }
      data.push(
        '- id: drawable',
        '#  biasL: [-0.25, 0.3]',
        '#  biasF: [0, -0.25]',
        '#  biasR: [-0.25, 0.5]',
      );
      data.push(`- id: drawable_sprite
  anim_data:
    idle:
      frames: [${img}]
      times: 10000
  sprite_data:
    atlas: ${atlas}
    filter_min: LINEAR_MIPMAP_LINEAR
    filter_mag: LINEAR
    origin: [0.5, 1]
  scale: 0.8
  simple_anim:
    - period: 5000
      scale: [1, 0.85]
`);
    } else {
      if (selected_mode === 'wall') {
        if (flags.solid) {
          data.push(
            'open_move: false',
            'open_vis: false',
            'map_view_wall_frames_from: solid',
          );
        } else {
          data.push(
            'open_move: true',
            'open_vis: true',
            'map_view_wall_frames_from: open',
          );
        }
      } else if (selected_mode === 'door') {
        data.push(
          'open_move: true',
          'open_vis: false',
          'advertise_other_side: true',
          'map_view_wall_frames_from: door',
        );
      } else if (selected_mode === 'floor') {
        data.push(
          `open_move: ${!flags.solid}`,
          'open_vis: true',
          'default_wall: solid',
        );
      }
      data.push('visuals:');
      if (selected_mode === 'floor') {
        data.push(
          '- pass: bg',
          '  type: simple_floor',
          '  opts:',
          `    atlas: ${atlas}`,
          `    tile: ${img}`,
          '- pass: bg',
          '  type: simple_ceiling',
          '  opts:',
          `    atlas: ${atlas}`,
          `    tile: ${img}`,
        );
      } else {
        data.push(
          '- type: simple_wall',
          '  opts:',
          `    atlas: ${atlas}`,
          `    tile: ${img}`,
        );
      }
    }
    if (buttonText({
      x, y, z,
      disabled,
      text: 'Create!',
    })) {
      crawlerRoom().send('texture_wizard_create', {
        filename: target_name,
        contents: `${data.join('\n')}\n`,
      });
    }
    y += button_height + PAD;
    font.draw({
      size: uiTextHeight() * 0.5,
      x, y, z, w,
      align: ALIGN.HWRAP,
      text: data.join('\n'),
    });
  }

  if (buttonText({
    x: x1 - button_width,
    y: y1 - button_height,
    z,
    hotkey: KEYS.ESC,
    text: 'Not now',
  })) {
    unused = [];
  }
  panel({
    ...viewport,
    color: [0.1,0.1,0.1,1],
    z,
  });
}
