/* global Z, VMath */

const assert = require('assert');
const fs = require('fs');
const glov_engine = require('./engine.js');

const { easeOut } = require('../../common/util.js');
const { v4Build } = VMath;
const { floor, min, pow, random } = Math;

let draw_list;
let glov_ui;
let glov_camera;

let transitions = [];

export const IMMEDIATE = 'immediate';

export const REMOVE = 'remove';
export const CONTINUE = 'continue';

const shaders = {
  transition_pixelate: {
    fp: fs.readFileSync(`${__dirname}/shaders/transition_pixelate.fp`, 'utf8'),
  },
};

export function populateDraw2DParams(params) {
  params.shaders = params.shaders || {};
  for (let name in shaders) {
    assert(!params.shaders[name]);
    params.shaders[name] = shaders[name];
  }
}

class GlovTransition {
  constructor(z, func) {
    this.z = z;
    this.capture = null;
    this.func = func;
    this.accum_time = 0;
  }
}

function transitionCapture(trans) {
  assert(!trans.capture);
  trans.capture = glov_engine.getTextureForCapture();
  trans.capture.copyTexImage();
}

export function queue(z, fn) {
  if (!glov_camera) {
    glov_camera = glov_engine.glov_camera;
    glov_ui = glov_engine.glov_ui;
    draw_list = glov_engine.draw_list;
  }
  let immediate = false;
  if (z === IMMEDIATE) {
    immediate = true;
    z = Z.TRANSITION_FINAL;
  }

  for (let ii = 0; ii < transitions.length; ++ii) {
    let trans = transitions[ii];
    if (trans.z === z) {
      // same Z
      assert(trans.capture);
      if (!trans.capture) {
        // two transitions at the same Z on one frame!  ignore second
        return false;
      }
    }
  }
  let trans = new GlovTransition(z, fn);
  transitions.push(trans);

  if (immediate) {
    transitionCapture(trans);
  }
  return true;
}

function destroyTexture(tex) {
  tex.destroy();
}

export function render(dt) {
  dt = min(dt, 100); // debug: clamp frame times
  for (let trans_idx = 0; trans_idx < transitions.length; ++trans_idx) {
    let trans = transitions[trans_idx];
    trans.accum_time += dt;
    if (!trans.capture) {
      // queue up a capture past the specified Z, so transitions rendering at that Z (plus a handful) get captured
      draw_list.queuefn(trans.z + Z.TRANSITION_RANGE, transitionCapture.bind(null, trans));
    } else if (trans.capture) {
      // call the function and give them the Z
      // If not the last one, want it to end now!
      let force_end = trans_idx < transitions.length - 1;
      let ret = trans.func(trans.z, trans.capture, trans.accum_time, force_end);
      if (ret === REMOVE) {
        setImmediate(destroyTexture.bind(null, trans.capture));
        transitions.splice(trans_idx, 1);
        trans_idx--;
      }
    }
  }
}


function glovTransitionFadeFunc(fade_time, z, initial, ms_since_start, force_end) {
  let progress = min(ms_since_start / fade_time, 1);
  let alpha = (1 - easeOut(progress, 2));
  let color = v4Build(1, 1, 1, alpha);
  glov_camera.set2DNormalized();
  draw_list.queueraw4(initial,
    0, 0, 1, 0,
    1, 1, 0, 1,
    z,
    0, 1, 1, 0,
    color, 'alpha_nearest');

  if (force_end || progress === 1) {
    return REMOVE;
  }
  return CONTINUE;
}


/*
  // Doesn't work because we need more than just 2 UV values in the queue call
function glovTransitionWipeFunc(wipe_time, wipe_angle, z, tex, ms_since_start, force_end) {
  let progress = min(ms_since_start / wipe_time, 1);

  glov_camera.set2DNormalized();

  let uvs = [[0,1], [1,0]];

  let points = [{}, {}, {}, {}];
  for (let ii = 0; ii < 4; ii++) {
    let x = (ii === 1 || ii === 2) ? 1 : 0;
    let y = (ii >= 2) ? 1 : 0;
    points[ii].x = x;
    points[ii].y = y;
  }

  while (wipe_angle > PI) {
    wipe_angle -= (2 * PI);
  }
  while (wipe_angle < -PI) {
    wipe_angle += (2 * PI);
  }

  // TODO: if anyone ever uses this, change 0 degrees to be up, not right, to match other things?
  if (wipe_angle >= -PI_4 && wipe_angle <= PI_4) {
    // horizontal wipe from left to right
    let x0 = progress * 2; // rightmost x
    let x1 = x0 - sin(abs(wipe_angle)) / SQRT1_2; // leftmost x
    if (wipe_angle < 0) {
      points[0].x = x1;
      points[3].x = x0;
    } else {
      points[0].x = x0;
      points[3].x = x1;
    }
    points[1].x = points[2].x = 2;
  } else if (wipe_angle >= PI_2 + PI_4 || wipe_angle <= -PI_2 - PI_4) {
    // horizontal wipe from right to left
    let x0 = 1 - progress * 2; // leftmost x
    let x1 = x0 + sin(abs(wipe_angle)) / SQRT1_2; // rightmost x,
    if (wipe_angle < 0) {
      points[1].x = x1;
      points[2].x = x0;
    } else {
      points[1].x = x0;
      points[2].x = x1;
    }
    points[0].x = points[3].x = -1;
  } else if (wipe_angle > PI_4 && wipe_angle <= PI_2 + PI_4) {
    // vertical wipe, top to bottom
    let y0 = progress * 2; // bottommost y
    let offs = cos(wipe_angle) / SQRT1_2;
    let y1 = y0 - abs(offs); // topmost y,
    if (offs > 0) {
      points[0].y = y0;
      points[1].y = y1;
    } else {
      points[0].y = y1;
      points[1].y = y0;
    }
    points[2].y = points[3].y = 2;
  } else {
    // vertical wipe, bottom to top
    let y0 = 1 - progress * 2; // topmost y
    let offs = cos(wipe_angle) / SQRT1_2;
    let y1 = y0 + abs(offs); // bottommost y,
    if (offs > 0) {
      points[2].y = y1;
      points[3].y = y0;
    } else {
      points[2].y = y0;
      points[3].y = y1;
    }
    points[0].y = points[1].y = -1;
  }
  // interp UVs based on points
  points[0].u = lerp(points[0].x, uvs[0][0], uvs[1][0]);
  points[1].u = lerp(points[1].x, uvs[0][0], uvs[1][0]);
  points[2].u = lerp(points[2].x, uvs[0][0], uvs[1][0]);
  points[3].u = lerp(points[3].x, uvs[0][0], uvs[1][0]);
  points[0].v = lerp(points[0].y, uvs[0][1], uvs[1][1]);
  points[1].v = lerp(points[1].y, uvs[0][1], uvs[1][1]);
  points[2].v = lerp(points[2].y, uvs[0][1], uvs[1][1]);
  points[3].v = lerp(points[3].y, uvs[0][1], uvs[1][1]);

  draw_list.queueraw4(tex,
    points[0].x, points[0].y, points[1].x, points[1].y,
    points[2].x, points[2].y, points[3].x, points[3].y,
    z,
    points[0].u, points[0].v, points[2].u, points[2].v,
    draw_list.color_white, 'alpha_nearest');

  if (force_end || progress === 1) {
    return REMOVE;
  }
  return CONTINUE;
}

*/

function glovTransitionSplitScreenFunc(time, border_width, slide_window, z, tex, ms_since_start, force_end) {
  let border_color = v4Build(1, 1, 1, 1);
  let progress = easeOut(min(ms_since_start / time, 1), 2);
  glov_camera.set2DNormalized();

  let uvs = [[0,1], [1,0]];

  let xoffs = progress;
  let v_half = uvs[0][1] + (uvs[1][1] - uvs[0][1]) / 2;
  if (slide_window) { // slide window
    draw_list.queueraw(tex, 0, 0, z, 1 - xoffs, 1 / 2,
      0, uvs[0][1], uvs[1][0] * (1 - progress), v_half,
      draw_list.color_white, 0, 'alpha_nearest');
    draw_list.queueraw(tex, 0 + xoffs, 1 / 2, z, 1 - xoffs, 1 / 2,
      uvs[1][0] * progress, v_half, uvs[1][0], uvs[1][1],
      draw_list.color_white, 0, 'alpha_nearest');
  } else { // slide image
    draw_list.queueraw(tex, 0 - xoffs, 0, z, 1, 1 / 2,
      uvs[0][0], uvs[0][1], uvs[1][0], v_half,
      draw_list.color_white, 0, 'alpha_nearest');
    draw_list.queueraw(tex, 0 + xoffs, 1 / 2, z, 1, 1 / 2,
      uvs[0][0], v_half, uvs[1][0], uvs[1][1],
      draw_list.color_white, 0, 'alpha_nearest');
  }
  let border_grow_progress = min(progress * 4, 1);
  border_color[3] = border_grow_progress;
  border_width *= border_grow_progress;
  // TODO: Would look better if the horizontal border grew from the middle out, so the overlapping bit is identical
  // on both sides
  glov_ui.drawRect(0, 0.5 - border_width, 1 - xoffs, 0.5, z + 1, border_color);
  glov_ui.drawRect(1 - xoffs - border_width, 0, 1 - xoffs, 0.5, z + 1, border_color);
  glov_ui.drawRect(xoffs, 0.5, 1, 0.5 + border_width, z + 1, border_color);
  glov_ui.drawRect(xoffs, 0.5, xoffs + border_width, 1, z + 1, border_color);

  if (force_end || progress === 1) {
    return REMOVE;
  }
  return CONTINUE;
}

const render_scale = 1;
let transition_pixelate_texture;

function transitionPixelateCapture() {
  if (!transition_pixelate_texture) {
    transition_pixelate_texture = glov_engine.getTextureForCapture();
  }
  transition_pixelate_texture.copyTexImage();
}

function glovTransitionPixelateFunc(time, z, tex, ms_since_start, force_end) {
  //ms_since_start %= time;
  let gd = glov_engine.graphics_device;
  let progress = min(ms_since_start / time, 1);
  glov_camera.set2DNormalized();

  if (progress > 0.5) {
    draw_list.queuefn(z, transitionPixelateCapture);
    if (transition_pixelate_texture) {
      tex = transition_pixelate_texture;
    }
  }

  let partial_progress = (progress > 0.5 ? 1 - progress : progress) * 2;
  // Use power of two scalings, but then scale relative to a 1024px virtual screen, so the biggest
  //  pixel is about the same percentage of the screen regardless of resolution.
  let pixel_scale = pow(2, floor(partial_progress * 8.9)) / 1024 * gd.width * render_scale;

  let param0 = v4Build(tex.width / pixel_scale, tex.height / pixel_scale,
    pixel_scale / tex.width, pixel_scale / tex.height);
  let param1 = v4Build(0.5 / tex.width, 0.5 / tex.height,
    (tex.texSizeX - 1) / tex.width, (tex.texSizeY - 1) / tex.height);


  draw_list.queueraw(tex, 0, 0, z + 1, 1, 1,
    0, 1, 1, 0,
    draw_list.color_white, 0, 'transition_pixelate_nearest', {
      clipSpace: draw_list.draw_2d.clipSpace,
      param0,
      param1,
    });

  if (force_end || progress === 1) {
    setImmediate(destroyTexture.bind(null, transition_pixelate_texture));
    transition_pixelate_texture = null;
    return REMOVE;
  }
  return CONTINUE;
}

export function fade(fade_time) {
  return glovTransitionFadeFunc.bind(null, fade_time);
}

// export function wipe(wipe_time, wipe_angle) {
//   return glovTransitionWipeFunc.bind(null, wipe_time, wipe_angle);
// }

// border_width in camera-relative size
export function splitScreen(time, border_width, slide_window) {
  border_width /= glov_engine.glov_camera.w(); // convert to normalized units
  return glovTransitionSplitScreenFunc.bind(null, time, border_width, slide_window);
}

export function pixelate(fade_time) {
  return glovTransitionPixelateFunc.bind(null, fade_time);
}

// export function logoZoom(time, logo) {
//   return glovTransitionLogoZoomFunc.bind(null, time, logo);
// }

export function randomTransition(fade_time_scale) {
  fade_time_scale = fade_time_scale || 1;
  let idx = floor(random() * 3);
  switch (idx) {
    case 0:
      return fade(500 * fade_time_scale);
    case 1:
      return splitScreen(250 * fade_time_scale, 2, false);
    case 2:
      return pixelate(750 * fade_time_scale);
    // case 3:
    //   return wipe(250 * fade_time_scale, random() * 2 * PI);
    // case 4:
    //   if (!logo) {
    //     GlovTextureLoadOptions options;
    //     options.clamp_s = options.clamp_t = true;
    //     logo = GlovTextures::loadtex("data/SampleLogoTransition.png", &options);
    //   }
    //   glovTransitionQueue(Z_TRANSITION_FINAL, glovTransitionLogoZoom(500, logo));
    //   break;
    default:
      assert(0);
  }
  return null;
}
