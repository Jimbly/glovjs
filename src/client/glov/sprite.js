/*global Draw2DSprite: false */
/*global RequestHandler: false */
/*global TextureManager: false */

class GlovSpriteManager {
  constructor(graphicsDevice, draw_list) {
    const requestHandler = RequestHandler.create({});
    this.texture_manager = TextureManager.create(graphicsDevice, requestHandler);
    this.textures = {};
    this.draw_list = draw_list;
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
  createSprite(texname, params) {
    const tex_inst = this.loadTexture(texname);
    params.texture = tex_inst.getTexture();
    const sprite = Draw2DSprite.create(params);
    tex_inst.subscribeTextureChanged(function () {
      sprite.setTexture(tex_inst.getTexture());
    });
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
