import {
  CrawlerCell,
  CrawlerLevel,
  DX,
  DY,
  DirType,
  VIS_PASSED_EAST,
  VIS_PASSED_NORTH,
} from './crawler_state';

export function pathFind(
  level: CrawlerLevel,
  start_x: number,
  start_y: number,
  start_dir: DirType,
  dest_x: number,
  dest_y: number,
  ignore_visibility: boolean,
): number[] | null {
  const { w, cells } = level;
  let dest_idx = dest_x + dest_y * w;
  let start_idx = start_x + start_y * w;
  let seen = [] as boolean[];
  let queue = [] as number[];
  let parent = [] as number[];
  let dir_at = [] as DirType[];
  function push(idx: number, parent_idx: number, dir: DirType): void {
    if (seen[idx]) {
      return;
    }
    seen[idx] = true;
    let cell = cells[idx];
    if (!cell.desc.open_move) {
      return;
    }
    if (cell.visible_bits || idx === dest_idx || ignore_visibility) {
      if (cell.isVisiblePit() && idx !== dest_idx) {
        return;
      }
      queue.push(idx);
      dir_at.push(dir);
      parent.push(parent_idx);
    }
  }
  function pathTo(queue_idx: number): number[] {
    let ret = [];
    while (queue_idx !== -1) {
      ret.push(queue[queue_idx]);
      queue_idx = parent[queue_idx];
    }
    return ret.reverse();
  }
  push(start_idx, -1, start_dir);
  let queue_idx = 0;
  function checkDir(
    cell: CrawlerCell,
    dir: DirType,
    idx: number,
    cx: number,
    cy: number
  ): void {
    let wall = cell.walls[dir];
    if (!wall.open_move) {
      return;
    }
    if (wall.is_secret) {
      if (dir === 0 && (cell.visible_bits & VIS_PASSED_EAST) ||
        dir === 1 && (cell.visible_bits & VIS_PASSED_NORTH) ||
        dir === 2 && (cells[idx - 1].visible_bits & VIS_PASSED_EAST) ||
        dir === 3 && (cells[idx - w].visible_bits & VIS_PASSED_NORTH)
      ) {
        // have seen it, can pass through
      } else {
        return;
      }
    }
    let x2 = cx + DX[dir];
    let y2 = cy + DY[dir];
    push(x2 + y2 * w, queue_idx, dir);
  }
  while (queue_idx < queue.length) {
    let idx = queue[queue_idx];
    if (idx === dest_idx) {
      return pathTo(queue_idx);
    }
    let cell = cells[idx];
    let cx = idx % w;
    let cy = (idx - cx) / w;
    checkDir(cell, dir_at[queue_idx], idx, cx, cy);
    for (let ii = 0 as DirType; ii < 4; ++ii) {
      checkDir(cell, ii, idx, cx, cy);
    }
    queue_idx++;
  }
  return null;
}
