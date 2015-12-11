/*jshint browser:true*/

/*global TurbulenzEngine: true */
/*global Draw2D: false */
/*global Draw2DSprite: false */
/*global RequestHandler: false */
/*global TextureManager: false */

TurbulenzEngine.onload = function onloadFn()
{
  var intervalID;
  var graphicsDevice = TurbulenzEngine.createGraphicsDevice({});
  var mathDevice = TurbulenzEngine.createMathDevice({});
  var draw2D = Draw2D.create({ graphicsDevice });
  var requestHandler = RequestHandler.create({});
  var textureManager = TextureManager.create(graphicsDevice, requestHandler);

  var textures = {};
  function loadTexture(texname) {
    var path = 'img/'+ texname;
    var inst = textureManager.getInstance(path);
    if (inst) {
      return inst;
    }
    textures[texname] = textureManager.load(path, false);
    return textureManager.getInstance(path);
  }
  function createSprite(texname, params) {
    var tex_inst = loadTexture(texname);
    params.texture = tex_inst.getTexture();
    var sprite = Draw2DSprite.create(params);
    tex_inst.subscribeTextureChanged(function () {
      sprite.setTexture(tex_inst.getTexture());
    });
    return sprite;
  }
  // Viewport for Draw2D.
  var gameWidth = 1280;
  var gameHeight = 960;
  var spriteSize = 64;
  var sprite = createSprite('test.png', {
    width : spriteSize,
    height : spriteSize,
    x : (Math.random() * (gameWidth - spriteSize) + (spriteSize * 0.5)),
    y : (Math.random() * (gameHeight - spriteSize) + (spriteSize * 0.5)),
    rotation : 0,
    color : mathDevice.v4Build(1, 1, 1, 1),
    textureRectangle : mathDevice.v4Build(0, 0, spriteSize, spriteSize)
  });

  var viewport = mathDevice.v4Build(0, 0, gameWidth, gameHeight);
  var configureParams = {
    scaleMode : 'scale',
    viewportRectangle : viewport
  };

  function tick() {
    if (!graphicsDevice.beginFrame()) {
      return;
    }
    draw2D.configure(configureParams);
    draw2D.setBackBuffer();
    draw2D.clear();

    sprite.x = (Math.random() * (gameWidth - spriteSize) + (spriteSize * 0.5));
    sprite.y = (Math.random() * (gameHeight - spriteSize) + (spriteSize * 0.5));

    draw2D.begin('alpha', 'deferred');
    draw2D.drawSprite(sprite);
    draw2D.end();
    graphicsDevice.endFrame();
  }

  intervalID = TurbulenzEngine.setInterval(tick, 1000/60);
};
