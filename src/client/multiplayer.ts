/*eslint global-require:off*/
// eslint-disable-next-line import/order
import * as local_storage from 'glov/client/local_storage';
local_storage.setStoragePrefix('glovjs-multiplayer'); // Before requiring anything else that might load from this

import assert from 'assert';
import { chatUICreate } from 'glov/client/chat_ui';
import { cmd_parse } from 'glov/client/cmds';
import * as engine from 'glov/client/engine';
import * as glov_font from 'glov/client/font';
import * as input from 'glov/client/input';
const { atan2, random } = Math;
import {
  ClientChannelWorker,
  netInit,
  netSubs,
} from 'glov/client/net';
import * as net_position_manager from 'glov/client/net_position_manager';
import * as particles from 'glov/client/particles';
import 'glov/client/report'; // for command testing
import { shaderCreate } from 'glov/client/shaders';
import { socialInit } from 'glov/client/social';
import { soundLoad } from 'glov/client/sound';
import { spotSuppressPad } from 'glov/client/spot';
import { spriteAnimationCreate } from 'glov/client/sprite_animation';
import { Sprite, spriteCreate } from 'glov/client/sprites';
import * as ui from 'glov/client/ui';
import {
  uiHandlingNav,
  uiTextHeight,
} from 'glov/client/ui';
import { getURLPageBase } from 'glov/client/urlhash';
import { Packet } from 'glov/common/packet';
import { DataObject } from 'glov/common/types';
import { toNumber } from 'glov/common/util';

import { ROVec3, v2sub, vec2, vec3, vec4 } from 'glov/common/vmath';
import { createAccountUI } from './account_ui';
import * as particle_data from './particle_data';

import type { CmdRespFunc } from 'glov/common/cmd_parse';

Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;

const pos_manager = net_position_manager.create({ n: 3, dim_pos: 2, dim_rot: 1 });

const ROOM_REQUIRES_LOGIN = true;

// Virtual viewport for our game logic
const game_width = 1280;
const game_height = 960;

let sprites: Record<string, Sprite> = {};
let animation: ReturnType<typeof spriteAnimationCreate>;

let account_ui: ReturnType<typeof createAccountUI>;
let chat_ui: ReturnType<typeof chatUICreate>;

cmd_parse.register({
  cmd: 'bin_get',
  func: function (str: string, resp_func: CmdRespFunc<string>) {
    chat_ui.channel!.pak('bin_get').send(function (err?: string | null, pak?: Packet) {
      if (err) {
        return void resp_func(err);
      }
      resp_func(null, pak!.readBuffer(false).join(','));
    });
  },
});

cmd_parse.register({
  cmd: 'bin_set',
  func: function (str: string, resp_func: CmdRespFunc<string>) {
    let pak = chat_ui.channel!.pak('bin_set');
    pak.writeBuffer(new Uint8Array(str.split(' ').map(toNumber)));
    pak.send(resp_func);
  },
});

export function main(): void {
  netInit({
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

  const test_shader = shaderCreate('shaders/test.fp');

  // const font = engine.font;

  account_ui = createAccountUI();
  chat_ui = chatUICreate({
    max_len: 1000,
    url_match: /((?:https?:\/\/)[^/]+\/index_multiplayer\.html\?[^\s]*)/g,
    url_info: /(\?[^\s]*)/,
    url_base: getURLPageBase(),
    user_context_cb: ({ user_id }: { user_id: string }) => ui.provideUserString('User ID', user_id),
  });

  const color_gray = vec4(0.5, 0.5, 0.5, 1);

  // Cache KEYS
  const KEYS = input.KEYS;
  const PAD = input.PAD;

  const sprite_size = 64;
  function initGraphics(): void {
    particles.preloadParticleData(particle_data);

    soundLoad('test');

    sprites.white = spriteCreate({ url: 'white' });

    sprites.test = spriteCreate({
      name: 'test',
      size: vec2(sprite_size, sprite_size),
      origin: vec2(0.5, 0.5),
    });
    sprites.test_tint = spriteCreate({
      name: 'tinted',
      ws: [16, 16, 16, 16],
      hs: [16, 16, 16],
      size: vec2(sprite_size, sprite_size),
      layers: 2,
      origin: vec2(0.5, 0.5),
    });
    animation = spriteAnimationCreate({
      idle_left: {
        frames: [0,1],
        times: [200, 500],
      },
      idle_right: {
        frames: [3,2],
        times: [200, 500],
      },
    });
    animation.setState('idle_left');

    sprites.game_bg = spriteCreate({
      url: 'white',
      size: vec2(game_width, game_height),
    });
  }


  let test_room: ClientChannelWorker | null = null;
  let test_character = { x: 0, y: 0, rot: 0 };

  function playerMotion(dt: number): void {
    // Network send
    if (pos_manager.checkNet((pos: ROVec3) => {
      test_character.x = pos[0];
      test_character.y = pos[1];
      test_character.rot = pos[2];
    })) {
      return;
    }

    if (uiHandlingNav()) {
      return;
    }

    let dx = 0;
    dx -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A) + input.padButtonDown(PAD.LEFT);
    dx += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D) + input.padButtonDown(PAD.RIGHT);
    let dy = 0;
    dy -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W) + input.padButtonDown(PAD.UP);
    dy += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S) + input.padButtonDown(PAD.DOWN);
    if (dx < 0) {
      animation.setState('idle_left');
    } else if (dx > 0) {
      animation.setState('idle_right');
    }

    test_character.x += dx * 0.2;
    test_character.y += dy * 0.2;

    let aim = v2sub(vec2(), input.mousePos(), [test_character.x, test_character.y]);
    test_character.rot = atan2(aim[0], -aim[1]);

    // Network send
    pos_manager.updateMyPos(new Float64Array([test_character.x, test_character.y, test_character.rot]), 'idle');
  }

  function getRoom(): void {
    if (!test_room) {
      test_room = netSubs().getChannel('multiplayer.test', true);
      pos_manager.reinit({
        channel: test_room,
        default_pos: vec3(
          (random() * (game_width - sprite_size) + (sprite_size * 0.5)),
          (random() * (game_height - sprite_size) + (sprite_size * 0.5)),
          0
        ),
      });
      chat_ui.setChannel(test_room);
    }
  }

  function preLogout(): void {
    if (test_room) {
      assert(test_room.numSubscriptions());
      test_room.unsubscribe();
      chat_ui.setChannel(null);
      test_room = null;
      if (!ROOM_REQUIRES_LOGIN) {
        setTimeout(getRoom, 1);
      }
    }
  }

  let pad_controls_sprite = true;
  let was_active = false;
  function test(dt: number): void {
    if (pad_controls_sprite) {
      spotSuppressPad();
    }
    chat_ui.run();
    account_ui.showLogin({
      x: 0, y: 0,
      prelogout: preLogout, center: false,
      style: glov_font.style(null, {
        outline_width: 2,
        outline_color: 0xFFFFFFff,
        color: 0x000000ff,
      }),
    });

    if (test_room && test_room.numSubscriptions()) {
      if (!was_active) {
        pad_controls_sprite = true;
        was_active = true;
      }
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
        x: test_character.x,
        y: test_character.y,
        z: Z.SPRITES,
        rot: test_character.rot,
        color: [1, 1, 0, 1],
        color1: [1, 0, 1, 1],
        frame: animation.getFrame(dt),
      });

      // Draw other users
      let room_clients = test_room.getChannelData<DataObject>('public.clients', {});
      for (let client_id in room_clients) {
        let other_client = room_clients[client_id] as DataObject;
        if (other_client.pos && other_client.ids) {
          let ids = other_client.ids as Partial<Record<string, string>>;
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
              uiTextHeight(), glov_font.ALIGN.HCENTER, 0, 0,
              ids.display_name || `client_${client_id}`);
          }
        }
      }
    } else {
      pad_controls_sprite = false;
      was_active = false;
    }

    chat_ui.runLate();

    if (input.keyDownEdge(KEYS.ESC) || input.padButtonDownEdge(PAD.B)) {
      pad_controls_sprite = !pad_controls_sprite;
    }
  }

  function testInit(dt: number): void {
    engine.setState(test);
    if (!ROOM_REQUIRES_LOGIN) {
      getRoom();
    }

    netSubs().onLogin(getRoom);

    test(dt);
  }

  initGraphics();
  engine.setState(testInit);
}
