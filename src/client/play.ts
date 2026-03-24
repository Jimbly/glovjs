import assert from 'assert';
import { autoResetSkippedFrames } from 'glov/client/auto_reset';
import { cmd_parse } from 'glov/client/cmds';
import * as engine from 'glov/client/engine';
import { ClientEntityManagerInterface } from 'glov/client/entity_manager_client';
import {
  ALIGN,
  Font,
  fontStyle,
  fontStyleAlpha,
} from 'glov/client/font';
import * as input from 'glov/client/input';
import {
  keyDown,
  keyDownEdge,
  KEYS,
  keyUpEdge,
  PAD,
  padButtonUpEdge,
} from 'glov/client/input';
import { ClientChannelWorker, netSubs } from 'glov/client/net';
import * as settings from 'glov/client/settings';
import {
  settingsRegister,
  settingsSet,
} from 'glov/client/settings';
import {
  Sprite,
  spriteCreate,
} from 'glov/client/sprites';
import {
  ButtonStateString,
  buttonText,
  drawBox,
  drawRect2,
  modalDialog,
  playUISound,
  uiButtonWidth,
  uiGetFont,
  uiTextHeight,
} from 'glov/client/ui';
import { webFSAPI } from 'glov/client/webfs';
import {
  EntityID,
  TSMap,
} from 'glov/common/types';
import { clamp, easeIn, easeOut, ridx } from 'glov/common/util';
import {
  JSVec2,
  JSVec3,
  v3iAddScale,
  v3iNormalize,
  v3iScale,
  v3set,
  v4set,
  Vec2,
  vec3,
  Vec3,
  vec4,
} from 'glov/common/vmath';
import {
  CrawlerLevel,
  crawlerLoadData,
  dirMod,
} from '../common/crawler_state';
import {
  aiDoFloor, aiTraitsClientStartup,
} from './ai';
import { blend } from './blend';
// import './client_cmds';
import {
  buildModeActive,
  crawlerBuildModeUI,
} from './crawler_build_mode';
import {
  crawlerCommStart,
  crawlerCommWant,
} from './crawler_comm';
import {
  controllerOnBumpEntity,
  CrawlerController,
  crawlerControllerTouchHotzonesAuto,
} from './crawler_controller';
import {
  crawlerEntFactory,
  crawlerEntityClientStartupEarly,
  crawlerEntityManager,
  crawlerEntityTraitsClientStartup,
  crawlerMyEnt,
  crawlerMyEntOptional,
} from './crawler_entity_client';
import {
  crawlerMapViewDraw,
  crawlerMapViewStartup,
  mapViewActive,
  mapViewSetActive,
  mapViewToggle,
} from './crawler_map_view';
import {
  crawlerBuildModeActivate,
  crawlerController,
  crawlerGameState,
  crawlerPlayBottomOfFrame,
  crawlerPlayInitOffline,
  crawlerPlayStartup,
  crawlerPlayTopOfFrame,
  crawlerPlayWantMode,
  crawlerPrepAndRenderFrame,
  crawlerSaveGame,
  crawlerScriptAPI,
  crawlerTurnBasedMovePreStart,
  getScaledFrameDt,
} from './crawler_play';
import {
  crawlerRenderViewportSet,
  renderSet3DOffset,
  renderSetScreenShake,
  renderViewportShear,
} from './crawler_render';
import {
  crawlerEntInFront,
  crawlerRenderEntitiesStartup,
  EntityDrawableSprite,
} from './crawler_render_entities';
import { crawlerScriptAPIDummyServer } from './crawler_script_api_client';
import { crawlerOnScreenButton } from './crawler_ui';
import { dialogNameRender } from './dialog_data';
import { dialogMoveLocked, dialogReset, dialogRun, dialogStartup } from './dialog_system';
import {
  EntityClient,
  entityManager,
  gameEntityTraitsClientStartup,
} from './entity_game_client';
import {
  game_height,
  game_width,
  MOVE_BUTTON_H,
  MOVE_BUTTON_W,
  render_height,
  render_width,
  VIEWPORT_X0,
  VIEWPORT_Y0,
} from './globals';
import { levelGenTest } from './level_gen_test';
import { chatUI } from './main';
import { tickMusic } from './music';
import { renderAppStartup } from './render_app';
import { SOUND_DATA } from './sound_data';
import {
  statusPush,
  statusTick,
} from './status';
import { uiActionClear, uiActionCurrent, uiActionTick } from './uiaction';
import { pauseMenuActive, pauseMenuOpen } from './uiaction_pause_menu';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { atan2, floor, max, min, random, round, PI } = Math;

declare module 'glov/client/settings' {
  export let ai_pause: 0 | 1; // TODO: move to ai.ts
  export let show_fps: 0 | 1;
  export let turn_toggle: 0 | 1;
}

// const ATTACK_WINDUP_TIME = 1000;
const MINIMAP_RADIUS = 3;
const MINIMAP_X = VIEWPORT_X0 + render_width + 2;
const MINIMAP_Y = 3;
const MINIMAP_W = 5+7*(MINIMAP_RADIUS*2 + 1);
const MINIMAP_H = MINIMAP_W;
const MINIMAP_STEP_SIZE = 6;
const MINIMAP_TILE_SIZE = MINIMAP_STEP_SIZE * 7/6;
const FULLMAP_STEP_SIZE = MINIMAP_STEP_SIZE;
const FULLMAP_TILE_SIZE = FULLMAP_STEP_SIZE * 7/6;
const COMPASS_X = MINIMAP_X;
const COMPASS_Y = MINIMAP_Y + MINIMAP_H;
const DO_COMPASS = true;
const DO_MOVEMENT_BUTTONS = true;

const DIALOG_RECT = {
  x: VIEWPORT_X0 + 8,
  w: render_width - 16,
  y: VIEWPORT_Y0,
  h: render_height + 4,
};

type Entity = EntityClient;

let font: Font;

let controller: CrawlerController;

let button_sprites: Record<ButtonStateString, Sprite>;
let button_sprites_down: Record<ButtonStateString, Sprite>;
let button_sprites_notext: Record<ButtonStateString, Sprite>;
let button_sprites_notext_down: Record<ButtonStateString, Sprite>;
type BarSprite = {
  bg: Sprite;
  hp: Sprite;
  empty: Sprite;
};
let bar_sprites: {
  healthbar: BarSprite;
};

const style_text = fontStyle(null, {
  color: 0xFFFFFFff,
  outline_width: 4,
  outline_color: 0x000000ff,
});
const style_damage = style_text;

export function myEnt(): Entity {
  return crawlerMyEnt() as Entity;
}

export function myEntOptional(): Entity | undefined {
  return crawlerMyEntOptional() as Entity | undefined;
}

function randInt(range: number): number {
  return floor(random() * range);
}

function drawBar(
  bar: BarSprite,
  x: number, y: number, z: number,
  w: number, h: number,
  p: number,
): void {
  const MIN_VIS_W = 4;
  let full_w = round(p * w);
  if (p > 0 && p < 1) {
    full_w = clamp(full_w, MIN_VIS_W, w - MIN_VIS_W/2);
  }
  let empty_w = w - full_w;
  drawBox({
    x, y, z,
    w, h,
  }, bar.bg, 1);
  if (full_w) {
    drawBox({
      x, y,
      w: full_w, h,
      z: z + 1,
    }, bar.hp, 1);
  }
  if (empty_w) {
    let temp_x = x + full_w;
    if (full_w) {
      temp_x -= 2;
      empty_w += 2;
    }
    drawBox({
      x: temp_x, y,
      w: empty_w, h,
      z: z + 1,
    }, bar.empty, 1);
  }
}

export function drawHealthBar(
  x: number, y: number, z: number,
  w: number, h: number,
  hp: number, hp_max: number,
  show_text: boolean
): void {
  drawBar(bar_sprites.healthbar, x, y, z, w, h, clamp(hp / hp_max, 0, 1));
  if (show_text) {
    font.drawSizedAligned(style_text, x, y + (settings.pixely > 1 ? 0.5 : 0), z+2,
      h*32/48, ALIGN.HVCENTERFIT,
      w, h, `${floor(hp)}`);
  }
}

const HP_BAR_W = 60;
const HP_BAR_H = 12;
const HP_X = VIEWPORT_X0 + floor((render_width - HP_BAR_W)/2);
const HP_Y = VIEWPORT_Y0 + render_height - HP_BAR_H - 8;
let color_temp = vec4();
type IncomingDamage = {
  start: number;
  msg: string;
  from: number; // 0 = front, 1 = right, 2 = back, etc
  pos?: JSVec2;
};
let incoming_damage: IncomingDamage[] = [];
const DAMAGE_HEIGHT = floor(render_height / 16);
const DAMAGE_GRID_CELLS = 7;
const DAMAGE_GRID_CELL_W = render_width / DAMAGE_GRID_CELLS;
const DAMAGED_GRID_PREF: JSVec2[] = [
  [floor(DAMAGE_GRID_CELLS/2), 1],
  [DAMAGE_GRID_CELLS - 1, 2],
  [floor(DAMAGE_GRID_CELLS/2), 1],
  [0, 2],
];
let screen_shake = 0;
function drawStatsOverViewport(): void {
  let my_ent = myEnt();
  assert(my_ent.isMe());
  let { hp, hp_max } = my_ent.data.stats;
  drawHealthBar(HP_X, HP_Y, my_ent.isAlive() ? Z.UI : Z.CONTROLLER_FADE - 3,
    HP_BAR_W, HP_BAR_H, blend('myhp', hp), hp_max, true);

  // Draw damage "floaters" on us, but on the UI layer
  if (autoResetSkippedFrames('incoming_damage')) {
    incoming_damage.length = 0;
  }
  let blink = 1;
  let used_pos: undefined | TSMap<true>;
  for (let ii = incoming_damage.length - 1; ii >= 0; --ii) {
    let floater = incoming_damage[ii];
    const { from } = floater;
    let elapsed = engine.frame_timestamp - floater.start;
    const FLOATER_TIME = 750; // not including fade
    const FLOATER_FADE = 250;
    const BLINK_TIME = 250;
    let alpha = 1;
    if (elapsed > FLOATER_TIME) {
      alpha = 1 - (elapsed - FLOATER_TIME) / FLOATER_FADE;
      if (alpha <= 0) {
        ridx(incoming_damage, ii);
        continue;
      }
    }

    if (!floater.pos) {
      if (!used_pos) {
        used_pos = {};
        for (let jj = 0; jj < incoming_damage.length; ++jj) {
          let other = incoming_damage[jj];
          if (other.pos) {
            used_pos[other.pos.join(',')] = true;
          }
        }
      }
      let start_pos = DAMAGED_GRID_PREF[from];
      if (!used_pos[start_pos.join(',')]) {
        floater.pos = start_pos;
      } else {
        // choose an open position if something is already in the preferred spot
        let tries = 5;
        do {
          let pos: JSVec2;
          if (from === 0) {
            pos = [
              start_pos[0] + (randInt(5) - 2) / 2,
              start_pos[1] + randInt(2),
            ];
          } else if (from === 1 || from === 3) {
            pos = [
              start_pos[0],
              start_pos[1] - 2 + randInt(5),
            ];
          } else {
            pos = [
              start_pos[0] + (randInt(3) - 1)/2,
              start_pos[1] - randInt(2),
            ];
          }
          if (!used_pos[pos.join(',')] || --tries < 0) {
            floater.pos = pos;
            break;
          }
        } while (true);
      }
    }

    if (elapsed < BLINK_TIME && floater.msg !== 'MISS') {
      blink = min(blink, elapsed / BLINK_TIME);
    }
    let float = 0.5 + 0.5 * easeOut(min(elapsed / 250, 1), 2);
    let floaty = easeOut(elapsed / (FLOATER_TIME + FLOATER_FADE), 2) * 10;
    let posx = VIEWPORT_X0 + (floater.pos[0] + 0.5) * DAMAGE_GRID_CELL_W;
    let posy = VIEWPORT_Y0 + render_height - (floater.pos[1] + 0.5) * DAMAGE_HEIGHT;
    font.drawSizedAligned(fontStyleAlpha(style_damage, alpha),
      posx - 400,
      posy + floaty, Z.FLOATERS,
      DAMAGE_HEIGHT * float, ALIGN.HVCENTER | ALIGN.HWRAP,
      800, 0, floater.msg);
  }
  if (blink < 1) {
    let v = easeOut(blink, 2);
    v4set(color_temp, 1, 0, 0, 0.5 * (1 - v));
    drawRect2({
      x: VIEWPORT_X0,
      y: VIEWPORT_Y0,
      w: render_width,
      h: render_height,
      z: Z.UI - 5,
      color: color_temp,
    });
    screen_shake = 1 - v;
  }
}

let attack_surges: {
  delta: Vec3;
  start: number;
}[] = [];
export function attackSurgeAdd(dx: number, dy: number, strength: number): void {
  let delta = vec3(dx, dy, 0);
  v3iNormalize(delta);
  v3iScale(delta, strength);
  attack_surges.push({
    delta,
    start: engine.frame_timestamp,
  });
}

const ATTACK_TIME = 250;
const ATTACK_IN_PORTION = 0.3;
let attack_camera_offs = vec3();
function calcAttackCameraOffs(): Vec3 {
  if (autoResetSkippedFrames('attack_surges')) {
    attack_surges.length = 0;
  }
  let now = engine.frame_timestamp;
  v3set(attack_camera_offs, 0, 0, 0);
  for (let ii = attack_surges.length - 1; ii >= 0; --ii) {
    let surge = attack_surges[ii];
    let t = now - surge.start;
    if (t >= ATTACK_TIME) {
      ridx(attack_surges, ii);
      continue;
    }
    t /= ATTACK_TIME;
    if (t < ATTACK_IN_PORTION) {
      t /= ATTACK_IN_PORTION;
      t = easeOut(t, 2);
    } else {
      t = 1 - (t - ATTACK_IN_PORTION) / (1 - ATTACK_IN_PORTION);
      t = easeIn(t, 2);
    }
    v3iAddScale(attack_camera_offs, surge.delta, t * 0.22);
  }
  return attack_camera_offs;
}

const ENEMY_HP_BAR_W = render_width / 4;
const ENEMY_HP_BAR_X = (render_width - ENEMY_HP_BAR_W)/2;
const ENEMY_HP_BAR_Y = VIEWPORT_Y0 + 8;
const ENEMY_HP_BAR_H = HP_BAR_H * 0.75;
function drawEnemyStats(ent: Entity): void {
  let stats = ent.data.stats;
  if (!stats) {
    return;
  }
  let { hp, hp_max } = stats;
  let bar_h = ENEMY_HP_BAR_H;
  let show_text = true;
  drawHealthBar(ENEMY_HP_BAR_X, ENEMY_HP_BAR_Y, Z.UI, ENEMY_HP_BAR_W, bar_h,
    blend(`enemyhp${ent.id}`, hp), hp_max, show_text);
  if (ent.display_name) {
    font.drawSizedAligned(style_text, ENEMY_HP_BAR_X, ENEMY_HP_BAR_Y + bar_h, Z.UI,
      uiTextHeight(), ALIGN.HVCENTERFIT,
      ENEMY_HP_BAR_W, bar_h, ent.display_name);
  }
}

function doEngagedEnemy(): void {
  let game_state = crawlerGameState();
  let level = game_state.level;
  if (
    !level ||
    crawlerController().controllerIsAnimating(0.75) ||
    controller.transitioning_floor
  ) {
    return;
  }
  let entities = entityManager().entities;
  let ent_in_front = crawlerEntInFront();
  if (ent_in_front && myEnt().isAlive()) {
    let target_ent = entities[ent_in_front]!;
    if (target_ent) {
      drawEnemyStats(target_ent);
    }
  }
}

function moveBlocked(): boolean {
  return false;
}

// TODO: move into crawler_play?
export function addFloater(ent_id: EntityID, message: string | null, anim: string): void {
  let ent = crawlerEntityManager().getEnt(ent_id);
  if (ent) {
    if (message) {
      if (!ent.floaters) {
        ent.floaters = [];
      }
      ent.floaters.push({
        start: engine.frame_timestamp,
        msg: message,
      });
    }
    if (ent.triggerAnimation) {
      ent.triggerAnimation(anim);
    }
  }
}

export function autosave(): void {
  if (engine.defines.NOAUTOSAVE) {
    statusPush('Skipped auto-save.');
    return;
  }
  crawlerSaveGame('auto');
  statusPush('Auto-saved.');
}

export function attackPlayer(source: Entity, target: Entity, message: string): void {
  assert.equal(myEnt(), target);
  let dx = source.data.pos[0] - target.data.pos[0];
  let dy = source.data.pos[1] - target.data.pos[1];
  let abs_angle = round(1 - atan2(dx, dy) / (PI/2));
  let rot = dirMod(-abs_angle + crawlerController().getEffRot() + 8);
  incoming_damage.push({
    start: engine.frame_timestamp,
    msg: message,
    from: rot,
  });

  let dss = (source as unknown as EntityDrawableSprite).drawable_sprite_state;
  dss.surge_at = engine.frame_timestamp;
  dss.surge_time = 250;
}

function moveBlockDead(): boolean {
  controller.setFadeOverride(0.75);

  const BORDER_PAD = 32;
  let y = VIEWPORT_Y0;
  let w = render_width - BORDER_PAD * 2;
  let x = VIEWPORT_X0 + BORDER_PAD;
  let h = render_height;
  let z = Z.UI + 20;

  font.drawSizedAligned(null,
    x + floor(w/2), y + floor(h/2) - 16, z,
    uiTextHeight(), ALIGN.HCENTER|ALIGN.VBOTTOM,
    0, 0, 'You have died.');

  if (buttonText({
    x: x + floor(w/2 - uiButtonWidth()/2), y: y + floor(h/2), z,
    text: 'Respawn',
  })) {
    myEnt().data.stats.hp = myEnt().data.stats.hp_max;
    controller.goToFloor(0, 'stairs_in', 'respawn');
  }

  return true;
}

export function playSoundFromEnt(ent: Entity, sound_id: keyof typeof SOUND_DATA): void {
  let pos = ent.getData<JSVec3>('pos')!;

  playUISound(sound_id, {
    pos: [pos[0] + 0.5, pos[1] + 0.5, 0.5],
    volume: 1,
  });
}

function bumpEntityCallback(ent_id: EntityID): void {
  let me = myEnt();
  let all_entities = entityManager().entities;
  let target_ent = all_entities[ent_id]!;
  if (target_ent && target_ent.isAlive() && target_ent.isEnemy() && me.isAlive()) {
    addFloater(ent_id, 'POW!', '');
    attackSurgeAdd(target_ent.data.pos[0] - me.data.pos[0], target_ent.data.pos[1] - me.data.pos[1], 1);
    // crawlerTurnBasedScheduleStep(250, 'attack');
  }
}

const MOVE_BUTTONS_X0 = MINIMAP_X;
const MOVE_BUTTONS_Y0 = 179;


function useNoText(): boolean {
  return input.inputTouchMode() || input.inputPadMode() || settings.turn_toggle;
}

function playCrawl(): void {
  profilerStartFunc();

  if (!controller.canRun()) {
    return profilerStopFunc();
  }

  const is_dead = !myEnt().isAlive();
  if (!controller.hasMoveBlocker() && is_dead) {
    controller.setMoveBlocker(moveBlockDead);
  }

  let down = {
    menu: 0,
  };
  type ValidKeys = keyof typeof down;
  let up_edge: Record<ValidKeys, number> = {
    menu: 0,
  };

  let dt = getScaledFrameDt();

  const frame_map_view = mapViewActive();
  const is_fullscreen_ui = uiActionCurrent()?.is_fullscreen_ui;
  let dialog_viewport = {
    ...DIALOG_RECT,
    z: Z.STATUS,
    pad_top: 2,
    pad_bottom: 4,
    pad_bottom_with_buttons: 4,
    pad_lr: 4,
  };
  if (is_fullscreen_ui || frame_map_view) {
    dialog_viewport.x = 0;
    dialog_viewport.w = game_width;
    dialog_viewport.y = 0;
    dialog_viewport.h = game_height - 3;
    dialog_viewport.z = Z.MODAL + 100;
  }
  dialogRun(dt, dialog_viewport, false);

  const build_mode = buildModeActive();
  let locked_dialog = dialogMoveLocked();
  const overlay_menu_up = uiActionCurrent()?.is_overlay_menu || is_dead || false;
  let minimap_display_h = build_mode ? MOVE_BUTTON_W : MINIMAP_H;
  let show_compass = !build_mode && DO_COMPASS;
  let compass_h = show_compass ? 11 : 0;

  if (build_mode && !controller.ignoreGameplay()) {
    let build_y = MINIMAP_Y + minimap_display_h + 2;
    crawlerBuildModeUI({
      x: MINIMAP_X,
      y: build_y,
      w: game_width - MINIMAP_X - 2,
      h: MOVE_BUTTONS_Y0 - build_y - 2,
      map_view: frame_map_view,
    });
  }


  let button_x0: number;
  let button_y0: number;

  let disabled = controller.hasMoveBlocker();

  function crawlerButton(
    rx: number, ry: number,
    frame: number,
    key: ValidKeys,
    keys: number[],
    pads: number[],
    toggled_down?: boolean
  ): void {
    if (is_dead) {
      return;
    }
    let z = Z.UI;
    let no_visible_ui = frame_map_view;
    let my_disabled = disabled;
    if (key === 'menu') {
      no_visible_ui = false;
      if (frame_map_view) {
        z = Z.MAP + 1;
      } else if (pauseMenuActive()) {
        z = Z.MODAL + 1;
      } else {
        z = Z.MENUBUTTON;
      }
      if (overlay_menu_up && !toggled_down) {
        my_disabled = true;
      }
    } else {
      if (overlay_menu_up && toggled_down) {
        no_visible_ui = true;
      } else {
        my_disabled = my_disabled || overlay_menu_up;
      }
    }
    // font.draw({
    //   style: style_text,
    //   x: button_x0 + (BUTTON_W + 2) * rx,
    //   y: button_y0 + (BUTTON_H + 2) * ry,
    //   z: z + 1,
    //   w: BUTTON_W, h: BUTTON_H,
    //   align: ALIGN.HVCENTERFIT | ALIGN.HWRAP,
    //   text: label,
    // });
    let ret = crawlerOnScreenButton({
      x: button_x0 + (MOVE_BUTTON_W + 2) * rx,
      y: button_y0 + (MOVE_BUTTON_H + 2) * ry,
      z,
      w: MOVE_BUTTON_W, h: MOVE_BUTTON_H,
      frame,
      keys,
      pads,
      no_visible_ui,
      do_up_edge: true,
      disabled: my_disabled,
      button_sprites: useNoText() ?
        toggled_down ? button_sprites_notext_down : button_sprites_notext :
        toggled_down ? button_sprites_down : button_sprites,
      is_movement: false,
      show_hotkeys: false,
    });
    // down_edge[key] += ret.down_edge;
    down[key] += ret.down;
    up_edge[key] += ret.up_edge;
  }


  // Escape / open/close menu button - *before* pauseMenu()
  button_x0 = 317;
  button_y0 = 3;
  let menu_up = frame_map_view || build_mode || overlay_menu_up;
  let menu_keys = [KEYS.ESC];
  let menu_pads = [PAD.START];
  if (menu_up) {
    menu_pads.push(PAD.B, PAD.BACK);
  }
  crawlerButton(0, 0, menu_up ? 10 : 6,
    'menu', menu_keys, menu_pads, pauseMenuActive());
  // if (!build_mode) {
  //   crawlerButton(0, 1, 7, 'inv', [KEYS.I], [PAD.Y], inventory_up);
  //   if (up_edge.inv) {
  //     inventory_up = !inventory_up;
  //   }
  // }

  uiActionTick();

  // Note: moved earlier so player motion doesn't interrupt it
  if (!frame_map_view) {
    if (!build_mode) {
      // Do game UI/stats here
      drawStatsOverViewport();
      doEngagedEnemy();
      // crawlerButton(2, 0, inventory_frame, 'inventory', [KEYS.I], []);
    }
    // Do modal UIs here
  } else {
    if (input.click({ button: 2 })) {
      mapViewToggle();
    }
  }

  button_x0 = MOVE_BUTTONS_X0;
  button_y0 = MOVE_BUTTONS_Y0;

  // Check for intentional events
  // if (!build_mode) {
  //   crawlerButton(2, -3, 7, 'inventory', [KEYS.I], [PAD.X], inventory_up);
  // }
  //
  // if (up_edge.inventory) {
  //   if (cur_action) {
  //     uiActionClear();
  //   } else {
  //     inventoryOpen();
  //   }
  // }

  profilerStart('doPlayerMotion');
  controller.doPlayerMotion({
    dt,
    button_x0: MOVE_BUTTONS_X0,
    button_y0: MOVE_BUTTONS_Y0,
    no_visible_ui: frame_map_view || build_mode || !DO_MOVEMENT_BUTTONS,
    button_w: MOVE_BUTTON_W,
    button_sprites: useNoText() ? button_sprites_notext : button_sprites,
    disable_move: moveBlocked() || overlay_menu_up,
    disable_player_impulse: Boolean(locked_dialog),
    show_buttons: !locked_dialog,
    do_debug_move: engine.defines.LEVEL_GEN || build_mode,
    show_debug: settings.show_fps ? { x: VIEWPORT_X0, y: VIEWPORT_Y0 + (build_mode ? 3 : 0) } : null,
    show_hotkeys: false,
    but_allow_rotate: false,
  });
  profilerStop();

  button_x0 = MOVE_BUTTONS_X0;
  button_y0 = MOVE_BUTTONS_Y0;

  let build_mode_allowed = engine.DEBUG || chatUI().getAccessObj().access?.sysadmin;
  if (build_mode_allowed && keyUpEdge(KEYS.B)) {
    if (!netSubs().loggedIn()) {
      modalDialog({
        text: 'Cannot enter build mode - not logged in',
        buttons: { ok: null },
      });
    } else if (!build_mode_allowed) {
      modalDialog({
        text: 'Cannot enter build mode - access denied',
        buttons: { ok: null },
      });
    } else {
      crawlerBuildModeActivate(!build_mode);
      if (crawlerCommWant()) {
        return profilerStopFunc();
      }
      uiActionClear();
    }
  }

  if (up_edge.menu) {
    if (menu_up) {
      if (build_mode && mapViewActive()) {
        mapViewSetActive(false);
        // but stay in build mode
      } else if (build_mode) {
        crawlerBuildModeActivate(false);
      } else if (uiActionCurrent()?.esc_cancels) {
        uiActionClear();
      } else {
        // close everything
        mapViewSetActive(false);
        // inventory_up = false;
      }
      if (pauseMenuActive()) {
        uiActionClear();
      }
    } else {
      pauseMenuOpen();
    }
  }

  if (!overlay_menu_up && (keyDownEdge(KEYS.M) || padButtonUpEdge(PAD.BACK))) {
    playUISound('button_click');
    mapViewToggle();
  }
  // inventoryMenu();
  let game_state = crawlerGameState();
  let script_api = crawlerScriptAPI();
  if (frame_map_view) {
    if (engine.defines.LEVEL_GEN) {
      if (levelGenTest(game_state)) {
        controller.initPosFromLevelDebug();
      }
    }
    crawlerMapViewDraw({
      game_state,
      x: 0,
      y: 0,
      w: game_width,
      h: game_height,
      step_size: FULLMAP_STEP_SIZE,
      tile_size: FULLMAP_TILE_SIZE,
      compass_x: floor((game_width - MINIMAP_W)/2),
      compass_y: 2,
      compass_w: 0,
      compass_h: 0, // note: compass ignored, compass_h = 0
      z: Z.MAP,
      level_gen_test: engine.defines.LEVEL_GEN,
      script_api,
      button_disabled: overlay_menu_up,
    });
  } else {
    crawlerMapViewDraw({
      game_state,
      x: MINIMAP_X,
      y: MINIMAP_Y,
      w: MINIMAP_W,
      h: minimap_display_h,
      step_size: MINIMAP_STEP_SIZE,
      tile_size: MINIMAP_TILE_SIZE,
      compass_x: COMPASS_X,
      compass_y: COMPASS_Y,
      compass_w: 0,
      compass_h,
      z: Z.MAP,
      level_gen_test: false,
      script_api,
      button_disabled: overlay_menu_up,
    });
  }

  statusTick(dialog_viewport);

  profilerStopFunc();
}

export function play(dt: number): void {
  let game_state = crawlerGameState();
  if (crawlerCommWant()) {
    // Must have been disconnected?
    crawlerCommStart();
    return;
  }

  screen_shake = 0;

  let overlay_menu_up = Boolean(uiActionCurrent()?.is_overlay_menu || dialogMoveLocked());

  tickMusic(game_state.level?.props.music as string || null); // || 'default_music'
  crawlerPlayTopOfFrame(overlay_menu_up, false);

  if (keyDownEdge(KEYS.F3)) {
    settingsSet('show_fps', 1 - settings.show_fps);
  }
  if (keyDownEdge(KEYS.F)) {
    settingsSet('filter', 1 - settings.filter);
  }
  if (keyDownEdge(KEYS.G)) {
    const types = ['instant', 'instantblend', 'queued', 'queued2'];
    let type_idx = types.indexOf(controller.getControllerType());
    type_idx = (type_idx + (keyDown(KEYS.SHIFT) ? -1 : 1) + types.length) % types.length;
    controller.setControllerType(types[type_idx]);
    statusPush(`Controller: ${types[type_idx]}`);
  }

  playCrawl();

  if (0) {
    let shear = clamp(input.mousePos()[0]/game_width* 2 - 1, -1, 1);
    renderViewportShear(shear);
    font.draw({
      x: 100, y: 100,
      z: 1000,
      text: `${shear}`,
    });
  } else {
    renderViewportShear(-0.2); // Game preference
  }

  renderSet3DOffset(calcAttackCameraOffs());
  renderSetScreenShake(screen_shake);
  crawlerPrepAndRenderFrame(false);

  if (!buildModeActive() && game_state.floor_id >= 0) {
    let script_api = crawlerScriptAPI();
    script_api.is_visited = true; // Always visited for AI
    aiDoFloor({
      floor_id: game_state.floor_id,
      game_state,
      entity_manager: entityManager(),
      defines: engine.defines,
      ai_pause: Boolean(settings.ai_pause || engine.defines.LEVEL_GEN || overlay_menu_up),
      script_api,
      distance_limit: Infinity,
      payload: {
        reason: 'realtime',
      },
    });
  }

  crawlerPlayBottomOfFrame();
}

function onPlayerMove(old_pos: Vec2, new_pos: Vec2): void {
  // let game_state = crawlerGameState();
  // aiOnPlayerMoved(game_state, myEnt(), old_pos, new_pos,
  //   settings.ai_pause || engine.defines.LEVEL_GEN, script_api);
  crawlerTurnBasedMovePreStart();
}

function onInitPos(): void {
  // autoAttackCancel();
}

function playInitShared(online: boolean): void {
  controller = crawlerController();

  controller.setOnPlayerMove(onPlayerMove);
  controller.setOnInitPos(onInitPos);

  uiActionClear();
}


function playOfflineLoading(): void {
  // TODO
}

function playInitOffline(): void {
  playInitShared(false);
}

function playInitEarly(room: ClientChannelWorker): void {

  // let room_public_data = room.getChannelData('public') as { seed: string };
  // game_state.setSeed(room_public_data.seed);

  playInitShared(true);
}

export function restartFromLastSave(): void {
  crawlerPlayWantMode('recent');
  crawlerPlayInitOffline();
}

settingsRegister({
  ai_pause: {
    // access_show: ['sysadmin'],
    default_value: 0,
    type: cmd_parse.TYPE_INT,
    range: [0, 1],
  },
  turn_toggle: {
    default_value: 0,
    type: cmd_parse.TYPE_INT,
    range: [0, 1],
  },
});

cmd_parse.register({
  cmd: 'save',
  help: 'Immediately trigger an auto-save',
  func: function (str, resp_func) {
    autosave();
    resp_func();
  },
});

function initLevel(cem: ClientEntityManagerInterface<Entity>, floor_id: number, level: CrawlerLevel): void {
  dialogReset();
}

export function playStartup(): void {
  font = uiGetFont();
  crawlerScriptAPIDummyServer(true); // No script API running on server
  crawlerPlayStartup({
    // on_broadcast: onBroadcast,
    play_init_online: playInitEarly,
    play_init_offline: playInitOffline,
    offline_data: {
      new_player_data: {
        type: 'player',
        pos: [0, 0, 0],
        floor: 0,
        stats: { hp: 10, hp_max: 10 },
      },
      loading_state: playOfflineLoading,
    },
    play_state: play,
    on_init_level_offline: initLevel,
    on_init_level_online: initLevel,
    default_vstyle: 'demo',
    allow_offline_console: engine.DEBUG,
    chat_ui_param: {
      x: 3,
      y_bottom: game_height,
      border: 2,
      scroll_grow: 2,
      cuddly_scroll: true,
    },
    chat_as_message_log: false,
  });
  crawlerEntityClientStartupEarly();
  let ent_factory = crawlerEntFactory<Entity>();
  gameEntityTraitsClientStartup(ent_factory);
  aiTraitsClientStartup();
  crawlerEntityTraitsClientStartup({
    name: 'EntityClient',
    Ctor: EntityClient,
  });
  crawlerRenderEntitiesStartup(font);
  crawlerRenderViewportSet({
    x: VIEWPORT_X0,
    y: VIEWPORT_Y0,
    w: render_width,
    h: render_height,
  });
  crawlerControllerTouchHotzonesAuto();
  // crawlerRenderSetUIClearColor(dawnbringer.colors[14]);

  let button_param = {
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
    ws: [26, 26, 26],
    hs: [26, 26, 26, 26],
  };
  button_sprites = {
    regular: spriteCreate({
      name: 'crawler_buttons/buttons',
      ...button_param,
    }),
    down: spriteCreate({
      name: 'crawler_buttons/buttons_down',
      ...button_param,
    }),
    rollover: spriteCreate({
      name: 'crawler_buttons/buttons_rollover',
      ...button_param,
    }),
    disabled: spriteCreate({
      name: 'crawler_buttons/buttons_disabled',
      ...button_param,
    }),
  };
  button_sprites_down = {
    regular: button_sprites.down,
    down: button_sprites.regular,
    rollover: button_sprites.rollover,
    disabled: button_sprites.disabled,
  };
  button_sprites_notext = {
    regular: spriteCreate({
      name: 'crawler_buttons/buttons_notext',
      ...button_param,
    }),
    down: spriteCreate({
      name: 'crawler_buttons/buttons_notext_down',
      ...button_param,
    }),
    rollover: spriteCreate({
      name: 'crawler_buttons/buttons_notext_rollover',
      ...button_param,
    }),
    disabled: spriteCreate({
      name: 'crawler_buttons/buttons_notext_disabled',
      ...button_param,
    }),
  };
  button_sprites_notext_down = {
    regular: button_sprites_notext.down,
    down: button_sprites_notext.regular,
    rollover: button_sprites_notext.rollover,
    disabled: button_sprites_notext.disabled,
  };

  let bar_param = {
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
    ws: [2, 4, 2],
    hs: [2, 4, 2],
  };
  let healthbar_bg = spriteCreate({
    name: 'crawler_healthbar_bg',
    ...bar_param,
  });
  bar_sprites = {
    healthbar: {
      bg: healthbar_bg,
      hp: spriteCreate({
        name: 'crawler_healthbar_hp',
        ...bar_param,
      }),
      empty: spriteCreate({
        name: 'crawler_healthbar_empty',
        ...bar_param,
      }),
    },
  };

  controllerOnBumpEntity(bumpEntityCallback);

  renderAppStartup();
  dialogStartup({
    font,
    // text_style_cb: dialogTextStyle,
    name_render_cb: dialogNameRender,
  });
  crawlerLoadData(webFSAPI());
  crawlerMapViewStartup({
    allow_pathfind: true,
    // color_rollover: dawnbringer.colors[8],
    build_mode_entity_icons: {},
    // style_map_name: fontStyle(...)
    compass_border_w: 6,
  });
}
