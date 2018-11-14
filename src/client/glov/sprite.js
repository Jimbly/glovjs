/*global RequestHandler: false */
/*global TextureManager: false */
/*global VMath: false */
/*global assert: false */

const { Draw2DSprite } = require('./tz/draw2d.js');

class GlovSpriteAnimation {
  constructor(params) {
    this.frame = 0;
    this.time = 0;
    this.state = null;
    this.anim = null;
    this.anim_idx = 0;

    if (params instanceof GlovSpriteAnimation) {
      this.data = params.data; // already initialized
      this.setState(params.state);
    } else {
      this.data = params;
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
  }

  clone() {
    return new GlovSpriteAnimation(this);
  }

  setState(state, force) {
    if (state === this.state && !force) {
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
    this.color_white = VMath.v4Build(1, 1, 1, 1);
    this.origin_0_0 = { origin: VMath.v2Build(0, 0) };
    Draw2DSprite.prototype.draw = this.draw;
    Draw2DSprite.prototype.drawTech = this.drawTech;
    Draw2DSprite.prototype.drawDualTint = this.drawDualTint;
  }

  buildRects(ws, hs) { // eslint-disable-line class-methods-use-this
    let rects = [];
    let total_w = 0;
    for (let ii = 0; ii < ws.length; ++ii) {
      total_w += ws[ii];
    }
    let total_h = 0;
    for (let ii = 0; ii < hs.length; ++ii) {
      total_h += hs[ii];
    }
    let wh = [];
    for (let ii = 0; ii < ws.length; ++ii) {
      wh.push(ws[ii] / total_h);
    }
    let y = 0;
    for (let jj = 0; jj < hs.length; ++jj) {
      let x = 0;
      for (let ii = 0; ii < ws.length; ++ii) {
        let r = VMath.v4Build(x, y, x + ws[ii], y + hs[jj]);
        rects.push(r);
        x += ws[ii];
      }
      y += hs[jj];
    }
    return {
      widths: ws,
      heights: hs,
      wh,
      rects,
      total_w,
      total_h,
    };
  }

  loadTexture(texname) {
    let path = texname;
    if (texname.indexOf('.') !== -1) {
      path = `img/${texname}`;
    }
    const inst = this.texture_manager.getInstance(path);
    if (inst) {
      return inst;
    }
    this.textures[texname] = this.texture_manager.load(path, false);
    return this.texture_manager.getInstance(path);
  }

  preloadParticleData(particle_data) {
    // Preload all referenced particle textures
    for (let key in particle_data.defs) {
      let def = particle_data.defs[key];
      for (let part_name in def.particles) {
        let part_def = def.particles[part_name];
        this.loadTexture(part_def.texture);
      }
    }
  }

  createAnimation(params) { // eslint-disable-line class-methods-use-this
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

  drawTech(params) {
    assert(this instanceof Draw2DSprite);
    let elem = this.manager.draw_list.queue(this,
      params.x, params.y, params.z, params.color,
      params.size,
      this.uidata ? this.uidata.rects[params.frame] : null,
      params.rotation,
      params.bucket);
    if (params.tech_params) {
      elem.tech_params = params.tech_params;
      if (!elem.tech_params.clipSpace) {
        elem.tech_params.clipSpace = this.manager.draw_list.draw_2d.clipSpace;
      }
    }
  }

  drawDualTint(params) {
    assert(this instanceof Draw2DSprite);
    this.manager.draw_list.queueDualTint(this,
      params.x, params.y, params.z,
      params.color, params.color1,
      params.size,
      this.uidata ? this.uidata.rects[params.frame] : null,
      params.rotation,
      params.bucket);
  }

  // Convenience
  createSpriteSimple(texname, u, v, params) {
    params = params || {};
    return this.createSprite(texname, {
      width: params.width || 1,
      height: params.height || 1,
      rotation: params.rotation || 0,
      color: params.color || this.color_white,
      origin: params.origin || undefined,
      u: u,
      v: v,
      layers: params.layers || 0,
    });
  }
  createSprite(texname, params) {
    let tex_insts = [];
    params.textures = [];
    if (params.layers) {
      for (let ii = 0; ii < params.layers; ++ii) {
        const tex_inst = this.loadTexture(`${texname}_${ii}.png`);
        tex_insts.push(tex_inst);
        params.textures.push(tex_inst.getTexture());
      }
    } else {
      const tex_inst = this.loadTexture(texname);
      tex_insts.push(tex_inst);
      params.textures.push(tex_inst.getTexture());
    }
    let uidata;
    if (Array.isArray(params.u)) {
      uidata = this.buildRects(params.u, params.v);
      params.textureRectangle = VMath.v4Build(0, 0, uidata.total_w, uidata.total_h);
    } else {
      // uidata = this.buildRects([params.u], [params.v]);
      params.textureRectangle = VMath.v4Build(0, 0, params.u, params.v);
    }
    const sprite = Draw2DSprite.create(params);
    tex_insts.forEach(function (tex_inst, idx) {
      tex_inst.subscribeTextureChanged(function () {
        sprite.setTexture(idx, tex_inst.getTexture());
      });
    });
    if (uidata) {
      sprite.uidata = uidata;
    }
    sprite.manager = this;
    return sprite;
  }

  loading() {
    return this.texture_manager.getNumPendingTextures();
  }
}

export function create(...args) {
  return new GlovSpriteManager(...args);
}
