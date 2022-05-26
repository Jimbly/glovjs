// Portions Copyright 2022 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

/**
 * Support for handling Spine animations.
 *
 * Note: Requires a Spine license to use in any product.
 */

const assert = require('assert');
const {
  BLEND_ALPHA,
  BLEND_ADDITIVE,
  spriteDataAlloc,
  queueSpriteData,
} = require('glov/client/sprites.js');
const { textureLoad } = require('./textures.js');
const { webFSGetFile } = require('./webfs.js');

const { AnimationState } = require('spine-core/AnimationState');
const { AnimationStateData } = require('spine-core/AnimationStateData');
const { AtlasAttachmentLoader } = require('spine-core/AtlasAttachmentLoader');
const { BlendMode } = require('spine-core/SlotData');
const { ClippingAttachment } = require('spine-core/ClippingAttachment');
const { MeshAttachment } = require('spine-core/MeshAttachment');
const { RegionAttachment } = require('spine-core/RegionAttachment');
const { Skeleton } = require('spine-core/Skeleton');
const { SkeletonBinary } = require('spine-core/SkeletonBinary');
// const { SkeletonJson } = require('spine-core/SkeletonJson');
const { TextureAtlas } = require('spine-core/TextureAtlas');
const { Color, Vector2 } = require('spine-core/Utils');

function SpineTexture(texture) {
  this.texture = texture;
  this.texs = [this.texture];
}
SpineTexture.prototype.setFilters = function (filter_min, filter_mag) {
  this.texture.setSamplerState({
    filter_min,
    filter_mag,
    wrap_s: gl.CLAMP_TO_EDGE,
    wrap_t: gl.CLAMP_TO_EDGE,
  });
};
SpineTexture.prototype.setWraps = function (wrap_s, wrap_t) {
  assert.equal(this.texture.wrap_s, wrap_s);
  assert.equal(this.texture.wrap_t, wrap_t);
};
SpineTexture.prototype.getImage = function () {
  assert(false);
  return { width: this.width, height: this.height };
};

let atlases = {};
function spineLoadAtlas(filename) {
  if (atlases[filename]) {
    return atlases[filename];
  }
  let atlas_text = webFSGetFile(filename, 'text');
  let parent = filename.match(/(.*\/)[^/]+/)[1];

  let atlas;
  try {
    atlases[filename] = atlas = new TextureAtlas(atlas_text);
  } catch (e) {
    throw new Error(`Couldn't parse texture atlas ${filename}: ${e.message}`);
  }
  for (let ii = 0; ii < atlas.pages.length; ++ii) {
    let page = atlas.pages[ii];

    page.setTexture(new SpineTexture(textureLoad({
      url: `${parent}${page.name}`,
      wrap_s: gl.CLAMP_TO_EDGE,
      wrap_t: gl.CLAMP_TO_EDGE,
    })));
  }
  return (atlases[filename] = atlas);
}

let skeletons = {};
function spineLoadSkeleton(atlas, params) {
  let { skel: filename, mix } = params;
  if (skeletons[filename]) {
    return skeletons[filename];
  }
  let atlas_loader = new AtlasAttachmentLoader(atlas);
  let is_json = filename.endsWith('.json');
  let skeleton_data;
  if (is_json) {
    assert(false);
    // let skeleton_json = new SkeletonJson(atlas_loader);
    // skeleton_json.scale = 1;
    // skeleton_data = skeleton_json.readSkeletonData(webFSGetFile(filename.slice(0, -'.json'.length), 'jsobj'));
  } else {
    let skeleton_binary = new SkeletonBinary(atlas_loader);
    skeleton_binary.scale = 1;
    skeleton_data = skeleton_binary.readSkeletonData(webFSGetFile(filename, 'binary'));
  }
  let skeleton = new Skeleton(skeleton_data);
  let animation_state_data = new AnimationStateData(skeleton_data);
  for (let from in mix) {
    let map = mix[from];
    for (let to in map) {
      let v = map[to];
      animation_state_data.setMix(from, to, v);
      if (!mix[to] || mix[to][from] === undefined) {
        animation_state_data.setMix(to, from, v);
      }
    }
  }
  return (skeletons[filename] = { skeleton, animation_state_data });
}

let tempPos = new Vector2();
let tempUv = new Vector2();
let tempLight = new Color();
let tempDark = new Color();
let finalColor = new Color();
let tempColor2 = new Color();

function Spine(params) {
  let {
    anim,
  } = params;
  let atlas = spineLoadAtlas(params.atlas);
  let { skeleton, animation_state_data } = spineLoadSkeleton(atlas, params);
  this.skeleton = skeleton;

  this.animation_state = new AnimationState(animation_state_data);
  this.vertices = new Float32Array(1024);
  if (anim) {
    this.setAnimation(0, anim, true);
  }
}
Spine.prototype.getAnimation = function (track_index) {
  track_index = track_index || 0;
  let cur = this.animation_state.getCurrent(track_index);
  return cur && cur.animation && cur.animation.name || null;
};
Spine.prototype.setAnimation = function (track_index, name, loop) {
  let cur = this.animation_state.getCurrent(track_index);
  if (cur && cur.animation && cur.animation.name === name) {
    return;
  }
  this.animation_state.setAnimation(track_index, name, loop);
};
Spine.prototype.update = function (dt) {
  this.animation_state.update(dt/1000);
  this.animation_state.apply(this.skeleton);
  this.skeleton.updateWorldTransform();
};
let match_a = [-1,-1,-1];
let match_b = [0,0,0];
const QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
const ZINC = 0.001;
Spine.prototype.draw = function (param) {
  let { x, y, z, scale } = param;
  if (scale === undefined) {
    scale = 1;
  }
  let { skeleton, vertices } = this;
  let drawOrder = skeleton.drawOrder;
  let skeletonColor = skeleton.color;

  const vertexSize = 2; // just 2 floats, x,y?
  const clippedVertexSize = vertexSize;
  const premultipliedAlpha = false;

  let texture;
  let uvs;
  let blend;
  let lookup = [];
  function doQuad(v0, v1, v2, v3) {
    lookup[0] = v0;
    lookup[1] = v1;
    lookup[2] = v2;
    lookup[3] = v3;
    let sprite = spriteDataAlloc(texture.texs, null, null, blend);
    let buf = sprite.data;
    for (let corner = 0, vout = 0; corner < 4; corner++) {
      let vin = lookup[corner] * 2;
      buf[vout++] = x + vertices[vin] * scale;
      buf[vout++] = y - vertices[vin+1] * scale;
      buf[vout++] = finalColor.r;
      buf[vout++] = finalColor.g;
      buf[vout++] = finalColor.b;
      buf[vout++] = finalColor.a;
      buf[vout++] = uvs[vin];
      buf[vout++] = uvs[vin + 1];
    }
    queueSpriteData(sprite, z);
    z += ZINC;
  }

  for (let i = 0; i < drawOrder.length; i++) {
    let slot = drawOrder[i];
    if (!slot.bone.active) {
      continue;
    }

    let attachment = slot.getAttachment();
    let numVertices;
    let triangles;
    let attachmentColor;
    if (attachment instanceof RegionAttachment) {
      let region = attachment;
      numVertices = 4;
      region.computeWorldVertices(slot.bone, vertices, 0, clippedVertexSize);
      triangles = QUAD_TRIANGLES;
      uvs = region.uvs;
      texture = region.region.renderObject.page.texture;
      attachmentColor = region.color;
    } else if (attachment instanceof MeshAttachment) {
      let mesh = attachment;
      numVertices = (mesh.worldVerticesLength >> 1);
      let numFloats = numVertices * clippedVertexSize;
      if (numFloats > vertices.length) {
        vertices = this.vertices = new Float32Array(numFloats);
      }
      mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, vertices, 0, clippedVertexSize);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      triangles = mesh.triangles;
      texture = mesh.region.renderObject.page.texture;
      uvs = mesh.uvs;
      attachmentColor = mesh.color;
    } else if (attachment instanceof ClippingAttachment) {
      // let clip = attachment;
      // clipper.clipStart(slot, clip);
      continue;
    } else {
      // clipper.clipEndWithSlot(slot);
      continue;
    }

    if (!texture) {
      // clipper.clipEndWithSlot(slot)
      continue;
    }

    let slotColor = slot.color;
    finalColor.r = skeletonColor.r * slotColor.r * attachmentColor.r;
    finalColor.g = skeletonColor.g * slotColor.g * attachmentColor.g;
    finalColor.b = skeletonColor.b * slotColor.b * attachmentColor.b;
    finalColor.a = skeletonColor.a * slotColor.a * attachmentColor.a;
    if (premultipliedAlpha) {
      finalColor.r *= finalColor.a;
      finalColor.g *= finalColor.a;
      finalColor.b *= finalColor.a;
    }
    let darkColor = tempColor2;
    if (!slot.darkColor) {
      darkColor.set(0, 0, 0, 1.0);
    } else {
      if (premultipliedAlpha) {
        darkColor.r = slot.darkColor.r * finalColor.a;
        darkColor.g = slot.darkColor.g * finalColor.a;
        darkColor.b = slot.darkColor.b * finalColor.a;
      } else {
        darkColor.setFromColor(slot.darkColor);
      }
      darkColor.a = premultipliedAlpha ? 1.0 : 0.0;
    }

    let slotBlendMode = slot.data.blendMode;
    blend = BLEND_ALPHA;
    if (slotBlendMode === BlendMode.Additive) { // Others are: Normal, Multiply, Screen
      blend = BLEND_ADDITIVE;
    }

    // if (clipper.isClipping()) {
    //   // clipper.clipTriangles(renderable.vertices, renderable.numFloats, triangles,
    //   //    triangles.length, uvs, finalColor, darkColor, twoColorTint);
    //   // TODO
    // } else
    {
      let verts = vertices;
      if (this.vertexEffect) {
        let vertexEffect = this.vertexEffect;
        for (let /*vout=0, */v = 0; v < numVertices*2; v+=2) {
          tempPos.x = verts[v];
          tempPos.y = verts[v + 1];
          tempUv.x = uvs[v];
          tempUv.y = uvs[v + 1];
          tempLight.setFromColor(finalColor);
          tempDark.set(0, 0, 0, 0);
          vertexEffect.transform(tempPos, tempUv, tempLight, tempDark);
          // TODO: output
          // verts[vout++] = tempPos.x;
          // verts[vout++] = tempPos.y;
          // verts[vout++] = tempLight.r;
          // verts[vout++] = tempLight.g;
          // verts[vout++] = tempLight.b;
          // verts[vout++] = tempLight.a;
          // verts[vout++] = tempUv.x;
          // verts[vout++] = tempUv.y;
          assert(false, 'Not yet implemented'); // would be similar to below
        }
      } else {
        if (numVertices === 4) {
          // assume quad
          let sprite = spriteDataAlloc(texture.texs, null, null, blend);
          let buf = sprite.data;
          for (let vin = 0, vout = 0; vin < numVertices*2; vin += 2) {
            buf[vout++] = x + verts[vin] * scale;
            buf[vout++] = y - verts[vin+1] * scale;
            buf[vout++] = finalColor.r;
            buf[vout++] = finalColor.g;
            buf[vout++] = finalColor.b;
            buf[vout++] = finalColor.a;
            buf[vout++] = uvs[vin];
            buf[vout++] = uvs[vin + 1];
          }
          queueSpriteData(sprite, z);
          z += ZINC;
        } else {
          // translate to quads
          for (let tri_idx = 0; tri_idx < triangles.length;) {
            match_b[0] = match_b[1] = match_b[2] = 0;
            let ti_b = tri_idx + 3;
            let num_match = 0;
            for (let ii = 0; ii < 3; ++ii) {
              match_a[ii] = -1;
              for (let jj = 0; jj < 3; ++jj) {
                if (triangles[tri_idx + ii] === triangles[ti_b + jj]) {
                  ++num_match;
                  match_a[ii] = jj;
                  match_b[jj] = 1;
                  break;
                }
              }
            }
            if (num_match === 2) {
              // can do as a quad
              let unmatchedA = match_a[0] === -1 ? 0 : match_a[1] === -1 ? 1 : 2;
              let unmatchedB = match_b[0] ? match_b[1] ? 2 : 1 : 0;
              doQuad(triangles[tri_idx + unmatchedA], triangles[tri_idx + (unmatchedA+1)%3],
                triangles[ti_b + unmatchedB], triangles[tri_idx + (unmatchedA+2)%3]);
              tri_idx += 6;
            } else {
              // Fake as triangle
              doQuad(triangles[tri_idx], triangles[tri_idx + 1], triangles[tri_idx + 1], triangles[tri_idx + 2]);
              tri_idx += 3;
            }
          }
        }
      }
      // draw indexed w/ texture, verts, triangles
    }
    // clipper.clipEndWithSlot(slot);
  }
  // clipper.clipEnd();
};

export function spineCreate(params) {
  return new Spine(params);
}