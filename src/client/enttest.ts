/*eslint global-require:off*/
// eslint-disable-next-line import/order
import * as local_storage from 'glov/client/local_storage';
local_storage.setStoragePrefix('glovjs-multiplayer'); // Before requiring anything else that might load from this

import assert from 'assert';
import { chatUICreate } from 'glov/client/chat_ui';
import { cmd_parse } from 'glov/client/cmds';
import * as engine from 'glov/client/engine';
import { EntityBaseClient } from 'glov/client/entity_base_client';
import { ClientEntityManager, clientEntityManagerCreate } from 'glov/client/entity_manager_client';
import { EntityPositionManager, entityPositionManagerCreate } from 'glov/client/entity_position_manager';
import * as glov_font from 'glov/client/font';
import * as input from 'glov/client/input';
const { atan2 } = Math;
import * as net from 'glov/client/net';
import { netSubs } from 'glov/client/net';
import * as particles from 'glov/client/particles';
import { socialInit } from 'glov/client/social';
import { spotSuppressPad } from 'glov/client/spot';
import { spriteAnimationCreate } from 'glov/client/sprite_animation';
import { Sprite, spriteCreate } from 'glov/client/sprites';
import * as ui from 'glov/client/ui';
import { uiHandlingNav } from 'glov/client/ui';
import { EntityID } from 'glov/common/entity_base_common';
import { Packet } from 'glov/common/packet';
import { ClientChannelWorker, ErrorCallback } from 'glov/common/types';
import { toNumber } from 'glov/common/util';
import { Vec2, v2addScale, v2copy, v2dist, v2scale, v2set, v2sub, v4set, vec2, vec4 } from 'glov/common/vmath';

import {
  VA_SIZE,
  VIEW_DIST,
  entityTestCommonClass,
} from '../common/entity_test_common';
import { createAccountUI } from './account_ui';
import * as particle_data from './particle_data';

Z.BACKGROUND = 1;
Z.SPRITES = 10;

class EntityTestClient extends entityTestCommonClass(EntityBaseClient) {
  entity_manager!: ClientEntityManager<EntityTestClient>;

  anim: ReturnType<typeof spriteAnimationCreate> | null;

  constructor(ent_id: EntityID, entity_manager: ClientEntityManager<EntityTestClient>) {
    super(ent_id, entity_manager);
    this.anim = null;
  }

  // static PLAYER_MOVE_FIELD = 'seq_player_move';
  // applyPlayerMove(
  //   action_id: string,
  //   new_pos: [number, number, number],
  //   resp_func: NetErrorCallback
  // ): void {
  //   this.applyBatchUpdate({
  //     field: EntityTestClient.PLAYER_MOVE_FIELD,
  //     action_id,
  //     data_assignments: {
  //       pos: new_pos,
  //     },
  //   }, resp_func);
  // }
}

let entity_manager: ClientEntityManager<EntityTestClient>;
let entity_pos_manager: EntityPositionManager;

const ROOM_REQUIRES_LOGIN = true;

// Virtual viewport for our game logic
const game_width = 1280;
const game_height = 960;

const SPEED = 0.2;

let sprites: Record<string, Sprite> = {};
let animation: ReturnType<typeof spriteAnimationCreate>;

const account_ui = createAccountUI();
let chat_ui: ReturnType<typeof chatUICreate>;

cmd_parse.register({
  cmd: 'bin_get',
  func: function (str: string, resp_func: ErrorCallback<string>) {
    chat_ui.channel.pak('bin_get').send(function (err?: string, pak?: Packet) {
      if (err) {
        return void resp_func(err);
      }
      resp_func(null, pak!.readBuffer(false).join(','));
    });
  },
});

cmd_parse.register({
  cmd: 'bin_set',
  func: function (str: string, resp_func: ErrorCallback<string>) {
    let pak = chat_ui.channel.pak('bin_set');
    pak.writeBuffer(new Uint8Array(str.split(' ').map(toNumber)));
    pak.send(resp_func);
  },
});

let test_character = { pos: vec2(), rot: 0 };
function onEntReady() {
  let my_ent = entity_manager.getMyEnt();
  let pos = my_ent.getData<[number,number]>('pos', [0,0]);
  v2copy(test_character.pos, pos);
}


export function main(): void {
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

  chat_ui = chatUICreate({ max_len: 1000 });

  entity_manager = clientEntityManagerCreate({
    channel_type: 'enttest',
    EntityCtor: EntityTestClient,
  });
  entity_pos_manager = entityPositionManagerCreate({
    entity_manager,
    dim_pos: 2,
    dim_rot: 1,
    speed: SPEED,
  });

  entity_manager.on('ent_ready', onEntReady);

  // Init friends subsystem, just to register handler, not used in demo,
  // alternatively, set DefaultUserWorker.prototype.rich_presence = false on the server.
  socialInit();

  // const font = engine.font;

  // Cache KEYS
  const KEYS = input.KEYS;
  const PAD = input.PAD;

  let color_temp = vec4();

  const sprite_size = 64;
  function initGraphics() {
    particles.preloadParticleData(particle_data);

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

  let impulse = vec2();
  function playerMotion(dt: number) {
    // Network send
    if (entity_manager.checkNet()) {
      return;
    }

    if (uiHandlingNav()) {
      return;
    }

    v2set(impulse, 0, 0);
    input.padGetAxes(impulse, 0);
    impulse[1] *= -1;
    v2scale(impulse, impulse, dt);
    impulse[0] -= input.keyDown(KEYS.LEFT) + input.keyDown(KEYS.A);
    impulse[0] += input.keyDown(KEYS.RIGHT) + input.keyDown(KEYS.D);
    impulse[1] -= input.keyDown(KEYS.UP) + input.keyDown(KEYS.W);
    impulse[1] += input.keyDown(KEYS.DOWN) + input.keyDown(KEYS.S);
    if (impulse[0] < 0) {
      animation.setState('idle_left');
    } else if (impulse[0] > 0) {
      animation.setState('idle_right');
    }

    v2addScale(test_character.pos, test_character.pos, impulse, SPEED);

    let aim = v2sub(vec2(), input.mousePos(), test_character.pos);
    test_character.rot = atan2(aim[0], -aim[1]);

    // Network send
    entity_pos_manager.updateMyPos(
      new Float64Array([test_character.pos[0], test_character.pos[1], test_character.rot]),
      'idle');
  }

  function getRoom() {
    if (!test_room) {
      test_room = netSubs().getChannel('enttest.test', true);
      assert(test_room);
      entity_manager.reinit({
        channel: test_room,
      });
      entity_pos_manager.reinit();
      chat_ui.setChannel(test_room);
    }
  }

  function preLogout() {
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
  function test(dt: number) {
    if (pad_controls_sprite) {
      spotSuppressPad();
    }
    entity_manager.tick();
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

    if (test_room && test_room.numSubscriptions() && entity_manager.isReady()) {
      if (!was_active) {
        pad_controls_sprite = true;
        was_active = true;
      }
      playerMotion(dt);

      sprites.game_bg.draw({
        x: 0, y: 0, z: Z.BACKGROUND,
        color: [0.3, 0.32, 0.35, 1],
      });

      // Draw self
      sprites.test_tint.drawDualTint({
        x: test_character.pos[0],
        y: test_character.pos[1],
        z: Z.SPRITES,
        rot: test_character.rot,
        color: [1, 1, 0, 1],
        color1: [1, 0, 1, 1],
        frame: animation.getFrame(dt),
      });
      // Draw view area
      ui.drawCircle(test_character.pos[0], test_character.pos[1], Z.SPRITES - 2, VIEW_DIST, 0.99, [1,1,1,0.5]);
      // Draw VisibleArea boundaries
      for (let xx = VA_SIZE; xx < game_width; xx+=VA_SIZE) {
        ui.drawLine(xx, 0, xx, game_height, Z.SPRITES - 3, 1, 1, [0,0,1,0.5]);
      }
      for (let yy = VA_SIZE; yy < game_height; yy+=VA_SIZE) {
        ui.drawLine(0, yy, game_width, yy, Z.SPRITES - 3, 1, 1, [0,0,1,0.5]);
      }
      // Draw VisibleArea boundaries
      for (let xx = VA_SIZE/2; xx < game_width; xx+=VA_SIZE) {
        ui.drawLine(xx, 0, xx, game_height, Z.SPRITES - 3, 1, 1, [0,0,1,0.125]);
      }
      for (let yy = VA_SIZE/2; yy < game_height; yy+=VA_SIZE) {
        ui.drawLine(0, yy, game_width, yy, Z.SPRITES - 3, 1, 1, [0,0,1,0.125]);
      }

      // Draw other entities
      let { entities } = entity_manager;
      for (let key in entities) {
        let ent_id = Number(key);
        let ent = entities[ent_id]!;
        let ped = entity_pos_manager.updateOtherEntity(ent_id, dt);
        if (!ped) {
          continue;
        }
        let { pos } = ped;
        v4set(color_temp, 1, 1, 1, ent.fade !== null ? ent.fade : 1);
        if (ent_id === entity_manager.my_ent_id) {
          color_temp[3] *= 0.5;
        }
        if (v2dist(test_character.pos, pos as unknown as Vec2) > VIEW_DIST) {
          color_temp[3] *= 0.25;
        }
        sprites.test.draw({
          x: pos[0], y: pos[1], z: Z.SPRITES - 1,
          rot: pos[2],
          color: color_temp,
        });
        if (ent.data.display_name) {
          ui.font.drawSizedAligned(glov_font.styleAlpha(glov_font.styleColored(null, 0x00000080), color_temp[3]),
            pos[0], pos[1] - 64, Z.SPRITES - 1,
            ui.font_height, glov_font.ALIGN.HCENTER, 0, 0,
            ent.data.display_name);
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

  function testInit(dt: number) {
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
