/*eslint global-require:off*/
/*global VMath: false */
/*global Z: false */

const glov_local_storage = require('./glov/local_storage.js');
const particle_data = require('./particle_data.js');

glov_local_storage.storage_prefix = 'glovjs-playground';
window.Z = window.Z || {};
Z.BACKGROUND = 0;
Z.SPRITES = 10;
Z.PARTICLES = 20;

// let app = exports;
// Virtual viewport for our game logic
export const game_width = 1280;
export const game_height = 960;

export let sprites = {};

// Persistent flags system for testing parameters
let flags = {};
function flagGet(key, dflt) {
  if (flags[key] === undefined) {
    flags[key] = glov_local_storage.getJSON(`flag_${key}`, dflt) || false;
  }
  return flags[key];
}
function flagToggle(key) {
  flags[key] = !flagGet(key);
  glov_local_storage.setJSON(`flag_${key}`, flags[key]);
}

export function main(canvas) {
  const glov_engine = require('./glov/engine.js');
  const glov_font = require('./glov/font.js');
  const glov_ui_test = require('./glov/ui_test.js');

  glov_engine.startup({
    canvas,
    game_width,
    game_height,
    pixely: flagGet('pixely', true),
  });

  const sound_manager = glov_engine.sound_manager;
  // const glov_camera = glov_engine.glov_camera;
  const glov_input = glov_engine.glov_input;
  const glov_sprite = glov_engine.glov_sprite;
  const glov_ui = glov_engine.glov_ui;
  const draw_list = glov_engine.draw_list;
  // const font = glov_engine.font;


  const createSpriteSimple = glov_sprite.createSpriteSimple.bind(glov_sprite);
  const createAnimation = glov_sprite.createAnimation.bind(glov_sprite);

  const color_white = VMath.v4Build(1, 1, 1, 1);
  const color_red = VMath.v4Build(1, 0, 0, 1);
  const color_yellow = VMath.v4Build(1, 1, 0, 1);

  // Cache key_codes
  const key_codes = glov_input.key_codes;
  const pad_codes = glov_input.pad_codes;

  const sprite_size = 64;
  function initGraphics() {
    glov_sprite.preloadParticleData(particle_data);

    sound_manager.loadSound('test');

    const origin_0_0 = glov_sprite.origin_0_0;

    sprites.white = createSpriteSimple('white', 1, 1, origin_0_0);

    sprites.test_tint = createSpriteSimple('tinted', [16, 16, 16, 16], [16, 16, 16], { layers: 2 });
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

    sprites.game_bg = createSpriteSimple('white', 2, 2, {
      width: game_width,
      height: game_height,
      origin: [0, 0],
    });
  }

  let last_particles = 0;

  function test(dt) {
    if (!test.color_sprite) {
      test.color_sprite = VMath.v4Copy(color_white);
      test.character = {
        x: (Math.random() * (game_width - sprite_size) + (sprite_size * 0.5)),
        y: (Math.random() * (game_height - sprite_size) + (sprite_size * 0.5)),
      };
    }

    if (flagGet('ui_test')) {
      glov_ui_test.run(100, 100);
    }
    if (flagGet('font_test')) {
      glov_ui_test.runFontTest(600, 100);
    }

    test.character.dx = 0;
    test.character.dy = 0;
    if (glov_input.isKeyDown(key_codes.LEFT) || glov_input.isKeyDown(key_codes.A) ||
      glov_input.isPadButtonDown(pad_codes.LEFT)
    ) {
      test.character.dx = -1;
      sprites.animation.setState('idle_left');
    } else if (glov_input.isKeyDown(key_codes.RIGHT) || glov_input.isKeyDown(key_codes.D) ||
      glov_input.isPadButtonDown(pad_codes.RIGHT)
    ) {
      test.character.dx = 1;
      sprites.animation.setState('idle_right');
    }
    if (glov_input.isKeyDown(key_codes.UP) || glov_input.isKeyDown(key_codes.W) ||
      glov_input.isPadButtonDown(pad_codes.UP)
    ) {
      test.character.dy = -1;
    } else if (glov_input.isKeyDown(key_codes.DOWN) || glov_input.isKeyDown(key_codes.S) ||
      glov_input.isPadButtonDown(pad_codes.DOWN)
    ) {
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
      VMath.v4Copy(color_yellow, test.color_sprite);
    } else if (glov_input.clickHit(bounds)) {
      VMath.v4Copy((test.color_sprite[2] === 0) ? color_white : color_red, test.color_sprite);
      sound_manager.play('test');
    } else if (glov_input.isMouseOver(bounds)) {
      VMath.v4Copy(color_white, test.color_sprite);
      test.color_sprite[3] = 0.5;
    } else {
      VMath.v4Copy(color_white, test.color_sprite);
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

    glov_ui.print(glov_font.styleColored(null, 0x000000ff),
      test.character.x, test.character.y + (++font_test_idx * 20), Z.SPRITES,
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
    glov_ui.print(font_style,
      test.character.x, test.character.y + (++font_test_idx * glov_ui.font_height), Z.SPRITES,
      'Outline and Drop Shadow');

    let x = 100;
    let y = game_height - 100 - 35 * 5;
    if (glov_ui.buttonText({ x, y, text: `Pixely: ${flagGet('pixely') ? 'ON' : 'OFF'}`,
      tooltip: 'Toggles pixely or regular mode (requires reload)' })
    ) {
      flagToggle('pixely');
      document.location = String(document.location);
    }
    y += 35;

    if (glov_ui.buttonText({ x, y, text: `Music: ${flagGet('music') ? 'ON' : 'OFF'}`,
      tooltip: 'Toggles playing a looping background music track' })
    ) {
      flagToggle('music');
      if (flagGet('music')) {
        sound_manager.playMusic('music_test.mp3', 1, sound_manager.FADE_IN);
      } else {
        sound_manager.playMusic('music_test.mp3', 0, sound_manager.FADE_OUT);
      }
    }
    y += 35;

    if (glov_ui.buttonText({ x, y, text: `Font Test: ${flagGet('font_test') ? 'ON' : 'OFF'}`,
      tooltip: 'Toggles visibility of general Font tests' })
    ) {
      flagToggle('font_test');
    }
    y += 35;

    if (glov_ui.buttonText({ x, y, text: `UI Test: ${flagGet('ui_test') ? 'ON' : 'OFF'}`,
      tooltip: 'Toggles visibility of general UI tests' })
    ) {
      flagToggle('ui_test');
    }
    y += 35;

    if (glov_ui.buttonText({ x, y, text: `Particles: ${flagGet('particles', true) ? 'ON' : 'OFF'}`,
      tooltip: 'Toggles particles' })
    ) {
      flagToggle('particles');
    }
    if (flagGet('particles')) {
      if (glov_engine.getFrameTimestamp() - last_particles > 1000) {
        last_particles = glov_engine.getFrameTimestamp();
        glov_engine.glov_particles.createSystem(particle_data.defs.explosion,
          //[test.character.x, test.character.y, Z.PARTICLES]
          [300 + Math.random() * 200, 300 + Math.random() * 200, Z.PARTICLES]
        );
      }
    }

    // Debugging touch state on mobile
    // const glov_camera = glov_engine.glov_camera;
    // glov_engine.font.drawSizedWrapped(glov_engine.fps_style, glov_camera.x0(), glov_camera.y0(), Z.FPSMETER,
    //   glov_camera.w(), 0, 22, JSON.stringify({
    //     last_touch_state: glov_input.last_touch_state,
    //     touch_state: glov_input.touch_state,
    //   }, undefined, 2));
  }

  function testInit(dt) {
    glov_engine.setState(test);
    if (flagGet('music')) {
      sound_manager.playMusic('music_test.mp3');
    }
    test(dt);
  }

  initGraphics();
  glov_engine.setState(testInit);
}
