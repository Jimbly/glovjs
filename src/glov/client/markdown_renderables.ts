export let markdown_default_renderables: TSMap<MarkdownRenderable> = {};

import { ROVec4 } from 'glov/common/vmath';
import {
  MDDrawBlock,
  MDDrawParam,
  MDLayoutBlock,
  MDLayoutCalcParam,
} from './markdown';
import { RenderableContent } from './markdown_parse';
import { Sprite } from './sprites';
import {
  sprites as ui_sprites,
} from './ui';

import type { Box } from './geom_types';
import type { Optional, TSMap } from 'glov/common/types';

export function markdownRenderableAddDefault(key: string, renderable: MarkdownRenderable): void {
  markdown_default_renderables[key] = renderable;
}

export type MarkdownRenderable = (content: RenderableContent) => MDLayoutBlock;

const EPSILON = 0.0000000001;
export function markdownLayoutFit(param: MDLayoutCalcParam, dims: Optional<Box, 'x' | 'y'>): dims is Box {
  let { cursor, text_height } = param;
  if (cursor.x + dims.w > param.w + EPSILON && cursor.x !== cursor.line_x0) {
    cursor.x = cursor.line_x0 = param.indent;
    cursor.y += text_height;
  }
  if (cursor.x + dims.w > param.w + EPSILON) {
    // still over, doesn't fit on a whole line, modify w (if caller listens to that)
    dims.w = param.w - cursor.line_x0;
  }
  dims.x = cursor.x;
  dims.y = cursor.y;
  cursor.x += dims.w;
  // TODO: if height > line_height, track this line's height on the cursor?
  return true;
}

export type MarkdownImageParam = {
  sprite: Sprite;
  frame?: number;
  color?: ROVec4;
};
let allowed_images: TSMap<MarkdownImageParam> = Object.create(null);
export function markdownImageRegister(img_name: string, param: MarkdownImageParam): void {
  allowed_images[img_name] = param;
}
class MDRImg implements MDLayoutBlock, MDDrawBlock, Box {
  key: string;
  scale: number;
  constructor(content: RenderableContent) {
    this.key = content.key;
    this.dims = this;
    let scale = content.param && content.param.scale;
    this.scale = (scale && typeof scale === 'number') ? scale : 1;
  }
  // assigned during layout
  dims: Box;
  x!: number;
  y!: number;
  w!: number;
  h!: number;
  img_data!: MarkdownImageParam;
  layout(param: MDLayoutCalcParam): MDDrawBlock[] {
    let { text_height } = param;
    let h = this.h = text_height * this.scale;
    let img_data = this.img_data = allowed_images[this.key] || { sprite: ui_sprites.white };
    let { sprite, frame } = img_data;
    let aspect = 1;
    if (typeof frame === 'number' && sprite.uidata && sprite.uidata.aspect) {
      aspect = sprite.uidata.aspect[frame];
    } else {
      let tex = sprite.texs[0];
      aspect = tex.width / tex.height;
    }
    this.w = h * aspect;
    markdownLayoutFit(param, this);
    // vertically center image
    // if scale is > 1.0, we perhaps want some line height logic instead
    this.y += (text_height - h) / 2;
    return [this];
  }
  draw(param: MDDrawParam): void {
    let x = this.x + param.x;
    let y = this.y + param.y;
    let { img_data } = this;
    img_data.sprite.draw({
      x, y,
      z: param.z,
      w: this.w,
      h: this.h,
      frame: img_data.frame,
      color: img_data.color,
    });
  }
}
function createMDRImg(content: RenderableContent): MDRImg {
  return new MDRImg(content);
}

markdownRenderableAddDefault('img', createMDRImg);
