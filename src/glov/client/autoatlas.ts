import assert from 'assert';
import { dataError } from 'glov/common/data_error';
import type { TSMap, WithRequired } from 'glov/common/types';
import { callEach, clone } from 'glov/common/util';
import {
  ROVec4,
  v4clone,
  v4copy,
  v4set,
  Vec4,
  vec4,
} from 'glov/common/vmath';
import { engineStartupFunc } from './engine';
import { filewatchOn } from './filewatch';
import {
  Sprite,
  spriteCreate,
  SpriteUIData,
  Texture,
  TextureOptions,
} from './sprites';
import { textureError, textureLoad } from './textures';
import { webFSGetFile, webFSOnReady } from './webfs';

type AutoAtlasBuildData = [string, number, number, number[], number[], number[] | undefined, number[] | undefined];

type AutoAtlasBuildDataRoot = {
  w: number;
  h: number;
  layers: number;
  tiles: AutoAtlasBuildData[];
};

export type SpriteWithUIData = WithRequired<Sprite, 'uidata'>;

let load_opts: TSMap<TextureOptions> = {};
let hit_startup = false;

const uidata_error: SpriteUIData = {
  rects: [[0,0,1,1]],
  wh: [1],
  hw: [1],
  widths: [1],
  heights: [1],
  aspect: null,
  total_w: 1,
  total_h: 1,
};

function spriteMakeError(sprite: Sprite): void {
  v4set(sprite.uvs as Vec4, 0, 0, 1, 1);
  sprite.texs = [textureError()];
  sprite.uidata = uidata_error;
}

let atlas_swaps: TSMap<string> = Object.create(null);
let atlases: TSMap<AutoAtlasImp>;

type AutoAtlasSprite = SpriteWithUIData & {
  autoatlas_used?: boolean;
  uidata_orig?: SpriteUIData;
};

function saveOrig(sprite: AutoAtlasSprite): void {
  if (!sprite.uidata_orig) {
    sprite.uidata_orig = clone(sprite.uidata);
    let rects = [] as unknown as Vec4[] & TSMap<Vec4>;
    for (let key in sprite.uidata.rects) {
      let src = (sprite.uidata.rects as TSMap<Vec4>)[key]!;
      rects[key] = v4clone(src);
    }
    sprite.uidata_orig.rects = rects;
  }
}

class AutoAtlasImp {
  sprites: TSMap<AutoAtlasSprite> = {};

  // Create with dummy data, will load later
  texs: Texture[] = [];
  prealloc(): AutoAtlasSprite {
    let sprite = spriteCreate({
      texs: this.texs,
      uvs: vec4(0, 0, 1, 1),
    });
    sprite.uidata = uidata_error;
    return sprite as AutoAtlasSprite;
  }

  did_tex_load = false;

  verifySprites(seen: TSMap<true>): void {
    let { sprites } = this;
    for (let img_name in sprites) {
      if (sprites[img_name]!.autoatlas_used && !seen[img_name] && img_name !== 'def') {
        dataError(`AutoAtlas "${this.atlas_name}" does not contain image "${img_name}"`);
        spriteMakeError(sprites[img_name]!);
      }
    }
  }

  atlas_data?: AutoAtlasBuildDataRoot;
  doInit(): void {
    let { sprites, atlas_name, texs } = this;
    let atlas_data = this.atlas_data = webFSGetFile(`${atlas_name}.auat`, 'jsobj') as AutoAtlasBuildDataRoot;
    // Root default sprite, with frame-indexing
    let root_sprite = sprites.def = (sprites.def || this.prealloc());
    let root_rects = [] as unknown as Vec4[] & TSMap<Vec4>;
    let root_aspect: number[] = [];

    // Make sprites for all named sprites
    let { tiles, w, h } = atlas_data;
    let seen: TSMap<true> = {};
    for (let tile_id = 0; tile_id < tiles.length; ++tile_id) {
      let is_new = false;
      let [tile_name, x, y, ws, hs, padh, padv] = tiles[tile_id];
      seen[tile_name] = true;
      let total_w = 0;
      for (let jj = 0; jj < ws.length; ++jj) {
        total_w += ws[jj];
      }
      let total_h = 0;
      for (let jj = 0; jj < hs.length; ++jj) {
        total_h += hs[jj];
      }
      root_aspect.push(total_w / total_h);
      let sprite = sprites[tile_name];
      if (!sprite) {
        sprite = sprites[tile_name] = this.prealloc();
        is_new = true;
      }
      sprite.texs = texs;
      let tile_uvs = sprite.uvs as Vec4;
      v4set(tile_uvs, x/w, y/h, (x+total_w)/w, (y+total_h)/h);
      root_rects.push(tile_uvs);
      root_rects[tile_name] = tile_uvs;

      let wh = [];
      for (let ii = 0; ii < ws.length; ++ii) {
        wh.push(ws[ii] / total_h);
      }
      let hw = [];
      for (let ii = 0; ii < hs.length; ++ii) {
        hw.push(hs[ii] / total_w);
      }
      let aspect = [];
      let non_square = false;
      let yy = y;
      let rects = [];
      for (let jj = 0; jj < hs.length; ++jj) {
        let xx = x;
        for (let ii = 0; ii < ws.length; ++ii) {
          let r = vec4(xx / w, yy / h,
            (xx + ws[ii]) / w, (yy + hs[jj]) / h);
          rects.push(r);
          let asp = ws[ii] / hs[jj];
          if (asp !== 1) {
            non_square = true;
          }
          aspect.push(asp);
          xx += ws[ii];
        }
        yy += hs[jj];
      }
      sprite.uidata = {
        widths: ws,
        heights: hs,
        wh,
        hw,
        rects,
        aspect: non_square ? aspect : null,
        padh,
        padv,
        total_w,
        total_h,
      };
      delete sprite.uidata_orig;
      sprite.doReInit();
      if (is_new) {
        callEach(this.on_image, null, tile_name);
      }
    }

    root_sprite.uidata = {
      rects: root_rects,
      aspect: root_aspect,
      total_h: h,
      total_w: w,
      // These should not be needed:
      widths: null!,
      heights: null!,
      wh: null!,
      hw: null!,
    };
    delete root_sprite.uidata_orig;

    if (hit_startup) {
      this.verifySprites(seen);
    }
    this.applySwaps();

    // Only issue texture load once at startup, not upon reload
    if (this.did_tex_load) {
      return;
    }
    this.did_tex_load = true;
    engineStartupFunc(() => {
      hit_startup = true;
      let opts = load_opts[atlas_name] || {};
      if (atlas_data.layers) {
        for (let idx = 0; idx < atlas_data.layers; ++idx) {
          let tex = textureLoad({
            wrap_s: gl.CLAMP_TO_EDGE,
            wrap_t: gl.CLAMP_TO_EDGE,
            ...opts,
            url: `img/atlas_${atlas_name}_${idx}.png`,
          });
          texs.push(tex);
        }
      } else {
        let tex = textureLoad({
          wrap_s: gl.CLAMP_TO_EDGE,
          wrap_t: gl.CLAMP_TO_EDGE,
          ...opts,
          url: `img/atlas_${atlas_name}.png`,
        });
        texs.push(tex);
      }
      for (let ii = 0; ii < texs.length; ++ii) {
        texs[ii].onLoad(this.checkLoaded.bind(this));
      }
      this.verifySprites(seen);
    });
  }

  applySwaps(): void {
    let dst_name = atlas_swaps[this.atlas_name];
    let dst = dst_name && atlases[dst_name];

    let sprites_src = this.sprites;
    let texs_src = this.texs;
    let atlas_data_src = this.atlas_data;
    assert(atlas_data_src);
    let tiles_src = atlas_data_src.tiles;
    let root_sprite = sprites_src.def;
    assert(root_sprite);
    function clearSwap(src_sprite: AutoAtlasSprite, tile_id: number, root_uidata_orig: SpriteUIData): void {
      if (src_sprite.uidata_orig) {
        src_sprite.uidata = src_sprite.uidata_orig;
        delete src_sprite.uidata_orig;
        src_sprite.texs = texs_src;
        v4copy(src_sprite.uvs as Vec4, (root_uidata_orig!.rects as ROVec4[])[tile_id]);
        src_sprite.doReInit();
      }
    }
    if (!dst) {
      let root_uidata_orig = root_sprite.uidata_orig;
      if (!root_uidata_orig) {
        return;
      }
      // clear any swaps
      for (let tile_id = 0; tile_id < tiles_src.length; ++tile_id) {
        let [tile_name] = tiles_src[tile_id];
        let src_sprite = sprites_src[tile_name];
        assert(src_sprite);
        clearSwap(src_sprite, tile_id, root_uidata_orig);
      }
      delete root_sprite.uidata_orig;
      return;
    }
    // apply swap
    let texs_dst = dst.texs;
    let atlas_data_dst = this.atlas_data;
    assert(atlas_data_dst);
    let sprites_dst = dst.sprites;
    saveOrig(root_sprite);
    let root_uidata = root_sprite.uidata;
    let root_rects = root_uidata.rects as unknown as Vec4[] & TSMap<Vec4>;
    let root_uidata_orig = root_sprite.uidata_orig;
    assert(root_uidata_orig);
    for (let tile_id = 0; tile_id < tiles_src.length; ++tile_id) {
      let [tile_name] = tiles_src[tile_id];
      let src_sprite = sprites_src[tile_name];
      assert(src_sprite);
      let dst_sprite = sprites_dst[tile_name];
      if (!dst_sprite) {
        clearSwap(src_sprite, tile_id, root_uidata_orig);
        continue;
      }
      saveOrig(src_sprite);
      // leaving most things alone, touch only UVs and texs
      src_sprite.texs = texs_dst;
      let tile_uvs = src_sprite.uvs as Vec4;
      v4copy(tile_uvs, dst_sprite.uvs as Vec4);
      src_sprite.uidata.rects = dst_sprite.uidata.rects;
      root_rects[tile_id] = tile_uvs;
      root_rects[tile_name] = tile_uvs;

      src_sprite.doReInit();
    }
  }

  is_loaded = false;
  checkLoaded(): void {
    let { texs } = this;
    this.is_loaded = false;
    if (!texs.length) {
      return;
    }
    for (let ii = 0; ii < texs.length; ++ii) {
      let tex = texs[ii];
      if (!tex.loaded) {
        return;
      }
    }
    this.is_loaded = true;
  }
  isLoaded(): boolean {
    return this.is_loaded;
  }

  setSamplerState(opts: TextureOptions): void {
    for (let ii = 0; ii < this.texs.length; ++ii) {
      let tex = this.texs[ii];
      tex.setSamplerState(opts);
    }
  }

  constructor(public atlas_name: string) {
    webFSOnReady(this.doInit.bind(this));
  }

  get(img_name: string): SpriteWithUIData {
    let ret = this.sprites[img_name];
    if (!ret) {
      ret = this.sprites[img_name] = this.prealloc();
      if (hit_startup) {
        dataError(`AutoAtlas "${this.atlas_name}" does not contain image "${img_name}"`);
        spriteMakeError(ret);
      }
    }
    ret.autoatlas_used = true;
    return ret;
  }

  on_image: ((img_name: string) => void)[] = [];
  onImage(cb: (img_name: string) => void): void {
    this.on_image.push(cb);
    Object.keys(this.sprites).forEach(cb);
  }
}

function autoAtlasReload(filename: string): void {
  filename = filename.slice(0, -5);
  let atlas = atlases[filename];
  if (!atlas) {
    // bundled in app, but not loaded? what a waste, but, I guess, maybe fine?
    // will happen when doing git updates on atlases that are not currently active
    return;
  }
  atlas.doInit();
  for (let key in atlas_swaps) {
    if (key === filename || atlas_swaps[key] === filename) {
      let other = atlases[key];
      if (other && other !== atlas) {
        other.doInit();
      }
    }
  }
}

export function autoAtlasTextureOpts(atlas_name: string, opts: TextureOptions): void {
  load_opts[atlas_name] = opts;
  if (atlases) {
    let atlas = atlases[atlas_name];
    if (atlas) {
      atlas.setSamplerState(opts);
    }
  }
}

function autoAtlasGet(atlas_name: string): AutoAtlasImp {
  if (!atlases) {
    atlases = {};
    filewatchOn('.auat', autoAtlasReload);
  }
  let atlas = atlases[atlas_name];
  if (!atlas) {
    atlas = atlases[atlas_name] = new AutoAtlasImp(atlas_name);
  }
  return atlas;
}

export function autoAtlasOnImage(atlas_name: string, cb: (img_name: string) => void): void {
  autoAtlasGet(atlas_name).onImage(cb);
}

export function autoAtlas(atlas_name: string, img_name: string): SpriteWithUIData {
  return autoAtlasGet(atlas_name).get(img_name);
}

export function autoAtlasSwap(src: string, dest: string): void {
  if (atlas_swaps[src] !== dest) {
    autoAtlasGet(dest);
    if (dest === src || !dest) {
      delete atlas_swaps[src];
    } else {
      atlas_swaps[src] = dest;
    }
    atlases[src]?.applySwaps();
  }
}
