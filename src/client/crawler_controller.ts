import assert from 'assert';
import * as engine from 'glov/client/engine';
import {
  getFrameDt,
  getFrameIndex,
  getFrameTimestamp,
} from 'glov/client/engine';
import { ClientEntityManagerInterface } from 'glov/client/entity_manager_client';
import { Box } from 'glov/client/geom_types';
import {
  keyDown,
  keyDownEdge,
  KEYS,
  PAD,
  padButtonDown,
} from 'glov/client/input';
import * as settings from 'glov/client/settings';
import { Sprite } from 'glov/client/sprites';
import * as ui from 'glov/client/ui';
import {
  ButtonStateString,
  modalDialog,
  playUISound,
  uiHandlingNav,
  uiTextHeight,
} from 'glov/client/ui';
import { EntityID, NetErrorCallback, VoidFunc } from 'glov/common/types';
import {
  clamp,
  easeIn,
  easeInOut,
  lerp,
  lerpAngle,
  sign,
} from 'glov/common/util';
import {
  ROVec2,
  rovec3,
  v2add,
  v2addScale,
  v2copy,
  v2distSq,
  v2floor,
  v2iFloor,
  v2iRound,
  v2lerp,
  v2same,
  v2sub,
  v3copy,
  Vec2,
  vec2,
  Vec3,
  vec3,
} from 'glov/common/vmath';
import {
  crawlerScriptRunEvents,
  CrawlerScriptWhen,
  getEffWall,
} from '../common/crawler_script';
import {
  BLOCK_MOVE,
  BLOCK_VIS,
  CellDesc,
  CrawlerCell,
  CrawlerLevel,
  CrawlerState,
  dirFromDelta,
  dirFromMove,
  dirMod,
  DirType,
  DX,
  DXY,
  DY,
  EAST,
  JSVec3,
  NORTH,
  SOUTH,
  VIS_PASSED_EAST,
  VIS_PASSED_NORTH,
  VIS_VISITED,
  WEST,
} from '../common/crawler_state';
import { pathFind } from '../common/pathfind';
import { buildModeActive } from './crawler_build_mode';
import {
  entityBlocks,
  EntityCrawlerClient,
} from './crawler_entity_client';
import { crawlerScriptAPI } from './crawler_play';
import {
  crawlerRenderGetPosOffs,
  crawlerRenderViewportGet,
  RenderPrepParam,
} from './crawler_render';
import { CrawlerScriptAPIClient } from './crawler_script_api_client';
import { crawlerOnScreenButton } from './crawler_ui';
import { statusPush } from './status';

const { PI, abs, cos, floor, max, min, random, round, sin } = Math;

const WALK_TIME = 500; // 250-500
const ROT_TIME = 250; // 150-250
const FAST_TRAVEL_STEP_MIN_TIME = 200; // affects instant-step-ish controllers
const KEY_REPEAT_TIME_ROT = 500;
const KEY_REPEAT_TIME_MOVE_DELAY = 500;
const KEY_REPEAT_TIME_MOVE_RATE = 150;

const FORCE_FACE_TIME = ROT_TIME;

const half_vec = rovec3(0.5, 0.5, 0.5);
const pit_times = [150, 400];

let temp_pos = vec2();
let temp_delta = vec2();

export type MoveBlocker = () => boolean;

type WallTransit = {
  pos: Vec2;
  dir: DirType;
};

type TickPositions = {
  dest_pos: Vec2; // Where the player is currently moving toward (already satisfied all checks / occupies in game logic)
  dest_rot: DirType;
  finished_pos: Vec2; // Where the player feels he is (not updated until after movement has finished)
  finished_rot: DirType;
  wall_transits: WallTransit[];
};
type TickParam = {
  dt: number;
};
type ControllerInputs = {
  forward: number;
  left: number;
  back: number;
  right: number;
  turn_left: number;
  turn_right: number;
};
interface PlayerController {
  tickMovement(param: TickParam): TickPositions;
  allowRepeatImmediately(): boolean;

  effRot(): DirType;
  effPos(): ROVec2;
  isMoving(): boolean;
  isAnimating(): boolean;
  startTurn(rot: DirType, double_time?: number): void;
  startMove(dir: DirType, double_time?: number): void;
  initPosSub(): void;
  autoStartMove(rot: DirType, offs: number): void;
  cancelAllMoves?(): void;
  cancelQueuedMoves?(): void;
  clearDoubleTime?(): void;
}

type StartMoveData = {
  bumped_something: boolean;
  going_through_door: boolean;
  bumped_entity: boolean;
};
function startMove(
  parent: CrawlerController,
  dir: DirType,
  new_pos: Vec2,
  new_rot: DirType,
): StartMoveData {
  const { game_state, script_api, last_dest_pos } = parent;
  const build_mode = buildModeActive();

  // check walls
  script_api.setLevel(game_state.level!);
  script_api.setPos(last_dest_pos);
  let blocked = game_state.level!.wallsBlock(last_dest_pos, dir, script_api);
  if ((blocked & BLOCK_MOVE) && build_mode) {
    if (!(blocked & BLOCK_VIS)) {
      blocked &= ~BLOCK_MOVE;
    }
    let wall_desc = game_state.level!.getCell(last_dest_pos[0], last_dest_pos[1])!.walls[dir];
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
      statusPush('Build mode open_move bypassed').fade();
    }
  }
  let blocked_vis = Boolean(blocked & BLOCK_VIS);
  let bumped_something = false;
  let going_through_door = false;
  if (blocked & BLOCK_MOVE) {
    bumped_something = true;
  } else if (blocked & BLOCK_VIS) { // any door
    going_through_door = true;
    // cur.double_time = 0;
  }
  // check destination
  let blocked_ent_id;
  let bumped_entity = false;
  if (!bumped_something && !build_mode) {
    blocked_ent_id = entityBlocks(game_state.floor_id, new_pos, true);
    if (blocked_ent_id) {
      bumped_something = true;
      bumped_entity = true;
    }
  }
  if (bumped_entity) {
    // Do an attack if appropriate, or other default action
    let is_facing_ent = dir === new_rot;
    if (blocked_vis) {
      // Can't see through this wall, and there's a monster on the other side!
      script_api.status('move_blocked', 'The door won\'t budge.');
    } else if (!is_facing_ent) {
      script_api.status('move_blocked', 'Something blocks your way.');
    } else {
      // TODO: Replace this with some kind of action callback
      // let total_attack_time = attackTime(my_ent);
      // queued_attack = {
      //   ent_id: blocked_ent_id,
      //   total_attack_time,
      //   start_time: frame_wall_time,
      //   windup: frame_wall_time + ATTACK_WINDUP_TIME,
      // };
    }
  }
  return {
    bumped_something,
    going_through_door,
    bumped_entity,
  };
}


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

class CrawlerControllerQueued implements PlayerController {
  interp_queue: MoveState[] = [];
  impulse_queue: MoveState[] = [];
  move_offs!: number;

  constructor(public parent: CrawlerController) {
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
  effRot(): DirType {
    return this.queueTail().rot;
  }
  effPos(): ROVec2 {
    let cur = this.interp_queue[this.interp_queue.length - 1];
    assert(cur.pos);
    v2copy(temp_pos, cur.pos);
    for (let ii = 0; ii < this.impulse_queue.length; ++ii) {
      let elem = this.impulse_queue[ii];
      if (isActionMove(elem)) {
        v2add(temp_pos, temp_pos, elem.pos);
      }
    }
    return temp_pos;
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

  isAnimating(): boolean {
    return this.queueLength() > 1;
  }

  startTurn(rot: DirType, double_time?: number): void {
    let drot = rot - this.effRot();
    if (drot > 2) {
      drot -= 4; // 3 -> -1
    } else if (drot < -2) {
      drot += 4; // -3 -> 1
    }
    let elem = this.pushImpulseState(null, rot, ACTION_ROT, sign(drot));
    if (double_time) {
      elem.double_time = double_time;
    }
  }
  startMove(dir: DirType, double_time?: number): void {
    let elem = this.pushImpulseState(DXY[dir], this.effRot(), ACTION_MOVE, dir);
    if (double_time) {
      elem.double_time = double_time;
    }
  }


  startQueuedMove(): void {
    assert.equal(this.interp_queue.length, 1);
    assert(this.impulse_queue.length > 0);
    let cur = this.interp_queue[0];
    assert(cur.pos);
    let next = this.impulse_queue.splice(0, 1)[0];
    let action_type = next.action_type;
    if (isActionMove(next)) {
      let new_pos = v2add(vec2(), cur.pos, next.pos);
      assert(next.action_dir !== undefined);
      assert(v2same(this.parent.last_dest_pos, cur.pos));
      const {
        bumped_something,
        going_through_door,
      } = startMove(this.parent, next.action_dir, new_pos, cur.rot);
      if (bumped_something) {
        action_type = ACTION_BUMP;
      } else if (going_through_door) {
        cur.double_time = 0;
      }

      if (bumped_something) {
        // Clear any queued impulse
        this.impulse_queue.length = 0;
        next.double_time = 0;
        // Push the bump
        let next_elem = this.pushInterpState(cur.pos, cur.rot, action_type, next);
        next_elem.bump_pos = new_pos;
      } else {
        this.pushInterpState(new_pos, next.rot, action_type, next);
      }
    } else {
      // Rotation, just apply
      assert(next.rot >= 0 && next.rot <= 3);
      this.pushInterpState(cur.pos, next.rot, action_type, next);
    }
  }

  initPosSub(): void {
    this.interp_queue = [];
    this.impulse_queue = [];
    this.move_offs = 0;
    this.pushInterpState(this.parent.last_finished_pos, this.parent.last_finished_rot, ACTION_NONE, null);
  }

  autoStartMove(rot: DirType, offs: number) : void {
    this.startMove(rot);
    this.move_offs = offs;
  }

  cancelAllMoves(): void {
    while (this.interp_queue.length > 1) {
      this.interp_queue.pop();
    }
    this.impulse_queue = [];
  }
  cancelQueuedMoves(): void {
    this.impulse_queue = [];
  }

  allowRepeatImmediately(): boolean {
    // Not currently doing any move
    // Or, we're continuing double-time movement
    return Boolean(this.queueLength() === 1 ||
      this.queueLength() === 2 && this.interp_queue[0].double_time ||
      this.queueLength() === 2 && this.move_offs > 0.45);
  }

  clearDoubleTime(): void {
    let cur = this.queueTail();
    cur.double_time = 0;
  }

  tickMovement(param: TickParam): TickPositions {
    let { dt } = param;
    let {
      interp_queue,
    } = this;
    // tick movement queue
    let easing = 2;
    let do_once = true;
    while (this.queueLength() > 1 && (dt || do_once)) {
      do_once = false;
      let cur = interp_queue[0];
      if (interp_queue.length === 1) {
        this.startQueuedMove();
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
        dt = 0; // Not completely sure: finish only one move per frame, end this frame exactly on this end of move
      } else {
        this.move_offs = (cur_time + dt) / tot_time;
        dt = 0;
      }
    }

    let { game_state } = this.parent;
    let cur = interp_queue[0];
    assert(cur.pos);
    let dest = cur;
    let wall_transits: WallTransit[] = [];
    if (interp_queue.length > 1) {
      let next = interp_queue[1];
      assert(next.pos);
      dest = next;
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
      game_state.angle = lerp(progress, cur_angle, next_angle);
      if (isActionMove(next)) {
        wall_transits.push({
          pos: cur.pos,
          dir: next.action_dir,
        });
      } else if (isActionBump(next)) {
        let p = (1 - abs(1 - progress * 2)) * 0.024;
        v2lerp(game_state.pos, p, cur.pos, next.bump_pos);
      }
    } else {
      v2copy(game_state.pos, cur.pos);
      game_state.angle = cur.rot * PI/2;
    }
    param.dt = dt;

    return {
      dest_pos: dest.pos!,
      dest_rot: dest.rot,
      finished_pos: cur.pos,
      finished_rot: cur.rot,
      wall_transits,
    };
  }
}

class CrawlerControllerInstantStep implements PlayerController {
  protected pos: Vec2 = vec2();
  protected rot!: DirType;

  constructor(public parent: CrawlerController) {
  }

  initPosSub(): void {
    v2copy(this.pos, this.parent.last_finished_pos);
    this.rot = this.parent.last_finished_rot;
  }
  tickMovement(param: TickParam): TickPositions {
    let { game_state } = this.parent;

    v2copy(game_state.pos, this.pos);
    game_state.angle = this.rot * PI / 2;

    return {
      dest_pos: this.pos,
      dest_rot: this.rot,
      finished_pos: this.pos,
      finished_rot: this.rot,
      wall_transits: [],
    };
  }
  allowRepeatImmediately(): boolean {
    return false;
  }

  effRot(): DirType {
    return this.rot;
  }
  effPos(): ROVec2 {
    return this.pos;
  }
  isMoving(): boolean {
    return false;
  }
  isAnimating(): boolean {
    return false;
  }
  startTurn(rot: DirType): void {
    assert(rot >= 0 && rot <= 3);
    this.rot = rot;
  }
  startMove(dir: DirType): void {
    let { script_api } = this.parent;
    let new_pos = v2add(vec2(), this.pos, DXY[dir]);
    const {
      bumped_something,
      bumped_entity,
    } = startMove(this.parent, dir, new_pos, this.rot);

    if (bumped_something) {
      // TODO: animate a bump towards `new_pos`? play sound?
      if (!bumped_entity) {
        script_api.status('move_blocked', '*BUMP*');
      }
    } else {
      v2copy(this.pos, new_pos);
    }
  }
  autoStartMove(rot: DirType, offs: number): void {
    this.startMove(rot);
  }
}

const BLEND_POS_T = WALK_TIME;
const BLEND_ROT_T = ROT_TIME;
const BLEND_RATE: Record<ActionType, number> = {
  [ACTION_NONE]: 1,
  [ACTION_MOVE]: 1/BLEND_POS_T,
  [ACTION_BUMP]: 1/BLEND_POS_T,
  [ACTION_ROT]: 1/BLEND_ROT_T,
};
class CrawlerControllerInstantBlend extends CrawlerControllerInstantStep {
  pos_blend_from = vec2();
  rot_blend_from!: DirType;
  blends: {
    t: number; // 0...1
    action_type: ActionType;
    delta_pos?: Vec2;
    finish_pos?: Vec2;
    delta_rot?: number;
    finish_rot?: DirType;
    transit?: WallTransit;
  }[] = [];

  blend_pos = vec2();
  initPosSub(): void {
    v2copy(this.pos, this.parent.last_finished_pos);
    this.rot = this.parent.last_finished_rot;
    v2copy(this.pos_blend_from, this.pos);
    this.rot_blend_from = this.rot;
    this.blends = [];
  }

  isMoving(): boolean {
    return false;
  }
  isAnimating(): boolean {
    return this.blends.length > 0;
  }
  tickMovement(param: TickParam): TickPositions {
    let { dt } = param;
    let { game_state } = this.parent;
    let { blends } = this;

    let { blend_pos } = this;
    v2copy(blend_pos, this.pos_blend_from);
    let blend_rot = this.rot_blend_from;

    let wall_transits: WallTransit[] = [];

    for (let ii = 0; ii < blends.length; ++ii) {
      let blend = blends[ii];
      blend.t += dt * BLEND_RATE[blend.action_type];
      if (blend.t >= 1) {
        if (blend.action_type === ACTION_MOVE) {
          v2copy(this.pos_blend_from, blend.finish_pos!);
          v2copy(blend_pos, this.pos_blend_from);
        } else if (blend.action_type === ACTION_ROT) {
          this.rot_blend_from = blend.finish_rot!;
          blend_rot = this.rot_blend_from;
        }
        blends.splice(ii, 1);
        --ii;
        continue;
      }
      let t = easeInOut(blend.t, 2);
      if (blend.action_type === ACTION_MOVE) {
        v2addScale(blend_pos, blend_pos, blend.delta_pos!, t);
        wall_transits.push(blend.transit!);
      } else if (blend.action_type === ACTION_ROT) {
        blend_rot += blend.delta_rot! * t;
      } else if (blend.action_type === ACTION_BUMP) {
        let p = (1 - abs(1 - t * 2)) * 0.024;
        v2addScale(blend_pos, blend_pos, blend.delta_pos!, p);
      }
    }
    v2copy(game_state.pos, blend_pos);
    game_state.angle = blend_rot * PI / 2;

    return {
      dest_pos: this.pos,
      dest_rot: this.rot,
      // finished_pos: this.pos_blend_from,
      // finished_rot: this.rot_blend_from,
      finished_pos: this.pos,
      finished_rot: this.rot,
      wall_transits,
    };
  }

  startTurn(rot: DirType): void {
    assert(rot >= 0 && rot <= 3);
    let drot = rot - this.rot;
    if (drot > 2) {
      drot -= 4; // 3 -> -1
    } else if (drot < -2) {
      drot += 4; // -3 -> 1
    }
    this.rot = rot;
    this.blends.push({
      t: 0,
      action_type: ACTION_ROT,
      delta_rot: drot,
      finish_rot: this.rot,
    });
  }
  startMove(dir: DirType): boolean {
    let { blends } = this;
    let delta_pos = DXY[dir];
    let new_pos = v2add(vec2(), this.pos, delta_pos);
    const {
      bumped_something,
      bumped_entity,
    } = startMove(this.parent, dir, new_pos, this.rot);

    if (bumped_something) {
      if (!bumped_entity) {
        let tail = blends[blends.length - 1];
        if (tail && tail.action_type === ACTION_BUMP && tail.delta_pos === delta_pos) {
          // two identical bumps, just ignore, they may add up to penetrate a wall
        } else {
          blends.push({
            t: 0,
            action_type: ACTION_BUMP,
            delta_pos,
          });
        }
      }
      return false;
    } else {
      let transit: WallTransit = {
        pos: this.pos.slice(0) as Vec2,
        dir,
      };
      v2copy(this.pos, new_pos);
      blends.push({
        t: 0,
        action_type: ACTION_MOVE,
        delta_pos,
        finish_pos: this.pos.slice(0) as Vec2,
        transit,
      });
      return true;
    }
  }
  autoStartMove(rot: DirType, offs: number): void {
    if (this.startMove(rot)) {
      let tail = this.blends[this.blends.length - 1];
      tail.t += offs;
    }
  }
}

const BLEND2_POS_T = WALK_TIME;
const BLEND2_ROT_T = ROT_TIME;
const BLEND2_RATE: Record<ActionType, number> = {
  [ACTION_NONE]: 1,
  [ACTION_MOVE]: 1/BLEND2_POS_T,
  [ACTION_BUMP]: 1/BLEND2_POS_T,
  [ACTION_ROT]: 1/BLEND2_ROT_T,
};
type Blend2 = {
  t: number; // 0...1
  started: boolean;
  finished: boolean;
  uncancelable: boolean;
  action_type: ActionType;
  delta_pos?: Vec2;
  finish_pos: Vec2;
  delta_rot?: number;
  finish_rot: DirType;
  transit?: WallTransit;
};
class CrawlerControllerQueued2 extends CrawlerControllerInstantStep {
  pos_blend_from = vec2();
  rot_blend_from!: DirType;
  blends: Blend2[] = [];

  effRot(): DirType {
    let { blends } = this;
    if (!blends.length) {
      return this.rot;
    }
    return blends[blends.length - 1].finish_rot;
  }
  effPos(): ROVec2 {
    let { blends } = this;
    if (!blends.length) {
      return this.pos;
    }
    return blends[blends.length - 1].finish_pos;
  }

  blend_pos = vec2();
  initPosSub(): void {
    v2copy(this.pos, this.parent.last_finished_pos);
    this.rot = this.parent.last_finished_rot;
    v2copy(this.pos_blend_from, this.pos);
    this.rot_blend_from = this.rot;
    this.blends = [];
  }
  is_blend_stopped = false;
  isMoving(): boolean {
    return this.is_blend_stopped;
  }
  isAnimating(): boolean {
    return this.blends.length > 0;
  }
  startQueuedMove(blend: Blend2): boolean {
    if (blend.action_type === ACTION_MOVE) {
      let dir = dirFromDelta(blend.delta_pos!);
      const {
        bumped_something,
        bumped_entity,
      } = startMove(this.parent, dir, blend.finish_pos, blend.finish_rot);

      if (bumped_something) {
        if (bumped_entity) {
          return false; // remove it
        }
        let { blends } = this;
        let predecessor = blends[blends.indexOf(blend) - 1];
        if (predecessor && predecessor.action_type === ACTION_BUMP && predecessor.delta_pos === blend.delta_pos) {
          // two identical bumps, remove it, they may add up to penetrate a wall
          return false;
        }
        // change it to a bump
        blend.started = true;
        blend.action_type = ACTION_BUMP;
        blend.finish_pos = this.pos.slice(0) as Vec2;
      } else {
        blend.started = true;
        v2copy(this.pos, blend.finish_pos);
      }
    } else if (blend.action_type === ACTION_ROT) {
      this.rot = blend.finish_rot;
      blend.started = true;
    } else {
      assert(false);
    }
    return true;
  }
  cancelAllMoves(): void {
    this.blends = this.blends.filter((blend) => blend.started || blend.uncancelable);
    // also need to cancel un-finished blends?
  }
  cancelQueuedMoves(): void {
    this.cancelAllMoves();
  }

  time_boost = 0;
  tickMovement(param: TickParam): TickPositions {
    let { dt } = param;
    let { game_state } = this.parent;
    let { blends, time_boost } = this;

    let had_blend_x = 0;
    let had_blend_y = 0;
    let { blend_pos } = this;
    v2copy(blend_pos, this.pos_blend_from);
    let blend_rot = this.rot_blend_from;
    let max_accel = dt * 0.015;
    if (this.is_blend_stopped) {
      // we previously blocked due to perpendicular blending, accelerate time
      time_boost = min(1.5, time_boost + max_accel);
    } else {
      time_boost = max(0, time_boost - max_accel);
    }
    this.time_boost = time_boost;
    this.is_blend_stopped = false;
    let did_start_finish = false;
    let finished_pos: Vec2 | null = null;
    let finished_rot: DirType = 0;
    let last_blend: Blend2 | null = null;
    let wall_transits: WallTransit[] = [];
    for (let ii = 0; ii < blends.length; ++ii) {
      let blend = blends[ii];
      if (blend.t < 0.667) {
        if (blend.action_type === ACTION_MOVE) {
          if (blend.delta_pos![0]) {
            if (had_blend_y || had_blend_x && had_blend_x !== blend.delta_pos![0]) {
              this.is_blend_stopped = true;
              break;
            }
            had_blend_x = blend.delta_pos![0];
          } else {
            if (had_blend_x || had_blend_y && had_blend_y !== blend.delta_pos![1]) {
              this.is_blend_stopped = true;
              break;
            }
            had_blend_y = blend.delta_pos![1];
          }
        }
      }
      if (!blend.started && (!last_blend || last_blend.finished)) {
        if (did_start_finish) {
          this.is_blend_stopped = true;
          break;
        }
        if (!this.startQueuedMove(blend)) {
          this.cancelAllMoves();
          break;
        }
        did_start_finish = true;
      }
      if (!blend.finished && !did_start_finish && ii !== blends.length - 1) {
        // have something after us, let's finish this (cause end-of-move events
        //   like pits to trigger) so we can start the next thing as soon as possible
        blend.finished = true;
        did_start_finish = true;
      }
      if (blend.finished) {
        finished_pos = blend.finish_pos;
        finished_rot = blend.finish_rot;
      }
      blend.t = min(1, blend.t + dt * BLEND2_RATE[blend.action_type] * (1 + time_boost));
      if (blend.t === 1) {
        if (!blend.finished) {
          blend.finished = true;
          did_start_finish = true;
          finished_pos = blend.finish_pos;
          finished_rot = blend.finish_rot;
        }
        if (ii === 0) {
          if (blend.action_type === ACTION_MOVE) {
            v2copy(this.pos_blend_from, blend.finish_pos!);
            v2copy(blend_pos, this.pos_blend_from);
          } else if (blend.action_type === ACTION_ROT) {
            this.rot_blend_from = blend.finish_rot!;
            blend_rot = this.rot_blend_from;
          }
          blends.splice(ii, 1);
          --ii;
          continue;
        }
      }
      let t = easeInOut(blend.t, 2);
      if (blend.action_type === ACTION_MOVE) {
        v2addScale(blend_pos, blend_pos, blend.delta_pos!, t);
        wall_transits.push(blend.transit!);
      } else if (blend.action_type === ACTION_ROT) {
        blend_rot += blend.delta_rot! * t;
      } else if (blend.action_type === ACTION_BUMP) {
        let p = (1 - abs(1 - t * 2)) * 0.024;
        v2addScale(blend_pos, blend_pos, blend.delta_pos!, p);
      }
      last_blend = blend;
    }
    v2copy(game_state.pos, blend_pos);
    game_state.angle = blend_rot * PI / 2;

    if (!finished_pos) {
      finished_pos = this.pos_blend_from;
      finished_rot = this.rot_blend_from;
    }

    return {
      dest_pos: this.pos,
      dest_rot: this.rot,
      finished_pos,
      finished_rot,
      wall_transits,
    };
  }

  startTurn(rot: DirType): void {
    assert(rot >= 0 && rot <= 3);
    let drot = rot - this.effRot();
    if (drot > 2) {
      drot -= 4; // 3 -> -1
    } else if (drot < -2) {
      drot += 4; // -3 -> 1
    }
    this.blends.push({
      t: 0,
      started: false,
      finished: false,
      uncancelable: false,
      action_type: ACTION_ROT,
      delta_rot: drot,
      finish_rot: rot,
      finish_pos: this.effPos().slice(0) as Vec2,
    });
  }
  startMove(dir: DirType): boolean {
    let cur_pos = this.effPos();
    let transit: WallTransit = {
      pos: cur_pos.slice(0) as Vec2,
      dir,
    };
    let new_pos = v2add(vec2(), cur_pos, DXY[dir]);
    this.blends.push({
      t: 0,
      started: false,
      finished: false,
      uncancelable: false,
      action_type: ACTION_MOVE,
      delta_pos: DXY[dir],
      finish_rot: this.effRot(),
      finish_pos: new_pos,
      transit,
    });
    return true;
  }
  autoStartMove(rot: DirType, offs: number): void {
    if (this.startMove(rot)) {
      let tail = this.blends[this.blends.length - 1];
      tail.uncancelable = true;
      tail.t += offs;
    }
  }
}


export type PlayerMotionParam = {
  button_x0: number;
  button_y0: number;
  no_visible_ui: boolean;
  show_buttons: boolean;
  show_debug: { x: number; y: number } | null;
  disable_move: boolean;
  disable_player_impulse: boolean;
  button_w: number;
  button_sprites: Record<ButtonStateString, Sprite>;
  dt: number;
  do_debug_move: boolean;
};

function controllerFromType(type: string, parent: CrawlerController): PlayerController {
  switch (type) {
    case 'instant':
      return new CrawlerControllerInstantStep(parent);
    case 'instantblend':
      return new CrawlerControllerInstantBlend(parent);
    case 'queued2':
      return new CrawlerControllerQueued2(parent);
    case 'queued':
      return new CrawlerControllerQueued(parent);
    default:
      assert(false, type);
  }
}

export class CrawlerController {
  game_state: CrawlerState;
  entity_manager: ClientEntityManagerInterface<EntityCrawlerClient>;
  script_api: CrawlerScriptAPIClient;
  on_init_level?: (floor_id: number) => void;
  on_enter_cell?: (pos: Vec2) => void;
  flush_vis_data?: (force: boolean) => void;
  player_controller!: PlayerController;
  controller_type!: string;
  constructor(param: {
    game_state: CrawlerState;
    entity_manager: ClientEntityManagerInterface<EntityCrawlerClient>;
    script_api: CrawlerScriptAPIClient;
    on_init_level?: (floor_id: number) => void;
    on_enter_cell?: (pos: Vec2) => void;
    flush_vis_data?: (force: boolean) => void;
    controller_type?: string;
  }) {
    this.game_state = param.game_state;
    this.entity_manager = param.entity_manager;
    this.script_api = param.script_api;
    this.flush_vis_data = param.flush_vis_data;
    this.on_init_level = param.on_init_level;
    this.on_enter_cell = param.on_enter_cell;
    this.setControllerType(param.controller_type || 'queued');
    this.script_api.setController(this);
  }

  on_player_move?: (old_pos: Vec2, new_pos: Vec2, move_dir: DirType) => void;
  setOnPlayerMove(fn: (old_pos: Vec2, new_pos: Vec2, move_dir: DirType) => void): void {
    this.on_player_move = fn;
  }
  on_init_pos?: (pos: Vec2, rot: DirType) => void;
  setOnInitPos(fn: (pos: Vec2, rot: DirType) => void): void {
    this.on_init_pos = fn;
  }

  updateEntAfterBuildModeSwitch(): void {
    let my_online_ent = this.entity_manager.getMyEnt();
    if (my_online_ent.data.floor !== this.game_state.floor_id) {
      this.applyPlayerFloorChange([this.last_dest_pos[0], this.last_dest_pos[1], this.last_dest_rot],
        this.game_state.floor_id, undefined, () => {
          // ignore
        });
    } else {
      this.applyPlayerMove('move_debug', [this.last_dest_pos[0], this.last_dest_pos[1], this.last_dest_rot]);
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

  cam_pos_z_offs = 0.5;
  cam_pos: Vec3 = vec3(0, 0, 0);
  mode: 'modeCrawl' | 'modeFreecam' = 'modeCrawl';
  fade_override = 0;
  move_blocker: MoveBlocker | null = null;
  transitioning_floor = false;
  fade_alpha = 0;
  fade_v = 0;
  prev_pos = vec2();
  last_dest_pos!: Vec2;
  last_dest_rot: DirType = 0;
  last_finished_pos!: Vec2;
  last_finished_rot: DirType = 0;
  last_type: CellDesc | undefined;
  path_to: Vec2 | null = null;
  path_to_last_step = 0;
  last_action_time = 0;
  last_action_hash = 0; // dx + dy * 8 + rot * 64;
  is_repeating = false;
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

  controllerIsAnimating(): boolean {
    if (this.mode !== 'modeCrawl') {
      return false;
    }
    return this.player_controller.isAnimating();
  }

  getControllerType(): string {
    return this.controller_type;
  }
  setControllerType(type: string): void {
    let reinit = Boolean(this.controller_type);
    this.controller_type = type;
    this.player_controller = controllerFromType(type, this);
    if (reinit) {
      this.initPos(false);
    }
  }

  doPlayerMotion(param: PlayerMotionParam): void {
    this.fade_v = 0;
    this.fade_alpha = 0;

    if (!this.canRun()) {
      return;
    }

    if ((engine.DEBUG || buildModeActive()) && keyDownEdge(KEYS.F2)) {
      this.mode = this.mode === 'modeFreecam' ? 'modeCrawl' : 'modeFreecam';
      if (this.mode === 'modeCrawl') {
        v2floor(this.game_state.pos, this.freecam_pos);
        let eff_angle_idx = (round(this.freecam_angle / (PI/2)) + 1024) % 4;
        this.game_state.angle = eff_angle_idx * PI/2;
        this.initPos(false);
        this.applyPlayerMove('move_debug', [this.last_dest_pos[0], this.last_dest_pos[1], this.last_dest_rot]);
      } else {
        v2add(this.freecam_pos, this.game_state.pos, half_vec);
        this.freecam_pos[2] = 0.5;
        if (this.game_state.level) {
          this.freecam_pos[2] += this.game_state.level.getInterpolatedHeight(
            this.game_state.pos[0], this.game_state.pos[1]);
        }
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
      let { x, y } = param.show_debug;
      let z = Z.DEBUG;
      const text_height = uiTextHeight();
      let my_ent = entity_manager.hasMyEnt() ? entity_manager.getMyEnt() : null;
      ui.print(null, x, y, z, `Pos: ${game_state.pos[0]},${game_state.pos[1]}` +
        `  Floor: ${my_ent?.data.floor}`);
      y += text_height;
      ui.print(null, x, y, z, `Angle: ${(game_state.angle / PI * 180).toFixed(0)}`);
      y += text_height;
      ui.print(null, x, y, z, `Angle Idx: ${this.player_controller.effRot()}`);
      y += text_height;
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

  getEntInFront(): EntityID | null {
    if (this.player_controller.isMoving()) {
      return null;
    }
    const { game_state, last_dest_pos, last_dest_rot, script_api } = this;
    const { level } = game_state;
    assert(level);
    script_api.setLevel(level);
    script_api.setPos(last_dest_pos);
    if (!level.wallsBlock(last_dest_pos, last_dest_rot, script_api)) {
      v2add(temp_pos, last_dest_pos, DXY[last_dest_rot]);
      return !buildModeActive() && entityBlocks(game_state.floor_id, temp_pos, false) || null;
    } else {
      return null;
    }
  }

  getCellInFront(): CrawlerCell | null {
    if (this.player_controller.isMoving()) {
      return null;
    }
    const { game_state, last_dest_pos, last_dest_rot, script_api } = this;
    const { level } = game_state;
    assert(level);
    script_api.setLevel(level);
    script_api.setPos(last_dest_pos);
    if (!(level.wallsBlock(last_dest_pos, last_dest_rot, script_api) & BLOCK_VIS)) {
      v2add(temp_pos, last_dest_pos, DXY[last_dest_rot]);
      return !buildModeActive() && level.getCell(temp_pos[0], temp_pos[1]) || null;
    } else {
      return null;
    }
  }

  // where we're (eventually) interpolating to
  getEffPos(): ROVec2 {
    return this.player_controller.effPos();
  }
  getEffRot(): DirType {
    return this.player_controller.effRot();
  }

  static PLAYER_MOVE_FIELD = 'seq_player_move';
  private applyPlayerMove(
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
    this.last_dest_pos = cur_pos.slice(0) as Vec2;
    v2copy(prev_pos, this.last_dest_pos);
    this.last_dest_rot = cur_rot;
    this.last_finished_pos = cur_pos.slice(0) as Vec2;
    this.last_finished_rot = cur_rot;
    this.path_to = null;
    if (this.on_init_pos) {
      this.on_init_pos(cur_pos, cur_rot);
    }
    this.player_controller.initPosSub();
    let cur_cell = game_state.level!.getCell(cur_pos[0], cur_pos[1]);
    if (cur_cell) {
      this.last_type = cur_cell.desc;
      if (cur_cell.desc.auto_evict) {
        for (let ii = 0; ii < 4; ++ii) {
          let rot = dirMod(cur_rot + ii);
          if (cur_cell.walls[rot].open_move && from_my_ent &&
            game_state.level!.getCell(cur_pos[0] + DX[rot], cur_pos[1] + DY[rot])!.desc.open_move
          ) {
            this.player_controller.autoStartMove(rot, 0.5);
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
    specific_pos?: JSVec3,
    keep_rot?: boolean,
  ): void {
    assert(!this.transitioning_floor);
    this.transitioning_floor = true;
    let runme: VoidFunc | null = null;
    this.setMoveBlocker(() => {
      if (!this.controllerIsAnimating()) {
        this.fade_override = 1;
      }
      runme?.();
      return this.transitioning_floor;
    });
    if (this.flush_vis_data) {
      this.flush_vis_data(true);
    }
    this.game_state.getLevelForFloorAsync(new_floor_id, (level: CrawlerLevel) => {
      let new_pos: JSVec3 = specific_pos ?
        specific_pos : level.special_pos[special_pos_key || 'stairs_in'] || level.special_pos.stairs_in;
      if (keep_rot) {
        let cur_rot = this.myEnt().data.pos[2];
        new_pos = [new_pos[0], new_pos[1], cur_rot];
      }

      let cell = level.getCell(new_pos[0], new_pos[1]); // may be -1 => null cell
      if (!cell || !cell.desc.open_vis) {
        // need initial position
        new_pos = level.special_pos.stairs_in;
      }
      // wait until this.controllerAnimating() is false before continuing
      runme = () => {
        if (this.controllerIsAnimating()) {
          return;
        }
        runme = null;
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
      };
    });
  }

  floorDelta(delta: number, special_pos_key: string, keep_rot: boolean): void {
    let floor_id = this.myEnt().data.floor;
    assert.equal(typeof floor_id, 'number');
    assert(floor_id + delta >= 0);
    this.goToFloor(floor_id + delta, special_pos_key, undefined, undefined, keep_rot);
  }

  floorAbsolute(floor_id: number, x: number, y: number, rot?: DirType): void {
    if (rot === undefined) {
      rot = this.myEnt().data.pos[2] as DirType;
    }
    this.goToFloor(floor_id, undefined, undefined, [x, y, rot]);
  }

  cancelQueuedMoves(): void {
    this.player_controller.cancelQueuedMoves?.();
  }

  forceMove(dir: DirType): void {
    this.player_controller.cancelAllMoves?.();
    this.player_controller.startMove(dir);
  }

  moveBlockPit(): boolean {
    this.pit_time += this.controllerIsAnimating() ? 0 : getFrameDt();
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
      this.cam_pos_z_offs = 0.5 - easeIn(pit_progress, 2);
      this.fade_override = clamp(pit_progress * 2 - 1, 0, 1);
    } else {
      this.cam_pos_z_offs = 0.5;
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
    this.setMoveBlocker(this.moveBlockPit.bind(this));
  }

  playerMoveFinish(level: CrawlerLevel, finished_pos: Vec2): void {
    const { game_state, script_api, last_finished_pos } = this;
    let new_cell = level.getCell(finished_pos[0], finished_pos[1]);
    if (new_cell) {
      let prev_cell = level.getCell(last_finished_pos[0], last_finished_pos[1]);
      new_cell.visible_bits |= VIS_VISITED;
      if (last_finished_pos[0] === finished_pos[0] + 1 && (
        new_cell.walls[EAST].is_secret || prev_cell?.walls[WEST].is_secret
      )) {
        new_cell.visible_bits |= VIS_PASSED_EAST;
      } else if (last_finished_pos[1] === finished_pos[1] + 1 && (
        new_cell.walls[NORTH].is_secret || prev_cell?.walls[SOUTH].is_secret
      )) {
        new_cell.visible_bits |= VIS_PASSED_NORTH;
      }
      if (last_finished_pos[0] === finished_pos[0] - 1 && (
        new_cell.walls[WEST].is_secret || prev_cell?.walls[EAST].is_secret
      )) {
        let ncell = level.getCell(finished_pos[0] - 1, finished_pos[1]);
        if (ncell) {
          assert.equal(ncell, prev_cell);
          ncell.visible_bits |= VIS_PASSED_EAST;
        }
      } else if (last_finished_pos[1] === finished_pos[1] - 1 && (
        new_cell.walls[SOUTH].is_secret || prev_cell?.walls[NORTH].is_secret
      )) {
        let ncell = level.getCell(finished_pos[0], finished_pos[1] - 1);
        if (ncell) {
          assert.equal(ncell, prev_cell);
          ncell.visible_bits |= VIS_PASSED_NORTH;
        }
      }
    }
    v2copy(last_finished_pos, finished_pos);
    this.map_update_this_frame = true;
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
    if (new_cell && !buildModeActive()) {
      if (new_cell.events) {
        assert(new_cell.events.length);
        script_api.setLevel(game_state.level!);
        script_api.setPos(finished_pos);
        crawlerScriptRunEvents(script_api, new_cell, CrawlerScriptWhen.POST);
      }
      this.on_enter_cell?.(finished_pos);
    }
  }

  playerMoveStart(action_id: string, new_pos: Vec2, new_rot: DirType): void {
    const { game_state, script_api } = this;

    let old_pos = this.last_dest_pos;
    let pos_changed = !v2same(old_pos, new_pos);
    if (pos_changed) {
      let move_dir = dirFromMove(old_pos, new_pos);
      let level = game_state.level!;
      let cell1 = level.getCell(old_pos[0], old_pos[1]);
      let wall1 = cell1 && cell1.walls[move_dir];
      let cell2 = level.getCell(new_pos[0], new_pos[1]);
      let wall2 = cell2 && cell2.walls[dirMod(move_dir + 2)];
      if (wall1 && wall1.swapped.sound_id) {
        playUISound(wall1.swapped.sound_id);
      } else if (wall2 && wall2.swapped.sound_id) {
        playUISound(wall2.swapped.sound_id);
      }

      if (cell2 && cell2.desc.swapped.sound_id === null) {
        // no sound
      } else {
        playUISound(cell2 && cell2.desc.swapped.sound_id || 'footstep');
      }

      if (this.on_player_move) {
        this.on_player_move(old_pos, new_pos, move_dir);
      }

      if (cell2 && cell2.events) {
        assert(cell2.events.length);
        if (action_id === 'move_debug') {
          script_api.status('build_event', `Note: no events run in ${buildModeActive() ? 'BUILD MODE' : 'debug'}`);
        } else {
          // TODO: if anything is predicted (keySet?) it should be cleared once the
          //   server has also run the event
          script_api.setLevel(game_state.level!);
          script_api.setPos(new_pos);
          crawlerScriptRunEvents(script_api, cell2, CrawlerScriptWhen.PRE);
        }
      }

      v2copy(this.prev_pos, this.last_dest_pos);
      v2copy(this.last_dest_pos, new_pos);
    }
    this.last_dest_rot = new_rot;

    this.applyPlayerMove(action_id, [new_pos[0], new_pos[1], new_rot],
      pos_changed ? this.resyncPosOnError.bind(this) : undefined);
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

  applyForceFace(game_state: CrawlerState, dt: number): void {
    let ffw = this.forceFaceUpdateWeight(dt);
    if (ffw) {
      assert(typeof this.force_face_dir === 'number');
      game_state.angle = lerpAngle(ffw, game_state.angle, this.force_face_dir * PI/2);
    }
  }

  startRelativeMove(dx: number, dy: number): void {
    this.last_action_time = getFrameTimestamp();
    this.last_action_hash = dx + dy * 8;
    let impulse_idx = this.player_controller.effRot();
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
    this.player_controller.startMove(impulse_idx);
    this.path_to = null;
  }

  startTurn(target_dir: DirType): void {
    this.last_action_time = getFrameTimestamp();
    this.last_action_hash = target_dir * 64;
    this.player_controller.startTurn(target_dir);
    this.path_to = null;
  }

  applyFade(positions: TickPositions): void {
    let { game_state, script_api } = this;
    let level = game_state.level!;
    let { pos, angle } = game_state;
    let { wall_transits } = positions;
    let max_alpha = this.fade_override;
    let pos_offs = crawlerRenderGetPosOffs();
    let cur_angle_as_rot = angle / (PI/2);
    for (let ii = 0; ii < wall_transits.length; ++ii) {
      let transit = wall_transits[ii];
      let cur_cell = level.getCell(transit.pos[0], transit.pos[1]);
      if (!cur_cell) {
        continue;
      }
      // let cur_angle = cur.rot * PI / 2;
      let wall_type = getEffWall(script_api, cur_cell, transit.dir).swapped;
      if (wall_type.open_vis) {
        continue;
      }
      let pos_through_door_angle = dirMod(cur_angle_as_rot - transit.dir + 4);
      let cutoff0 = (1 - pos_offs[1]) / 2;
      let cutoff1 = (1 - pos_offs[0]) / 2;
      let cutoff2 = (1 + pos_offs[1]) / 2;
      let cutoff3 = (1 + pos_offs[0]) / 2;
      let cutoff;
      if (pos_through_door_angle < 1) {
        cutoff = lerp(pos_through_door_angle, cutoff0, cutoff1);
      } else if (pos_through_door_angle < 2) {
        cutoff = lerp(pos_through_door_angle - 1, cutoff1, cutoff2);
      } else if (pos_through_door_angle < 3) {
        cutoff = lerp(pos_through_door_angle - 2, cutoff2, cutoff3);
      } else {
        cutoff = lerp(pos_through_door_angle - 3, cutoff3, cutoff0);
      }
      let progress;
      if (transit.dir === EAST) {
        progress = pos[0] - transit.pos[0];
      } else if (transit.dir === NORTH) {
        progress = pos[1] - transit.pos[1];
      } else if (transit.dir === WEST) {
        progress = transit.pos[0] - pos[0];
      } else /* SOUTH */ {
        progress = transit.pos[1] - pos[1];
      }
      progress = clamp(progress, 0, 1);
      let alpha;
      if (progress < cutoff) {
        alpha = progress/cutoff;
      } else {
        alpha = 1 - (progress - cutoff) / (1 - cutoff);
      }
      max_alpha = max(max_alpha, alpha);

      // let next_cell = level.getCell(next.pos[0], next.pos[1]);
      // this.fade_v = next_cell.type === CellType.STAIRS_IN || cur_cell.type === CellType.STAIRS_IN ? 1 : 0;
      // this.fade_v = next_cell.type === CellType.STAIRS_IN || next_cell.type === CellType.STAIRS_OUT ||
      //   cur_cell.type === CellType.STAIRS_IN || cur_cell.type === CellType.STAIRS_OUT ? 1 : 0;
    }
    this.fade_alpha = max_alpha;
  }

  approx_pos = vec2();
  modeCrawl(param: PlayerMotionParam): void {
    const frame_timestamp = getFrameTimestamp();
    const {
      button_x0,
      button_y0,
      no_visible_ui,
      button_w,
      button_sprites,
      show_buttons,
      disable_move,
      disable_player_impulse,
    } = param;
    let dt = param.dt;
    const {
      last_dest_pos,
      last_finished_pos,
      prev_pos,
      game_state,
    } = this;
    const build_mode = buildModeActive();

    let no_move = this.hasMoveBlocker() || disable_move || disable_player_impulse;

    if (no_move) { // was: disable_player_impulse
      this.path_to = null;
    }

    let down: ControllerInputs = {
      forward: 0,
      left: 0,
      back: 0,
      right: 0,
      turn_left: 0,
      turn_right: 0,
    };
    type ValidKeys = keyof ControllerInputs;
    let down_edge = {
      forward: 0,
      left: 0,
      back: 0,
      right: 0,
      turn_left: 0,
      turn_right: 0,
    } as Record<ValidKeys, number>;

    let disabled = no_move || disable_player_impulse;
    function button(
      rx: number, ry: number,
      frame: number,
      key: ValidKeys,
      keys: number[],
      pads: number[],
      toggled_down?: boolean,
      touch_hotzone?: Box,
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
        disabled,
        button_sprites,
        touch_hotzone,
      });
      down_edge[key] += ret.down_edge;
      down[key] += ret.down;
      // up_edge[key] += ret.up_edge;
    }

    // Check for intentional events
    // v2add(temp_pos, last_dest_pos, DXY[this.last_dest_rot]);
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
        keys_forward.push(KEYS.UP);
        keys_back.push(KEYS.DOWN);
        pad_turn_left.push(PAD.LEFT);
        pad_forward.push(PAD.UP);
        pad_turn_right.push(PAD.RIGHT);
        pad_left.push(PAD.LEFT_BUMPER);
        pad_back.push(PAD.DOWN);
        pad_right.push(PAD.RIGHT_BUMPER);
      }
      if (settings.turn_toggle) {
        let t = keys_turn_left;
        keys_turn_left = keys_left;
        keys_left = t;
        t = keys_turn_right;
        keys_turn_right = keys_right;
        keys_right = t;
        t = pad_turn_left;
        pad_turn_left = pad_left;
        pad_left = t;
        t = pad_turn_right;
        pad_turn_right = pad_right;
        pad_right = t;
      }
      if (!uiHandlingNav()) {
        // not affected by turn_toggle
        keys_turn_left.push(KEYS.LEFT);
        keys_turn_right.push(KEYS.RIGHT);
      }

      let left_hotzone: Box | undefined;
      let forward_hotzone: Box | undefined;
      let back_hotzone: Box | undefined;
      let right_hotzone: Box | undefined;
      if (!uiHandlingNav() && !disabled && !build_mode) {
        // do touch controls on the viewport
        let viewport = crawlerRenderViewportGet();
        let leftright_w = floor(viewport.w * 0.24);
        left_hotzone = {
          ...viewport,
          w: leftright_w,
        };
        right_hotzone = {
          ...viewport,
          x: viewport.x + viewport.w - leftright_w,
          w: leftright_w,
        };
        forward_hotzone = {
          x: left_hotzone.x + left_hotzone.w,
          y: viewport.y,
          w: viewport.w - left_hotzone.w - right_hotzone.w,
          h: floor(viewport.h * 0.84),
        };
        back_hotzone = {
          ...forward_hotzone,
          y: forward_hotzone.y + forward_hotzone.h,
          h: viewport.h - forward_hotzone.h,
        };
      }

      button(0, 0, 0, 'turn_left', keys_turn_left, pad_turn_left, false, left_hotzone);
      button(1, 0, forward_frame, 'forward', keys_forward, pad_forward, false, forward_hotzone);
      button(2, 0, 2, 'turn_right', keys_turn_right, pad_turn_right, false, right_hotzone);
      button(0, 1, 3, 'left', keys_left, pad_left);
      button(1, 1, 4, 'back', keys_back, pad_back, false, back_hotzone);
      button(2, 1, 5, 'right', keys_right, pad_right);
    }

    let level = game_state.level!;

    if (!no_move) {
      let eff_rot = this.player_controller.effRot();
      {
        let drot = down_edge.turn_left;
        drot -= down_edge.turn_right;
        while (drot) {
          let s = sign(drot);
          eff_rot = dirMod(eff_rot + s + 4);
          this.startTurn(eff_rot);
          drot -= s;
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
          if (frame_timestamp - this.last_action_time < KEY_REPEAT_TIME_MOVE_RATE &&
            this.last_action_hash === (dx + dy * 8)
          ) {
            // Pressed the same action again within the repeat period, double-tap, start repeating if held
            this.is_repeating = true;
          }
          this.startRelativeMove(dx, dy);
        }
      }

      if (!this.player_controller.isMoving() &&
        frame_timestamp - this.last_action_time >= KEY_REPEAT_TIME_ROT
      ) {
        // Not currently doing any move
        // Check for held rotation inputs
        let drot = 0;
        drot += down.turn_left;
        drot -= down.turn_right;
        let drot2 = sign(drot);
        if (drot2) {
          eff_rot = dirMod(eff_rot + drot2 + 4);
          this.startTurn(eff_rot);
        }
      }

      let kb_repeat_rate = this.is_repeating ? KEY_REPEAT_TIME_MOVE_RATE : KEY_REPEAT_TIME_MOVE_DELAY;
      if (!this.player_controller.isMoving() && frame_timestamp - this.last_action_time >= kb_repeat_rate ||
        this.player_controller.allowRepeatImmediately()
      ) {
        // Check for held movement inputs
        let dx = 0;
        dx += down.left;
        dx -= down.right;
        let dy = 0;
        dy += down.forward;
        dy -= down.back;
        if (dx || dy) {
          this.is_repeating = true;
          this.startRelativeMove(dx, dy);
        }
      }
      if (!down.forward && !down.back && !down.left && !down.right) {
        this.is_repeating = false;
      }

      if (!this.player_controller.isMoving() && !build_mode && entityBlocks(game_state.floor_id, last_dest_pos, true) &&
        !v2same(last_dest_pos, prev_pos)
      ) {
        // We're standing over a blocking entity!  Move to where we were before
        this.player_controller.startMove(dirFromMove(last_dest_pos, prev_pos));
      }

      if (!this.player_controller.isMoving() && this.path_to &&
        frame_timestamp - this.path_to_last_step > FAST_TRAVEL_STEP_MIN_TIME
      ) {
        let { w } = level;
        let cur = {
          pos: last_dest_pos,
          rot: eff_rot,
        };
        let path = pathFind(level, cur.pos[0], cur.pos[1], cur.rot,
          this.path_to[0], this.path_to[1], build_mode, crawlerScriptAPI());
        if (!path || path.length === 1) {
          this.path_to = null;
        } else {
          this.path_to_last_step = frame_timestamp;
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
            this.player_controller.startTurn(dirMod(cur.rot + drot + 4), 2);
          } else {
            if (!build_mode && entityBlocks(game_state.floor_id, next_pos, true)) {
              this.player_controller.clearDoubleTime?.();
              this.path_to = null;
            } else {
              // move
              this.player_controller.startMove(cur.rot, path.length > 2 ? 1 : 0);
            }
          }
        }
      }
    } else {
      // no_move
      this.player_controller.cancelQueuedMoves?.();
      if (this.loading_level) {
        this.fade_alpha = this.fade_override;
        return;
      }
    }

    let tick_param = {
      dt,
    };
    let positions = this.player_controller.tickMovement(tick_param);
    dt = tick_param.dt;

    this.applyFade(positions);

    this.applyForceFace(game_state, dt);

    let { approx_pos } = this;
    v2copy(approx_pos, game_state.pos);
    let ca = cos(game_state.angle) * 0.5;
    let sa = sin(game_state.angle) * 0.5;
    let pos_offs = crawlerRenderGetPosOffs();
    approx_pos[0] += pos_offs[1] * ca + pos_offs[0] * sa;
    approx_pos[1] += pos_offs[1] * sa - pos_offs[0] * ca;
    v2iRound(approx_pos);
    let approx_cell = level.getCell(approx_pos[0], approx_pos[1]);
    if (approx_cell && approx_cell.desc.auto_evict) {
      // this.fade_v = approx_cell.type === STAIRS_IN ? 1 : 0;
      // this.fade_v = 1;
      this.fade_alpha = 1;
    }

    if (positions.dest_rot !== this.last_dest_rot || !v2same(positions.dest_pos, last_dest_pos)) {
      let action_id = param.do_debug_move ? 'move_debug' : 'move';
      this.playerMoveStart(action_id, positions.dest_pos, positions.dest_rot);
    }

    if (!v2same(positions.finished_pos, last_finished_pos)) {
      this.playerMoveFinish(level, positions.finished_pos);
      if (no_move) { // was: disable_player_impulse
        this.player_controller.cancelAllMoves?.();
      }
    }
    if (positions.finished_rot !== this.last_finished_rot) {
      this.last_finished_rot = positions.finished_rot;
      this.map_update_this_frame = true;
    }

    this.flagCellNextToUsVisible(temp_pos);
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

  force_face_dir: DirType | null = null;
  force_face_counter: number = 0;
  force_face_starting = false;
  forceFaceDir(dir: DirType | null): void {
    if (dir !== null) {
      if (dir !== this.force_face_dir) {
        if (this.force_face_dir !== null && this.force_face_counter) {
          // let it finish first
        } else if (this.force_face_dir !== null && this.force_face_starting) {
          // fade out first
          this.force_face_counter = FORCE_FACE_TIME;
          this.force_face_starting = false;
        } else {
          this.force_face_dir = dir;
          this.force_face_counter = FORCE_FACE_TIME;
          this.force_face_starting = true;
        }
      }
    } else if (this.force_face_dir !== null) {
      if (!this.force_face_starting) {
        // already fading out
      } else if (this.force_face_counter) {
        // let it finish first
      } else {
        // Start fading out
        this.force_face_counter = FORCE_FACE_TIME;
        this.force_face_starting = false;
      }
    }
  }
  forceFaceUpdateWeight(dt: number): number {
    this.force_face_counter = max(0, this.force_face_counter - dt);
    if (this.force_face_dir === null) {
      return 0;
    } else if (this.force_face_starting) {
      return 1 - this.force_face_counter / FORCE_FACE_TIME;
    } else {
      if (!this.force_face_counter) {
        this.force_face_dir = null;
        return 0;
      } else {
        return this.force_face_counter / FORCE_FACE_TIME;
      }
    }
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
      const { game_state } = this;
      v2add(this.cam_pos, game_state.pos, half_vec);
      const { level } = game_state;
      if (level) {
        this.cam_pos[2] = this.cam_pos_z_offs + level.getInterpolatedHeight(game_state.pos[0], game_state.pos[1]);
      }
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
