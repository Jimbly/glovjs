import assert from 'assert';
import { DataObject, Rec, TSMap } from 'glov/common/types';
import { clamp } from 'glov/common/util';
import { Vec2 } from 'glov/common/vmath';
import { autoAtlas } from './autoatlas';
import * as camera2d from './camera2d';
import { spriteClipped, spriteClippedViewport } from './sprites';
import { EnumLayer } from './topdown';
import { UIBox } from './ui';

const { floor, max, min, round } = Math;

export type GraphicTile = string|null|undefined;
export type GraphicLayer = (GraphicTile[] | undefined | null)[];

export type TileMapParams = {
  atlas_name: string;
  tile_w: number;
  tile_h?: number;
};

class TileMap<EnumType extends string=string> {
  enum_layer!: EnumLayer<EnumType>;
  enumLayerSet(layer: EnumLayer<EnumType>): void {
    this.enum_layer = layer;
    this.h = layer.length;
    this.w = layer[0].length;
  }

  // Graphics layers
  gfx_layers: GraphicLayer[] = [];
  layer_z: Rec<number, number> = {};

  atlas_name: string;
  tile_w: number;
  tile_h: number;
  w = 0;
  h = 0;

  rounded = true;

  constructor(param: TileMapParams) {
    this.atlas_name = param.atlas_name;
    this.tile_w = param.tile_w;
    this.tile_h = param.tile_h || param.tile_w;
  }

  centerCamera(pos: Vec2, screen_rect?: UIBox): void {
    let rect = screen_rect || {
      x: camera2d.x0(),
      y: camera2d.y0(),
      w: camera2d.w(),
      h: camera2d.h(),
    };
    let { tile_w, tile_h } = this;
    let hx = pos[0] * tile_w;
    let hy = pos[1] * tile_h;
    if (this.rounded) {
      hx = round(hx);
      hy = round(hy);
    }
    let centerx = floor(rect.x + rect.w/2);
    let centery = floor(rect.y + rect.h/2);
    camera2d.shift(
      clamp(-centerx + hx, -rect.x, this.w * tile_w - rect.w),
      clamp(-centery + hy, -rect.y - tile_h, this.h * tile_h - rect.h));
  }

  // draws the map located at (camera-space) 0,0 - use camera shifting to get the appropriate part in view
  draw(param: {
    z?: number;
  }): void {
    let z = param.z || Z.UI;

    let viewport = {
      x: camera2d.x0Real(),
      y: camera2d.y0Real(),
      w: camera2d.wReal(),
      h: camera2d.hReal(),
    };
    if (spriteClipped()) {
      viewport = spriteClippedViewport();
    }

    const { atlas_name, tile_w, tile_h, gfx_layers, w, h } = this;

    let x0 = floor(viewport.x / tile_w);
    let x1 = floor((viewport.x + viewport.w) / tile_w);
    let y0 = floor(viewport.y / tile_h);
    let y1 = floor((viewport.y + viewport.h) / tile_h);

    for (let ii = 0; ii < gfx_layers.length; ++ii) {
      let layer = gfx_layers[ii];
      if (!layer) {
        continue;
      }
      let zz = this.layer_z[ii] || z;
      for (let yy = max(0, y0); yy <= min(y1, h-1); ++yy) {
        let row = layer[yy];
        if (!row) {
          continue;
        }
        for (let xx = max(0, x0); xx <= min(x1, w-1); ++xx) {
          let spr = row[xx];
          if (!spr) {
            continue;
          }
          autoAtlas(atlas_name, spr).draw({
            x: xx * tile_w,
            y: yy * tile_h,
            w: tile_w,
            h: tile_h,
            z: zz,
          });
        }
      }
    }
  }

  fromTiled(
    json_obj: unknown,
    tileset: Rec<number, [string, EnumType]>,
    open_enum: EnumType,
  ): void {
    type TiledLayer = {
      data: number[];
      width: number;
      height: number;
      x: number;
      y: number;
    };

    let json = json_obj as DataObject;
    let w = json.width as number;
    let h = json.height as number;
    let layers = json.layers as TiledLayer[];
    assert(layers.length === 1);
    let layer = layers[0];
    assert(!layer.x);
    assert(!layer.y);
    assert(layer.width === w);
    assert(layer.height === h);
    let tiles: GraphicLayer = [];
    let enums: EnumLayer<EnumType> = [];
    for (let yy = 0, idx=0; yy < h; ++yy) {
      let row: (string|null)[] = [];
      let enum_row: EnumType[] = [];
      tiles.push(row);
      enums.push(enum_row);
      for (let xx = 0; xx < w; ++xx, ++idx) {
        let tileidx = layer.data[idx];
        if (!tileidx) {
          row.push(null);
          enum_row.push(open_enum);
        } else {
          let tile = tileset[tileidx - 1];
          assert(tile);
          row.push(tile[0]);
          enum_row.push(tile[1]);
        }
      }
    }
    this.gfx_layers[0] = tiles;
    this.enumLayerSet(enums);
  }

  fromLDtk(
    json_obj: unknown,
    enum_lookup: TSMap<EnumType>,
    open_enum: EnumType,
  ): void {
    type SparseArray = ((string|null)[]|null)[];
    type LDtkData = {
      w: number;
      h: number;
      layers: SparseArray[];
      enum_layer?: SparseArray;
    };

    let { w, h, layers, enum_layer } = json_obj as LDtkData;
    this.gfx_layers = [];
    let { gfx_layers } = this;
    for (let ii = 0; ii < layers.length; ++ii) {
      let layer = layers[ii];
      gfx_layers.push(layer);
    }

    let enums: EnumLayer<EnumType> = [];
    for (let yy = 0, idx=0; yy < h; ++yy) {
      let enum_row: EnumType[] = [];
      enums.push(enum_row);
      for (let xx = 0; xx < w; ++xx, ++idx) {
        let v = enum_layer && enum_layer[yy] && enum_layer[yy]![xx];

        if (v) {
          assert(enum_lookup[v], v);
          let ev = enum_lookup[v];
          enum_row.push(ev);
        } else {
          enum_row.push(open_enum);
        }
      }
    }
    this.enumLayerSet(enums);
  }

}
export type { TileMap };

export function tileMapCreate<EnumType extends string=string>(params: TileMapParams): TileMap<EnumType> {
  return new TileMap<EnumType>(params);
}
