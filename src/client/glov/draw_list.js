/* eslint no-bitwise:off */
/* eslint no-underscore-dangle:off */
/*global assert: true */
/*global VMath: false */

const { Draw2DSpriteData } = require('./tz/draw2d.js');

function cmpDrawList(a, b) {
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  if (a.x !== b.x) {
    return a.x - b.x;
  }
  return a.uid - b.uid;
}

const unit_vec4 = VMath.v4Build(1,1,1,1);

class DrawListSprite {
  constructor() {
    // First two used by Draw2D internals
    this._textures = [];
    this.data = Draw2DSpriteData.create();
    // These used by our queuing/sorting
    this.raw4 = true;
    this.x = this.y = this.z = 0;
    this.bucket = 'alpha';
    this.tech_params = null;
  }
  _update() { // eslint-disable-line class-methods-use-this
    // Nothing, but gets called by draw2d
  }
}

class GlovDrawList {
  constructor(draw_2d, camera) {
    this.draw_2d = draw_2d;
    this.camera = camera;
    this.list = [];
    this.default_bucket = 'alpha';
    this.default_bucket_tint = 'alpha_tint';
    this.sprite_list = [];
    this.sprite_alloc_count = 0;
    this.color_white = VMath.v4Build(1, 1, 1, 1);
    this.uid = 0;
  }

  createDrawListSprite() {
    if (this.sprite_alloc_count === this.sprite_list.length) {
      this.sprite_list.push(new DrawListSprite());
    }
    return this.sprite_list[this.sprite_alloc_count++];
  }

  // '_nearest' is useful
  setNearest(new_value) {
    if (new_value) {
      this.default_bucket = 'alpha_nearest';
      this.default_bucket_tint = 'alpha_tint_nearest';
    } else {
      this.default_bucket = 'alpha';
      this.default_bucket_tint = 'alpha_tint';
    }
  }

  queue(sprite, x, y, z, color, scale, tex_rect, rotation, bucket) {
    assert(sprite);
    scale = scale || unit_vec4;
    let elem = {
      sprite,
      x: (x - this.camera.data[0]) * this.camera.data[4],
      y: (y - this.camera.data[1]) * this.camera.data[5],
      z,
      color: color || this.color_white,
      scale: VMath.v4Build(scale[0] * this.camera.data[4], scale[1]*this.camera.data[5], 1,1),
      tex_rect,
      bucket: bucket || this.default_bucket,
      rotation: rotation || 0,
      uid: ++this.uid,
    };
    this.list.push(elem);
    return elem;
  }

  queueDualTint(sprite, x, y, z, color0, color1, scale, tex_rect, rotation, bucket) {
    assert(sprite);
    scale = scale || unit_vec4;
    let elem = {
      sprite,
      x: (x - this.camera.data[0]) * this.camera.data[4],
      y: (y - this.camera.data[1]) * this.camera.data[5],
      z,
      color: color0 || this.color_white,
      scale: VMath.v4Build(scale[0] * this.camera.data[4], scale[1]*this.camera.data[5], 1,1),
      tex_rect,
      bucket: bucket || this.default_bucket_tint,
      rotation: rotation || 0,
      tech_params: {
        clipSpace: this.draw_2d.clipSpace,
        color1: color1 || this.color_white,
      },
      uid: ++this.uid,
    };
    this.list.push(elem);
    return elem;
  }

  // Identical to queue, but uses integer screen coordinates, for use with
  // nearest-filtered sprites so they do not shimmer as they move by sub-pixel amounts
  queueInt(sprite, x, y, z, color, scale, tex_rect, rotation, bucket) {
    assert(sprite);
    scale = scale || unit_vec4;
    let elem = {
      sprite,
      x: (x - this.camera.data[0]) * this.camera.data[4] | 0,
      y: (y - this.camera.data[1]) * this.camera.data[5] | 0,
      z,
      color: color || this.color_white,
      scale: VMath.v4Build(scale[0] * this.camera.data[4], scale[1]*this.camera.data[5], 1,1),
      tex_rect,
      bucket: bucket || this.default_bucket,
      rotation: rotation || 0,
      uid: ++this.uid,
    };
    this.list.push(elem);
    return elem;
  }

  queuefn(z, fn) {
    let elem = {
      fn,
      x: 0,
      y: 0,
      z,
      bucket: null,
      uid: ++this.uid,
    };
    this.list.push(elem);
    return elem;
  }

  queueraw(
    tex, x, y, z, w, h,
    u0, v0, u1, v1,
    color, rotation, bucket, tech_params
  ) {
    return this.queueraw4(tex,
      x, y,
      x + w, y,
      x + w, y + h,
      x, y + h,
      z,
      u0, v0, u1, v1,
      color, bucket, tech_params);
  }
  queueraw4(
    tex, x0, y0, x1, y1, x2, y2, x3, y3, z,
    u0, v0, u1, v1,
    color, bucket, tech_params
  ) {
    let elem = this.createDrawListSprite();
    let data = elem.data;
    // x1 y1 x2 y2 x3 y3 x4 y4 - vertices [0,8)
    // cr cg cb ca u1 v1 u2 v2 - normalized color + texture [8,16)
    data[0] = (x0 - this.camera.data[0]) * this.camera.data[4];
    data[1] = (y0 - this.camera.data[1]) * this.camera.data[5];
    data[2] = (x1 - this.camera.data[0]) * this.camera.data[4];
    data[3] = (y1 - this.camera.data[1]) * this.camera.data[5];
    data[4] = (x3 - this.camera.data[0]) * this.camera.data[4];
    data[5] = (y3 - this.camera.data[1]) * this.camera.data[5];
    data[6] = (x2 - this.camera.data[0]) * this.camera.data[4];
    data[7] = (y2 - this.camera.data[1]) * this.camera.data[5];
    data[8] = color[0];
    data[9] = color[1];
    data[10] = color[2];
    data[11] = color[3];
    data[12] = u0;
    data[13] = v0;
    data[14] = u1;
    data[15] = v1;
    elem._textures = [tex];
    elem.x = data[0];
    elem.y = data[1];
    elem.z = z;
    elem.bucket = bucket || this.defauilt_bucket;
    elem.tech_params = tech_params || null;
    elem.uid = ++this.uid;
    this.list.push(elem);
    return elem;
  }

  draw() {
    let bucket = null;
    let tech_params = null;
    let orig_tech_params = this.draw_2d.techniqueParameters;
    this.list.sort(cmpDrawList);
    for (let ii = 0; ii < this.list.length; ++ii) {
      let elem = this.list[ii];
      if (elem.bucket !== bucket || elem.tech_params !== tech_params) {
        if (bucket) {
          this.draw_2d.end();
        }
        bucket = elem.bucket;
        tech_params = elem.tech_params;
        this.draw_2d.techniqueParameters = tech_params || orig_tech_params;
        if (bucket) {
          this.draw_2d.begin(bucket);
        }
      }
      if (elem.fn) {
        elem.fn(elem);
      } else if (elem.raw4) {
        this.draw_2d.drawSprite(elem);
      } else {
        let sprite = elem.sprite;
        sprite.x = elem.x;
        sprite.y = elem.y;
        sprite.setScale(elem.scale);
        sprite.setColor(elem.color);
        sprite.rotation = elem.rotation;
        if (elem.tex_rect) {
          sprite.setTextureRectangle(elem.tex_rect);
        }
        this.draw_2d.drawSprite(sprite);
      }
    }
    this.sprite_alloc_count = 0;
    this.list.length = 0;
    this.uid = 0;
    if (bucket) {
      this.draw_2d.end();
      this.draw_2d.techniqueParameters = orig_tech_params;
    }
  }
}

export function create(...args) {
  return new GlovDrawList(...args);
}
