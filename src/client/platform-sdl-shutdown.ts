import * as camera2d from 'glov/client/camera2d';
import { MODE_DEVELOPMENT } from 'glov/client/client_config';
import { addPreTickFunc, addTickFunc, removeTickFunc, setPixelyStrict } from 'glov/client/engine';
import { hasCrashed } from 'glov/client/error_report';
import { eatAllInput, keyDown, keyDownEdge, KEYS } from 'glov/client/input';
import { BLEND_ADDITIVE, spriteQueueRaw4, Texture } from 'glov/client/sprites';
import { textureWhite } from 'glov/client/textures';
import * as transition from 'glov/client/transition';
import { clamp } from 'glov/common/util';
import { vec4 } from 'glov/common/vmath';
import { onCloseRequested } from './platform-sdl';
import { sdlEventQueue } from './platform-sdl-events';

const { PI, min, sin } = Math;

let doing_shutdown = false;

function shutdownAnimFunc(
  fade_time: number,
  is_test: boolean,
  z: number,
  initial: Texture,
  ms_since_start: number,
  force_end: boolean
): string {
  let progress_total = min(ms_since_start / fade_time, 1);
  let color_vec = vec4(0, 0, 0, 1);
  camera2d.setNormalized();
  spriteQueueRaw4([textureWhite()],
    0, 0, 0, 1,
    1, 1, 1, 0,
    z,
    0, 1, 1, 0,
    [0,0,0,1]);

  for (let ii = 0; ii < 3; ++ii) {
    let progress = clamp(progress_total + ii*0.1*progress_total, 0, 1);
    let color = 0.333333 + progress;
    color_vec[0] = color_vec[1] = color_vec[2] = color;
    progress = sin(clamp(progress*1.2, 0, 1) * PI / 2);
    let yoffs = progress;
    if (yoffs > 0.8) {
      yoffs = 0.8 + (yoffs - 0.8) / 0.2 * 0.199;
    }
    progress = clamp(progress_total + ii*0.01*progress_total, 0, 1);
    let xoffs = sin(progress * 1.25*PI);
    let x0 = (0 - xoffs*0.5);
    let x1 = (1 + xoffs*0.5);
    let y0 = (0 + yoffs*0.5);
    let y1 = (1 - yoffs*0.5);
    spriteQueueRaw4([initial],
      x0, y0, x0, y1, x1, y1, x1, y0,
      z + 0.1, 0, 1, 1, 0,
      color_vec, undefined, undefined, BLEND_ADDITIVE);

    color = 0 + progress*progress*0.333333;
    color_vec[0] = color_vec[1] = color_vec[2] = color;
    x0 = 0 - xoffs*0.5;
    y0 = 0 + yoffs*0.5;
    x1 = 1 + xoffs*0.5;
    y1 = 1 - yoffs*0.5;
    spriteQueueRaw4([initial],
      x0, y0, x0, y1, x1, y1, x1, y0,
      z + 0.1, 0, 1, 1, 0,
      color_vec, undefined, undefined, BLEND_ADDITIVE);
  }


  if (force_end || progress_total === 1) {
    if (is_test) {
      doing_shutdown = false;
    } else {
      sdlEventQueue(onCloseRequested);
    }
    return transition.REMOVE;
  }
  return transition.CONTINUE;
}

let registered_pre_tick = false;

function shutdownPreTick(): void {
  // Note: this will fight with any app pre-tick when testing and then testing ends
  if (doing_shutdown) {
    setPixelyStrict(false);
  }
}

function shutdownAnimStart(is_test: boolean): void {
  if (!registered_pre_tick) {
    addPreTickFunc(shutdownPreTick);
    registered_pre_tick = true;
  }
  let init = true;
  // QP2ATODO: hook this playUISound('power_down');
  function tickFunc(): void {
    if (init) {
      transition.queue(Z.TRANSITION_FINAL, shutdownAnimFunc.bind(null, 250, is_test));
      init = false;
    }
    if (doing_shutdown) {
      eatAllInput();
    } else {
      removeTickFunc(tickFunc);
    }
  }
  doing_shutdown = true;
  addTickFunc(tickFunc);
}

export function sdlShutdownBeforeClose(): void {
  // TODO, if we get sick of it: disable in development
  if (hasCrashed()) {
    // pass through immediately
    sdlEventQueue(onCloseRequested);
  } else {
    if (doing_shutdown) {
      return;
    }
    doing_shutdown = true;
    shutdownAnimStart(false);
  }
}

export function sdlShutdownTest(): void {
  if (MODE_DEVELOPMENT && keyDown(KEYS.SHIFT) && keyDownEdge(KEYS.F4)) {
    shutdownAnimStart(true);
  }
}
