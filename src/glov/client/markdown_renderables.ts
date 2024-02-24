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
import type { TSMap } from 'glov/common/types';

export function markdownRenderableAddDefault(key: string, renderable: MarkdownRenderable): void {
  markdown_default_renderables[key] = renderable;
}

export type MarkdownRenderable = (content: RenderableContent) => MDLayoutBlock;

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
  constructor(content: RenderableContent) {
    this.key = content.key;
    this.dims = this;
  }
  // assigned during layout
  dims: Box;
  x!: number;
  y!: number;
  w!: number;
  h!: number;
  img_data!: MarkdownImageParam;
  layout(param: MDLayoutCalcParam): MDDrawBlock[] {
    let { cursor, text_height } = param;
    let h = this.h = text_height;
    let img_data = this.img_data = allowed_images[this.key] || { sprite: ui_sprites.white };
    let { sprite, frame } = img_data;
    let aspect = 1;
    if (typeof frame === 'number' && sprite.uidata && sprite.uidata.aspect) {
      aspect = sprite.uidata.aspect[frame];
    } else {
      let tex = sprite.texs[0];
      aspect = tex.width / tex.height;
    }
    let w = this.w = h * aspect;
    // TODO: utility for this?
    if (cursor.x + w > param.w && cursor.x !== cursor.line_x0) {
      cursor.x = cursor.line_x0 = param.indent;
      cursor.y += text_height;
    }
    this.x = cursor.x;
    this.y = cursor.y;
    cursor.x += w;
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
