/*eslint global-require:off*/
// eslint-disable-next-line import/order
import * as local_storage from 'glov/client/local_storage';
local_storage.setStoragePrefix('glovjs-multiplayer'); // Before requiring anything else that might load from this

import assert from 'assert';
import { chatUICreate } from 'glov/client/chat_ui';
import { cmd_parse } from 'glov/client/cmds';
import * as engine from 'glov/client/engine';
import { EntityBaseClient } from 'glov/client/entity_base_client';
import { ClientEntityManagerInterface, clientEntityManagerCreate } from 'glov/client/entity_manager_client';
import { EntityPositionManager, entityPositionManagerCreate } from 'glov/client/entity_position_manager';
import * as glov_font from 'glov/client/font';
import * as input from 'glov/client/input';
import {
  ClientChannelWorker,
  netDisconnected,
  netInit,
  netSubs,
} from 'glov/client/net';
import * as particles from 'glov/client/particles';
import { socialInit } from 'glov/client/social';
import { spotSuppressPad } from 'glov/client/spot';
import { Sprite, spriteCreate } from 'glov/client/sprites';
import {
  buttonText,
  drawCircle,
  drawLine,
  uiButtonHeight,
  uiGetFont,
  uiHandlingNav,
  uiTextHeight,
} from 'glov/client/ui';
import { DataObject } from 'glov/common/types';
import {
  Vec2,
  Vec3,
  v2addScale,
  v2copy,
  v2dist,
  v2length,
  v2scale,
  v2set,
  v4copy,
  v4lerp,
  vec2,
  vec4,
} from 'glov/common/vmath';

import {
  EntityType,
  VA_SIZE,
  VIEW_DIST,
  entityTestCommonClass,
} from '../common/entity_test_common';
import { createAccountUI } from './account_ui';
import * as particle_data from './particle_data';

const { PI, cos, max, random, sin } = Math;

Z.BACKGROUND = 1;
Z.SPRITES = 10;

const AI_CLAIM_TIME = 2000;

class EntityTestClient extends entityTestCommonClass(EntityBaseClient) {
  declare entity_manager: ClientEntityManagerInterface<EntityTestClient>;

  next_move_time!: number;
  in_view: boolean;
  my_activate_time: number;
  error_time: number;
  home_point?: Vec2;

  constructor(data: DataObject) {
    super(data);
    this.waiting = false;
    this.in_view = false;
    this.my_activate_time = -Infinity;
    this.error_time = -Infinity;
    this.resetMoveTime(true);
  }

  resetMoveTime(initial: boolean): void {
    this.next_move_time = engine.frame_timestamp + 500 + random() * (500 + (initial ? AI_CLAIM_TIME : 0));
  }

  waiting: boolean;
  static AI_MOVE_FIELD = 'seq_ai_move';
  applyAIMove(
    new_pos: Vec3,
  ): void {
    assert(!this.waiting);
    this.waiting = true;
    this.applyBatchUpdate({
      field: EntityTestClient.AI_MOVE_FIELD,
      action_id: 'ai_move',
      data_assignments: {
        pos: new_pos,
      },
    }, (err) => {
      if (err) {
        this.error_time = engine.frame_timestamp;
      }
      this.waiting = false;
    });
  }

  erroredRecently(): number {
    let dt = engine.frame_timestamp - this.error_time;
    return max(0, 1 - dt / 2000);
  }

  activatedRecently(): number {
    let dt = engine.frame_timestamp - this.my_activate_time;
    return max(0, 1 - dt / 2000);
  }

  lastUpdatedBySomeoneElse(): boolean {
    if (!this.data.seq_ai_move) {
      return false;
    }
    if (this.data.seq_ai_move.startsWith(this.entity_manager.getSubscriptionIdPrefix())) {
      return false;
    }
    return true;
  }

  tickAI(dt: number): void {
    if (this.waiting || !this.in_view) {
      return;
    }
    if (engine.frame_timestamp < this.next_move_time) {
      return;
    }
    if (this.lastUpdatedBySomeoneElse()) {
      if (engine.frame_timestamp - this.last_update_timestamp < AI_CLAIM_TIME) {
        // someone else updated recently, ignore
        this.resetMoveTime(false);
        return;
      } // else it's been a while, do an update if we want
    }
    let pos = this.getData<Vec3>('pos');
    assert(pos);
    if (!this.home_point) {
      this.home_point = pos.slice(0) as Vec2;
    }
    let r = 64 * random();
    let theta = random() * PI * 2;
    let new_pos: Vec3 = [this.home_point[0] + sin(theta) * r, this.home_point[1] - cos(theta) * r, theta];
    this.my_activate_time = engine.frame_timestamp;
    this.resetMoveTime(false);
    this.applyAIMove(new_pos);
  }
}

let entity_manager: ClientEntityManagerInterface<EntityTestClient>;
let entity_pos_manager: EntityPositionManager;

const ROOM_REQUIRES_LOGIN = false;

// Virtual viewport for our game logic
const game_width = 1280;
const game_height = 960;

const SPEED = 0.2;

let sprite_entity: Sprite;
let sprite_game_bg: Sprite;

const account_ui = createAccountUI();
let chat_ui: ReturnType<typeof chatUICreate>;

let test_character = { pos: vec2(), rot: 0 };
function onEntReady(): void {
  if (entity_manager.hasMyEnt()) {
    let my_ent = entity_manager.getMyEnt();
    let pos = my_ent.getData<[number,number]>('pos', [0,0]);
    v2copy(test_character.pos, pos);
  } else {
    // Position should have already arrived in `initial_pos` message
  }
}

const color_self = vec4(0.5, 1, 0.5, 1);
const color_self_shadow = vec4(0, 1, 0, 0.25);
const color_player = vec4(0.75, 0.5, 1.0, 1);
const color_bot = vec4(0.25, 0.25, 0.25, 1);
const color_bot_active = vec4(1, 0.66, 0.25, 1);
const color_bot_error = vec4(1, 0, 0, 1);

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

  chat_ui = chatUICreate({ max_len: 1000 });

  entity_manager = clientEntityManagerCreate<EntityTestClient>({
    channel_type: 'enttest',
    create_func: (data: DataObject) => {
      return new EntityTestClient(data);
    },
  });
  entity_pos_manager = entityPositionManagerCreate({
    entity_manager,
    dim_pos: 2,
    dim_rot: 1,
    anim_state_defs: {
      test_anim_state: {
        stopped: (value: unknown): boolean => value === 'idle',
      },
    },
  });

  entity_manager.on('ent_ready', onEntReady);

  netSubs().onChannelMsg('enttest', 'initial_pos', (data: Vec2) => {
    v2copy(test_character.pos, data);
  });

  // Init friends subsystem, just to register handler, not used in demo,
  // alternatively, set DefaultUserWorker.prototype.rich_presence = false on the server.
  socialInit();

  // const font = engine.font;

  // Cache KEYS
  const KEYS = input.KEYS;
  const PAD = input.PAD;

  let color_temp = vec4();

  const sprite_size = 48;
  function initGraphics(): void {
    particles.preloadParticleData(particle_data);

    sprite_entity = spriteCreate({
      name: 'entity',
      ws: [128, 128],
      hs: [128, 128],
      size: vec2(sprite_size, sprite_size),
      origin: vec2(0.5, 0.5),
    });

    sprite_game_bg = spriteCreate({
      url: 'white',
      size: vec2(game_width, game_height),
    });
  }


  let test_room: ClientChannelWorker | null = null;

  let impulse = vec2();
  let player_state = {
    test_anim_state: 'idle',
  };
  function playerMotion(dt: number): void {
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
    player_state.test_anim_state = v2length(impulse) > dt * 0.1 ? 'walk' : 'idle';
    v2addScale(test_character.pos, test_character.pos, impulse, SPEED);

    // let aim = v2sub(vec2(), input.mousePos(), test_character.pos);
    // test_character.rot = atan2(aim[0], -aim[1]);

    // Network send
    entity_pos_manager.updateMyPos(
      new Float64Array([test_character.pos[0], test_character.pos[1], test_character.rot]),
      player_state);
  }

  let last_ai_tick = engine.frame_timestamp;
  function aiMotion(dt: number): void {
    if (engine.frame_timestamp < last_ai_tick + 200) {
      return;
    }
    last_ai_tick = engine.frame_timestamp;
    let { entities } = entity_manager;
    for (let ent_id_string in entities) {
      let ent_id = Number(ent_id_string);
      let ent = entities[ent_id]!;
      if (ent.data.type !== EntityType.Bot) {
        continue;
      }
      ent.tickAI(dt);
    }
  }

  function getRoom(): void {
    if (!test_room && !netDisconnected()) { // includes not doing this if actively logging in
      test_room = netSubs().getChannel('enttest.test', true);
      assert(test_room);
      entity_manager.reinit({
        channel: test_room,
      });
      entity_pos_manager.reinit();
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
    entity_manager.tick();
    chat_ui.run();
    let y = 0;
    y = account_ui.showLogin({
      x: 0, y,
      prelogout: preLogout,
      prelogin: preLogout,
      center: false,
      style: glov_font.style(null, {
        outline_width: 2,
        outline_color: 0xFFFFFFff,
        color: 0x000000ff,
      }),
    }) + 4;

    if (test_room && test_room.numSubscriptions() && entity_manager.isReady() && !netDisconnected()) {
      if (!was_active) {
        pad_controls_sprite = true;
        was_active = true;
      }
      playerMotion(dt);

      aiMotion(dt);

      if (buttonText({
        x: 0, y,
        text: 'Spawn Entity',
      })) {
        let r = 128;
        let theta = random() * PI * 2;
        let pos = [test_character.pos[0] + sin(theta) * r, test_character.pos[1] + cos(theta) * r, 0];
        test_room.send('spawn', { pos });
      }
      y += uiButtonHeight() + 4;

      if (buttonText({
        x: 0, y,
        text: 'Reset Current VA',
      })) {
        test_room.send('resetva');
      }
      y += uiButtonHeight() + 4;

      sprite_game_bg.draw({
        x: 0, y: 0, z: Z.BACKGROUND,
        color: [0.3, 0.32, 0.35, 1],
      });

      // Draw self
      sprite_entity.draw({
        x: test_character.pos[0],
        y: test_character.pos[1],
        z: Z.SPRITES,
        rot: test_character.rot,
        color: color_self,
        frame: player_state.test_anim_state === 'idle' ? 1 : 3,
      });
      // Draw view area
      drawCircle(test_character.pos[0], test_character.pos[1], Z.SPRITES - 2, VIEW_DIST, 0.99, [1,1,1,0.5]);
      // Draw VisibleArea boundaries
      for (let xx = VA_SIZE; xx < game_width; xx+=VA_SIZE) {
        drawLine(xx, 0, xx, game_height, Z.SPRITES - 3, 1, 1, [0,0,1,0.5]);
      }
      for (let yy = VA_SIZE; yy < game_height; yy+=VA_SIZE) {
        drawLine(0, yy, game_width, yy, Z.SPRITES - 3, 1, 1, [0,0,1,0.5]);
      }
      // Draw VisibleArea boundaries
      for (let xx = VA_SIZE/2; xx < game_width; xx+=VA_SIZE) {
        drawLine(xx, 0, xx, game_height, Z.SPRITES - 3, 1, 1, [0,0,1,0.125]);
      }
      for (let yy = VA_SIZE/2; yy < game_height; yy+=VA_SIZE) {
        drawLine(0, yy, game_width, yy, Z.SPRITES - 3, 1, 1, [0,0,1,0.125]);
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
        let frame;
        if (ent.data.type === EntityType.Player) {
          if (ent_id === entity_manager.getMyEntID()) {
            v4copy(color_temp, color_self_shadow);
          } else {
            v4copy(color_temp, color_player);
          }
          frame = ped.anim_state.test_anim_state === 'idle' ? 1 : 3;
        } else {
          v4lerp(color_temp, ent.activatedRecently(), color_bot, color_bot_active);
          v4lerp(color_temp, ent.erroredRecently(), color_temp, color_bot_error);
          frame = 0;
        }
        color_temp[3] *= ent.fade !== null ? ent.fade : 1;
        if (v2dist(test_character.pos, pos as unknown as Vec2) > VIEW_DIST) {
          color_temp[3] *= 0.25;
          ent.in_view = false;
        } else {
          ent.in_view = true;
        }
        sprite_entity.draw({
          x: pos[0], y: pos[1], z: Z.SPRITES - 1,
          rot: pos[2],
          color: color_temp,
          frame,
        });
        if (ent.data.display_name) {
          uiGetFont().drawSizedAligned(glov_font.styleAlpha(glov_font.styleColored(null, 0x00000080), color_temp[3]),
            pos[0], pos[1] - 64, Z.SPRITES - 1,
            uiTextHeight(), glov_font.ALIGN.HCENTER, 0, 0,
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

    entity_manager.actionListFlush();
  }

  function testInit(dt: number): void {
    engine.setState(test);
    if (!ROOM_REQUIRES_LOGIN) {
      netSubs().onceConnected(getRoom);
    }

    netSubs().onLogin(getRoom);

    test(dt);
  }

  initGraphics();
  engine.setState(testInit);
}
