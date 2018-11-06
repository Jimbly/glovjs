// Copyright (c) 2012-2013 Turbulenz Limited
/* eslint complexity:off */
/* eslint no-use-before-define:off */
/* eslint no-bitwise:off */
/* eslint no-extra-parens:off */
/* eslint one-var:off */
/* eslint sort-vars:off */
/* eslint no-underscore-dangle:off */
/*global
Float32Array:false,
debug:false,
assert:false
*/

const util = require('../../../common/util.js');

//
// Draw2DGroup. Wraps vertex buffer data with pairings of indices and textures
// representing subsets of buffer relating to a set of equal-texture quads.
//
// [ sprite1  sprite2  sprite3  sprite4  sprite5 ]
//  \---------------/  \------/ \--------------/
//       texture 1    texture 2     texture 3
//      12 indices    6 indices     12 indices
//
class Draw2DGroup {
  constructor() {
    // pairs of index counts + associated texture for subset of group.
    this.indices = [];
    this.textures = [];
    this.numSets = 0;

    // vertex buffer for group.
    this.vertexBufferData = new Draw2D.FloatArray(1024);
    this.numVertices = 0;
  }
}
Draw2DGroup.create = function () {
  return new Draw2DGroup();
};

function diffTextures(texturesa, texturesb) {
  if (texturesa.length !== texturesb.length) {
    return true;
  }
  for (let ii = 0; ii < texturesa.length; ++ii) {
    if (texturesa[ii] !== texturesb[ii]) {
      return true;
    }
  }
  return false;
}

//
// Draw2DSprite
//
export class Draw2DSprite {
  constructor(params) {
    // data:
    // ---
    // First 16 values reserved for Draw2DSpriteData.
    //   includes colour and texture coordinates.
    //
    // 16    : old_rotation (for lazy evaluation)
    // 17,18 : width/2, height/2 (changed by user via function)
    // 19,20 : scaleX, scaleY    (changed by user via function)
    // 21,22 : shearX, shearY    (changed by user via function)
    // 23,24 : originX, originY  (changed by user via function)
    // 25,26 : cx, cy // locally defined position of true center of sprite relative to origin
    //    (dependent on scale/shear/center/dimension)
    // 27,28 : u1, v1 // locally defined position of top-left vertex relative to center of sprite.
    //    (dependent on scale/shear/dimension)
    // 29,30 : u2, v2 // locally defined position of top-right vertex relative to center of sprite.
    //    (dependent on scale/shear/dimension)
    // 31,32 : px, py // relative defined position of true center of sprite relative to origin
    //    (dependent on rotation and cx,cy)
    // 33,34 : x1, y1 // relative defined position of top-left vertex relative to center of sprite.
    //    (dependent on rotation and u1,v1)
    // 35,36 : x2, y2 // relative defined position of top-right vertex relative to center of sprite.
    //    (dependent on rotation and u2,v2)
    // 37 : Squared epsilon to consider rotations equal based on dimensions.
    let data = this.data = new Draw2D.FloatArray(38);

    // textures (not optional)
    let textures = this._textures = params.textures || [];
    let texture = textures[0];
    if (texture) {
      if (texture.width & (texture.width - 1) !== 0 || texture.height & (texture.height - 1) !== 0) {
        debug.abort('Draw2DSprites require textures with power-of-2 dimensions');
        return null;
      }
    }

    // position (optional, default 0,0)
    this.x = params.x || 0.0;
    this.y = params.y || 0.0;

    // rotation (optional, default 0)
    this.rotation = data[16] = params.rotation || 0.0;

    // colour (optional, default [1,1,1,1])
    let color = params.color;
    data[8] = color ? color[0] : 1.0;
    data[9] = color ? color[1] : 1.0;
    data[10] = color ? color[2] : 1.0;
    data[11] = color ? color[3] : 1.0;

    // uvRect (optional, default texture rectangle)
    let uvRect = params.textureRectangle;
    let iwidth = texture ? 1 / texture.width : 1;
    let iheight = texture ? 1 / texture.height : 1;
    data[12] = uvRect ? uvRect[0] * iwidth : 0.0;
    data[13] = uvRect ? uvRect[1] * iheight : 0.0;
    data[14] = uvRect ? uvRect[2] * iwidth : 1.0;
    data[15] = uvRect ? uvRect[3] * iheight : 1.0;

    // dimensions / 2 (default texture dimensions)
    data[17] = (params.width !== undefined ? params.width : texture.width) * 0.5;
    data[18] = (params.height !== undefined ? params.height : texture.height) * 0.5;

    // scale (default [1,1])
    let scale = params.scale;
    data[19] = scale ? scale[0] : 1.0;
    data[20] = scale ? scale[1] : 1.0;

    // shear (default [0,0])
    let shear = params.shear;
    data[21] = shear ? shear[0] : 0.0;
    data[22] = shear ? shear[1] : 0.0;

    // origin (default dimensions / 2)
    let origin = params.origin;
    data[23] = origin ? origin[0] : data[17];
    data[24] = origin ? origin[1] : data[18];
    assert(isFinite(data[23]));  // JE: Tracking down error
    assert(isFinite(data[24]));  // JE: Tracking down error

    this._invalidate();
  }

  //
  // Assumption is that user will not be performing these actions frequently.
  // To that end, we provide a function which performs the ssary side effects
  // on call, to prevent an overhead for lazy evaluation.
  //
  getTextureRectangle(dst) {
    if (dst === undefined) {
      dst = new Draw2D.FloatArray(4);
    }
    let data = this.data;
    let texture = this._textures[0];
    if (texture) {
      dst[0] = data[12] * texture.width;
      dst[1] = data[13] * texture.height;
      dst[2] = data[14] * texture.width;
      dst[3] = data[15] * texture.height;
    } else {
      dst[0] = data[12];
      dst[1] = data[13];
      dst[2] = data[14];
      dst[3] = data[15];
    }
    return dst;
  }

  setTextureRectangle(uvRect) {
    let data = this.data;
    let texture = this._textures[0];
    if (texture) {
      let iwidth = 1 / texture.width;
      let iheight = 1 / texture.height;
      data[12] = uvRect[0] * iwidth;
      data[13] = uvRect[1] * iheight;
      data[14] = uvRect[2] * iwidth;
      data[15] = uvRect[3] * iheight;
    } else {
      data[12] = uvRect[0];
      data[13] = uvRect[1];
      data[14] = uvRect[2];
      data[15] = uvRect[3];
    }
  }

  getColor(dst) {
    if (dst === undefined) {
      dst = new Draw2D.FloatArray(4);
    }
    let data = this.data;
    dst[0] = data[8];
    dst[1] = data[9];
    dst[2] = data[10];
    dst[3] = data[11];
    return dst;
  }

  setColor(color) {
    let data = this.data;
    data[8] = color[0];
    data[9] = color[1];
    data[10] = color[2];
    data[11] = color[3];
  }

  getTextures() {
    return this._textures;
  }

  setTexture(idx, texture) {
    // Verify that the texture is not NPOT
    debug.assert(
      !texture ||
      (texture.width & (texture.width - 1)) === 0 && (texture.height & (texture.height - 1)) === 0,
      'Draw2DSprite does not support non-power-of-2 textures');

    if (this._textures[idx] !== texture) {
      let su = (this._textures[idx] ? this._textures[idx].width : 1.0) / (texture ? texture.width : 1.0);
      let sv = (this._textures[idx] ? this._textures[idx].height : 1.0) / (texture ? texture.height : 1.0);
      this._textures[idx] = texture || null;

      // re-normalise texture coordinates.
      if (idx === 0) {
        let data = this.data;
        data[12] *= su;
        data[13] *= sv;
        data[14] *= su;
        data[15] *= sv;
      }
    }
  }

  getWidth() {
    return this.data[17] * 2;
  }

  setWidth(width) {
    width *= 0.5;
    assert(isFinite(width)); // JE: Tracking down error
    let data = this.data;
    if (data[17] !== width) {
      // Move the origin so that the sprite gets scaled around
      // it, rather than scaled around the top left corner.
      // originX = originX * (newwidth/2) / (oldwidth/2)
      assert(isFinite(data[23]));  // JE: Tracking down error
      if (!isFinite(data[23])) {  // JE: Tracking down error
        data[23] = 0;  // JE: Tracking down error
      }  // JE: Tracking down error
      data[23] = data[23] * width / data[17];
      assert(isFinite(data[23]));  // JE: Tracking down error
      data[17] = width;
      this._invalidate();
    }
  }

  getHeight() {
    return this.data[18] * 2;
  }

  setHeight(height) {
    height *= 0.5;
    let data = this.data;
    if (data[18] !== height) {
      // originY = originY * (newheight/2) / (oldheight/2)
      data[24] = data[24] * height / data[18];
      data[18] = height;
      this._invalidate();
    }
  }

  getScale(dst) {
    if (dst === undefined) {
      dst = new Draw2D.FloatArray(2);
    }
    let data = this.data;
    dst[0] = data[19];
    dst[1] = data[20];
    return dst;
  }

  setScale(scale) {
    let scaleX = scale[0];
    let scaleY = scale[1];
    let data = this.data;
    if (data[19] !== scaleX || data[20] !== scaleY) {
      data[19] = scaleX;
      data[20] = scaleY;
      this._invalidate();
    }
  }

  getShear(dst) {
    if (dst === undefined) {
      dst = new Draw2D.FloatArray(2);
    }
    let data = this.data;
    dst[0] = data[21];
    dst[1] = data[22];
    return dst;
  }

  setShear(shear) {
    let shearX = shear[0];
    let shearY = shear[1];
    let data = this.data;
    if (data[21] !== shearX || data[22] !== shearY) {
      data[21] = shearX;
      data[22] = shearY;
      this._invalidate();
    }
  }

  getOrigin(dst) {
    if (dst === undefined) {
      dst = new Draw2D.FloatArray(2);
    }
    let data = this.data;
    dst[0] = data[23];
    dst[1] = data[24];
    return dst;
  }

  setOrigin(origin) {
    let originX = origin[0];
    let originY = origin[1];
    assert(isFinite(originX) && isFinite(originY));  // JE: Tracking down error

    let data = this.data;
    assert(isFinite(data[23]));  // JE: Tracking down error
    if (data[23] !== originX || data[24] !== originY) {
      data[23] = originX;
      assert(isFinite(data[23]));  // JE: Tracking down error
      data[24] = originY;
      this._invalidate();
    }
  }

  // Method for internal use only.
  //
  // Recompute locally defined vectors.
  _invalidate() {
    let data = this.data;

    // [ T1 T2 ] = [ scaleX 0 ] [ 1 shearX ]
    // [ T3 T4 ]   [ 0 scaleY ] [ shearY 1 ]
    let T1 = data[19];
    let T2 = data[19] * data[21];
    let T3 = data[20] * data[22];
    let T4 = data[20];

    // Recompute locally defined position of true center of sprite.
    let x = data[17] - data[23];
    let y = data[18] - data[24];
    let cx = data[25] = (T1 * x + T2 * y);
    let cy = data[26] = (T3 * x + T4 * y);

    // Recompute locally defined position of top-left vertex relative to center of sprite.
    x = -data[17];
    y = -data[18];
    let ux = data[27] = (T1 * x + T2 * y);
    let uy = data[28] = (T3 * x + T4 * y);

    // Recompute locally defined position of top-right vertex relative to center of sprite.
    x = -x;
    let vx = data[29] = (T1 * x + T2 * y);
    let vy = data[30] = (T3 * x + T4 * y);

    // Rotate vectors to screen space so that in the case that rotation is not performed
    // These vectors are still valid.
    let rotation = data[16] = this.rotation;
    let cos = Math.cos(rotation);
    let sin = Math.sin(rotation);

    data[31] = ((cos * cx) - (sin * cy));
    data[32] = ((sin * cx) + (cos * cy));
    data[33] = ((cos * ux) - (sin * uy));
    data[34] = ((sin * ux) + (cos * uy));
    data[35] = ((cos * vx) - (sin * vy));
    data[36] = ((sin * vx) + (cos * vy));

    // Compute suitable epsilon to consider rotations equals.
    // We do this by finding the vertex furthest from defined center of rotation.
    // And using its distance to compute what rotation constitutes a 'visible' rotation.
    //
    // Positions of vertices relative to origin are given by:
    // v1 = c + u, v2 = c + v, v3 = c - v, v4 = c - u.
    // |v1|^2 = |c|^2 + |u|^2 + 2c.u
    // |v4|^2 = |c|^2 + |u|^2 - 2c.u
    // |v2|^2 = |c|^2 + |v|^2 + 2c.v
    // |v3|^2 = |c|^2 + |v|^2 - 2c.v
    //
    // Compute r1 = |u|^2 + abs(2c.u)
    // Compute r2 = |v|^2 + abs(2c.v)
    //
    // Finally max(|vi|^2) = |c|^2 + max(r1, r2)
    //
    let dot = 2 * ((cx * ux) + (cy * uy));
    if (dot < 0) {
      dot = -dot;
    }
    let r1 = (ux * ux) + (uy * uy) + dot;

    dot = 2 * ((cx * vx) + (cy * vy));
    if (dot < 0) {
      dot = -dot;
    }
    let r2 = (vx * vx) + (vy * vy) + dot;

    if (r2 > r1) {
      r1 = r2;
    }

    r1 += ((cx * cx) + (cy * cy));

    // r1 is the squared distance to furthest vertex.
    //
    // We permit a half pixel movement to be considered a 'true' movement.
    // Squared rotation required to impart this movement on furthest vertex is
    data[37] = (0.25 / r1);
  }

  // Method for internal use only.
  //
  // Recompute draw2d coordinate space vertices and vectors.
  _update(angleScaleFactor) {
    let data = this.data;
    let x, y, u, v;

    // Check if rotation has been modified
    x = this.rotation;
    y = x - data[16];
    if ((y * y) > (data[37] * angleScaleFactor)) {
      data[16] = x;
      u = Math.cos(x);
      v = Math.sin(x);

      // rotate locally defined vectors.
      x = data[25];
      y = data[26];
      data[31] = (u * x - v * y);
      data[32] = (v * x + u * y);

      x = data[27];
      y = data[28];
      data[33] = (u * x - v * y);
      data[34] = (v * x + u * y);

      x = data[29];
      y = data[30];
      data[35] = (u * x - v * y);
      data[36] = (v * x + u * y);
    }

    // Compute center of this sprite in screen space.
    u = this.x + data[31];
    v = this.y + data[32];

    // Compute vertex positions in screen space.
    x = data[33];
    y = data[34];
    data[0] = u + x;
    data[1] = v + y;
    data[6] = u - x;
    data[7] = v - y;

    x = data[35];
    y = data[36];
    data[2] = u + x;
    data[3] = v + y;
    data[4] = u - x;
    data[5] = v - y;
  }
}

Draw2DSprite.create = function (params) {
  assert(params.width);
  assert(params.height);
  assert(params.textures && params.textures.length);
  if ((params.width === undefined || params.height === undefined) && !params.textures) {
    return null;
  }

  return new Draw2DSprite(params);
};
Draw2DSprite.version = 1;

//
// Used in rectangle draw routines to compute data to be pushed into
// vertex buffers.
//
export let Draw2DSpriteData = {
  setFromRotatedRectangle: function setFromRotatedRectangle(sprite, textures, rect, uvrect, color, rotation, origin) {
    debug.assert(rect.length === 4);
    let x1 = rect[0];
    let y1 = rect[1];
    let x2 = rect[2];
    let y2 = rect[3];

    if (!rotation) {
      sprite[0] = x1;
      sprite[1] = y1;
      sprite[2] = x2;
      sprite[3] = y1;
      sprite[4] = x1;
      sprite[5] = y2;
      sprite[6] = x2;
      sprite[7] = y2;
    } else {
      let cx, cy;
      if (origin) {
        debug.assert(origin.length === 2);
        cx = x1 + origin[0];
        cy = y1 + origin[1];
      } else {
        cx = 0.5 * (x1 + x2);
        cy = 0.5 * (y1 + y2);
      }

      let dx = x1 - cx;
      let dy = y1 - cy;

      let cos = Math.cos(rotation);
      let sin = Math.sin(rotation);
      let w = (x2 - x1);
      let h = (y2 - y1);

      sprite[0] = x1 = cx + (cos * dx - sin * dy);
      sprite[1] = y1 = cy + (sin * dx + cos * dy);
      sprite[2] = x1 + (cos * w);
      sprite[3] = y1 + (sin * w);
      sprite[4] = x1 - (sin * h);
      sprite[5] = y1 + (cos * h);
      sprite[6] = x1 + (cos * w - sin * h);
      sprite[7] = y1 + (sin * w + cos * h);
    }

    if (color) {
      debug.assert(color.length === 4);
      sprite[8] = color[0];
      sprite[9] = color[1];
      sprite[10] = color[2];
      sprite[11] = color[3];
    } else {
      sprite[8] = sprite[9] = sprite[10] = sprite[11] = 1.0;
    }

    if (uvrect && textures) {
      debug.assert(uvrect.length === 4);
      let iwidth = 1 / textures[0].width;
      let iheight = 1 / textures[0].height;
      sprite[12] = uvrect[0] * iwidth;
      sprite[13] = uvrect[1] * iheight;
      sprite[14] = uvrect[2] * iwidth;
      sprite[15] = uvrect[3] * iheight;
    } else {
      sprite[12] = sprite[13] = 0;
      sprite[14] = sprite[15] = 1;
    }
  },
  create: function create() {
    // x1 y1 x2 y2 x3 y3 x4 y4 - vertices [0,8)
    // cr cg cb ca u1 v1 u2 v2 - normalized color + texture [8,16)
    return new Draw2D.FloatArray(16);
  }
};

export function Draw2D() {
  this.forceUpdate = false;
  this.clearBackBuffer = false;
  // Note that this code gets inserted into the constructor.
  this.defaultClearColor = Draw2D.defaultClearColor;
  // supported sort modes.
  this.sort = {
    deferred: 'deferred',
    immediate: 'immediate',
    texture: 'texture'
  };
  // supported scale modes.
  this.scale = {
    scale: 'scale',
    none: 'none'
  };
  this.drawStates = {
    uninit: 0,
    ready: 1,
    draw: 2
  };
  this.clipSpace = new Draw2D.FloatArray(4);

  this.draw = this.drawDeferred;
  this.drawSprite = this.drawSpriteDeferred;
  this.drawRaw = this.drawRawDeferred;
}

// Methods
Draw2D.prototype.clear = function (clearColor) {
  if (this.state !== this.drawStates.ready) {
    return false;
  }

  let gd = this.graphicsDevice;
  if (this.currentRenderTarget) {
    if (!gd.beginRenderTarget(this.currentRenderTarget.renderTarget)) {
      return false;
    }

    gd.clear(clearColor || this.defaultClearColor);
    gd.endRenderTarget();
  } else {
    gd.clear(clearColor || this.defaultClearColor);
  }

  return true;
};

Draw2D.prototype.clearBatch = function () {
  this.currentTextureGroup = undefined;
  this.numGroups = 0;
};

Draw2D.prototype.bufferSprite = function (buffer, sprite, index) {
  sprite._update(0);

  /*jshint bitwise: false*/
  index <<= 4;

  /*jshint bitwise: true*/
  let data = sprite.data;
  buffer[index] = data[0];
  buffer[index + 1] = data[1];
  buffer[index + 2] = data[2];
  buffer[index + 3] = data[3];
  buffer[index + 4] = data[4];
  buffer[index + 5] = data[5];
  buffer[index + 6] = data[6];
  buffer[index + 7] = data[7];
  buffer[index + 8] = data[8];
  buffer[index + 9] = data[9];
  buffer[index + 10] = data[10];
  buffer[index + 11] = data[11];
  buffer[index + 12] = data[12];
  buffer[index + 13] = data[13];
  buffer[index + 14] = data[14];
  buffer[index + 15] = data[15];
};

Draw2D.prototype.update = function () {
  let graphicsDevice = this.graphicsDevice;
  let width = this.width;
  let height = this.height;

  let graphicsDeviceWidth = graphicsDevice.width;
  let graphicsDeviceHeight = graphicsDevice.height;

  if (width !== graphicsDeviceWidth || height !== graphicsDeviceHeight || this.forceUpdate) {
    let viewWidth, viewHeight, viewX, viewY;
    let viewportRectangle = this.viewportRectangle;

    if (viewportRectangle) {
      viewX = viewportRectangle[0];
      viewY = viewportRectangle[1];
      viewWidth = viewportRectangle[2] - viewX;
      viewHeight = viewportRectangle[3] - viewY;
    } else {
      viewX = 0;
      viewY = 0;
      viewWidth = graphicsDeviceWidth;
      viewHeight = graphicsDeviceHeight;
    }

    if ((viewWidth === graphicsDeviceWidth) && (viewHeight === graphicsDeviceHeight)) {
      this.clearBackBuffer = false;
    } else {
      this.clearBackBuffer = true;
    }

    let target = this.currentRenderTarget;

    if (this.scaleMode === 'scale') {
      let viewAspectRatio = viewWidth / viewHeight;
      let graphicsDeviceAspectRatio = graphicsDeviceWidth / graphicsDeviceHeight;
      let calcViewWidth, calcViewHeight, diffWidth, diffHeight, halfDiffWidth, halfDiffHeight;

      if (graphicsDeviceAspectRatio > viewAspectRatio) {
        calcViewWidth = Math.ceil((graphicsDeviceHeight / viewHeight) * viewWidth);
        diffWidth = graphicsDeviceWidth - calcViewWidth;
        halfDiffWidth = Math.floor(diffWidth * 0.5);

        this.scissorX = halfDiffWidth;
        this.scissorY = 0;
        this.scissorWidth = calcViewWidth;
        this.scissorHeight = graphicsDeviceHeight;

        this.viewScaleX = viewWidth / calcViewWidth;
        this.viewScaleY = viewHeight / graphicsDeviceHeight;

        if (!target) {
          this.clipOffsetX = (halfDiffWidth / graphicsDeviceWidth * 2.0) - 1.0;
          this.clipOffsetY = 1;
          this.clipScaleX = (calcViewWidth / graphicsDeviceWidth * 2.0) / viewWidth;
          this.clipScaleY = -2.0 / viewHeight;
        }
      } else {
        calcViewHeight = Math.ceil((graphicsDeviceWidth / viewWidth) * viewHeight);
        diffHeight = graphicsDeviceHeight - calcViewHeight;
        halfDiffHeight = Math.floor(diffHeight * 0.5);

        this.scissorX = 0;
        this.scissorY = halfDiffHeight;
        this.scissorWidth = graphicsDeviceWidth;
        this.scissorHeight = calcViewHeight;

        this.viewScaleX = viewWidth / graphicsDeviceWidth;
        this.viewScaleY = viewHeight / calcViewHeight;

        if (!target) {
          this.clipOffsetX = -1.0;
          this.clipOffsetY = 1 - ((halfDiffHeight / graphicsDeviceHeight) * 2.0);
          this.clipScaleX = 2.0 / viewWidth;
          this.clipScaleY = ((calcViewHeight / graphicsDeviceHeight) * -2.0) / viewHeight;
        }
      }
    } else {
      this.viewScaleX = 1;
      this.viewScaleY = 1;

      if (!target) {
        this.clipOffsetX = -1.0;
        this.clipOffsetY = 1.0;
        this.clipScaleX = 2.0 / graphicsDeviceWidth;
        this.clipScaleY = -2.0 / graphicsDeviceHeight;
      }

      this.scissorX = 0;
      this.scissorY = (graphicsDeviceHeight - viewHeight);
      this.scissorWidth = viewWidth;
      this.scissorHeight = viewHeight;
    }

    this.spriteAngleFactor = Math.min(this.viewScaleX, this.viewScaleY);
    this.spriteAngleFactor *= this.spriteAngleFactor;

    this.width = graphicsDeviceWidth;
    this.height = graphicsDeviceHeight;

    let renderTargets = this.renderTargetStructs;
    let limit = renderTargets.length;
    for (let i = 0; i < limit; i += 1) {
      this.validateTarget(renderTargets[i], this.scissorWidth, this.scissorHeight);
    }

    if (target) {
      this.clipOffsetX = -1.0;
      this.clipOffsetY = -1.0;
      this.clipScaleX = 2.0 * target.actualWidth / target.texture.width / viewWidth;
      this.clipScaleY = 2.0 * target.actualHeight / target.texture.height / viewHeight;
    }

    // Deal with viewports that are not started at (0,0)
    this.clipOffsetX -= viewX * this.clipScaleX;
    this.clipOffsetY -= viewY * this.clipScaleY;

    this.clipSpace[0] = this.clipScaleX;
    this.clipSpace[1] = this.clipScaleY;
    this.clipSpace[2] = this.clipOffsetX;
    this.clipSpace[3] = this.clipOffsetY;

    this.updateRenderTargetVbo(this.scissorX, this.scissorY, this.scissorWidth, this.scissorHeight);
    this.forceUpdate = false;
  }
};

Draw2D.prototype.getViewport = function (dst) {
  if (!dst) {
    dst = new Draw2D.FloatArray(4);
  }
  let viewport = this.viewportRectangle;
  if (viewport) {
    dst[0] = viewport[0];
    dst[1] = viewport[1];
    dst[2] = viewport[2];
    dst[3] = viewport[3];
  } else {
    dst[0] = dst[1] = 0;
    dst[2] = this.graphicsDevice.width;
    dst[3] = this.graphicsDevice.height;
  }
  return dst;
};

Draw2D.prototype.getScreenSpaceViewport = function (dst) {
  if (!dst) {
    dst = new Draw2D.FloatArray(4);
  }

  // ensure mapping is correct.
  this.update();

  dst[0] = this.scissorX;
  dst[1] = this.height - (this.scissorY + this.scissorHeight);
  dst[2] = dst[0] + this.scissorWidth;
  dst[3] = dst[1] + this.scissorHeight;
  return dst;
};

Draw2D.prototype.viewportMap = function (screenX, screenY, dst) {
  if (!dst) {
    dst = new Draw2D.FloatArray(2);
  }

  // ensure mapping is correct.
  this.update();

  // webgl coordinates have flipped y.
  let scissorY = (this.height - this.scissorHeight - this.scissorY);

  dst[0] = (screenX - this.scissorX) * this.viewScaleX;
  dst[1] = (screenY - scissorY) * this.viewScaleY;

  let viewport = this.viewportRectangle;
  if (viewport) {
    dst[0] += viewport[0];
    dst[1] += viewport[1];
  }

  return dst;
};

Draw2D.prototype.viewportUnmap = function (x, y, dst) {
  if (!dst) {
    dst = new Draw2D.FloatArray(2);
  }

  // ensure mapping is correct.
  this.update();

  let viewport = this.viewportRectangle;
  if (viewport) {
    x -= viewport[0];
    y -= viewport[1];
  }

  // webgl coordinates have flipped y.
  let scissorY = (this.height - this.scissorHeight - this.scissorY);

  dst[0] = (x / this.viewScaleX) + this.scissorX;
  dst[1] = (y / this.viewScaleY) + scissorY;
  return dst;
};

Draw2D.prototype.viewportClamp = function (point) {
  if (point) {
    let x = point[0];
    let y = point[1];

    let minX, minY, maxX, maxY;
    let viewport = this.viewportRectangle;
    if (viewport) {
      minX = viewport[0];
      minY = viewport[1];
      maxX = viewport[2];
      maxY = viewport[3];
    } else {
      minX = 0;
      minY = 0;
      maxX = this.graphicsDevice.width;
      maxY = this.graphicsDevice.height;
    }

    if (x < minX) {
      x = minX;
    } else if (x > maxX) {
      x = maxX;
    }

    if (y < minY) {
      y = minY;
    } else if (y > maxY) {
      y = maxY;
    }

    point[0] = x;
    point[1] = y;
  }

  return point;
};

Draw2D.prototype.configure = function (params) {
  if (this.state !== this.drawStates.ready) {
    return false;
  }

  let viewportRectangle = ('viewportRectangle' in params) ? params.viewportRectangle : this.viewportRectangle;

  let scaleMode = params.scaleMode;
  if (scaleMode !== undefined) {
    if (!(scaleMode in this.scale)) {
      return false;
    }
    if (scaleMode === 'scale' && !viewportRectangle) {
      return false;
    }
    this.scaleMode = scaleMode;
  }

  this.viewportRectangle = viewportRectangle;

  this.forceUpdate = true;
  this.update();

  return true;
};

Draw2D.prototype.destroy = function () {
  this.state = this.drawStates.uninit;

  this.graphicsDevice = null;

  if (this.vertexBuffer) {
    this.vertexBuffer.destroy();
  }
  if (this.indexBuffer) {
    this.indexBuffer.destroy();
  }

  this.copyVertexBuffer.destroy();

  let renderTargets = this.renderTargetStructs;
  while (renderTargets.length > 0) {
    let target = renderTargets.pop();
    target.texture.destroy();
    target.renderTarget.destroy();
    target.texture = null;
    target.renderTarget = null;
  }
};

Draw2D.prototype.begin = function (blendMode) {
  let sortMode = 'deferred';

  //if there are render states left in the stack
  //and begin has been called without an end
  //draw previous data with current render state
  let firstTime = !this.sortMode;
  if (this.dispatch()) {
    this.clearBatch();
  }

  if (firstTime) {
    if (this.state !== this.drawStates.ready) {
      return false;
    }

    // Check the buffers are correct before we render
    this.update();

    if (!this.currentRenderTarget) {
      this.graphicsDevice.setScissor(this.scissorX, this.scissorY, this.scissorWidth, this.scissorHeight);
    }
  }

  this.state = this.drawStates.draw;

  blendMode = (blendMode) ? blendMode : (firstTime ? 'alpha' : this.blendMode);

  if (!firstTime) {
    this.sortModeStack.push(this.sortMode);
    this.blendModeStack.push(this.blendMode);
  }
  this.sortMode = sortMode;
  this.blendMode = blendMode;

  this.graphicsDevice.setTechnique(this.blendModeTechniques[blendMode]);

  return true;
};

////////////////////////////////////////////////////////////////////////////
// append sprite data to group buffer.
Draw2D.prototype._bufferSprite = function (group, sprite) {
  let vertexData = group.vertexBufferData;
  let vertexBuffer = this.vertexBuffer;

  let index = group.numVertices * vertexBuffer.stride;
  let total = index + (4 * vertexBuffer.stride);
  if (total >= vertexData.length) {
    // allocate new vertex buffer data array.
    let size = this.bufferSizeAlgorithm(total, this.cpuStride);
    let newData = new Draw2D.FloatArray(size);

    // copy data from existing buffer.
    for (let i = 0; i < index; i += 1) {
      newData[i] = vertexData[i];
    }

    group.vertexBufferData = vertexData = newData;
  }

  let c1 = sprite[8];
  let c2 = sprite[9];
  let c3 = sprite[10];
  let c4 = sprite[11];
  let u1 = sprite[12];
  let v1 = sprite[13];
  let u2 = sprite[14];
  let v2 = sprite[15];

  vertexData[index] = sprite[0];
  vertexData[index + 1] = sprite[1];
  vertexData[index + 2] = c1;
  vertexData[index + 3] = c2;
  vertexData[index + 4] = c3;
  vertexData[index + 5] = c4;
  vertexData[index + 6] = u1;
  vertexData[index + 7] = v1;

  vertexData[index + 8] = sprite[2];
  vertexData[index + 9] = sprite[3];
  vertexData[index + 10] = c1;
  vertexData[index + 11] = c2;
  vertexData[index + 12] = c3;
  vertexData[index + 13] = c4;
  vertexData[index + 14] = u2;
  vertexData[index + 15] = v1;

  vertexData[index + 16] = sprite[4];
  vertexData[index + 17] = sprite[5];
  vertexData[index + 18] = c1;
  vertexData[index + 19] = c2;
  vertexData[index + 20] = c3;
  vertexData[index + 21] = c4;
  vertexData[index + 22] = u1;
  vertexData[index + 23] = v2;

  vertexData[index + 24] = sprite[6];
  vertexData[index + 25] = sprite[7];
  vertexData[index + 26] = c1;
  vertexData[index + 27] = c2;
  vertexData[index + 28] = c3;
  vertexData[index + 29] = c4;
  vertexData[index + 30] = u2;
  vertexData[index + 31] = v2;

  group.numVertices += 4;

  // increment number of indices in present subset.
  group.indices[group.numSets - 1] += 6;
};

Draw2D.prototype.bufferMultiSprite = function (group, buffer, count, offset) {
  let vertexData = group.vertexBufferData;
  let vertexBuffer = this.vertexBuffer;

  let numSprites = (count === undefined) ? Math.floor(buffer.length / 16) : count;
  count = numSprites * 16;

  offset = (offset !== undefined ? offset : 0) * 16;

  let index = (group.numVertices * vertexBuffer.stride);
  let total = index + (numSprites * 4 * vertexBuffer.stride);
  if (total >= vertexData.length) {
    // allocate new vertex buffer data array.
    let size = this.bufferSizeAlgorithm(total, this.cpuStride);
    let newData = new Draw2D.FloatArray(size);

    for (let i = 0; i < index; i += 1) {
      newData[i] = vertexData[i];
    }

    group.vertexBufferData = vertexData = newData;
  }

  let limit = offset + count;
  for (let i = offset; i < limit; i += 16) {
    let c1 = buffer[i + 8];
    let c2 = buffer[i + 9];
    let c3 = buffer[i + 10];
    let c4 = buffer[i + 11];
    let u1 = buffer[i + 12];
    let v1 = buffer[i + 13];
    let u2 = buffer[i + 14];
    let v2 = buffer[i + 15];

    vertexData[index] = buffer[i];
    vertexData[index + 1] = buffer[i + 1];
    vertexData[index + 2] = c1;
    vertexData[index + 3] = c2;
    vertexData[index + 4] = c3;
    vertexData[index + 5] = c4;
    vertexData[index + 6] = u1;
    vertexData[index + 7] = v1;

    vertexData[index + 8] = buffer[i + 2];
    vertexData[index + 9] = buffer[i + 3];
    vertexData[index + 10] = c1;
    vertexData[index + 11] = c2;
    vertexData[index + 12] = c3;
    vertexData[index + 13] = c4;
    vertexData[index + 14] = u2;
    vertexData[index + 15] = v1;

    vertexData[index + 16] = buffer[i + 4];
    vertexData[index + 17] = buffer[i + 5];
    vertexData[index + 18] = c1;
    vertexData[index + 19] = c2;
    vertexData[index + 20] = c3;
    vertexData[index + 21] = c4;
    vertexData[index + 22] = u1;
    vertexData[index + 23] = v2;

    vertexData[index + 24] = buffer[i + 6];
    vertexData[index + 25] = buffer[i + 7];
    vertexData[index + 26] = c1;
    vertexData[index + 27] = c2;
    vertexData[index + 28] = c3;
    vertexData[index + 29] = c4;
    vertexData[index + 30] = u2;
    vertexData[index + 31] = v2;

    index += 32;
  }

  group.numVertices += (numSprites * 4);

  // increment number of indices in present subset.
  group.indices[group.numSets - 1] += (numSprites * 6);
};

////////////////////////////////////////////////////////////////////////////
Draw2D.prototype.indexData = function (count) {
  let indexData = new Draw2D.UInt16Array(count);
  let vertexIndex = 0;
  for (let i = 0; i < count; i += 6) {
    indexData[i] = vertexIndex;
    indexData[i + 1] = vertexIndex + 1;
    indexData[i + 2] = vertexIndex + 2;
    indexData[i + 3] = vertexIndex + 1;
    indexData[i + 4] = vertexIndex + 2;
    indexData[i + 5] = vertexIndex + 3;
    vertexIndex += 4;
  }
  return indexData;
};

// upload group buffer to graphics device vertexBuffer.
Draw2D.prototype.uploadBuffer = function (group, count, offset) {
  let vertexBuffer = this.vertexBuffer;
  let vertexBufferParameters = this.vertexBufferParameters;
  let graphicsDevice = this.graphicsDevice;
  let vertexData = group.vertexBufferData;

  let performanceData = this.performanceData;

  if (count > vertexBufferParameters.numVertices) {
    let newSize = this.bufferSizeAlgorithm(count, this.gpuStride);
    if (newSize > this.maxVertices) {
      newSize = this.maxVertices;
    }

    vertexBufferParameters.numVertices = newSize;
    this.vertexBuffer.destroy();
    this.vertexBuffer = vertexBuffer = graphicsDevice.createVertexBuffer(vertexBufferParameters);

    // 32 bytes per vertex.
    // 2 bytes per index, 1.5 indices per vertex.
    performanceData.gpuMemoryUsage = newSize * 35;

    newSize *= 1.5;

    // Set indices.
    let indexBufferParameters = this.indexBufferParameters;
    indexBufferParameters.data = this.indexData(newSize);
    indexBufferParameters.numIndices = newSize;
    this.indexBuffer.destroy();
    this.indexBuffer = graphicsDevice.createIndexBuffer(indexBufferParameters);
    indexBufferParameters.data = null;
    graphicsDevice.setIndexBuffer(this.indexBuffer);
  }

  performanceData.dataTransfers += 1;

  if (offset === 0) {
    vertexBuffer.setData(vertexData, 0, count);
  } else {
    let stride = vertexBuffer.stride;
    vertexBuffer.setData(vertexData.subarray(offset * stride, (offset + count) * stride), 0, count);
  }
};

////////////////////////////////////////////////////////////////////////////
Draw2D.prototype.drawRawDeferred = function (textures, multiSprite, count, offset) {
  textures = textures || this.defaultTextures;
  let group = this.drawGroups[0];
  this.numGroups = 1;

  // If present group draw list uses a different texture
  // We must start a new draw list.
  let numSets = group.numSets;
  if (numSets === 0 || diffTextures(group.textures[numSets - 1], textures)) {
    group.textures[numSets] = textures;
    group.indices[numSets] = 0;
    group.numSets += 1;
  }

  this.bufferMultiSprite(group, multiSprite, count, offset);
};

Draw2D.prototype.drawSpriteDeferred = function (sprite) {
  let textures = sprite._textures || this.defaultTextures;

  let group = this.drawGroups[0];
  this.numGroups = 1;

  // If present group draw list uses a different texture
  // We must start a new draw list.
  let numSets = group.numSets;
  if (numSets === 0 || diffTextures(group.textures[numSets - 1], textures)) {
    group.textures[numSets] = textures;
    group.indices[numSets] = 0;
    group.numSets += 1;
  }

  sprite._update(this.spriteAngleFactor);
  this._bufferSprite(group, sprite.data);
};

Draw2D.prototype.drawDeferred = function (params) {
  let textures = params.textures || this.defaultTextures;

  let group = this.drawGroups[0];
  this.numGroups = 1;

  // If present group draw list uses a different texture
  // We must start a new draw list.
  let numSets = group.numSets;
  if (numSets === 0 || diffTextures(group.textures[numSets - 1], textures)) {
    group.textures[numSets] = textures;
    group.indices[numSets] = 0;
    group.numSets += 1;
  }

  let destRect = params.destinationRectangle;
  let srcRect = params.sourceRectangle;
  let color = params.color;
  let rotation = params.rotation;

  let drawSpriteData = this.drawSpriteData;
  Draw2DSpriteData.setFromRotatedRectangle(drawSpriteData, textures, destRect, srcRect, color, rotation, params.origin);

  this._bufferSprite(group, drawSpriteData);
};

////////////////////////////////////////////////////////////////////////////
Draw2D.prototype.end = function () {
  if (this.state !== this.drawStates.draw) {
    return false;
  }

  if (this.dispatch()) {
    this.clearBatch();
  }

  if (this.blendModeStack.length !== 0) {
    this.blendMode = this.blendModeStack.pop();
    this.sortMode = this.sortModeStack.pop();
    this.graphicsDevice.setTechnique(this.blendModeTechniques[this.blendMode]);
  } else {
    this.blendMode = undefined;
    this.sortMode = undefined;
    this.state = this.drawStates.ready;
  }

  return true;
};

Draw2D.prototype.dispatch = function () {
  // Nothing to dispatch.
  let numGroups = this.numGroups;
  if (numGroups === 0) {
    return false;
  }

  let graphicsDevice = this.graphicsDevice;
  let techniqueParameters = this.techniqueParameters;
  graphicsDevice.setIndexBuffer(this.indexBuffer);

  let drawGroups = this.drawGroups;
  let renderTargetUsed = false;
  if (this.currentRenderTarget) {
    renderTargetUsed = graphicsDevice.beginRenderTarget(this.currentRenderTarget.renderTarget);
  }

  let performanceData = this.performanceData;

  for (let i = 0; i < numGroups; i += 1) {
    let group = drawGroups[i];

    let textures = group.textures;
    let indices = group.indices;
    let setIndex = 0;

    let vindex = 0;
    let vlimit = group.numVertices;
    while (vindex < vlimit) {
      // number of vertices remaining.
      let vcount = vlimit - vindex;
      if (vcount > this.maxVertices) {
        vcount = this.maxVertices;
      }

      // Upload group vertex sub-buffer to graphics device.
      this.uploadBuffer(group, vcount, vindex);
      graphicsDevice.setStream(this.vertexBuffer, this.semantics);

      // sprite uses 4 vertices, and 6 indices
      // so for 'vcount' number of vertices, we have vcount * 1.5 indices
      let ilimit = vcount * 1.5;
      let iindex = 0;
      while (iindex < ilimit) {
        let tex_list = textures[setIndex];
        techniqueParameters.tex0 = tex_list[0];
        if (tex_list[1]) {
          techniqueParameters.tex1 = tex_list[1];
        }

        // number of indices remaining to render.
        let icount = ilimit - iindex;
        if (icount >= indices[setIndex]) {
          // finish rendering sub list.
          icount = indices[setIndex];
          setIndex += 1;
        } else {
          // sub list still has remaining indices to render.
          indices[setIndex] -= icount;
        }

        let batchSize = icount / 6;
        if (performanceData.batchCount === 0) {
          performanceData.minBatchSize = batchSize;
          performanceData.maxBatchSize = batchSize;
          performanceData.avgBatchSize = batchSize;
          performanceData.batchCount = 1;
        } else {
          if (batchSize < performanceData.minBatchSize) {
            performanceData.minBatchSize = batchSize;
          }
          if (batchSize > performanceData.maxBatchSize) {
            performanceData.maxBatchSize = batchSize;
          }
          performanceData.avgBatchSize *= performanceData.batchCount;
          performanceData.avgBatchSize += batchSize;
          performanceData.batchCount += 1;
          performanceData.avgBatchSize /= performanceData.batchCount;
        }

        graphicsDevice.setTechniqueParameters(techniqueParameters);
        graphicsDevice.drawIndexed(graphicsDevice.PRIMITIVE_TRIANGLES, icount, iindex);

        iindex += icount;
      }

      vindex += vcount;
    }

    group.numSets = 0;
    group.numVertices = 0;
  }

  if (this.currentRenderTarget && renderTargetUsed) {
    graphicsDevice.endRenderTarget();
  }

  return true;
};

Draw2D.prototype.bufferSizeAlgorithm = function (target, stride) {
  // scale factor of 2 is asymtopically optimal in terms of number of resizes
  // performed and copies performed, but we want to try and conserve memory
  // and so choose a less optimal 1.25 so that buffer will never be too much
  // larger than necessary.
  let factor = 1.25;

  // We size buffer to the next power of the factor which is >= target
  let logf = Math.ceil(Math.log(target) / Math.log(factor));
  let size = Math.floor(Math.pow(factor, logf));

  // Additionally ensure that we always take a multiple of of the stride
  // to avoid wasted bytes that could never be used.
  return (stride * Math.ceil(size / stride));
};

Draw2D.prototype.updateRenderTargetVbo = function (viewX, viewY, viewWidth, viewHeight) {
  let graphicsDevice = this.graphicsDevice;
  let halfGraphicsDeviceWidth = 0.5 * graphicsDevice.width;
  let halfGraphicsDeviceHeight = 0.5 * graphicsDevice.height;

  //
  // Update the VBO for the presentRenderTarget
  //
  let vertexBuffer = this.copyVertexBuffer;

  let left = (viewX - halfGraphicsDeviceWidth) / halfGraphicsDeviceWidth;
  let right = (viewX + viewWidth - halfGraphicsDeviceWidth) / halfGraphicsDeviceWidth;
  let topv = (viewY - halfGraphicsDeviceHeight) / halfGraphicsDeviceHeight;
  let bottom = (viewY + viewHeight - halfGraphicsDeviceHeight) / halfGraphicsDeviceHeight;

  let vertexData = this.vertexBufferData;
  vertexData[0] = left;
  vertexData[1] = bottom;
  vertexData[2] = 0.0;
  vertexData[3] = 1.0;

  vertexData[4] = left;
  vertexData[5] = topv;
  vertexData[6] = 0.0;
  vertexData[7] = 0.0;

  vertexData[8] = right;
  vertexData[9] = bottom;
  vertexData[10] = 1.0;
  vertexData[11] = 1.0;

  vertexData[12] = right;
  vertexData[13] = topv;
  vertexData[14] = 1.0;
  vertexData[15] = 0.0;

  vertexBuffer.setData(vertexData, 0, 4);
};

Draw2D.makePow2 = // always overallocate.
/*jshint bitwise: false*/
function (dim) {
  let index = Math.log(dim) / Math.log(2);
  return (1 << Math.ceil(index));
};

/*jshint bitwise: true*/
Draw2D.prototype.createRenderTarget = function (params) {
  let gd = this.graphicsDevice;
  let renderTargets = this.renderTargetStructs;
  let index = renderTargets.length;

  let name = (params && params.name) ? params.name : `RenderTarget#${index}`;
  let backBuffer = (params && params.backBuffer !== undefined) ? params.backBuffer : true;
  let matchScreen = (params.width === undefined || params.height === undefined);

  let texParams = this.renderTargetTextureParameters;
  texParams.name = name;

  let width = (matchScreen) ? gd.width : params.width;
  let height = (matchScreen) ? gd.height : params.height;

  let makePow2 = Draw2D.makePow2;
  texParams.width = makePow2(width);
  texParams.height = makePow2(height);

  let texture = gd.createTexture(texParams);
  let targetParams = this.renderTargetParams;
  targetParams.colorTexture0 = texture;
  let renderTarget = gd.createRenderTarget(targetParams);

  renderTargets.push({
    managed: matchScreen,
    renderTarget: renderTarget,
    texture: texture,
    backBuffer: backBuffer,
    actualWidth: (backBuffer ? width : texture.width),
    actualHeight: (backBuffer ? height : texture.height)
  });

  return index;
};

Draw2D.prototype.validateTarget = function (target, viewWidth, viewHeight) {
  if (target.managed) {
    let tex = target.texture;
    if (target.backBuffer) {
      target.actualWidth = viewWidth;
      target.actualHeight = viewHeight;
    }
    let makePow2 = Draw2D.makePow2;
    viewWidth = makePow2(viewWidth);
    viewHeight = makePow2(viewHeight);

    if (!target.backBuffer) {
      target.actualWidth = viewWidth;
      target.actualHeight = viewHeight;
    }
    if (tex.width !== viewWidth || tex.height !== viewHeight) {
      let texParams = this.renderTargetTextureParameters;
      let targetParams = this.renderTargetParams;

      texParams.name = tex.name;
      texParams.width = viewWidth;
      texParams.height = viewHeight;

      tex.destroy();
      target.renderTarget.destroy();

      let graphicsDevice = this.graphicsDevice;
      target.texture = graphicsDevice.createTexture(texParams);
      targetParams.colorTexture0 = target.texture;
      target.renderTarget = graphicsDevice.createRenderTarget(targetParams);
    }
  }
};

Draw2D.prototype.setBackBuffer = function () {
  if (this.state !== this.drawStates.ready) {
    return false;
  }

  this.currentRenderTarget = null;
  this.forceUpdate = true;

  return true;
};

Draw2D.prototype.getRenderTargetTexture = function (renderTargetIndex) {
  let renderTargets = this.renderTargetStructs;
  if (renderTargetIndex < 0 || renderTargetIndex >= renderTargets.length) {
    return null;
  }

  return renderTargets[renderTargetIndex].texture;
};

Draw2D.prototype.getRenderTarget = function (renderTargetIndex) {
  let renderTargets = this.renderTargetStructs;
  if (renderTargetIndex < 0 || renderTargetIndex >= renderTargets.length) {
    return null;
  }

  return renderTargets[renderTargetIndex].renderTarget;
};

Draw2D.prototype.setRenderTarget = function (renderTargetIndex) {
  let renderTargets = this.renderTargetStructs;
  if (renderTargetIndex < 0 || renderTargetIndex >= renderTargets.length) {
    return false;
  }

  if (this.state !== this.drawStates.ready) {
    return false;
  }

  this.currentRenderTarget = renderTargets[renderTargetIndex];
  this.forceUpdate = true;

  return true;
};

Draw2D.prototype.copyRenderTarget = function (renderTargetIndex) {
  if (this.state !== this.drawStates.ready) {
    return false;
  }

  let renderTargets = this.renderTargetStructs;
  if (renderTargetIndex < 0 || renderTargetIndex >= renderTargets.length) {
    return false;
  }

  // Check the buffers are correct before we render.
  this.update();

  if (!this.currentRenderTarget) {
    this.graphicsDevice.setScissor(this.scissorX, this.scissorY, this.scissorWidth, this.scissorHeight);
  }

  let graphicsDevice = this.graphicsDevice;
  let target = renderTargets[renderTargetIndex];
  let tex = target.texture;

  let technique = this.copyTechnique;
  let params = this.copyTechniqueParameters;
  let copyUVScale = params.copyUVScale;
  copyUVScale[0] = target.actualWidth / tex.width;
  copyUVScale[1] = target.actualHeight / tex.height;
  params.copyFlip = (!this.currentRenderTarget ? -1.0 : 1.0);
  params.inputTexture0 = tex;

  let renderTargetUsed = false;
  let currentTarget = this.currentRenderTarget;
  let vbo = this.copyVertexBuffer;
  if (currentTarget) {
    renderTargetUsed = graphicsDevice.beginRenderTarget(currentTarget.renderTarget);
  }

  graphicsDevice.setTechnique(technique);
  graphicsDevice.setTechniqueParameters(params);

  graphicsDevice.setStream(vbo, this.quadSemantics);
  graphicsDevice.draw(this.quadPrimitive, 4, 0);

  if (currentTarget && renderTargetUsed) {
    graphicsDevice.endRenderTarget();
  }

  return true;
};

Draw2D.prototype.resetPerformanceData = function () {
  let data = this.performanceData;
  data.minBatchSize = data.maxBatchSize = data.avgBatchSize = undefined;
  data.batchCount = 0;
  data.dataTransfers = 0;
};

let tz_lowp = [
  '#ifdef GL_ES',
  '#define TZ_LOWP lowp',
  'precision mediump float;',
  'precision mediump int;',
  '#else',
  '#define TZ_LOWP',
  '#endif'
].join('\n');

let alpha_blend_state = {
  'DepthTestEnable': false,
  'DepthMask': false,
  'CullFaceEnable': false,
  'BlendEnable': true,
  'BlendFunc': [770, 771]
};
let additive_blend_state = {
  'DepthTestEnable': false,
  'DepthMask': false,
  'CullFaceEnable': false,
  'BlendEnable': true,
  'BlendFunc': [770, 1]
};
let sampler_linear = {
  'MinFilter': 9985/* LINEAR_MIPMAP_NEAREST */ ,
  'MagFilter': 9729/* LINEAR */ ,
  // clamp or wrap is arbitrary depending on application requirements
  'WrapS': 33071 /* CLAMP_TO_EDGE */,
  'WrapT': 33071 /* CLAMP_TO_EDGE */,
};
let sampler_nearest = {
  'MinFilter': 9728 /*NEAREST*/,
  'MagFilter': 9728 /*NEAREST*/,
  // clamp or wrap is arbitrary depending on application requirements
  'WrapS': 10497 /*REPEAT*/, // 33071 /* CLAMP_TO_EDGE */,
  'WrapT': 10497 /*REPEAT*/, // 33071 /* CLAMP_TO_EDGE */,
};
function addShader(shader_def, name, simple_def) {
  assert(!shader_def.techniques[name]);
  let fp_text = simple_def.fp;
  // Add preamble
  if (fp_text.indexOf('#define TZ_LOWP') === -1) {
    fp_text = `${tz_lowp}\n${fp_text}`;
  }
  // Look for existing identical fragment shader
  let new_prog_name;
  for (let prog_name in shader_def.programs) {
    let prog = shader_def.programs[prog_name];
    if (prog.code === fp_text) {
      new_prog_name = prog_name;
    }
  }
  if (!new_prog_name) {
    new_prog_name = `fp_${name}`;
    assert(!shader_def.programs[new_prog_name]);
    shader_def.programs[new_prog_name] = {
      type: 'fragment',
      code: fp_text,
    };
  }
  let tech = {
    'parameters': ['clipSpace'],
    'semantics': ['POSITION', 'COLOR', 'TEXCOORD0'],
    'states': (simple_def.blend === 'additive') ? additive_blend_state : alpha_blend_state,
    'programs': ['vp_draw2D', new_prog_name]
  };
  // tex0 and tex1 and handled automatically and assigned per-sprite,
  // any other textures may be set in the technique parameters at draw-time
  fp_text.replace(/uniform sampler2D\s+([^;]+)/gu, (m, sampler_name) => {
    tech.parameters.push(sampler_name);
    if (!shader_def.parameters[sampler_name]) {
      shader_def.parameters[sampler_name] = { type: 'sampler2D' };
      shader_def.samplers[sampler_name] = sampler_linear;
    }
  });
  fp_text.replace(/uniform vec4\s+([^;]+)/gu, (m, parameter_name) => {
    tech.parameters.push(parameter_name);
    if (!shader_def.parameters[parameter_name]) {
      shader_def.parameters[parameter_name] = {
        type: 'float',
        columns: 4,
      };
    }
  });

  shader_def.techniques[name] = [tech];
}


// Constructor function
Draw2D.create = function (params) {
  let o = new Draw2D();
  let gd = o.graphicsDevice = params.graphicsDevice;

  // Current sort and blend mode.
  o.sortMode = undefined;
  o.blendMode = undefined;

  // Disjoint stack of modes for nested begins.
  o.sortModeStack = [];
  o.blendModeStack = [];

  // Set of render groups to be dispatched.
  o.drawGroups = [Draw2DGroup.create()];
  o.numGroups = 0;

  // Cached reference to last retrieved group to accelerate
  // texture sort mode draw calls.
  o.texGroup = undefined;

  // Sprite data instance used for rectangle draw calls.
  o.drawSpriteData = Draw2DSpriteData.create();

  // Solid fill texture for draw calls that do not specify a texture.
  o.defaultTextures = [
    gd.createTexture({
      name: 'DefaultDraw2DTexture',
      width: 1,
      height: 1,
      depth: 1,
      format: 'L8',
      cubemap: false,
      mipmaps: true,
      renderable: false,
      dynamic: false,
      data: [0xff]
    })
  ];

  // Load embedded default shader and techniques
  let shader_def = {
    'version': 1,
    'name': 'draw2D.cgfx',
    'samplers': {
      'inputTexture0': {
        'MinFilter': 9728 /* NEAREST */,
        'MagFilter': 9729 /* LINEAR */,
        'WrapS': 33071 /* CLAMP_TO_EDGE */,
        'WrapT': 33071 /* CLAMP_TO_EDGE */,
      }
    },
    'parameters': {
      'clipSpace': {
        'type': 'float',
        'columns': 4
      },
      'copyUVScale': {
        'type': 'float',
        'columns': 2
      },
      'copyFlip': {
        'type': 'float'
      },
      'inputTexture0': {
        'type': 'sampler2D'
      }
    },
    'techniques': {
      'copy': [
        {
          'parameters': ['copyUVScale', 'copyFlip', 'inputTexture0'],
          'semantics': ['POSITION', 'TEXCOORD0'],
          'states': {
            'DepthTestEnable': false,
            'DepthMask': false,
            'CullFaceEnable': false,
            'BlendEnable': false
          },
          'programs': ['vp_copy', 'fp_copy']
        }
      ]
    },
    'programs': {
      'fp_copy': {
        'type': 'fragment',
        'code': [
          tz_lowp,
          'varying vec4 tz_TexCoord[1];',
          'uniform sampler2D inputTexture0;',
          'void main()',
          '{',
          '  gl_FragColor=texture2D(inputTexture0,tz_TexCoord[0].xy);',
          '}'
        ].join('\n')
      },
      'vp_copy': {
        'type': 'vertex',
        'code': [
          tz_lowp,
          'varying vec4 tz_TexCoord[1];',
          'attribute vec4 ATTR0;',
          'attribute vec4 ATTR8;',
          'vec4 _OutPosition1;',
          'vec2 _OutUV1;',
          'uniform vec2 copyUVScale;',
          'uniform float copyFlip;',
          'void main()',
          '{',
          '  _OutPosition1.x=ATTR0.x;',
          '  _OutPosition1.y=ATTR0.y*copyFlip;',
          '  _OutPosition1.zw=ATTR0.zw;',
          '  _OutUV1=ATTR8.xy*copyUVScale;',
          '  tz_TexCoord[0].xy=_OutUV1;',
          '  gl_Position=_OutPosition1;',
          '}'
        ].join('\n')
      },
      'vp_draw2D': {
        'type': 'vertex',
        'code': [
          tz_lowp,
          'varying TZ_LOWP vec4 tz_Color;',
          'varying vec4 tz_TexCoord[1];',
          'attribute vec4 ATTR0;',
          'attribute vec4 ATTR3;',
          'attribute vec4 ATTR8;',
          'vec4 _OUTPosition1;',
          'vec4 _OUTColor1;',
          'vec2 _OUTTexCoord01;',
          'uniform vec4 clipSpace;',
          'void main()',
          '{',
          '  vec2 _position;',
          '  _position=ATTR0.xy*clipSpace.xy+clipSpace.zw;',
          '  _OUTPosition1.x=_position.x;',
          '  _OUTPosition1.y=_position.y;',
          '  _OUTPosition1.z=0.0;',
          '  _OUTPosition1.w=1.0;',
          '  _OUTColor1=ATTR3;',
          '  _OUTTexCoord01=ATTR8.xy;',
          '  tz_TexCoord[0].xy=ATTR8.xy;',
          '  tz_Color=ATTR3;',
          '  gl_Position=_OUTPosition1;',
          '}'
        ].join('\n')
      }
    }
  };

  let fp_draw2D = [
    'varying TZ_LOWP vec4 tz_Color;',
    'varying vec4 tz_TexCoord[1];',
    'uniform sampler2D tex0;',
    'void main()',
    '{',
    '  vec4 _TMP0=texture2D(tex0,tz_TexCoord[0].xy);',
    '  gl_FragColor=tz_Color*_TMP0;',
    '}'
  ].join('\n');
  let fp_draw2D_tint = [
    'varying TZ_LOWP vec4 tz_Color;',
    'varying vec4 tz_TexCoord[1];',
    'uniform sampler2D tex0;',
    'uniform sampler2D tex1;',
    'uniform vec4 color1;',
    'void main()',
    '{',
    '  vec4 tex0 = texture2D(tex0,tz_TexCoord[0].xy);',
    '  vec2 tex1 = texture2D(tex1,tz_TexCoord[0].xy).rg;',
    '  float value = dot(tex0.rgb, vec3(0.2, 0.5, 0.3));',
    '  vec3 valueR = value * tz_Color.rgb;',
    '  vec3 valueG = value * color1.rgb;',
    '  vec3 value3 = mix(tex0.rgb, valueG, tex1.g);',
    '  value3 = mix(value3, valueR, tex1.r);',
    '  gl_FragColor = vec4(value3, tex0.a * tz_Color.a);',
    '}'
  ].join('\n');
  addShader(shader_def, 'alpha', { fp: fp_draw2D });
  addShader(shader_def, 'additive', { fp: fp_draw2D, blend: 'additive' });
  addShader(shader_def, 'alpha_tint', { fp: fp_draw2D_tint });
  addShader(shader_def, 'additive_tint', { fp: fp_draw2D_tint, blend: 'additive' });

  if (params.shaders) {
    for (let name in params.shaders) {
      // Convert from simple shader (just FP text) into appropriate def
      assert(!shader_def.techniques[name]); // Already have one named that, must have unique names
      addShader(shader_def, name, params.shaders[name]);
    }
  }
  let shader_def_nearest = util.clone(shader_def);
  for (let name in shader_def_nearest.samplers) {
    shader_def_nearest.samplers[name] = sampler_nearest;
  }

  let shader = gd.createShader(util.clone(shader_def));
  let shader_nearest = gd.createShader(util.clone(shader_def_nearest));

  // Mapping from blend mode name to Technique object.
  // Do a second copy for "nearest" sampling version of shaders
  o.blendModeTechniques = {};
  shader.suffix = '';
  shader_nearest.suffix = '_nearest';
  [shader, shader_nearest].forEach((shader_it) => {
    for (let name in shader_def.techniques) {
      if (name === 'copy') {
        continue;
      }
      o.blendModeTechniques[name + shader_it.suffix] = shader_it.getTechnique(name);
    }
  });

  // Blending techniques.
  o.techniqueParameters = gd.createTechniqueParameters({
    clipSpace: o.clipSpace,
    tex0: null
  });

  // Current render target
  o.currentRenderTarget = null;
  o.renderTargetStructs = [];

  o.state = o.drawStates.ready;

  o.scaleMode = 'none';
  o.blendMode = 'alpha';

  // View port, back buffer and managed render target values.
  o.width = 0;
  o.height = 0;

  o.scissorX = 0;
  o.scissorY = 0;
  o.scissorWidth = o.graphicsDevice.width;
  o.scissorHeight = o.graphicsDevice.height;

  o.clipOffsetX = -1.0;
  o.clipOffsetY = 1;
  o.clipScaleX = 2.0 / o.graphicsDevice.width;
  o.clipScaleY = -2.0 / o.graphicsDevice.height;

  o.viewScaleX = 1;
  o.viewScaleY = 1;

  // GPU Memory.
  // -----------
  let initial = (params.initialGpuMemory ? params.initialGpuMemory : 0);
  if (initial < 140) {
    // 140 = minimum that can be used to draw a single sprite.
    initial = 140;
  }
  if (initial > 2293760) {
    // 2293760 = maximum that can ever be used in 16bit indices.
    initial = 2293760;
  }

  o.performanceData = {
    gpuMemoryUsage: initial,
    minBatchSize: 0,
    maxBatchSize: 0,
    avgBatchSize: 0,
    batchCount: 0,
    dataTransfers: 0
  };

  o.maxGpuMemory = (params.maxGpuMemory ? params.maxGpuMemory : 2293760);
  if (o.maxGpuMemory < initial) {
    o.maxGpuMemory = initial;
  }

  let initialVertices = Math.floor(initial / 140) * 4;
  o.maxVertices = Math.floor(o.maxGpuMemory / 140) * 4;
  if (o.maxVertices > 65536) {
    o.maxVertices = 65536;
  }

  // number of bytes used per-sprite on cpu vertex buffers.
  o.cpuStride = 64;

  // vertex buffer is in terms of number of vertices.
  // so we have a stride of 4 rather than 128.
  o.gpuStride = 4;

  // Index and vertex buffer setup.
  o.vertexBufferParameters = {
    'numVertices': initialVertices,
    'attributes': [gd.VERTEXFORMAT_FLOAT2, gd.VERTEXFORMAT_FLOAT4, gd.VERTEXFORMAT_FLOAT2],
    'transient': true
  };
  o.vertexBuffer = gd.createVertexBuffer(o.vertexBufferParameters);

  o.semantics = gd.createSemantics([gd.SEMANTIC_POSITION, gd.SEMANTIC_COLOR, gd.SEMANTIC_TEXCOORD0]);
  o.indexBufferParameters = {
    numIndices: (initialVertices * 1.5),
    format: gd.INDEXFORMAT_USHORT,
    dynamic: false,
    data: o.indexData((initialVertices * 1.5))
  };
  o.indexBuffer = gd.createIndexBuffer(o.indexBufferParameters);
  o.indexBufferParameters.data = null;

  // Render Target API
  // -----------------
  // Objects and values used in render target management.
  o.renderTargetIndex = 0;
  o.renderTargetCount = 0;

  o.renderTargetTextureParameters = {
    name: '',
    width: 0,
    height: 0,
    depth: 1,
    format: 'R8G8B8A8',
    cubemap: false,
    mipmaps: true,
    renderable: true,
    dynamic: true
  };

  o.renderTargetParams = {
    colorTexture0: null
  };

  // Render Target copying.
  // ----------------------
  // Copy technique for copyRenderTarget
  o.copyTechnique = shader.getTechnique('copy');
  o.copyTechniqueParameters = gd.createTechniqueParameters({
    inputTexture0: null,
    copyFlip: 1,
    copyUVScale: new Draw2D.FloatArray([1, 1])
  });

  // Objects used in copyRenderTarget method.
  o.quadSemantics = gd.createSemantics([gd.SEMANTIC_POSITION, gd.SEMANTIC_TEXCOORD0]);
  o.quadPrimitive = gd.PRIMITIVE_TRIANGLE_STRIP;

  o.copyVertexBufferParams = {
    'numVertices': 4,
    'attributes': [gd.VERTEXFORMAT_FLOAT2, gd.VERTEXFORMAT_FLOAT2],
    'transient': true
  };
  o.copyVertexBuffer = gd.createVertexBuffer(o.copyVertexBufferParams);

  // updateRenderTargetVBO
  // ---------------------
  o.vertexBufferData = new Draw2D.FloatArray([
    -1.0,
    -1.0,
    0.0,
    0.0,
    1.0,
    -1.0,
    1.0,
    0.0,
    -1.0,
    1.0,
    0.0,
    1.0,
    1.0,
    1.0,
    1.0,
    1.0
  ]);

  return o;
};
Draw2D.version = 7;

Draw2D.defaultClearColor = [0, 0, 0, 1];

// Detect correct typed arrays
((function () {
  Draw2D.UInt16Array = function (arg) {
    if (arguments.length === 0) {
      return [];
    }

    let ret;
    if (typeof arg === 'number') {
      ret = new Array(arg);
    } else {
      ret = [];
      for (let i = 0; i < arg.length; i += 1) {
        ret[i] = arg[i];
      }
    }
    return ret;
  };

  let testArray;
  let textDescriptor;

  if (typeof Uint16Array !== 'undefined') {
    testArray = new Uint16Array(4);
    textDescriptor = Object.prototype.toString.call(testArray);
    if (textDescriptor === '[object Uint16Array]') {
      Draw2D.UInt16Array = Uint16Array;
    }
  }

  Draw2D.FloatArray = function (arg) {
    if (arguments.length === 0) {
      return [];
    }

    let ret;
    if (typeof arg === 'number') {
      ret = new Array(arg);
    } else {
      ret = [];
      for (let i = 0; i < arg.length; i += 1) {
        ret[i] = arg[i];
      }
    }
    return ret;
  };

  if (typeof Float32Array !== 'undefined') {
    testArray = new Float32Array(4);
    textDescriptor = Object.prototype.toString.call(testArray);
    if (textDescriptor === '[object Float32Array]') {
      Draw2D.FloatArray = Float32Array;
      Draw2D.defaultClearColor = new Float32Array(Draw2D.defaultClearColor);
    }
  }
})());
