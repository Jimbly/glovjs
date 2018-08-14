/*global Draw2DSprite: false */
/*global RequestHandler: false */
/*global TextureManager: false */
/*global math_device: false */
/*global assert: false */

class GlovSpriteAnimation {
  constructor(params) {
    this.frame = 0;
    this.time = 0;
    this.state = null;
    this.data = params;
    this.anim = null;
    this.anim_idx = 0;
    for (let key in this.data) {
      let anim = this.data[key];
      if (typeof anim.frames === 'number') {
        anim.frames = [anim.frames];
      }
      if (typeof anim.times === 'number') {
        let arr = new Array(anim.frames.length);
        for (let ii = 0; ii < anim.frames.length; ++ii) {
          arr[ii] = anim.times;
        }
        anim.times = arr;
      }
      if (anim.loop === undefined) {
        anim.loop = true;
      }
    }
  }

  setState(state, force) {
    if (state === this.state && !force)  {
      return;
    }
    this.state = state;
    this.anim = this.data[state];
    this.time = 0;
    this.anim_idx = 0;
    this.frame = this.anim.frames[this.anim_idx];
  }

  update(dt) {
    if (!this.anim) {
      return;
    }
    this.time += dt;
    if (this.time > this.anim.times[this.anim_idx]) {
      this.time -= this.anim.times[this.anim_idx];
      this.anim_idx = this.anim_idx + 1;
      if (this.anim_idx === this.anim.frames.length) {
        if (this.anim.loop) {
          this.anim_idx = this.anim_idx % this.anim.frames.length;
        } else {
          // keep final frame
          this.anim = null;
          return;
        }
      }
      this.frame = this.anim.frames[this.anim_idx];
      if (this.time >= this.anim.times[this.anim_idx]) {
        this.time = this.anim.times[this.anim_idx] - 1;
      }
    }
  }

  getFrame(dt) {
    if (dt !== undefined) {
      this.update(dt);
    }
    return this.frame;
  }
}

class GlovSpriteManager {
  constructor(graphicsDevice, draw_list) {
    const requestHandler = RequestHandler.create({});
    this.texture_manager = TextureManager.create(graphicsDevice, requestHandler);
    this.textures = {};
    this.draw_list = draw_list;
  }

  buildRects(ws, hs) {
    let rects = [];
    let total_w = 0;
    for (let ii = 0; ii < ws.length; ++ii) {
      total_w += ws[ii];
    }
    let percents_w = [];
    for (let ii = 0; ii < ws.length; ++ii) {
      percents_w.push(ws[ii] / total_w);
    }
    let total_h = 0;
    for (let ii = 0; ii < hs.length; ++ii) {
      total_h += hs[ii];
    }
    let percents_h = [];
    for (let ii = 0; ii < hs.length; ++ii) {
      percents_h.push(hs[ii] / total_h);
    }
    let y = 0;
    for (let jj = 0; jj < hs.length; ++jj) {
      let x = 0;
      for (let ii = 0; ii < ws.length; ++ii) {
        let r = math_device.v4Build(x, y, x + ws[ii], y + hs[jj]);
        rects.push(r);
        x += ws[ii];
      }
      y += hs[jj];
    }
    return {
      rects,
      percents_w,
      percents_h,
      total_w,
      total_h,
    };
  }

  loadTexture(texname) {
    let path = texname;
    if (texname.indexOf('.') !== -1) {
      path = 'img/'+ texname;
    }
    const inst = this.texture_manager.getInstance(path);
    if (inst) {
      return inst;
    }
    this.textures[texname] = this.texture_manager.load(path, false);
    return this.texture_manager.getInstance(path);
  }

  createAnimation(params) {
    return new GlovSpriteAnimation(params);
  }

  // Convenience drawing.
  // Not the most efficient queuing method - lots of temporary objects and indirection
  draw(params) {
    assert(this instanceof Draw2DSprite);
    this.manager.draw_list.queue(this,
      params.x, params.y, params.z, params.color,
      params.size,
      this.uidata ? this.uidata.rects[params.frame] : null,
      params.rotation,
      params.bucket);
  }

  createSprite(texname, params) {
    const tex_inst = this.loadTexture(texname);
    params.texture = tex_inst.getTexture();
    let uidata;
    if (Array.isArray(params.u)) {
      uidata = this.buildRects(params.u, params.v);
      params.textureRectangle = math_device.v4Build(0, 0, uidata.total_w, uidata.total_h);
    } else {
      // uidata = this.buildRects([params.u], [params.v]);
      params.textureRectangle = math_device.v4Build(0, 0, params.u, params.v);
    }
    const sprite = Draw2DSprite.create(params);
    tex_inst.subscribeTextureChanged(function () {
      sprite.setTexture(tex_inst.getTexture());
    });
    if (uidata) {
      sprite.uidata = uidata;
    }
    sprite.draw = this.draw;
    sprite.manager = this;
    return sprite;
  }

  loading() {
    return this.texture_manager.getNumPendingTextures();
  }
}

export function create() {
  let args = Array.prototype.slice.call(arguments, 0);
  args.splice(0,0, null);
  return new (Function.prototype.bind.apply(GlovSpriteManager, args))();
}
