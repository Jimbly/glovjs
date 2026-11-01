export const DX = [0, 1, 0, -1];
export const DY = [1, 0, -1, 0];

export const DIR_RIGHT = 0;
export const DIR_UP = 1;
export const DIR_LEFT = 2;
export const DIR_DOWN = 3;
export type Dir = 0 | 1 | 2 | 3;
// maps radians (dir/4 * 2pi) to dx = sin(radians); dy = cos(radians)

import assert from 'assert';
import { Rec } from 'glov/common/types';
import { clamp } from 'glov/common/util';
import {
  v2addScale,
  v2cross,
  v2dist,
  v2distSq,
  v2iAdd,
  v2iNormalize,
  v2iScale,
  v2sub,
  Vec2,
} from 'glov/common/vmath';

const { asin, cos, floor, PI, sin, sqrt } = Math;

export type EnumLayer<T extends string=string> = T[][];

function lineCircleAdvCollide(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, radius: number): {
  ret: boolean;
  xout: number;
  yout: number;
  interx: number;
  intery: number;
} {
  let xout;
  let yout;
  let interx = 0;
  let intery = 0;
  let dx = x1 - x0;
  let dcx = x0 - cx;
  let dy = y1 - y0;
  let dcy = y0 - cy;
  let A = dx*dx + dy*dy;
  let B = 2 * (dx*dcx + dy*dcy);
  let C = dcx*dcx + dcy*dcy - radius*radius;
  let intersects = false;
  let distance_remaining = 0;
  // Solve quadratic formula
  let det = B*B - 4 * A*C;
  if (det >= -0.001) {
    // determine point(s) of intersection
    let t0;
    let t1;
    if (A >= -0.001 && A <= 0.001 || det < 0) {
      if (B === 0) {
        if (C === 0) {
          t0 = t1 = 0;
        } else {
          t0 = t1 = -1;
        }
      } else {
        t0 = t1 = -C / B;
      }
    } else {
      t0 = (-B + sqrt(det)) / (2 * A);
      t1 = (-B - sqrt(det)) / (2 * A);
    }
    if ((t0 < 0 || t0 > 1) && (t1 >= 0 && t1 <= 1)) {
      t0 = t1; // get the one which is in the range 0..1 (on the line segment
    } else if (t0 >= 0 && t0 <= 1 && t1 >= 0 && t1 <= 1 && t1 < t0) {
      t0 = t1; // get the first one
    }
    if (t0 >= 0 && t0 <= 1) {
      intersects = true;
      interx = x0 + (x1 - x0) * t0;
      intery = y0 + (y1 - y0) * t0;
      distance_remaining = (1.0 - t0) * v2dist([x0, y0], [x1, y1]);
    } else {
      // We started and ended inside of the collision area, maybe someone just
      // laid a bomb down here?
    }
  }
  if (intersects) {
    let x = interx - cx;
    let y = intery - cy;

    let dthetaSign = v2cross([x, y],
      [interx - x1, intery - y1]);
    dthetaSign = (dthetaSign > 0) ? 1 : -1;

    // Find current theta and advance
    let theta = asin(clamp(x / radius, -1, 1));
    if (theta > PI/2) {
      theta -= 2 * PI;
    }
    // theta in range of -pi/2 to pi/2
    if (y < 0) {
      // should be in range pi/2 to 3pi/2
      theta = PI - theta;
    }
    theta += dthetaSign * (distance_remaining / radius);
    let x2 = (radius * 1.01) * sin(theta);
    let y2 = (radius * 1.01) * cos(theta);
    xout = cx + x2;
    yout = cy + y2;

  } else {
    xout = x1;
    yout = y1;
  }
  return {
    ret: intersects,
    xout,
    yout,
    interx,
    intery,
  };
}

type MotionRet = {
  dir: Dir | null;
};
export function topdownMotion<T extends string=string>(params: {
  layer: EnumLayer<T>;
  solid_tiles: Rec<T, boolean>;
  pos: Vec2;
  move_dist: number;
  impulse: Vec2; // this gets normalized and multiplied by move_dist
}): MotionRet {
  let { layer, solid_tiles, pos, impulse, move_dist } = params;

  v2iNormalize(impulse);
  v2iScale(impulse, move_dist);

  let startx = pos[0];
  let starty = pos[1];
  if (0) {
    // nocoll
    v2iAdd(pos, impulse);
  } else {
    // Logic from Splody:
    // Treat player as sphere
    // Do edge collisions first (push player back along movement vector)
    // need to check only edges adjacent to where we will end up
    // If we hit no edges, then check corners, and swing the player along an arc
    //  around the corner if they intersected it.
    // If we hit an edge, I don't think it's possible to hit a corner after being moved

    let fx2 = pos[0] + impulse[0];
    let fy2 = pos[1] + impulse[1];
    const player_radius = 0.49;

    function cellIsOpen(xx: number, yy: number): boolean {
      let cell = layer[yy] && layer[yy][xx];
      return !cell || !solid_tiles[cell];
    }

    for (let do_edges_twice = 0; do_edges_twice < 2; do_edges_twice++) {
      let x2 = floor(fx2);
      let y2 = floor(fy2);
      let fdx = fx2 - pos[0];
      let fdy = fy2 - pos[1];
      // Edges
      if (1) {
        for (let edge = 0; edge < DX.length; edge++) {
          let dx = DX[edge];
          let dy = DY[edge];
          let fpartx2 = fx2 - x2;
          let fparty2 = fy2 - y2;
          if (dx === -1 && fpartx2 < player_radius ||
            dy === -1 && fparty2 < player_radius ||
            dx === 1 && fpartx2 > 1.0 - player_radius ||
            dy === 1 && fparty2 > 1.0 - player_radius
          ) {
            // Will collide with the given edge
            if (!cellIsOpen(x2 + dx, y2 + dy)) {
              // And there's something there!  Move position in offending direction out by
              //  the radius from the wall
              let newx = x2 + (dx + 1) / 2 - dx * player_radius;
              let newy = y2 + (dy + 1) / 2 - dy * player_radius;
              let saved_fx2 = fx2;
              let saved_fy2 = fy2;
              // From the world
              if (dx) {
                fx2 = newx;
              } else if (dy) {
                fy2 = newy;
              }

              // Squishy Movement
              let lost = v2dist([fx2, fy2], [saved_fx2, saved_fy2]);

              let open_adj = [[
                cellIsOpen(x2 - 1, y2 - 1),
                cellIsOpen(x2, y2 - 1),
                cellIsOpen(x2 + 1, y2 - 1),
              ], [
                cellIsOpen(x2 - 1, y2),
                cellIsOpen(x2, y2),
                cellIsOpen(x2 + 1, y2),
              ], [
                cellIsOpen(x2 - 1, y2 + 1),
                cellIsOpen(x2, y2 + 1),
                cellIsOpen(x2 + 1, y2 + 1),
              ]];
              // If pushing against a flat wall, and there's a corner around it, move
              // towards the open corner
              if (dx) {
                if (fparty2 <= 0.5 &&
                  open_adj[0][1 + dx] &&
                  open_adj[0][1]
                ) {
                  if (fdy <= 0) {
                    fy2 -= lost;
                  }
                } else if (fparty2 >= 0.25 &&
                  open_adj[2][1 + dx] &&
                  open_adj[2][1]
                ) {
                  if (fdy >= 0) {
                    fy2 += lost;
                  }
                } else if (fparty2 <= 0.75 &&
                  open_adj[0][1 + dx] &&
                  open_adj[0][1]
                ) {
                  if (fdy <= 0) {
                    fy2 -= lost;
                  }
                }
              } else if (dy) {
                if (fpartx2 <= 0.5 &&
                  open_adj[1 + dy][0] &&
                  open_adj[1][0]
                ) {
                  if (fdx <= 0) {
                    fx2 -= lost;
                  }
                } else if (fpartx2 >= 0.25 &&
                  open_adj[1 + dy][2] &&
                  open_adj[1][2]
                ) {
                  if (fdx >= 0) {
                    fx2 += lost;
                  }
                } else if (fpartx2 <= 0.75 &&
                  open_adj[1 + dy][0] &&
                  open_adj[1][0]
                ) {
                  if (fdx <= 0) {
                    fx2 -= lost;
                  }
                }
              }
            }
          }
        } // for (edges)
      }
      // Corners
      if (do_edges_twice === 0) {
        const adx = [0, 1, 1, 0];
        const ady = [0, 0, 1, 1];
        for (let diags = 0; diags < adx.length; diags++) {
          let dx = adx[diags];
          let dy = ady[diags];
          let cornerx = x2 + dx;
          let cornery = y2 + dy;
          let dist_to_corner = v2dist([fx2, fy2], [cornerx, cornery]);
          let dist_to_corner_from_start = v2dist(pos, [cornerx, cornery]);
          if (dist_to_corner < player_radius + 0.0001) {
            // Hits!
            let tilex = x2 + dx * 2 - 1;
            let tiley = y2 + dy * 2 - 1;
            if (!cellIsOpen(tilex, tiley)) {
              // And there's something in the way.
              // a) find line-circle intersection point
              // b) calc distance of line segment inside circle
              // c) set fx2, fy2 to a point on the circle moved that much distance
              //   along the arc from the intersection point
              let fx0 = pos[0];
              let fy0 = pos[1];
              if (dist_to_corner_from_start > player_radius - 0.001 &&
                dist_to_corner_from_start < player_radius + 0.0001
              ) {
                // We're starting inside the circle!
                // Push out a bit so this works
                let scale = (player_radius + 0.0001) / dist_to_corner_from_start;
                assert(scale >= 1.0 && scale < 1.5);
                fx0 = (fx0 - cornerx) * scale + cornerx;
                fy0 = (fy0 - cornery) * scale + cornery;
              }
              let ret = lineCircleAdvCollide(fx0, fy0, fx2, fy2, cornerx, cornery, player_radius);
              if (!ret.ret) {
                //console.log("");
              } else {
                let { xout, yout } = ret;
                fx2 = xout;
                fy2 = yout;
              }
            }
          }
        } // for(diags)
      }
    }
    pos[0] = fx2;
    pos[1] = fy2;
  }

  let dist = v2dist([startx, starty], pos);
  if ((dist - move_dist) / move_dist > 0.01) { // more than 1% extra movement distance
    let delta = v2sub([0, 0], pos, [startx, starty]);
    v2iNormalize(delta);
    v2addScale(pos, [startx, starty], delta, move_dist);
    dist = v2distSq([startx, starty], pos);
  }

  let ret: MotionRet = {
    dir: null,
  };
  if (dist > 0.01*0.01) {
    ret.dir = impulse[0] > 0 ? 1 : impulse[0] < 0 ? 3 : impulse[1] > 0 ? 0 : 2;
  }
  return ret;
}
