/*jshint noempty:false*/

/*global $: false */
/*global math_device: false */
/*global assert: false */
/*global Z: false */

const local_storage = require('./local_storage.js');
const particle_data = require('./particle_data.js');

local_storage.storage_prefix = 'turbulenz-playground';
window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SPRITES = 10;
Z.PARTICLES = 20;

let app = exports;
// Virtual viewport for our game logic
export const game_width = 1280;
export const game_height = 960;

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
  const glov_camera = glov_engine.glov_camera;
  const glov_input = glov_engine.glov_input;
  const glov_sprite = glov_engine.glov_sprite;
  const glov_ui = glov_engine.glov_ui;
  const draw_list = glov_engine.draw_list;
  // const font = glov_engine.font;


  const loadTexture = glov_sprite.loadTexture.bind(glov_sprite);
  const createSprite = glov_sprite.createSprite.bind(glov_sprite);
  const createAnimation = glov_sprite.createAnimation.bind(glov_sprite);

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

  let sprites = {};
  const sprite_size = 64;
  function initGraphics() {
    if (sprites.white) {
      return;
    }

    // Preload all referenced particle textures
    for (let key in particle_data.defs) {
      let def = particle_data.defs[key];
      for (let part_name in def.particles) {
        let part_def = def.particles[part_name];
        loadTexture(part_def.texture);
      }
    }

    sound_manager.loadSound('test');

    const origin_0_0 = { origin: math_device.v2Build(0, 0) };

    function loadSprite(file, u, v, params) {
      params = params || {};
      return createSprite(file, {
        width: params.width || 1,
        height: params.height || 1,
        rotation: params.rotation || 0,
        color: params.color || color_white,
        origin: params.origin || undefined,
        u: u,
        v: v,
        layers: params.layers || 0,
      });
    }

    sprites.white = loadSprite('white', 1, 1, origin_0_0);

    sprites.test_tint = loadSprite('tinted', [16, 16, 16, 16], [16, 16, 16], { layers: 2 });
    sprites.animation = createAnimation({
      idle_left: {
        frames: [0,1],
        times: [200, 500],
      },
      idle_right: {
        frames: [3,2],
        times: [200, 500],
      },
    });
    sprites.animation.setState('idle_left');

    sprites.game_bg = loadSprite('white', 1, 1, {
      width : game_width,
      height : game_height,
      origin: [0, 0],
    });
  }

  function doBlurEffect(src, dest) {
    glov_engine.effects.applyGaussianBlur({
      source: src,
      destination: dest,
      blurRadius: 5,
      blurTarget: glov_engine.getTemporaryTarget(),
    });
  }
  function doDesaturateEffect(src, dest) {
    let saturation = 0.1;

    // Perf note: do not allocate these each frame for better perf
    let xform = math_device.m43BuildIdentity();
    let tmp = math_device.m43BuildIdentity();

    math_device.m43BuildIdentity(xform);
    if (saturation !== 1) {
      glov_engine.effects.saturationMatrix(saturation, tmp);
      math_device.m43Mul(xform, tmp, xform);
    }
    // if ((hue % (Math.PI * 2)) !== 0) {
    //   glov_engine.effects.hueMatrix(hue, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (contrast !== 1) {
    //   glov_engine.effects.contrastMatrix(contrast, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (brightness !== 0) {
    //   glov_engine.effects.brightnessMatrix(brightness, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (additiveRGB[0] !== 0 || additiveRGB[1] !== 0 || additiveRGB[2] !== 0) {
    //   glov_engine.effects.additiveMatrix(additiveRGB, tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (grayscale) {
    //   glov_engine.effects.grayScaleMatrix(tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (negative) {
    //   glov_engine.effects.negativeMatrix(tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    // if (sepia) {
    //   glov_engine.effects.sepiaMatrix(tmp);
    //   math_device.m43Mul(xform, tmp, xform);
    // }
    glov_engine.effects.applyColorMatrix({
      colorMatrix: xform,
      source: src,
      destination: dest,
    });
  }

  let do_particles = true;
  let last_particles = 0;

  function test(dt) {

    if (!test.color_sprite) {
      test.color_sprite = math_device.v4Copy(color_white);
      test.character = {
        x : (Math.random() * (game_width - sprite_size) + (sprite_size * 0.5)),
        y : (Math.random() * (game_height - sprite_size) + (sprite_size * 0.5)),
      };
    }

    test.character.dx = 0;
    test.character.dy = 0;
    if (glov_input.isKeyDown(key_codes.LEFT) || glov_input.isKeyDown(key_codes.A) || glov_input.isPadButtonDown(0, pad_codes.LEFT)) {
      test.character.dx = -1;
      sprites.animation.setState('idle_left');
    } else if (glov_input.isKeyDown(key_codes.RIGHT) || glov_input.isKeyDown(key_codes.D) || glov_input.isPadButtonDown(0, pad_codes.RIGHT)) {
      test.character.dx = 1;
      sprites.animation.setState('idle_right');
    }
    if (glov_input.isKeyDown(key_codes.UP) || glov_input.isKeyDown(key_codes.W) || glov_input.isPadButtonDown(0, pad_codes.UP)) {
      test.character.dy = -1;
    } else if (glov_input.isKeyDown(key_codes.DOWN) || glov_input.isKeyDown(key_codes.S) || glov_input.isPadButtonDown(0, pad_codes.DOWN)) {
      test.character.dy = 1;
    }

    test.character.x += test.character.dx * dt * 0.2;
    test.character.y += test.character.dy * dt * 0.2;
    let bounds = {
      x: test.character.x - sprite_size/2,
      y: test.character.y - sprite_size/2,
      w: sprite_size,
      h: sprite_size,
    };
    if (glov_input.isMouseDown() && glov_input.isMouseOver(bounds)) {
      math_device.v4Copy(color_yellow, test.color_sprite);
    } else if (glov_input.clickHit(bounds)) {
      math_device.v4Copy((test.color_sprite[2] === 0) ? color_white : color_red, test.color_sprite);
      sound_manager.play('test');
    } else if (glov_input.isMouseOver(bounds)) {
      math_device.v4Copy(color_white, test.color_sprite);
      test.color_sprite[3] = 0.5;
    } else {
      math_device.v4Copy(color_white, test.color_sprite);
      test.color_sprite[3] = 1;
    }

    draw_list.queue(sprites.game_bg, 0, 0, Z.BACKGROUND, [0, 0.72, 1, 1]);
    sprites.test_tint.drawDualTint({
      x: test.character.x,
      y: test.character.y,
      z: Z.SPRITES,
      color: [1, 1, 0, 1],
      color1: [1, 0, 1, 1],
      size: [sprite_size, sprite_size],
      frame: sprites.animation.getFrame(dt),
    });

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

    if (glov_ui.buttonText({ x: 100, y: 200, text: 'Particles: ' + (do_particles ? 'ON' : 'OFF')})) {
      do_particles = !do_particles;
    }
    if (do_particles) {
      let dt = glov_engine.getFrameTimestamp() - last_particles;
      if (dt > 1000) {
        last_particles = glov_engine.getFrameTimestamp();
        glov_engine.glov_particles.createSystem(particle_data.defs.explosion,
          //[test.character.x, test.character.y, Z.PARTICLES]
          [300 + Math.random() * 200, 300 + Math.random() * 200, Z.PARTICLES]
        );
      }
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
    app.game_state = test;
    test(dt);
  }

  function loading() {
    let load_count = glov_sprite.loading() + sound_manager.loading();
    $('#loading_text').text(`Loading (${load_count})...`);
    if (!load_count) {
      $('.screen').hide();
      app.game_state = testInit;
    }
  }

  function loadingInit() {
    initGraphics();
    app.game_state = loading;
    loading();
  }

  app.game_state = loadingInit;

  function tick(dt) {
    if (glov_ui.modal_dialog) {
      // Testing effects during modal dialogs
      glov_engine.queueFrameEffect(Z.MODAL - 2, doBlurEffect);
      glov_engine.queueFrameEffect(Z.MODAL - 1, doDesaturateEffect);
    }
    // Borders
    glov_ui.drawRect(glov_camera.x0(), glov_camera.y0(), glov_camera.x1(), 0, Z.BORDERS, glov_engine.pico8_colors[0]);
    glov_ui.drawRect(glov_camera.x0(), game_height, glov_camera.x1(), glov_camera.y1(), Z.BORDERS, glov_engine.pico8_colors[0]);
    glov_ui.drawRect(glov_camera.x0(), 0, 0, game_height, Z.BORDERS, glov_engine.pico8_colors[0]);
    glov_ui.drawRect(game_width, 0, glov_camera.x1(), game_height, Z.BORDERS, glov_engine.pico8_colors[0]);

    app.game_state(dt);
  }

  loadingInit();
  glov_engine.go(tick);
}
