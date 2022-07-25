/*eslint global-require:off*/
// eslint-disable-next-line import/order
import * as local_storage from 'glov/client/local_storage.js';
local_storage.setStoragePrefix('glovjs-multiplayer'); // Before requiring anything else that might load from this

import * as assert from 'assert';
import { cmd_parse } from 'glov/client/cmds.js';
import * as engine from 'glov/client/engine.js';
import * as glov_font from 'glov/client/font.js';
import * as input from 'glov/client/input.js';
const { atan2, random } = Math;
import * as net from 'glov/client/net.js';
import * as net_position_manager from 'glov/client/net_position_manager.js';
import * as particles from 'glov/client/particles.js';
import * as shaders from 'glov/client/shaders.js';
import { socialInit } from 'glov/client/social.js';
import { soundLoad, soundPlay } from 'glov/client/sound.js';
import * as sprite_animation from 'glov/client/sprite_animation.js';
import * as glov_sprites from 'glov/client/sprites.js';
import * as ui from 'glov/client/ui.js';
import { uiHandlingNav } from 'glov/client/ui.js';
import { toNumber } from 'glov/common/util.js';

import { v2sub, v4copy, vec2, vec3, vec4 } from 'glov/common/vmath.js';
import { createAccountUI } from './account_ui.js';
import * as particle_data from './particle_data.js';

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;

let app = exports;
window.app = app; // for debugging

const pos_manager = net_position_manager.create({ n: 3, dim_pos: 2, dim_rot: 1 });

const ROOM_REQUIRES_LOGIN = true;

// Virtual viewport for our game logic
export const game_width = 1280;
export const game_height = 960;

export let sprites = {};

cmd_parse.register({
  cmd: 'bin_get',
  func: function (str, resp_func) {
    app.chat_ui.channel.pak('bin_get').send(function (err, pak) {
      if (err) {
        return void resp_func(err);
      }
      resp_func(null, pak.readBuffer(false).join(','));
    });
  },
});

cmd_parse.register({
  cmd: 'bin_set',
  func: function (str, resp_func) {
    let pak = app.chat_ui.channel.pak('bin_set');
    pak.writeBuffer(new Uint8Array(str.split(' ').map(toNumber)));
    pak.send(resp_func);
  },
});

export function main() {
  net.init({
    engine,
    cmd_parse,
    auto_create_user: false,
  });

  if (!engine.startup({
    game_width,
    game_height,
    pixely: false,
    font: {
      info: require('./img/font/palanquin32.json'),
      texture: 'font/palanquin32',
    },
    safearea_ignore_bottom: true, // We keep the chat button out of the bottom center safe area trouble spot
    ui_sounds: {
      msg_err: 'msg_err',
      msg_in: 'msg_in',
      msg_out: 'msg_out',
      msg_out_err: 'msg_out_err',
      user_join: 'user_join',
      user_leave: 'user_leave',
    },
  })) {
    return;
  }

  // Init friends subsystem, just to register handler, not used in demo,
  // alternatively, set DefaultUserWorker.prototype.rich_presence = false on the server.
  socialInit();

  const test_shader = shaders.create('shaders/test.fp');

  // const font = engine.font;


  const createSprite = glov_sprites.create;
  const createAnimation = sprite_animation.create;

  app.account_ui = createAccountUI();
  app.chat_ui = require('glov/client/chat_ui.js').create({ max_len: 1000 });

  const color_white = vec4(1, 1, 1, 1);
  const color_gray = vec4(0.5, 0.5, 0.5, 1);
  const color_red = vec4(1, 0, 0, 1);
  const color_yellow = vec4(1, 1, 0, 1);

  // Cache KEYS
  const KEYS = input.KEYS;
  const PAD = input.PAD;

  const sprite_size = 64;
  function initGraphics() {
    particles.preloadParticleData(particle_data);

    soundLoad('test');

    sprites.white = createSprite({ url: 'white' });

    sprites.test = createSprite({
      name: 'test',
      size: vec2(sprite_size, sprite_size),
      origin: vec2(0.5, 0.5),
    });
    sprites.test_tint = createSprite({
      name: 'tinted',
      ws: [16, 16, 16, 16],
      hs: [16, 16, 16],
      size: vec2(sprite_size, sprite_size),
      layers: 2,
      origin: vec2(0.5, 0.5),
    });
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

    sprites.game_bg = createSprite({
      url: 'white',
      size: vec2(game_width, game_height),
    });
  }


  let test_room;
  let test;

  function playerMotion(dt) {
    // Network send
    if (pos_manager.checkNet((pos) => {
      test.character.x = pos[0];
      test.character.y = pos[1];
      test.character.rot = pos[2];
    })) {
      return;
    }

    if (uiHandlingNav()) {
      return;
    }

    test.character.dx = 0;
    test.character.dx -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A) + input.padButtonDown(PAD.LEFT);
    test.character.dx += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D) + input.padButtonDown(PAD.RIGHT);
    test.character.dy = 0;
    test.character.dy -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W) + input.padButtonDown(PAD.UP);
    test.character.dy += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S) + input.padButtonDown(PAD.DOWN);
    if (test.character.dx < 0) {
      sprites.animation.setState('idle_left');
    } else if (test.character.dx > 0) {
      sprites.animation.setState('idle_right');
    }

    test.character.x += test.character.dx * 0.2;
    test.character.y += test.character.dy * 0.2;
    let bounds = {
      x: test.character.x - sprite_size/2,
      y: test.character.y - sprite_size/2,
      w: sprite_size,
      h: sprite_size,
    };
    if (input.mouseDownOverBounds(bounds)) {
      v4copy(test.color_sprite, color_yellow);
    } else if (input.click(bounds)) {
      v4copy(test.color_sprite, (test.color_sprite[2] === 0) ? color_white : color_red);
      soundPlay('test');
    } else if (input.mouseOver(bounds)) {
      v4copy(test.color_sprite, color_white);
      test.color_sprite[3] = 0.5;
    } else {
      v4copy(test.color_sprite, color_white);
      test.color_sprite[3] = 1;
    }

    let aim = v2sub(vec2(), input.mousePos(), [test.character.x, test.character.y]);
    test.character.rot = atan2(aim[0], -aim[1]);

    // Network send
    pos_manager.updateMyPos(new Float64Array([test.character.x, test.character.y, test.character.rot]), 'idle');
  }

  function getRoom() {
    if (!test_room) {
      test_room = net.subs.getChannel('test.test', true);
      pos_manager.reinit({
        channel: test_room,
        default_pos: vec3(
          (random() * (game_width - sprite_size) + (sprite_size * 0.5)),
          (random() * (game_height - sprite_size) + (sprite_size * 0.5)),
          0
        ),
      });
      app.chat_ui.setChannel(test_room);
    }
  }

  function preLogout() {
    if (test_room) {
      assert(test_room.subscriptions);
      net.subs.unsubscribe(test_room.channel_id);
      app.chat_ui.setChannel(null);
      test_room = null;
      if (!ROOM_REQUIRES_LOGIN) {
        setTimeout(getRoom, 1);
      }
    }
  }

  test = function (dt) {
    app.chat_ui.run();
    app.account_ui.showLogin({
      x: 0, y: 0,
      prelogout: preLogout, center: false,
      style: glov_font.style(null, {
        outline_width: 2,
        outline_color: 0xFFFFFFff,
        color: 0x000000ff,
      }),
    });

    if (!test.color_sprite) {
      test.color_sprite = v4copy(vec4(), color_white);
      test.character = { x: 0, y: 0, rot: 0 };
    }

    if (test_room && test_room.subscriptions) {
      playerMotion(dt);

      sprites.game_bg.draw({
        x: 0, y: 0, z: Z.BACKGROUND,
        color: [0.5, 0.6, 0.7, 1],
        shader: test_shader,
        shader_params: {
          params: [1.0, 1.0, 1.0, engine.getFrameTimestamp() * 0.0005 % 1000],
        },
      });

      sprites.test_tint.drawDualTint({
        x: test.character.x,
        y: test.character.y,
        z: Z.SPRITES,
        rot: test.character.rot,
        color: [1, 1, 0, 1],
        color1: [1, 0, 1, 1],
        size: [sprite_size, sprite_size],
        frame: sprites.animation.getFrame(dt),
      });

      // Draw other users
      let room_clients = test_room.getChannelData('public.clients', {});
      for (let client_id in room_clients) {
        let other_client = room_clients[client_id];
        if (other_client.pos && other_client.ids) {
          let pcd = pos_manager.updateOtherClient(client_id, dt);
          if (pcd) {
            let pos = pcd.pos;
            sprites.test.draw({
              x: pos[0], y: pos[1], z: Z.SPRITES - 1,
              rot: pos[2],
              color: color_gray,
            });
            ui.font.drawSizedAligned(glov_font.styleColored(null, 0x00000080),
              pos[0], pos[1] - 64, Z.SPRITES - 1,
              ui.font_height, glov_font.ALIGN.HCENTER, 0, 0,
              other_client.ids.display_name || `client_${client_id}`);
          }
        }
      }
    }

    app.chat_ui.runLate();
  };

  function testInit(dt) {
    engine.setState(test);
    if (!ROOM_REQUIRES_LOGIN) {
      getRoom();
    }

    net.subs.onLogin(getRoom);

    test(dt);
  }

  initGraphics();
  engine.setState(testInit);
}
