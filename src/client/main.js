/*jshint noempty:false*/

/*global $: false */
/*global TurbulenzEngine: true */
/*global Draw2D: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SPRITES = 10;

const PIXELY = true;

export function main()
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

  draw_list.setDefaultBucket(PIXELY ? 'alpha_nearest' : 'alpha');

  const sound_manager = require('./glov/sound_manager.js').create();
  sound_manager.loadSound('test');

  function loadTexture(texname) {
    return glov_sprite.loadTexture(texname);
  }
  function createSprite(texname, params) {
    return glov_sprite.createSprite(texname, params);
  }

  const font_info_arial32 = require('./img/font/arial32.json');
  const font_info_arial12x2 = require('./img/font/04b03_8x2.json');
  const font = glov_font.create(draw_list, PIXELY ? font_info_arial12x2 : font_info_arial32,
    loadTexture(PIXELY ? '04b03_8x2.png' : 'arial32.png'));
  const glov_ui = require('./glov/ui.js').create(glov_sprite, glov_input, font, draw_list);
  glov_ui.bindSounds(sound_manager, {
    button_click: 'button_click',
    rollover: 'rollover',
  });

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
      test.color_sprite = math_device.v4Copy(color_white);
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
    let bounds = {
      x: test.character.x - spriteSize/2,
      y: test.character.y - spriteSize/2,
      w: spriteSize,
      h: spriteSize,
    };
    if (glov_input.isMouseDown() && glov_input.isMouseOver(bounds)
    ) {
      math_device.v4Copy(color_yellow, test.color_sprite);
    } else if (glov_input.clickHit(bounds)
    ) {
      math_device.v4Copy((test.color_sprite === color_red) ? color_white : color_red, test.color_sprite);
      sound_manager.play('test');
    } else if (glov_input.isMouseOver(bounds)) {
      math_device.v4Copy(color_white, test.color_sprite);
      test.color_sprite[3] = 0.5;
    } else {
      math_device.v4Copy(color_white, test.color_sprite);
      test.color_sprite[3] = 1;
    }

    draw_list.queue(test.game_bg, 0, 0, Z.BACKGROUND, [0, 0.72, 1, 1]);
    draw_list.queue(test.sprite, test.character.x, test.character.y, Z.SPRITES, test.color_sprite, null, null, 0, 'alpha');

    let font_test_idx = 0;

    glov_ui.print(glov_font.styleColored(null, 0x000000ff), test.character.x, test.character.y + (++font_test_idx * 20), Z.SPRITES,
      'TEXT!');
    let font_style = glov_font.style(null, {
      outline_width: 1.0,
      outline_color: 0x800000ff,
      glow_xoffs: 3.25,
      glow_yoffs: 3.25,
      glow_inner: -2.5,
      glow_outer: 5,
      glow_color: 0x000000ff,
    });
    glov_ui.print(font_style, test.character.x, test.character.y + (++font_test_idx * glov_ui.font_height), Z.SPRITES,
      'Outline and Drop Shadow');

    if (glov_ui.buttonText({ x: 100, y: 100, text: 'Button!'})) {
      glov_ui.modalDialog({
        title: 'Modal Dialog',
        text: 'This is a modal dialog!',
        buttons: {
          'OK': function () {
            console.log('OK pushed!');
          },
          'Cancel': null, // no callback
        },
      });
    }
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

    glov_camera.tick();
    glov_camera.set2DAspectFixed(game_width, game_height);
    sound_manager.tick(dt);
    glov_input.tick();
    glov_ui.tick();

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
}
