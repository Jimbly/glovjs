/*global assert: true */

function cmpDrawList(a, b) {
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  return a.x - b.x;
}

const unit_vec4 = [1,1,1,1];

class GlovDrawList {
  constructor(draw2d) {
    this.draw2d = draw2d;
    this.list = [];
  }

  queue(sprite, x, y, z, color, scale, tex_rect, rotation, bucket) {
    let elem = {
      sprite,
      x, y, z,
      color,
      scale: scale || unit_vec4,
      tex_rect,
      bucket: bucket || 'alpha',
      rotation: rotation || 0,
    };
    this.list.push(elem);
    return elem;
  }

  queuefn(fn, x, y, z, bucket) {
    let elem = {
      fn,
      x, y, z,
      bucket: bucket || 'alpha',
    };
    this.list.push(elem);
    return elem;
  }


  draw() {
    let bucket = null;
    let tech_params = null;
    let orig_tech_params = this.draw2d.techniqueParameters;
    this.list.sort(cmpDrawList);
    for (let ii = 0; ii < this.list.length; ++ii) {
      let elem = this.list[ii];
      if (elem.bucket !== bucket || elem.tech_params !== tech_params) {
        if (bucket) {
          this.draw2d.end();
        }
        bucket = elem.bucket;
        tech_params = elem.tech_params;
        this.draw2d.techniqueParameters = tech_params || orig_tech_params;
        assert(bucket);
        this.draw2d.begin(bucket, 'deferred');
      }
      if (elem.fn) {
        elem.fn(elem);
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
        this.draw2d.drawSprite(sprite);
      }
    }
    this.list.length = 0;
    if (bucket) {
      this.draw2d.end();
      this.draw2d.techniqueParameters = orig_tech_params;
    }
  }
}

export function create(draw2d) {
  return new GlovDrawList(draw2d);
}
