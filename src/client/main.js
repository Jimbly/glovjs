/*jshint browser:true*/

TurbulenzEngine.onload = function onloadFn()
{
  var intervalID;
  var graphicsDevice = TurbulenzEngine.createGraphicsDevice({});
  var mathDevice = TurbulenzEngine.createMathDevice({});
  var draw2D = Draw2D.create({ graphicsDevice });

  var textures = {};
  var loadedResources = 0;
  var lastLoadedResources = 0;
  function textureParams(src) {
    return {
      src: 'img/' + src,
      mipmaps: true,
      onload: function (texture) {
        if (texture)
        {
          textures[src] = texture;
          ++loadedResources;
        }
      }
    };
  }
  graphicsDevice.createTexture(textureParams('test.png'));
  // Viewport for Draw2D.
  var gameWidth = 1280;
  var gameHeight = 960;
  var spriteSize = 64;
  var sprite = Draw2DSprite.create({
    texture : textures['test.png'],
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
    if (loadedResources !== lastLoadedResources) {
      lastLoadedResources = loadedResources;
      sprite.setTexture(textures['test.png']);
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
