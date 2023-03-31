import * as engine from 'glov/client/engine';
import {
  ALIGN,
  Font,
} from 'glov/client/font';
import * as input from 'glov/client/input';
import {
  KEYS,
  PAD,
  keyDownEdge,
  keyUpEdge,
} from 'glov/client/input';
import { MenuItem } from 'glov/client/selection_box';
import * as settings from 'glov/client/settings';
import { SimpleMenu, simpleMenuCreate } from 'glov/client/simple_menu';
import {
  spotSuppressPad,
} from 'glov/client/spot';
import {
  Sprite,
  spriteCreate,
} from 'glov/client/sprites';
import * as ui from 'glov/client/ui';
import {
  ButtonStateString,
  isMenuUp,
} from 'glov/client/ui';
import * as urlhash from 'glov/client/urlhash';
import walltime from 'glov/client/walltime';
import { webFSAPI } from 'glov/client/webfs';
import {
  TraitFactory,
  traitFactoryCreate,
} from 'glov/common/trait_factory';
import {
  ClientChannelWorker,
  DataObject,
  EntityID,
} from 'glov/common/types';
import {
  Vec2,
} from 'glov/common/vmath';
import {
  crawlerLoadData,
} from '../common/crawler_state';
import {
  aiDoFloor, aiTraitsClientStartup,
} from './ai';
// import './client_cmds';
import { buildModeActive, crawlerBuildModeUI } from './crawler_build_mode';
import {
  crawlerCommStart,
  crawlerCommWant,
  getChatUI,
} from './crawler_comm';
import { CrawlerController } from './crawler_controller';
import {
  EntityCrawlerClient,
  crawlerEntityManager,
  crawlerEntityTraitsClientStartup,
  crawlerMyEnt,
  isLocal,
  isOnline,
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
  crawlerPlayStartup,
  crawlerRenderFrame,
  crawlerRenderFramePrep,
  crawlerSaveGame,
  crawlerScriptAPI,
  getScaledFrameDt,
} from './crawler_play';
import {
  crawlerRenderViewportSet,
  renderPrep,
} from './crawler_render';
import {
  crawlerRenderEntitiesPrep,
  crawlerRenderEntitiesStartup,
} from './crawler_render_entities';
import { crawlerScriptAPIDummyServer } from './crawler_script_api_client';
import { crawlerOnScreenButton } from './crawler_ui';
import { EntityDemoClient, entityManager } from './entity_demo_client';
// import { EntityDemoClient } from './entity_demo_client';
import {
  game_height,
  game_width,
  render_height,
  render_width,
} from './globals';
import { levelGenTest } from './level_gen_test';
import { renderAppStartup, renderResetFilter } from './render_app';
import {
  statusTick,
} from './status';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { floor, max, min, round } = Math;

declare module 'glov/client/settings' {
  export let ai_pause: 0 | 1; // TODO: move to ai.ts
  export let show_fps: 0 | 1;
  export let volume: number;
}

// const ATTACK_WINDUP_TIME = 1000;
const MINIMAP_RADIUS = 3;
const MINIMAP_X = 261;
const MINIMAP_Y = 3;
const MINIMAP_W = 5+7*(MINIMAP_RADIUS*2 + 1);
const VIEWPORT_X0 = 3;
const VIEWPORT_Y0 = 3;

type Entity = EntityDemoClient;

let font: Font;

let frame_wall_time = 0;
let loading_level = false;

let controller: CrawlerController;

let pause_menu_up = false;

let button_sprites: Record<ButtonStateString, Sprite>;
let button_sprites_down: Record<ButtonStateString, Sprite>;

function myEnt(): Entity {
  return crawlerMyEnt() as Entity;
}

// function entityManager(): ClientEntityManagerInterface<Entity> {
//   return crawlerEntityManager() as ClientEntityManagerInterface<Entity>;
// }

const PAUSE_MENU_W = 160;
let pause_menu: SimpleMenu;
function pauseMenu(): void {
  if (!pause_menu) {
    pause_menu = simpleMenuCreate({
      x: (game_width - PAUSE_MENU_W)/2,
      y: 80,
      z: Z.MODAL + 2,
      width: PAUSE_MENU_W,
    });
  }
  let items: MenuItem[] = [{
    name: 'Return to game',
    cb: function () {
      pause_menu_up = false;
    },
  }, {
    name: 'Volume',
    //plus_minus: true,
    slider: true,
    value_inc: 0.05,
    value_min: 0,
    value_max: 1,
  }, {
    name: isOnline() ? 'Return to Title' : 'Save and Exit',
    cb: function () {
      if (!isOnline()) {
        crawlerSaveGame();
      }
      urlhash.go('');
    },
  }];
  if (isLocal()) {
    items.push({
      name: 'Exit without saving',
      cb: function () {
        urlhash.go('');
      },
    });
  }

  let volume_item = items[1];
  volume_item.value = settings.volume;
  volume_item.name = `Volume: ${(settings.volume * 100).toFixed(0)}`;

  pause_menu.run({
    slider_w: 80,
    items,
  });

  settings.set('volume', pause_menu.getItem(1).value);

  ui.menuUp();
}

function moveBlocked(): boolean {
  return false;
}

// TODO: move into crawler_play?
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function addFloater(ent_id: EntityID, message: string | null, anim: string): void {
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

function moveBlockDead(): boolean {
  controller.setFadeOverride(0.75);

  let y = VIEWPORT_Y0;
  let w = render_width;
  let x = VIEWPORT_X0;
  let h = render_height;
  let z = Z.UI;

  font.drawSizedAligned(null,
    x + w/2, y + h/2 - 16, z,
    ui.font_height, ALIGN.HCENTER|ALIGN.VBOTTOM,
    0, 0, 'You have died.');

  if (ui.buttonText({
    x: x + w/2 - ui.button_width/2, y: y + h/2, z,
    text: 'Respawn',
  })) {
    controller.goToFloor(0, 'stairs_in', 'respawn');
  }

  return true;
}

const BUTTON_W = 26;

const MOVE_BUTTONS_X0 = 261;
const MOVE_BUTTONS_Y0 = 179;

function playCrawl(): void {
  profilerStartFunc();

  let down = {
    menu: 0,
  };
  type ValidKeys = keyof typeof down;
  let up_edge = {
    menu: 0,
  } as Record<ValidKeys, number>;

  const build_mode = buildModeActive();
  let frame_map_view = mapViewActive();
  let minimap_display_h = build_mode ? BUTTON_W : MINIMAP_W;
  let show_compass = !build_mode;
  let compass_h = show_compass ? 11 : 0;
  let minimap_h = minimap_display_h + compass_h;

  if (build_mode && !controller.ignoreGameplay()) {
    let build_y = MINIMAP_Y + minimap_h + 2;
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

  function button(
    rx: number, ry: number,
    frame: number,
    key: ValidKeys,
    keys: number[],
    pads: number[],
    toggled_down?: boolean
  ): void {
    let z;
    let no_visible_ui = frame_map_view;
    let my_disabled = disabled;
    if (key === 'menu') {
      no_visible_ui = false;
      if (frame_map_view) {
        z = Z.MAP + 1;
      }
      if (pause_menu_up) {
        z = Z.MODAL + 1;
      }
    } else {
      my_disabled = my_disabled || pause_menu_up;
    }
    let ret = crawlerOnScreenButton({
      x: button_x0 + (BUTTON_W + 2) * rx,
      y: button_y0 + (BUTTON_W + 2) * ry,
      z,
      w: BUTTON_W, h: BUTTON_W,
      frame,
      keys,
      pads,
      no_visible_ui,
      do_up_edge: true,
      disabled: my_disabled,
      button_sprites: toggled_down ? button_sprites_down : button_sprites,
    });
    // down_edge[key] += ret.down_edge;
    down[key] += ret.down;
    up_edge[key] += ret.up_edge;
  }


  // Escape / open/close menu button - *before* pauseMenu()
  button_x0 = 317;
  button_y0 = 3;
  let menu_up = frame_map_view || build_mode || pause_menu_up;
  let menu_keys = [KEYS.ESC];
  button(0, 0, menu_up ? 10 : 6, 'menu', menu_keys, [PAD.BACK]);

  if (pause_menu_up) {
    pauseMenu();
  }

  controller.doPlayerMotion({
    dt: getScaledFrameDt(),
    button_x0: MOVE_BUTTONS_X0,
    button_y0: MOVE_BUTTONS_Y0,
    no_visible_ui: frame_map_view,
    button_w: BUTTON_W,
    button_sprites,
    disable_move: moveBlocked() || pause_menu_up,
    show_buttons: true,
    do_debug_move: engine.defines.LEVEL_GEN || build_mode,
    show_debug: Boolean(settings.show_fps),
  });

  button_x0 = MOVE_BUTTONS_X0;
  button_y0 = MOVE_BUTTONS_Y0;

  // Check for intentional events
  // if (!build_mode) {
  //   button(2, -3, 7, 'inventory', [KEYS.I], [PAD.X], inventory_up);
  // }
  //
  // if (up_edge.inventory) {
  //   inventory_up = !inventory_up;
  // }

  if (keyUpEdge(KEYS.B)) {
    crawlerBuildModeActivate(!build_mode);
  }

  if (up_edge.menu) {
    if (menu_up) {
      if (mapViewActive()) {
        mapViewSetActive(false);
      } else if (build_mode) {
        crawlerBuildModeActivate(false);
      } else {
        // close whatever other menu
      }
      pause_menu_up = false;
    } else {
      pause_menu_up = true;
    }
  }

  if (!frame_map_view) {
    if (!build_mode) {
      // Do game UI/stats here
    }
    // Do modal UIs here
  } else {
    if (input.click({ button: 2 })) {
      mapViewToggle();
    }
  }
  if (!pause_menu_up && keyDownEdge(KEYS.M)) {
    mapViewToggle();
  }
  let game_state = crawlerGameState();
  let script_api = crawlerScriptAPI();
  if (frame_map_view) {
    if (engine.defines.LEVEL_GEN) {
      if (levelGenTest(game_state)) {
        controller.initPosFromLevelDebug();
      }
    }
    crawlerMapViewDraw(game_state, 0, 0, game_width, game_height, 0, Z.MAP,
      engine.defines.LEVEL_GEN, script_api, pause_menu_up);
  } else {
    crawlerMapViewDraw(game_state, MINIMAP_X, MINIMAP_Y, MINIMAP_W, minimap_display_h, compass_h, Z.MAP,
      false, script_api, pause_menu_up);
  }

  statusTick(VIEWPORT_X0, VIEWPORT_Y0, Z.STATUS, render_width, render_height);

  profilerStopFunc();
}

function playerMotion(): void {
  if (!controller.canRun()) {
    return;
  }

  if (!controller.hasMoveBlocker() && !myEnt().isAlive()) {
    controller.setMoveBlocker(moveBlockDead);
  }

  playCrawl();

  if (settings.show_fps && !controller.getTransitioningFloor()) {
    // Debug UI
    // let y = ui.font_height * 3;
    // let z = Z.DEBUG;
    // ui.print(null, 0, y, z, `Walltime: ${frame_wall_time.toString().slice(-6)}`);
    // y += ui.font_height;
    // ui.print(null, 0, y, z, `Queue: ${queueLength()}${interp_queue[0].double_time ? ' double-time' : ''}`);
    // y += ui.font_height;
    // ui.print(null, 0, y, z, `Attack: ${frame_wall_time - queued_attack.start_time}/${queued_attack.windup}`);
    // y += ui.font_height;
  }
}

function drawEntitiesPrep(): void {
  crawlerRenderEntitiesPrep();
  let game_state = crawlerGameState();
  let level = game_state.level;
  if (!level) {
    // eslint-disable-next-line no-useless-return
    return; // still loading
  }
  // let game_entities = entityManager().entities;
  // let ent_in_front = crawlerEntInFront();
  // if (ent_in_front && myEnt().isAlive()) {
  //   let target_ent = game_entities[ent_in_front]!;
  //   drawEnemyStats(target_ent);
  //   autoAttack(target_ent);
  // } else {
  //   autoAttack(null);
  // }
}

export function play(dt: number): void {
  profilerStartFunc();
  let game_state = crawlerGameState();
  if (crawlerCommWant()) {
    // Must have been disconnected?
    crawlerCommStart();
    return profilerStopFunc();
  }
  profilerStart('top');
  crawlerEntityManager().tick();
  frame_wall_time = max(frame_wall_time, walltime()); // strictly increasing

  const map_view = mapViewActive();
  if (!(map_view || isMenuUp() || pause_menu_up)) {
    spotSuppressPad();
  }

  profilerStopStart('chat');
  getChatUI().run({
    hide: map_view || pause_menu_up || !isOnline(),
    x: 3,
    y: 196,
    border: 2,
    scroll_grow: 2,
    always_scroll: !map_view,
    cuddly_scroll: true,
  });
  profilerStopStart('mid');

  if (keyDownEdge(KEYS.F3)) {
    settings.set('show_fps', 1 - settings.show_fps);
  }
  if (keyDownEdge(KEYS.F)) {
    settings.set('filter', 1 - settings.filter);
    renderResetFilter();
  }

  profilerStopStart('playerMotion');
  playerMotion();

  crawlerRenderFramePrep();

  profilerStopStart('render prep');
  renderPrep(controller.getRenderPrepParam());
  drawEntitiesPrep();

  controller.flushMapUpdate();

  crawlerRenderFrame();

  if (!loading_level && !buildModeActive()) {
    let script_api = crawlerScriptAPI();
    script_api.is_visited = true; // Always visited for AI
    aiDoFloor(game_state.floor_id, game_state, entityManager(), engine.defines,
      settings.ai_pause || engine.defines.LEVEL_GEN || pause_menu_up, script_api);
  }

  if (crawlerCommWant()) {
    crawlerCommStart();
  }

  crawlerEntityManager().actionListFlush();

  getChatUI().runLate();
  profilerStop();
  profilerStopFunc();
}

function onPlayerMove(old_pos: Vec2, new_pos: Vec2): void {
  // let game_state = crawlerGameState();
  // aiOnPlayerMoved(game_state, myEnt(), old_pos, new_pos,
  //   settings.ai_pause || engine.defines.LEVEL_GEN, script_api);
}

function onInitPos(): void {
  // autoAttackCancel();
}

function playInitShared(online: boolean): void {
  controller = crawlerController();

  controller.setOnPlayerMove(onPlayerMove);
  controller.setOnInitPos(onInitPos);

  pause_menu_up = false;
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

export function playStartup(): void {
  ({ font } = ui);
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
  });
  let ent_factory = traitFactoryCreate<Entity, DataObject>();
  aiTraitsClientStartup(ent_factory);
  crawlerEntityTraitsClientStartup({
    ent_factory: ent_factory as unknown as TraitFactory<EntityCrawlerClient, DataObject>,
    name: 'EntityDemoClient',
    Ctor: EntityDemoClient,
  });
  crawlerRenderEntitiesStartup(font);
  crawlerRenderViewportSet({
    x: VIEWPORT_X0,
    y: VIEWPORT_Y0,
    w: render_width,
    h: render_height,
  });
  // crawlerRenderSetUIClearColor(dawnbringer.colors[14]);

  let button_param = {
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
    ws: [26, 26, 26],
    hs: [26, 26, 26, 26],
  };
  button_sprites = {
    regular: spriteCreate({
      name: 'buttons/buttons',
      ...button_param,
    }),
    down: spriteCreate({
      name: 'buttons/buttons_down',
      ...button_param,
    }),
    rollover: spriteCreate({
      name: 'buttons/buttons_rollover',
      ...button_param,
    }),
    disabled: spriteCreate({
      name: 'buttons/buttons_disabled',
      ...button_param,
    }),
  };
  button_sprites_down = {
    regular: button_sprites.down,
    down: button_sprites.regular,
    rollover: button_sprites.rollover,
    disabled: button_sprites.disabled,
  };

  renderAppStartup();
  crawlerLoadData(webFSAPI());
  crawlerMapViewStartup();
}
