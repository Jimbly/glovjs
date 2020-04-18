/*eslint global-require:off*/
const glov_local_storage = require('./glov/local_storage.js');
glov_local_storage.storage_prefix = 'glovjs-playground'; // Before requiring anything else that might load from this

const engine = require('./glov/engine.js');
const net = require('./glov/net.js');
const ui = require('./glov/ui.js');
const { soundLoad, soundPlayMusic } = require('./glov/sound.js');
const soundscape = require('./glov/soundscape.js');

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
export const game_width = 320;
export const game_height = 240;

export let sprites = {};

export function main() {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    net.init({ engine });
  }

  const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  let font = { info: font_info_04b03x1, texture: 'font/04b03_8x1' };

  if (!engine.startup({
    font,
    game_width,
    game_height,
    pixely: 'strict',
    viewport_postprocess: false,
  })) {
    return;
  }

  // const font = engine.font;

  // Perfect sizes for pixely modes
  ui.scaleSizes(13 / 32);
  ui.setFontHeight(8);

  let ss;
  let intensity = 0.5;
  function initGraphics() {
    soundLoad('soundscape/milestone', { streaming: true });
    soundLoad('soundscape/scenario', { streaming: true });
    function genFiles(base, count) {
      let ret = [];
      for (let ii = 0; ii < count; ++ii) {
        ret.push(`${base}${ii+1}`);
      }
      return ret;
    }
    ss = soundscape.create({
      base_path: 'soundscape/',
      layers: {
        bg: {
          odds: [0,3,3,1],
          period: 30000,
          period_noise: 10000,
          min_intensity: 0,
          add_delay: 2000,
          files: genFiles('bg', 3),
          tags: {
            epic: {
              priority: 1,
              files: genFiles('bg-epic', 3),
            },
            night: {
              priority: 0.5,
              files: [],
            },
          },
        },
        bass: {
          max: 2,
          period: 20000,
          period_noise: 10000,
          min_intensity: 0.2,
          files: genFiles('bass', 3),
        },
        color: {
          max: 1,
          min_intensity: 0.4,
          files: genFiles('color', 2),
        },
        fg: {
          odds: [1,2],
          period: 20000,
          period_noise: 10000,
          min_intensity: 0.6,
          files: genFiles('fg', 4),
        },
      },
    });
  }

  function test(dt) {
    let x = ui.button_height;
    let button_spacing = ui.button_height + 2;
    let y = game_height - 10 - button_spacing * 5;
    let z = Z.UI;

    intensity = ui.slider(intensity, {
      x, y, z,
      min: 0,
      max: 1,
    });
    ss.setIntensity(intensity);
    ui.print(null, x + ui.button_width + 8, y, z, `${intensity.toFixed(2)}`);
    y += ui.button_height;

    if (ui.buttonText({ x, y, text: `Tag:epic = ${ss.getTag('epic') ? 'ON' : 'Off'}` })) {
      ss.setTag('epic', !ss.getTag('epic'));
    }
    y += button_spacing;
    if (ui.buttonText({ x, y, text: `Tag:night = ${ss.getTag('night') ? 'ON' : 'Off'}` })) {
      ss.setTag('night', !ss.getTag('night'));
    }
    y += button_spacing;

    if (ui.buttonText({ x, y, text: 'Play fanfare' })) {
      soundPlayMusic(['soundscape/milestone', 'soundscape/scenario'][Math.floor(Math.random() * 2)]);
    }
    y += button_spacing;

    x = game_width / 2;
    y = 5;
    let debug = ss.debug();
    for (let ii = 0; ii < debug.length; ++ii) {
      ui.print(null, x, y, z, debug[ii]);
      y += ui.font_height;
    }

    ss.tick();
  }

  function testInit(dt) {
    engine.setState(test);
    test(dt);
  }

  initGraphics();
  engine.setState(testInit);
}
