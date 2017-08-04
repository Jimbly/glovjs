/*jshint browser:true, noempty:false*/

/*global $: false */
/*global TurbulenzEngine: true */
/*global Draw2D: false */
/*global math_device: false */
/*global assert: false */

TurbulenzEngine.onload = function onloadFn()
{
  const graphics_device = TurbulenzEngine.createGraphicsDevice({});
  window.math_device = window.math_device || TurbulenzEngine.createMathDevice({});
  let draw2d_params = { graphicsDevice: graphics_device };
  const glov_font = require('./glov/font.js');
  glov_font.populateDraw2DParams(draw2d_params);
  const draw_2d = Draw2D.create(draw2d_params);
  const glov_sprite = require('./glov/sprite.js').create(graphics_device);
  const glov_camera = require('./glov/camera.js').create(graphics_device, draw_2d);
  const input_device = TurbulenzEngine.createInputDevice({});
  const glov_input = require('./glov/input.js').create(input_device, draw_2d, glov_camera);
  const draw_list = require('./glov/draw_list.js').create(draw_2d, glov_camera);

  draw_list.setDefaultBucket('alpha'); // or 'alpha_nearest'

  const sound_manager = require('./glov/sound_manager.js').create();
  sound_manager.loadSound('test');

  function loadTexture(texname) {
    return glov_sprite.loadTexture(texname);
  }
  function createSprite(texname, params) {
    return glov_sprite.createSprite(texname, params);
  }

  const arial32_info = require('./img/font/arial32.json');
  const font = glov_font.create(draw_list, arial32_info, loadTexture('arial32.png'));
  const glov_ui = require('./glov/ui.js').create(glov_sprite, glov_input, font, draw_list);

  // Preload
  loadTexture('test.png');

  // Virtual viewport for our game logic
  let game_width = 1280;
  let game_height = 960;
  glov_camera.set2DAspectFixed(game_width, game_height);
  const color_white = math_device.v4Build(1, 1, 1, 1);
  const color_red = math_device.v4Build(1, 0, 0, 1);
  const color_yellow = math_device.v4Build(1, 1, 0, 1);

  // Cache key_codes
  const key_codes = glov_input.key_codes;
  const pad_codes = glov_input.pad_codes;

  let global_timer = 0;
  let game_state;

  let sprites = {};
  function initGraphics() {
    if (sprites.white) {
      return;
    }
    sprites.white = createSprite('white', {
      width : 1,
      height : 1,
      x : 0,
      y : 0,
      rotation : 0,
      color : [1,1,1, 1],
      origin: [0, 0],
      textureRectangle : math_device.v4Build(0, 0, 1, 1)
    });
  }

  function test(dt) {
    const spriteSize = 64;
    if (!test.color_sprite) {
      // Really this should be in initGraphics to get preloading
      test.color_sprite = color_white;
      test.sprite = createSprite('test.png', {
        width : spriteSize,
        height : spriteSize,
        rotation : 0,
        color : test.color_sprite,
        textureRectangle : math_device.v4Build(0, 0, spriteSize, spriteSize)
      });
      test.character = {
        x : (Math.random() * (game_width - spriteSize) + (spriteSize * 0.5)),
        y : (Math.random() * (game_height - spriteSize) + (spriteSize * 0.5)),
      };
      test.game_bg = createSprite('white', {
        width : game_width,
        height : game_height,
        x : 0,
        y : 0,
        rotation : 0,
        color : [0, 0.72, 1, 1],
        origin: [0, 0],
        textureRectangle : math_device.v4Build(0, 0, spriteSize, spriteSize)
      });
    }

    test.character.dx = 0;
    test.character.dy = 0;
    if (glov_input.isKeyDown(key_codes.LEFT) || glov_input.isKeyDown(key_codes.A) || glov_input.isPadButtonDown(0, pad_codes.LEFT)) {
      test.character.dx = -1;
    } else if (glov_input.isKeyDown(key_codes.RIGHT) || glov_input.isKeyDown(key_codes.D) || glov_input.isPadButtonDown(0, pad_codes.RIGHT)) {
      test.character.dx = 1;
    }
    if (glov_input.isKeyDown(key_codes.UP) || glov_input.isKeyDown(key_codes.W) || glov_input.isPadButtonDown(0, pad_codes.UP)) {
      test.character.dy = -1;
    } else if (glov_input.isKeyDown(key_codes.DOWN) || glov_input.isKeyDown(key_codes.S) || glov_input.isPadButtonDown(0, pad_codes.DOWN)) {
      test.character.dy = 1;
    }

    test.character.x += test.character.dx * dt * 0.2;
    test.character.y += test.character.dy * dt * 0.2;
    if (glov_input.isMouseDown() && glov_input.isMouseOver(test.character.x - spriteSize/2, test.character.y - spriteSize/2, spriteSize, spriteSize)) {
      test.sprite.setColor(color_yellow);
    } else if (glov_input.clickHit(test.character.x - spriteSize/2, test.character.y - spriteSize/2, spriteSize, spriteSize)) {
      test.color_sprite = (test.color_sprite === color_red) ? color_white : color_red;
      sound_manager.play('test');
    } else if (glov_input.isMouseOver(test.character.x - spriteSize/2, test.character.y - spriteSize/2, spriteSize, spriteSize)) {
      test.color_sprite[3] = 0.5;
    } else {
      test.color_sprite[3] = 1;
    }

    draw_list.queue(test.game_bg, 0, 0, 1, [0, 0.72, 1, 1]);
    draw_list.queue(test.sprite, test.character.x, test.character.y, 2, test.color_sprite);

    let font_test_idx = 0;
    let font_style = null;

    font.drawSized(glov_font.styleColored(null, 0x000000ff), test.character.x, test.character.y + (++font_test_idx * 20), 3, 24, 24,
      'TEST!');
    font_style = glov_font.style(null, {
      color: 0xFF00FFff,
    });
    font.drawSized(font_style, test.character.x, test.character.y + (++font_test_idx * 20), 3, 24, 24,
      'TEST2!');
    font_style = glov_font.style(null, {
      outline_width: 2.0,
      outline_color: 0x800080ff,
    });
    font.drawSized(font_style, test.character.x, test.character.y + (++font_test_idx * 20), 3, 24, 24,
      'OUTLINE');
    font_style = glov_font.style(null, {
      outline_width: 2.0,
      outline_color: 0xFFFF00ff,
    });
    font.drawSized(font_style, test.character.x, test.character.y + (++font_test_idx * 20), 3, 24, 24,
      'OUTLINE2');
    font_style = glov_font.style(null, {
      glow_xoffs: 3.25,
      glow_yoffs: 3.25,
      glow_inner: -2.5,
      glow_outer: 5,
      glow_color: 0x000000ff,
    });
    font.drawSized(font_style, test.character.x, test.character.y + (++font_test_idx * 20), 3, 24, 24,
      'Drop Shadow');
    font_style = glov_font.style(null, {
      glow_xoffs: 0,
      glow_yoffs: 0,
      glow_inner: -1,
      glow_outer: 5,
      glow_color: 0xFFFFFFff,
    });
    font.drawSized(font_style, test.character.x, test.character.y + (++font_test_idx * 20), 3, 24, 24,
      'Glow');
    font_style = glov_font.style(null, {
      outline_width: 1.0,
      outline_color: 0x800000ff,
      glow_xoffs: 3.25,
      glow_yoffs: 3.25,
      glow_inner: -2.5,
      glow_outer: 5,
      glow_color: 0x000000ff,
    });
    font.drawSized(font_style, test.character.x, test.character.y + (++font_test_idx * 20), 3, 24, 24,
      'Both');

    glov_ui.buttonText(100, 100, 10, 300, 32, 'Button!');
  }

  function testInit(dt) {
    $('.screen').hide();
    $('#title').show();
    game_state = test;
    test(dt);
  }

  function loading() {
    let load_count = glov_sprite.loading() + sound_manager.loading();
    $('#loading').text(`Loading (${load_count})...`);
    if (!load_count) {
      game_state = testInit;
    }
  }

  function loadingInit() {
    initGraphics();
    $('.screen').hide();
    $('#title').show();
    game_state = loading;
    loading();
  }

  game_state = loadingInit;

  var last_tick = Date.now();
  function tick() {
    if (!graphics_device.beginFrame()) {
      return;
    }
    var now = Date.now();
    var dt = Math.min(Math.max(now - last_tick, 1), 250);
    last_tick = now;
    global_timer += dt;
    sound_manager.tick();
    glov_input.tick();

    glov_camera.tick();
    glov_camera.set2DAspectFixed(game_width, game_height);

    if (window.need_repos) {
      --window.need_repos;
      var ul = [];
      glov_camera.virtualToPhysical(ul, [0,0]);
      var lr = [];
      glov_camera.virtualToPhysical(lr, [game_width-1,game_height-1]);
      var viewport = [ul[0], ul[1], lr[0], lr[1]];
      var height = viewport[3] - viewport[1];
      // default font size of 16 when at height of game_height
      var font_size = Math.min(256, Math.max(2, Math.floor(height/800 * 16)));
      $('#gamescreen').css({
        left: viewport[0],
        top: viewport[1],
        width: viewport[2] - viewport[0],
        height: height,
        'font-size': font_size,
      });
      $('#fullscreen').css({
        'font-size': font_size,
      });
    }

    draw_2d.setBackBuffer();
    draw_2d.clear([0, 0, 0, 1]);

    game_state(dt);

    draw_list.draw();

    graphics_device.endFrame();
    glov_input.endFrame();
  }

  loadingInit();
  TurbulenzEngine.setInterval(tick, 1000/60);
};
