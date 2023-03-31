import assert from 'assert';
import {
  getFrameDt,
  getFrameIndex,
} from 'glov/client/engine';
import { ClientEntityManagerInterface } from 'glov/client/entity_manager_client';
import {
  KEYS,
  PAD,
  keyDown,
  keyDownEdge,
  padButtonDown,
} from 'glov/client/input';
import { Sprite } from 'glov/client/sprites';
import * as ui from 'glov/client/ui';
import {
  ButtonStateString,
  modalDialog,
  uiHandlingNav,
} from 'glov/client/ui';
import { EntityID, NetErrorCallback } from 'glov/common/types';
import {
  clamp,
  easeIn,
  easeInOut,
  lerp,
  sign,
} from 'glov/common/util';
import {
  Vec2,
  Vec3,
  rovec3,
  v2add,
  v2copy,
  v2distSq,
  v2floor,
  v2iFloor,
  v2lerp,
  v2same,
  v2sub,
  v3copy,
  vec2,
  vec3,
} from 'glov/common/vmath';
import {
  CrawlerScriptWhen,
  crawlerScriptRunEvents,
  getEffWall,
} from '../common/crawler_script';
import {
  BLOCK_MOVE,
  BLOCK_VIS,
  CellDesc,
  CrawlerCell,
  CrawlerLevel,
  CrawlerState,
  DX,
  DXY,
  DY,
  DirType,
  EAST,
  JSVec3,
  NORTH,
  SOUTH,
  VIS_PASSED_EAST,
  VIS_PASSED_NORTH,
  VIS_VISITED,
  WEST,
  dirFromDelta,
  dirMod,
} from '../common/crawler_state';
import { pathFind } from '../common/pathfind';
import { buildModeActive } from './crawler_build_mode';
import {
  EntityCrawlerClient,
  entityBlocks,
} from './crawler_entity_client';
import {
  RenderPrepParam,
  crawlerRenderGetPosOffs,
} from './crawler_render';
import { CrawlerScriptAPIClient } from './crawler_script_api_client';
import { crawlerOnScreenButton } from './crawler_ui';
import { statusPush } from './status';

const { PI, abs, cos, random, round, sin } = Math;

const WALK_TIME = 500;
const ROT_TIME = 250;

const half_vec = rovec3(0.5, 0.5, 0.5);
const pit_times = [150, 400];

let temp_pos = vec2();
let temp_delta = vec2();

export type MoveBlocker = () => boolean;

const ACTION_NONE = 0;
const ACTION_MOVE = 1;
const ACTION_ROT = 2;
const ACTION_BUMP = 3;
type ActionType = typeof ACTION_NONE | typeof ACTION_MOVE | typeof ACTION_ROT | typeof ACTION_BUMP;
class MoveState {
  pos: Vec2 | null; // Only null for ACTION_ROT
  rot: DirType;
  bump_pos?: Vec2;
  action_type: ActionType;
  action_dir: number | undefined;
  double_time = 0;
  constructor(pos: Vec2 | null, rot: DirType, action_type: ActionType, action_dir: number | undefined) {
    assert(action_dir !== null);
    if (action_type === ACTION_MOVE) {
      assert(pos);
      assert(typeof action_dir === 'number');
      assert(action_dir >= 0 && action_dir < 4);
    } else if (action_type === ACTION_ROT) {
      assert(action_dir === -1 || action_dir === 1);
    }
    this.pos = pos;
    this.rot = rot;
    this.action_type = action_type;
    this.action_dir = action_dir;
  }
}

type MoveStateActionMove = MoveState & {
  action_type: typeof ACTION_MOVE;
  action_dir: DirType;
  pos: Vec2;
};

// type MoveStateActionRot = MoveState & {
//   action_type: typeof ACTION_ROT;
//   action_dir: -1 | 1;
// };

type MoveStateActionBump = MoveState & {
  action_type: typeof ACTION_BUMP;
  action_dir: DirType;
  bump_pos: Vec2;
};

function isActionMove(move_state: MoveState): move_state is MoveStateActionMove {
  return move_state.action_type === ACTION_MOVE;
}

function isActionBump(move_state: MoveState): move_state is MoveStateActionBump {
  return move_state.action_type === ACTION_BUMP;
}

// function isActionRot(move_state: MoveState): move_state is MoveStateActionRot {
//   return move_state.action_type === ACTION_ROT;
// }

export type PlayerMotionParam = {
  button_x0: number;
  button_y0: number;
  no_visible_ui: boolean;
  show_buttons: boolean;
  show_debug: boolean;
  disable_move: boolean;
  button_w: number;
  button_sprites: Record<ButtonStateString, Sprite>;
  dt: number;
  do_debug_move: boolean;
};

export class CrawlerController {
  game_state: CrawlerState;
  entity_manager: ClientEntityManagerInterface<EntityCrawlerClient>;
  script_api: CrawlerScriptAPIClient;
  on_init_level?: (floor_id: number) => void;
  flush_vis_data?: (force: boolean) => void;
  constructor(param: {
    game_state: CrawlerState;
    entity_manager: ClientEntityManagerInterface<EntityCrawlerClient>;
    script_api: CrawlerScriptAPIClient;
    on_init_level?: (floor_id: number) => void;
    flush_vis_data?: (force: boolean) => void;
  }) {
    this.game_state = param.game_state;
    this.entity_manager = param.entity_manager;
    this.script_api = param.script_api;
    this.flush_vis_data = param.flush_vis_data;
    this.on_init_level = param.on_init_level;
    this.script_api.setController(this);
  }

  on_player_move?: (old_pos: Vec2, new_pos: Vec2) => void;
  setOnPlayerMove(fn: (old_pos: Vec2, new_pos: Vec2) => void): void {
    this.on_player_move = fn;
  }
  on_init_pos?: (pos: Vec2, rot: DirType) => void;
  setOnInitPos(fn: (pos: Vec2, rot: DirType) => void): void {
    this.on_init_pos = fn;
  }

  updateEntAfterBuildModeSwitch(): void {
    let my_online_ent = this.entity_manager.getMyEnt();
    if (my_online_ent.data.floor !== this.game_state.floor_id) {
      this.applyPlayerFloorChange([this.last_pos[0], this.last_pos[1], this.last_rot], this.game_state.floor_id,
        undefined, () => {
          // ignore
        });
    } else {
      this.applyPlayerMove('move_debug', [this.last_pos[0], this.last_pos[1], this.last_rot]);
    }
  }

  buildModeSwitch(param: {
    entity_manager: ClientEntityManagerInterface<EntityCrawlerClient>;
  }): void {
    this.entity_manager = param.entity_manager;
    if (this.entity_manager.hasMyEnt()) {
      this.updateEntAfterBuildModeSwitch();
    }
  }


  cam_pos: Vec3 = vec3(0, 0, 0.5);
  mode: 'modeCrawl' | 'modeFreecam' = 'modeCrawl';
  fade_override = 0;
  move_blocker: MoveBlocker | null = null;
  transitioning_floor = false;
  fade_alpha = 0;
  fade_v = 0;
  prev_pos = vec2();
  last_pos!: Vec2;
  last_rot: DirType = 0;
  last_type: CellDesc | undefined;
  interp_queue: MoveState[] = [];
  impulse_queue: MoveState[] = [];
  move_offs!: number;
  path_to: Vec2 | null = null;
  map_update_this_frame: boolean = false;
  pit_time!: number;
  pit_stage!: number;
  freecam_pos = vec3();
  freecam_angle = 0;
  freecam_pitch = 0;
  loading_level = false;

  setFadeOverride(v: number): void {
    this.fade_override = v;
  }

  setMoveBlocker(fn: MoveBlocker): void {
    this.move_blocker = fn;
  }
  hasMoveBlocker(): boolean {
    return Boolean(this.move_blocker);
  }

  canRun(): boolean {
    if (this.entity_manager.checkNet()) {
      return false;
    }
    return true;
  }

  myEnt(): EntityCrawlerClient {
    return this.entity_manager.getMyEnt();
  }

  moveBlockLoadingLevel(): boolean {
    return this.loading_level;
  }
  initHaveLevel(floor_id: number, from_my_ent: boolean): void {
    this.game_state.setLevelActive(floor_id);
    this.initPos(from_my_ent);
    if (this.on_init_level) {
      this.on_init_level(floor_id);
    }
  }
  initFromMyEnt(): void {
    assert(this.entity_manager.hasMyEnt());
    let floor_id = this.myEnt().data.floor;
    assert.equal(typeof floor_id, 'number');
    this.setFadeOverride(1);
    this.setMoveBlocker(this.moveBlockLoadingLevel.bind(this));
    this.loading_level = true;
    this.game_state.getLevelForFloorAsync(floor_id, () => {
      this.loading_level = false;
      this.initHaveLevel(floor_id, true);
    });
  }

  // For hybrid build transition
  reloadLevel(): void {
    let floor_id = this.game_state.floor_id;
    assert(floor_id >= 0);
    this.setFadeOverride(1);
    this.setMoveBlocker(this.moveBlockLoadingLevel.bind(this));
    this.loading_level = true;
    this.game_state.getLevelForFloorAsync(floor_id, () => {
      this.loading_level = false;
      this.initHaveLevel(floor_id, false);
    });
  }

  getTransitioningFloor(): boolean {
    return this.transitioning_floor;
  }
  onFloorChangeAck(): boolean {
    if (!this.transitioning_floor) {
      return false;
    }
    this.transitioning_floor = false;
    this.fade_override = 0;
    assert(this.entity_manager.hasMyEnt());
    this.initHaveLevel(this.myEnt().getData<number>('floor')!, true);
    return true;
  }

  getFadeAlpha(): number {
    return this.fade_alpha;
  }
  getFadeColor(): number {
    return this.fade_v;
  }

  doPlayerMotion(param: PlayerMotionParam): void {
    this.fade_v = 0;
    this.fade_alpha = 0;

    if (!this.canRun()) {
      return;
    }

    if (keyDownEdge(KEYS.F2)) {
      this.mode = this.mode === 'modeFreecam' ? 'modeCrawl' : 'modeFreecam';
      if (this.mode === 'modeCrawl') {
        v2floor(this.game_state.pos, this.freecam_pos);
        let eff_angle_idx = (round(this.freecam_angle / (PI/2)) + 1024) % 4;
        this.game_state.angle = eff_angle_idx * PI/2;
        this.initPos(false);
        this.applyPlayerMove('move_debug', [this.last_pos[0], this.last_pos[1], this.last_rot]);
      } else {
        v2add(this.freecam_pos, this.game_state.pos, half_vec);
        this.freecam_pos[2] = 0.5;
        this.freecam_angle = this.game_state.angle;
        this.freecam_pitch = 0;
      }
    }

    if (this.move_blocker) {
      if (!this.move_blocker()) {
        this.move_blocker = null;
        this.fade_override = 0;
      }
    }

    this[this.mode](param);

    if (param.show_debug && !this.getTransitioningFloor()) {
      const { game_state, entity_manager } = this;
      let y = 0;
      let z = Z.DEBUG;
      let my_ent = entity_manager.hasMyEnt() ? entity_manager.getMyEnt() : null;
      ui.print(null, 0, y, z, `Pos: ${game_state.pos[0]},${game_state.pos[1]}` +
        `  Floor: ${my_ent?.data.floor}`);
      y += ui.font_height;
      ui.print(null, 0, y, z, `Angle: ${(game_state.angle / PI * 180).toFixed(0)}`);
      y += ui.font_height;
      ui.print(null, 0, y, z, `Angle Idx: ${this.moveEffRot()}`);
      y += ui.font_height;
    }
  }

  ignoreVisibility(): boolean {
    return this.mode === 'modeFreecam';
  }

  ignoreGameplay(): boolean {
    return this.mode === 'modeFreecam';
  }

  pathTo(target_x: number, target_y: number): void {
    this.path_to = [target_x, target_y];
  }
  queueTail(): MoveState {
    return this.impulse_queue.length ?
      this.impulse_queue[this.impulse_queue.length - 1] :
      this.interp_queue[this.interp_queue.length - 1];
  }
  queueLength(): number {
    return this.interp_queue.length + this.impulse_queue.length;
  }
  pushImpulseState(
    delta: Vec2 | null,
    rot: DirType,
    action_type: ActionType,
    action_dir: (-1 | 1) | DirType
  ): MoveState {
    assert(action_type === ACTION_MOVE || action_type === ACTION_ROT);
    assert(rot >= 0 && rot <= 3);
    // console.log(
    //   getFrameIndex(), `pushImpulseState ${action_type === ACTION_MOVE ? 'move' : 'rot'} ` +
    //   `delta=${delta} rot=${rot} dir=${action_dir} ql=${this.interp_queue.length}+${this.impulse_queue.length}`,
    //   new Error()
    // );
    let tail = this.queueTail();
    let next = new MoveState(delta, rot, action_type, action_dir);
    this.impulse_queue.push(next);
    if (tail && tail.action_type === next.action_type && tail.action_dir === next.action_dir) {
      // They're the same
      let queue_length = this.queueLength();
      if (queue_length > 3 || queue_length === 3 && this.move_offs < 0.5) {
        tail.double_time = 1;
      }
    }
    return next;
  }
  pushInterpState(pos: Vec2, rot: DirType, action_type: ActionType, impulse_elem: MoveState | null): MoveState {
    let next = new MoveState(pos, rot, action_type, impulse_elem?.action_dir);
    if (impulse_elem) {
      next.double_time = impulse_elem.double_time;
    }
    this.interp_queue.push(next);
    return next;
  }
  moveEffRot(): DirType {
    return this.queueTail().rot;
  }

  isMoving(): boolean {
    if (this.queueLength() === 1) {
      return false;
    }
    if (this.queueLength() === 2 && this.queueTail().action_type === ACTION_BUMP) {
      return false;
    }
    return true;
  }

  getEntInFront(): EntityID | null {
    const { game_state, last_pos, last_rot, script_api } = this;
    const { level } = game_state;
    assert(level);
    script_api.setLevel(level);
    script_api.setPos(last_pos);
    if (!this.isMoving() && !level.wallsBlock(last_pos, last_rot, script_api)) {
      v2add(temp_pos, last_pos, DXY[last_rot]);
      return !buildModeActive() && entityBlocks(game_state.floor_id, temp_pos, false) || null;
    } else {
      return null;
    }
  }

  startMove(dir: DirType): MoveState {
    return this.pushImpulseState(DXY[dir], this.moveEffRot(), ACTION_MOVE, dir);
  }
  startRelativeMove(dx: number, dy: number): void {
    let impulse_idx = this.moveEffRot();
    if (abs(dx) > abs(dy)) {
      if (dx < 0) {
        impulse_idx--;
      } else {
        impulse_idx++;
      }
    } else {
      if (dy < 0) {
        impulse_idx += 2;
      }
    }
    impulse_idx = dirMod(impulse_idx + 4);
    this.startMove(impulse_idx);
  }

  startQueuedMove(do_debug_move: boolean): void {
    const { game_state, script_api } = this;
    const build_mode = buildModeActive();
    assert.equal(this.interp_queue.length, 1);
    assert(this.impulse_queue.length > 0);
    let cur = this.interp_queue[0];
    assert(cur.pos);
    let next = this.impulse_queue.splice(0, 1)[0];
    let action_type = next.action_type;
    if (isActionMove(next)) {
      let new_pos = v2add(vec2(), cur.pos, next.pos);
      // check walls
      assert(next.action_dir !== undefined);
      script_api.setLevel(game_state.level!);
      script_api.setPos(cur.pos);
      let blocked = game_state.level!.wallsBlock(cur.pos, next.action_dir, script_api);
      if ((blocked & BLOCK_MOVE) && build_mode) {
        if (!(blocked & BLOCK_VIS)) {
          blocked &= ~BLOCK_MOVE;
        }
        let wall_desc = game_state.level!.getCell(cur.pos[0], cur.pos[1])!.walls[next.action_dir];
        if (wall_desc.replace) {
          for (let ii = 0; ii < wall_desc.replace.length; ++ii) {
            let desc = wall_desc.replace[ii].desc;
            if (desc.open_move) {
              // Build mode, and the wall blocks movement, but has a replace that doesn't, allow going through
              blocked &= ~BLOCK_MOVE;
            }
          }
        }
        if (!(blocked & BLOCK_MOVE)) {
          statusPush('Build mode open_move bypassed');
        }
      }
      if (blocked & BLOCK_MOVE) {
        action_type = ACTION_BUMP;
      } else if (blocked & BLOCK_VIS) { // any door
        cur.double_time = 0;
      }
      // check destination
      //let next_cell = game_state.level.getCell(new_pos[0], new_pos[1]);
      let blocked_ent_id;
      if (action_type !== ACTION_BUMP && !build_mode) {
        blocked_ent_id = entityBlocks(game_state.floor_id, new_pos, true);
        if (blocked_ent_id) {
          action_type = ACTION_BUMP;
        }
      }

      if (action_type === ACTION_BUMP) {
        // Clear any queued impulse
        this.impulse_queue.length = 0;
        next.double_time = 0;
        // Push the bump
        let next_elem = this.pushInterpState(cur.pos, cur.rot, action_type, next);
        next_elem.bump_pos = new_pos;
        // Do an attack if appropriate
        if (blocked_ent_id) {
          let is_facing_ent = next.action_dir === cur.rot;
          if ((blocked & BLOCK_VIS) && !(blocked & BLOCK_MOVE)) {
            // Can't see through this wall, and there's a monster on the other side!
            script_api.status('move_blocked', 'The door won\'t budge.');
          } else if (!is_facing_ent) {
            script_api.status('move_blocked', 'Something blocks your way.');
          } else {
            // TODO: Replace this with some kind of action
            // let total_attack_time = attackTime(my_ent);
            // queued_attack = {
            //   ent_id: blocked_ent_id,
            //   total_attack_time,
            //   start_time: frame_wall_time,
            //   windup: frame_wall_time + ATTACK_WINDUP_TIME,
            // };
          }
        }
      } else {
        script_api.is_visited = true; // Always visited for AI
        if (this.on_player_move) {
          this.on_player_move(cur.pos, new_pos);
        }
        this.pushInterpState(new_pos, next.rot, action_type, next);
        let action_id = do_debug_move ? 'move_debug' : 'move';
        let new_pos_triplet: JSVec3 = [new_pos[0], new_pos[1], next.rot];
        this.playerMoveStart(action_id, new_pos_triplet);
        this.applyPlayerMove(action_id, new_pos_triplet, this.resyncPosOnError.bind(this));
      }
    } else {
      // Rotation, just apply
      assert(next.rot >= 0 && next.rot <= 3);
      this.last_rot = next.rot;
      this.pushInterpState(cur.pos, next.rot, action_type, next);
      let action_id = do_debug_move ? 'move_debug' : 'move';
      this.applyPlayerMove(action_id, [cur.pos[0], cur.pos[1], next.rot]);
    }
  }

  static PLAYER_MOVE_FIELD = 'seq_player_move';
  applyPlayerMove(
    action_id: string,
    new_pos: JSVec3,
    resp_func?: NetErrorCallback
  ): void {
    let my_ent = this.myEnt();
    if (this.entity_manager.isOnline()) {
      my_ent.applyBatchUpdate({
        field: CrawlerController.PLAYER_MOVE_FIELD,
        action_id,
        data_assignments: {
          pos: new_pos,
        },
      }, resp_func);
    } else {
      v3copy(my_ent.data.pos, new_pos);
    }
  }

  applyPlayerFloorChange(
    new_pos: JSVec3,
    new_floor: number,
    reason: string | undefined,
    resp_func: NetErrorCallback
  ): void {
    let my_ent = this.myEnt();
    if (this.entity_manager.isOnline()) {
      my_ent.applyBatchUpdate({
        field: CrawlerController.PLAYER_MOVE_FIELD,
        action_id: 'floorchange',
        payload: {
          reason,
        },
        data_assignments: {
          pos: new_pos,
          floor: new_floor,
        },
      }, resp_func);
    } else {
      v3copy(my_ent.data.pos, new_pos);
      my_ent.data.floor = new_floor;
      resp_func(null);
    }
  }

  getMapUpdateThisFrame(): boolean {
    return this.map_update_this_frame;
  }
  initPos(from_my_ent: boolean): void {
    const { game_state, prev_pos } = this;
    this.map_update_this_frame = true;
    if (from_my_ent) {
      let my_ent = this.myEnt();
      let predicted_pos = my_ent.getData<JSVec3>('pos')!;
      v2copy(game_state.pos, predicted_pos);
      game_state.angle = predicted_pos[2] * PI/2;
    }
    let cur_rot = dirMod(round(game_state.angle / (PI/2)) + 4);
    let cur_pos = v2iFloor(game_state.pos.slice(0) as Vec2);
    this.last_pos = cur_pos.slice(0) as Vec2;
    v2copy(prev_pos, this.last_pos);
    this.last_rot = cur_rot;
    this.interp_queue = [];
    this.impulse_queue = [];
    this.path_to = null;
    this.move_offs = 0;
    if (this.on_init_pos) {
      this.on_init_pos(cur_pos, cur_rot);
    }
    this.pushInterpState(cur_pos, cur_rot, ACTION_NONE, null);
    let cur_cell = game_state.level!.getCell(cur_pos[0], cur_pos[1]);
    if (cur_cell) {
      this.last_type = cur_cell.desc;
      if (cur_cell.desc.auto_evict) {
        for (let ii = 0; ii < 4; ++ii) {
          let rot = dirMod(cur_rot + ii);
          if (cur_cell.walls[rot].open_move && from_my_ent &&
            game_state.level!.getCell(cur_pos[0] + DX[rot], cur_pos[1] + DY[rot])!.desc.open_move
          ) {
            this.startMove(rot);
            this.move_offs = 0.5;
            break;
          }
        }
      }
    } else {
      this.last_type = undefined;
    }
  }

  initPosFromLevelDebug(): void {
    const { game_state } = this;
    let cur_level = game_state.level!;
    v2copy(game_state.pos, cur_level.special_pos.stairs_in);
    game_state.angle = cur_level.special_pos.stairs_in[2] * PI / 2;
    this.initPos(false);
  }

  resyncPosOnError(err: string | null): void {
    if (err) {
      this.script_api.predictionClear();
      this.initPos(true);
    }
  }

  goToFloor(
    new_floor_id: number,
    special_pos_key?: string,
    reason?: string,
    specific_pos?: JSVec3
  ): void {
    assert(!this.transitioning_floor);
    this.transitioning_floor = true;
    this.fade_override = 1;
    this.setMoveBlocker(() => this.transitioning_floor);
    if (this.flush_vis_data) {
      this.flush_vis_data(true);
    }
    this.game_state.getLevelForFloorAsync(new_floor_id, (level: CrawlerLevel) => {
      let new_pos: JSVec3 = specific_pos ?
        specific_pos : level.special_pos[special_pos_key || 'stairs_in'] || level.special_pos.stairs_in;

      let cell = level.getCell(new_pos[0], new_pos[1]); // may be -1 => null cell
      if (!cell || !cell.desc.open_vis) {
        // need initial position
        new_pos = level.special_pos.stairs_in;
      }
      this.applyPlayerFloorChange([new_pos[0], new_pos[1], new_pos[2]], new_floor_id, reason, (err) => {
        if (err) {
          this.transitioning_floor = false;
          this.fade_override = 0;
          throw err;
        }
        if (!this.entity_manager.isOnline()) {
          this.onFloorChangeAck();
        }
        // else: floorchange_ack will be delivered momentarily
      });
    });
  }

  floorDelta(delta: number, special_pos_key: string): void {
    let floor_id = this.myEnt().data.floor;
    assert.equal(typeof floor_id, 'number');
    assert(floor_id + delta >= 0);
    this.goToFloor(floor_id + delta, special_pos_key);
  }

  floorAbsolute(floor_id: number, x: number, y: number, rot?: DirType): void {
    if (rot === undefined) {
      rot = this.myEnt().data.pos[2] as DirType;
    }
    this.goToFloor(floor_id, undefined, undefined, [x, y, rot]);
  }

  cancelAllMoves(): void {
    while (this.interp_queue.length > 1) {
      this.interp_queue.pop();
    }
    this.impulse_queue = [];
  }

  forceMove(dir: DirType): void {
    this.cancelAllMoves();
    this.startMove(dir);
  }

  moveBlockPit(): boolean {
    this.pit_time += getFrameDt();
    let pit_progress = this.pit_time / pit_times[this.pit_stage];
    if (pit_progress > 1) {
      pit_progress = 0;
      this.pit_time = 0;
      ++this.pit_stage;
    }
    if (this.pit_stage === 0) {
      // pit open
    } else if (this.pit_stage === 1) {
      // fall down
      this.cam_pos[2] = 0.5 - easeIn(pit_progress, 2);
      this.fade_override = clamp(pit_progress * 2 - 1, 0, 1);
    } else {
      this.cam_pos[2] = 0.5;
      this.goToFloor(this.pit_target_floor, this.pit_target_key, 'pit', this.pit_target_pos);
      // still returning true, because move_blocker is modified in the above call
    }
    return true;
  }

  pit_target_floor!: number;
  pit_target_key?: string;
  pit_target_pos?: JSVec3;
  fallThroughPit(floor_id: number, pos_key?: string, pos_pair?: JSVec3): void {
    this.pit_stage = 0;
    this.pit_time = 0;
    this.pit_target_floor = floor_id;
    this.pit_target_key = pos_key;
    this.pit_target_pos = pos_pair;
    this.move_blocker = this.moveBlockPit.bind(this);
  }

  playerMoveFinish(level: CrawlerLevel, new_cell: CrawlerCell | null, cur_move_pos: Vec2): void {
    const { last_pos, game_state, script_api } = this;
    assert(cur_move_pos);
    let prev_cell = level.getCell(last_pos[0], last_pos[1]);
    if (new_cell) {
      new_cell.visible_bits |= VIS_VISITED;
      if (last_pos[0] === cur_move_pos[0] + 1 && (
        new_cell.walls[EAST].is_secret || prev_cell?.walls[WEST].is_secret
      )) {
        new_cell.visible_bits |= VIS_PASSED_EAST;
      } else if (last_pos[1] === cur_move_pos[1] + 1 && (
        new_cell.walls[NORTH].is_secret || prev_cell?.walls[SOUTH].is_secret
      )) {
        new_cell.visible_bits |= VIS_PASSED_NORTH;
      }
      if (last_pos[0] === cur_move_pos[0] - 1 && (
        new_cell.walls[WEST].is_secret || prev_cell?.walls[EAST].is_secret
      )) {
        let ncell = level.getCell(cur_move_pos[0] - 1, cur_move_pos[1]);
        if (ncell) {
          assert.equal(ncell, prev_cell);
          ncell.visible_bits |= VIS_PASSED_EAST;
        }
      } else if (last_pos[1] === cur_move_pos[1] - 1 && (
        new_cell.walls[SOUTH].is_secret || prev_cell?.walls[NORTH].is_secret
      )) {
        let ncell = level.getCell(cur_move_pos[0], cur_move_pos[1] - 1);
        if (ncell) {
          assert.equal(ncell, prev_cell);
          ncell.visible_bits |= VIS_PASSED_NORTH;
        }
      }
    }
    v2copy(this.prev_pos, last_pos);
    v2copy(last_pos, cur_move_pos);
    let type = new_cell && new_cell.desc || level.default_open_cell;
    if (type !== this.last_type) {
      this.last_type = type;
      let msg = type.debug_msg || '';
      // These are all handled by events now:
      // if (type.code === 'CELL_STAIRS_IN' && game_state.floor_id === 0 || type.code === 'CELL_ENTRANCE') {
      //   msg = 'This is where you came in, try to find the stairs down instead.';
      // } else if (type.code === 'CELL_STAIRS_IN') {
      //   this.goToFloor(game_state.floor_id - 1, 'stairs_out');
      // } else if (type.code === 'CELL_STAIRS_OUT') {
      //   this.goToFloor(game_state.floor_id + 1, 'stairs_in');
      // } else if (type.code === 'CELL_PIT') {
      //   script_api.status('pit', 'A sinking feeling...');
      //   this.fallThroughPit();
      // }
      if (msg) {
        modalDialog({
          text: msg,
          buttons: {
            OK: null,
          }
        });
      }
    }
    if (new_cell && new_cell.events && !buildModeActive()) {
      assert(new_cell.events.length);
      script_api.setLevel(game_state.level!);
      script_api.setPos(cur_move_pos);
      crawlerScriptRunEvents(script_api, new_cell, CrawlerScriptWhen.POST);
    }
  }

  playerMoveStart(action_id: string, new_pos: JSVec3): void {
    const { game_state, script_api } = this;
    let new_cell = game_state.level!.getCell(new_pos[0], new_pos[1]);
    if (new_cell && new_cell.events) {
      assert(new_cell.events.length);
      if (action_id === 'move_debug') {
        script_api.status('build_event', `Note: no events run in ${buildModeActive() ? 'BUILD MODE' : 'debug'}`);
      } else {
        // TODO: if anything is predicted (keySet?) it should be cleared once the
        //   server has also run the event
        script_api.setLevel(game_state.level!);
        script_api.setPos(new_pos);
        crawlerScriptRunEvents(script_api, new_cell, CrawlerScriptWhen.PRE);
      }
    }
  }

  flagCellNextToUsVisible(pos: Vec2): void {
    let level = this.game_state.level!;
    this.script_api.setLevel(level);
    this.script_api.setPos(pos);
    // Could just do behind us, but this makes the map a little more stable
    for (let dir = 0 as DirType; dir < 4; ++dir) {
      let blocks = level.wallsBlock(pos, dir, this.script_api);
      if (!(blocks & BLOCK_VIS)) {
        let cell = level.getCell(pos[0] + DX[dir], pos[1] + DY[dir]);
        if (cell) {
          cell.visible_frame = getFrameIndex() - 1;
        }
      }
    }
    let cell = level.getCell(pos[0], pos[1]);
    if (cell) {
      cell.visible_frame = getFrameIndex() - 1;
    }
  }

  modeCrawl(param: PlayerMotionParam): void {
    const {
      button_x0,
      button_y0,
      no_visible_ui,
      button_w,
      button_sprites,
      show_buttons,
      disable_move,
    } = param;
    let dt = param.dt;
    const {
      last_pos,
      impulse_queue,
      interp_queue,
      prev_pos,
      game_state,
    } = this;
    const build_mode = buildModeActive();

    let no_move = this.hasMoveBlocker() || disable_move;

    let down = {
      forward: 0,
      left: 0,
      back: 0,
      right: 0,
      turn_left: 0,
      turn_right: 0,
    };
    type ValidKeys = keyof typeof down;
    let down_edge = {
      forward: 0,
      left: 0,
      back: 0,
      right: 0,
      turn_left: 0,
      turn_right: 0,
    } as Record<ValidKeys, number>;

    function button(
      rx: number, ry: number,
      frame: number,
      key: ValidKeys,
      keys: number[],
      pads: number[],
      toggled_down?: boolean
    ): void {
      let z;
      let ret = crawlerOnScreenButton({
        x: button_x0 + (button_w + 2) * rx,
        y: button_y0 + (button_w + 2) * ry,
        z,
        w: button_w, h: button_w,
        frame,
        keys,
        pads,
        no_visible_ui,
        do_up_edge: false,
        disabled: no_move,
        button_sprites,
      });
      down_edge[key] += ret.down_edge;
      down[key] += ret.down;
      // up_edge[key] += ret.up_edge;
    }

    // Check for intentional events
    // v2add(temp_pos, last_pos, DXY[this.last_rot]);
    // Old: forward attacks: let forward_frame = entityBlocks(game_state.floor_id, temp_pos, true) ? 11 : 1;
    let forward_frame = 1;
    if (show_buttons) {
      let keys_turn_left = [KEYS.Q];
      let keys_forward = [KEYS.W];
      let keys_turn_right = [KEYS.E];
      let keys_left = [KEYS.A];
      let keys_back = [KEYS.S];
      let keys_right = [KEYS.D];
      if (!build_mode) {
        keys_turn_left.push(KEYS.NUMPAD7);
        keys_forward.push(KEYS.NUMPAD8);
        keys_turn_right.push(KEYS.NUMPAD9);
        keys_left.push(KEYS.NUMPAD4);
        keys_back.push(KEYS.NUMPAD2, KEYS.NUMPAD5);
        keys_right.push(KEYS.NUMPAD6);
      }
      let pad_turn_left: number[] = [];
      let pad_forward: number[] = [];
      let pad_turn_right: number[] = [];
      let pad_left: number[] = [];
      let pad_back: number[] = [];
      let pad_right: number[] = [];
      if (uiHandlingNav()) {
        // hotkeys, but no nav keys
      } else {
        keys_turn_left.push(KEYS.LEFT);
        keys_forward.push(KEYS.UP);
        keys_turn_right.push(KEYS.RIGHT);
        keys_back.push(KEYS.DOWN);
        pad_turn_left.push(PAD.LEFT);
        pad_forward.push(PAD.UP);
        pad_turn_right.push(PAD.RIGHT);
        pad_left.push(PAD.LEFT_BUMPER);
        pad_back.push(PAD.DOWN);
        pad_right.push(PAD.RIGHT_BUMPER);
      }
      button(0, 0, 0, 'turn_left', keys_turn_left, pad_turn_left);
      button(1, 0, forward_frame, 'forward', keys_forward, pad_forward);
      button(2, 0, 2, 'turn_right', keys_turn_right, pad_turn_right);
      button(0, 1, 3, 'left', keys_left, pad_left);
      button(1, 1, 4, 'back', keys_back, pad_back);
      button(2, 1, 5, 'right', keys_right, pad_right);
    }

    if (no_move) {
      this.fade_alpha = this.fade_override;
      return;
    }

    let eff_rot = this.moveEffRot();
    {
      let drot = down_edge.turn_left;
      drot -= down_edge.turn_right;
      while (drot) {
        let s = sign(drot);
        eff_rot = dirMod(eff_rot + s + 4);
        this.pushImpulseState(null, eff_rot, ACTION_ROT, s);
        drot -= s;
        this.path_to = null;
      }
    }

    {
      let dx = 0;
      dx += down_edge.left;
      dx -= down_edge.right;
      let dy = 0;
      dy += down_edge.forward;
      dy -= down_edge.back;
      if (dx || dy) {
        this.startRelativeMove(dx, dy);
        this.path_to = null;
      }
    }


    if (interp_queue.length + impulse_queue.length === 1) {
      // Not currently doing any move
      // Check for held rotation inputs
      let drot = 0;
      drot += down.turn_left;
      drot -= down.turn_right;
      let drot2 = sign(drot);
      if (drot2) {
        this.pushImpulseState(null, dirMod(eff_rot + drot2 + 4), ACTION_ROT, drot2);
      }
    }
    if (this.queueLength() === 1 || this.queueLength() === 2 && interp_queue[0].double_time) {
      // Not currently doing any move
      // Or, we're continuing double-time movement
      // Check for held movement inputs
      let dx = 0;
      dx += down.left;
      dx -= down.right;
      let dy = 0;
      dy += down.forward;
      dy -= down.back;
      if (dx || dy) {
        this.startRelativeMove(dx, dy);
        this.path_to = null;
      }
    }

    assert(interp_queue[0].pos);
    if (this.queueLength() === 1 && !build_mode && entityBlocks(game_state.floor_id, interp_queue[0].pos, true) &&
      !v2same(interp_queue[0].pos, prev_pos)
    ) {
      // We're standing over a blocking entity!  Move to where we were before
      v2sub(temp_delta, prev_pos, interp_queue[0].pos);
      this.pushImpulseState(temp_delta, this.moveEffRot(), ACTION_MOVE,
        temp_delta[0] > 0 ? 0 : temp_delta[1] > 0 ? 1 : temp_delta[0] < 0 ? 2 : 3);
    }

    let level = game_state.level!;
    if (this.queueLength() === 1 && this.path_to) {
      let { w } = level;
      let cur = this.queueTail();
      assert(cur.pos);
      let path = pathFind(level, cur.pos[0], cur.pos[1], cur.rot,
        this.path_to[0], this.path_to[1], build_mode);
      if (!path || path.length === 1) {
        this.path_to = null;
      } else {
        let next = path[1];
        let nx = next % w;
        let ny = (next - nx) / w;
        let next_pos = [nx, ny] as const;
        assert.equal(v2distSq(next_pos, cur.pos), 1);
        v2sub(temp_delta, next_pos, cur.pos);
        let need_dir = dirFromDelta(temp_delta);
        if (need_dir !== cur.rot) {
          // rotate
          let drot = need_dir - cur.rot;
          if (drot < -2) {
            drot += 4;
          } else if (drot > 2) {
            drot -= 4;
          }
          if (drot === -2 || drot === 2) {
            drot = random() > 0.5 ? -1 : 1;
          }
          assert(drot === -1 || drot === 1);
          this.pushImpulseState(null, dirMod(cur.rot + drot + 4), ACTION_ROT, drot).double_time = 2;
        } else {
          if (!build_mode && entityBlocks(game_state.floor_id, next_pos, true)) {
            cur.double_time = 0;
            this.path_to = null;
          } else {
            // move
            let elem = this.startMove(cur.rot);
            if (path.length > 2) {
              elem.double_time = 1;
            }
          }
        }
      }
    }

    // tick movement queue
    let easing = 2;
    let do_once = true;
    while (this.queueLength() > 1 && (dt || do_once)) {
      do_once = false;
      let cur = interp_queue[0];
      if (interp_queue.length === 1) {
        if (disable_move) {
          assert(impulse_queue[0].action_type !== ACTION_ROT); // Old logic was maybe this, but never happens anyway?
          break;
        }
        this.startQueuedMove(param.do_debug_move);
      }
      let next = interp_queue[1];
      let tot_time = next.action_type === ACTION_MOVE ? WALK_TIME : ROT_TIME;
      if (next.double_time && this.move_offs > 0.5 || cur.double_time && this.move_offs < 0.5) {
        tot_time /= 2;
        easing = this.move_offs > 0.5 ? next.double_time : cur.double_time;
      }
      let cur_time = this.move_offs * tot_time;
      if (cur_time + dt >= tot_time) {
        dt -= tot_time - cur_time;
        this.move_offs = 0;
        interp_queue.splice(0, 1); // same as interp_queue = this.interp_queue = [interp_queue[1]];
        this.map_update_this_frame = true;
        dt = 0; // Not completely sure: finish only one move per frame, end this frame exactly on this end of move
      } else {
        this.move_offs = (cur_time + dt) / tot_time;
        dt = 0;
      }
    }

    let cur = interp_queue[0];
    assert(cur.pos);
    let cur_cell = level.getCell(cur.pos[0], cur.pos[1]);
    let instantaneous_move;
    if (interp_queue.length > 1) {
      let next = interp_queue[1];
      assert(next.pos);
      assert(this.move_offs >= 0);
      assert(this.move_offs <= 1);
      let progress = easeInOut(this.move_offs, easing);
      v2lerp(game_state.pos, progress, cur.pos, next.pos);
      let cur_angle = cur.rot * PI / 2;
      let next_angle = next.rot * PI / 2;
      if (next_angle - cur_angle > PI) {
        next_angle -= PI * 2;
      } else if (cur_angle - next_angle > PI) {
        next_angle += PI * 2;
      }
      this.game_state.angle = lerp(progress, cur_angle, next_angle);
      if (isActionMove(next)) {
        let pos_offs = crawlerRenderGetPosOffs();
        let pos_through_door_angle = dirMod(cur.rot - next.action_dir + 4);

        let alpha;
        let cutoff = pos_through_door_angle === 0 ? (1 - pos_offs[1]) / 2 :
          pos_through_door_angle === 2 ? (1 + pos_offs[1]) / 2 :
          pos_through_door_angle === 3 ? (1 + pos_offs[0]) / 2 : (1 - pos_offs[0]) / 2;
        if (progress < cutoff) {
          instantaneous_move = cur;
          alpha = progress / cutoff;
        } else {
          instantaneous_move = next;
          alpha = 1 - (progress - cutoff) / (1 - cutoff);
        }
        if (cur_cell) {
          let wall_type = getEffWall(this.script_api, cur_cell, next.action_dir).swapped;
          if (!wall_type.open_vis) {
            // let next_cell = level.getCell(next.pos[0], next.pos[1]);
            // this.fade_v = next_cell.type === CellType.STAIRS_IN || cur_cell.type === CellType.STAIRS_IN ? 1 : 0;
            // this.fade_v = next_cell.type === CellType.STAIRS_IN || next_cell.type === CellType.STAIRS_OUT ||
            //   cur_cell.type === CellType.STAIRS_IN || cur_cell.type === CellType.STAIRS_OUT ? 1 : 0;
            this.fade_alpha = alpha;
          }
        }
      } else if (isActionBump(next)) {
        let p = (1 - abs(1 - progress * 2)) * 0.025;
        v2lerp(game_state.pos, p, cur.pos, next.bump_pos);
        instantaneous_move = cur;
      } else {
        if (progress < 0.5) {
          instantaneous_move = cur;
        } else {
          instantaneous_move = next;
        }
      }
    } else {
      instantaneous_move = cur;
      v2copy(game_state.pos, cur.pos);
      game_state.angle = cur.rot * PI/2;
    }
    assert(instantaneous_move);
    assert(instantaneous_move.pos);

    let inst_cell = level.getCell(instantaneous_move.pos[0], instantaneous_move.pos[1]);
    if (inst_cell && inst_cell.desc.auto_evict) {
      // this.fade_v = inst_cell.type === STAIRS_IN ? 1 : 0;
      // this.fade_v = 1;
      this.fade_alpha = 1;
    }

    let move_for_abs_pos = cur; // instantaneous_move
    assert(move_for_abs_pos.pos);
    if (!v2same(move_for_abs_pos.pos, last_pos)) {
      this.playerMoveFinish(level, inst_cell, move_for_abs_pos.pos);
    }

    this.flagCellNextToUsVisible(instantaneous_move.pos);
  }

  modeFreecam(param: PlayerMotionParam): void {
    let speed = 0.001 * (keyDown(KEYS.SHIFT) ? 3 : 1);
    let drot = 0;
    if (!uiHandlingNav()) {
      drot += keyDown(KEYS.LEFT) + padButtonDown(PAD.LEFT);
      drot -= keyDown(KEYS.RIGHT) + padButtonDown(PAD.RIGHT);
    }
    drot += keyDown(KEYS.Q);
    drot -= keyDown(KEYS.E);
    this.freecam_angle += drot * 0.004;
    let cp = cos(this.freecam_pitch);
    let sp = sin(this.freecam_pitch);
    let dx = 0;
    dx += keyDown(KEYS.A) + padButtonDown(PAD.LEFT_BUMPER);
    dx -= keyDown(KEYS.D) + padButtonDown(PAD.RIGHT_BUMPER);
    this.freecam_pos[0] += cos(this.freecam_angle + PI/2) * dx * speed;
    this.freecam_pos[1] += sin(this.freecam_angle + PI/2) * dx * speed;
    let dy = 0;
    dy += keyDown(KEYS.W);
    dy -= keyDown(KEYS.S);
    if (!uiHandlingNav()) {
      dy += padButtonDown(PAD.UP);
      dy -= padButtonDown(PAD.DOWN);
    }
    this.freecam_pos[0] += cos(this.freecam_angle) * dy * speed * cp;
    this.freecam_pos[1] += sin(this.freecam_angle) * dy * speed * cp;
    this.freecam_pos[2] += dy * sp * speed;
    let dz = 0;
    if (!uiHandlingNav()) {
      dz += keyDown(KEYS.SPACE);
    }
    dz -= keyDown(KEYS.C) + keyDown(KEYS.Z);
    this.freecam_pos[0] += cos(this.freecam_angle) * dz * speed * -sp;
    this.freecam_pos[1] += sin(this.freecam_angle) * dz * speed * -sp;
    this.freecam_pos[2] += dz * cp * speed;
    let dp = 0;
    if (!uiHandlingNav()) {
      dp += keyDown(KEYS.UP);
      dp -= keyDown(KEYS.DOWN);
    }
    this.freecam_pitch += dp * 0.004;
    this.freecam_pitch = clamp(this.freecam_pitch, -PI/2 + 0.001, PI/2 - 0.001);
  }

  getRenderPrepParam(): RenderPrepParam {
    if (this.mode === 'modeFreecam') {
      return {
        game_state: this.game_state,
        script_api: this.script_api,
        cam_pos: this.freecam_pos,
        angle: this.freecam_angle,
        pitch: this.freecam_pitch,
        ignore_vis: true,
        map_update_this_frame: false,
      };
    } else {
      v2add(this.cam_pos, this.game_state.pos, half_vec);
      return {
        game_state: this.game_state,
        script_api: this.script_api,
        cam_pos: this.cam_pos,
        angle: this.game_state.angle,
        pitch: 0,
        ignore_vis: false,
        map_update_this_frame: this.map_update_this_frame,
      };
    }
  }

  flushMapUpdate(): boolean {
    if (this.map_update_this_frame) {
      this.map_update_this_frame = false;
      if (this.flush_vis_data) {
        this.flush_vis_data(false);
      }
      return true;
    }
    return false;
  }
}
