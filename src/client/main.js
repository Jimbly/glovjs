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
  var inputDevice = TurbulenzEngine.createInputDevice({});
  var input = require('./input.js').create(inputDevice, draw2D);

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
  var color_white = mathDevice.v4Build(1, 1, 1, 1);
  var color_red = mathDevice.v4Build(1, 0, 0, 1);
  var color_yellow = mathDevice.v4Build(1, 1, 0, 1);
  var color_sprite = color_white;
  var sprite = createSprite('test.png', {
    width : spriteSize,
    height : spriteSize,
    x : (Math.random() * (gameWidth - spriteSize) + (spriteSize * 0.5)),
    y : (Math.random() * (gameHeight - spriteSize) + (spriteSize * 0.5)),
    rotation : 0,
    color : color_sprite,
    textureRectangle : mathDevice.v4Build(0, 0, spriteSize, spriteSize)
  });

  // Cache keyCodes
  var keyCodes = inputDevice.keyCodes;
  var padCodes = input.padCodes;

  var viewport = mathDevice.v4Build(0, 0, gameWidth, gameHeight);
  var configureParams = {
    scaleMode : 'scale',
    viewportRectangle : viewport
  };

  function tick() {
    if (!graphicsDevice.beginFrame()) {
      return;
    }
    input.tick();
    draw2D.configure(configureParams);
    draw2D.setBackBuffer();
    draw2D.clear();

    var character = {
      dx: 0,
      dy: 0,
    };
    if (input.isKeyDown(keyCodes.LEFT) || input.isKeyDown(keyCodes.A) || input.isPadButtonDown(0, padCodes.LEFT)) {
      character.dx = -1;
    } else if (input.isKeyDown(keyCodes.RIGHT) || input.isKeyDown(keyCodes.D) || input.isPadButtonDown(0, padCodes.RIGHT)) {
      character.dx = 1;
    }
    if (input.isKeyDown(keyCodes.UP) || input.isKeyDown(keyCodes.W) || input.isPadButtonDown(0, padCodes.UP)) {
      character.dy = -1;
    } else if (input.isKeyDown(keyCodes.DOWN) || input.isKeyDown(keyCodes.S) || input.isPadButtonDown(0, padCodes.DOWN)) {
      character.dy = 1;
    }

    sprite.x += character.dx;
    sprite.y += character.dy;
    if (input.isMouseDown() && input.isMouseOverSprite(sprite)) {
      sprite.setColor(color_yellow);
    } else if (input.clickHitSprite(sprite)) {
      color_sprite = (color_sprite === color_red) ? color_white : color_red;
      sprite.setColor(color_sprite);
    } else if (input.isMouseOverSprite(sprite)) {
      color_sprite[3] = 0.5;
      sprite.setColor(color_sprite);
    } else {
      color_sprite[3] = 1;
      sprite.setColor(color_sprite);
    }

    draw2D.begin('alpha', 'deferred');
    draw2D.drawSprite(sprite);
    draw2D.end();
    graphicsDevice.endFrame();
  }

  intervalID = TurbulenzEngine.setInterval(tick, 1000/60);
};
