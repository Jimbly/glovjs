/*global assert: true */
/*global math_device: false */

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
  constructor(draw_2d, camera) {
    this.draw_2d = draw_2d;
    this.camera = camera;
    this.list = [];
    this.default_bucket = 'alpha';
  }

  // 'alpha_nearest' is useful
  setDefaultBucket(new_value) {
    this.default_bucket = new_value;
  }

  queue(sprite, x, y, z, color, scale, tex_rect, rotation, bucket) {
    scale =  scale || unit_vec4;
    let elem = {
      sprite,
      x: (x - this.camera.data[0]) * this.camera.data[4],
      y: (y - this.camera.data[1]) * this.camera.data[5],
      z,
      color,
      scale: math_device.v4Build(scale[0] * this.camera.data[4], scale[1]*this.camera.data[5], 1,1),
      tex_rect,
      bucket: bucket || this.default_bucket,
      rotation: rotation || 0,
    };
    this.list.push(elem);
    return elem;
  }

  queuefn(fn, x, y, z, bucket) {
    let elem = {
      fn,
      x: (x - this.camera.data[0]) * this.camera.data[4],
      y: (y - this.camera.data[1]) * this.camera.data[5],
      z,
      bucket: bucket || this.default_bucket,
    };
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
        assert(bucket);
        this.draw_2d.begin(bucket, 'deferred');
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
        this.draw_2d.drawSprite(sprite);
      }
    }
    this.list.length = 0;
    if (bucket) {
      this.draw_2d.end();
      this.draw_2d.techniqueParameters = orig_tech_params;
    }
  }
}

export function create() {
  let args = Array.prototype.slice.call(arguments, 0);
  args.splice(0,0, null);
  return new (Function.prototype.bind.apply(GlovDrawList, args))();
}
