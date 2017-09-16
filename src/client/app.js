/*jshint noempty:false*/

/*global $: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SPRITES = 10;

// Virtual viewport for our game logic
const game_width = 1280;
const game_height = 960;

export function main(canvas)
{
  const glov_engine = require('./glov/engine.js');
  const glov_font = require('./glov/font.js');

  glov_engine.startup({
    canvas,
    game_width,
    game_height,
    pixely: true,
  });

  const sound_manager = glov_engine.sound_manager;
  // const glov_camera = glov_engine.glov_camera;
  const glov_input = glov_engine.glov_input;
  const glov_sprite = glov_engine.glov_sprite;
  const glov_ui = glov_engine.glov_ui;
  const draw_list = glov_engine.draw_list;
  // const font = glov_engine.font;


  const loadTexture = glov_sprite.loadTexture.bind(glov_sprite);
  const createSprite = glov_sprite.createSprite.bind(glov_sprite);

  glov_ui.bindSounds(sound_manager, {
    button_click: 'button_click',
    rollover: 'rollover',
  });

  let edit_box = glov_ui.createEditBox({
    x: 300,
    y: 100,
    w: 200,
  });

  const color_white = math_device.v4Build(1, 1, 1, 1);
  const color_red = math_device.v4Build(1, 0, 0, 1);
  const color_yellow = math_device.v4Build(1, 1, 0, 1);

  // Cache key_codes
  const key_codes = glov_input.key_codes;
  const pad_codes = glov_input.pad_codes;

  let game_state;

  let sprites = {};
  const spriteSize = 64;
  function initGraphics() {
    if (sprites.white) {
      return;
    }

    sound_manager.loadSound('test');
    loadTexture('test.png');

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

    sprites.test = createSprite('test.png', {
      width : spriteSize,
      height : spriteSize,
      rotation : 0,
      color : [1,1,1,1],
      textureRectangle : math_device.v4Build(0, 0, spriteSize, spriteSize)
    });

    sprites.game_bg = createSprite('white', {
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

  function test(dt) {
    if (!test.color_sprite) {
      test.color_sprite = math_device.v4Copy(color_white);
      test.character = {
        x : (Math.random() * (game_width - spriteSize) + (spriteSize * 0.5)),
        y : (Math.random() * (game_height - spriteSize) + (spriteSize * 0.5)),
      };
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

    draw_list.queue(sprites.game_bg, 0, 0, Z.BACKGROUND, [0, 0.72, 1, 1]);
    draw_list.queue(sprites.test, test.character.x, test.character.y, Z.SPRITES, test.color_sprite, null, null, 0, 'alpha');

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

    if (edit_box.run() === edit_box.SUBMIT) {
      glov_ui.modalDialog({
        title: 'Modal Dialog',
        text: `Edit box submitted with text ${edit_box.text}`,
        buttons: {
          'OK': null,
        },
      });
    }
    glov_ui.print(font_style, 300, 140, Z.UI, `Edit Box Text: ${edit_box.text}`);
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

  function tick(dt) {
    game_state(dt);
  }

  loadingInit();
  glov_engine.go(tick);
}
