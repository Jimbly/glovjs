/* eslint no-labels:off */

enum WallType {
  OPEN='open',
  DOOR='door',
  SOLID='solid',
  SECRET_DOOR='secret_door',
}

enum CellType {
  OPEN='open',
  SOLID='solid',
  PIT='pit',
  STAIRS_IN='stairs_in',
  STAIRS_OUT='stairs_out',
  ENTRANCE='entrance', // TODO: this should just come in as STAIRS_IN from the caller, and not need floor_id here!
}

export type GenParamsBrogue = {
  odds: Partial<Record<string, number>>;
  hallway_chance: number;
  closets: number;
  secrets: number;
  w: number;
  h: number;
  max_rooms: number;
  shops: number;
  shop_cell_ids: string[];
  wall_ids: Record<WallType, string>;
  cell_ids: Record<CellType, string>;
  passageway_chance: number;
  pits_min: number;
  pits_random: number;
  enemies_min: number;
  enemies_random: number;
  // auto-computed:
  odds_total?: number;
};

export type GenParamsWrapBrogue = {
  type: 'brogue';
  brogue: GenParamsBrogue;
};

export type GenParamsAny = GenParamsWrapBrogue;

export const default_gen_params: GenParamsWrapBrogue = {
  type: 'brogue',
  brogue: {
    odds: {
      small_rect: 1,
      organic_small: 1,
      organic_large: 1,
      tetronimo: 1,
      rect2: 1,
      circle: 1,
    },
    hallway_chance: 0.95,
    closets: 10,
    secrets: 4,
    w: 33,
    h: 29,
    max_rooms: 40,
    shops: 0,
    shop_cell_ids: ['shop_1', 'shop_2', 'shop_3'],
    wall_ids: {
      [WallType.OPEN]: 'open',
      [WallType.DOOR]: 'door',
      [WallType.SOLID]: 'solid',
      [WallType.SECRET_DOOR]: 'secret_door',
    },
    cell_ids: {
      [CellType.OPEN]: 'open',
      [CellType.SOLID]: 'solid',
      [CellType.PIT]: 'pit',
      [CellType.STAIRS_IN]: 'stairs_in',
      [CellType.STAIRS_OUT]: 'stairs_out',
      [CellType.ENTRANCE]: 'entrance',
    },
    passageway_chance: 1,
    pits_min: 0,
    pits_random: 0,
    enemies_min: 20,
    enemies_random: 10,
  },
};

import assert from 'assert';
import {
  mashString,
  randCreate,
  shuffleArray,
} from 'glov/common/rand_alea';
import { ridx } from 'glov/common/util';
import {
  CellDesc,
  CrawlerLevel,
  CrawlerLevelSerialized,
  DX, DY,
  DirType,
  EAST,
  NORTH,
  SOUTH,
  WEST,
  WallDesc,
  crawlerGetCellDesc,
  crawlerGetWallDesc,
  createLevel,
} from './crawler_state';

type Rand = ReturnType<typeof randCreate>;

const { abs, floor, max, min, round } = Math;

type RoomID = number;
type Room = number[] & {
  w: number;
  h: number;
  id: RoomID;
  parent_id: RoomID;
  adj: RoomID[];
  door_opts?: number[];
  doors?: [number, number, WallType?][];
  need_doors?: boolean;
  allow_hallway?: boolean;
  walls?: [number, number, number, WallType][];
  place_at?: [number, number];
  size?: number;
  has_entrance?: boolean;
  has_exit?: boolean;
  secret?: boolean;
  adj_secret?: number;
};

// 0 is not part of room (solid), >=1 is part of room (open)
function roomTemp(w: number, h: number): Room {
  let ret:Room = new Array(w * h) as Room;
  for (let ii = 0; ii < ret.length; ++ii) {
    ret[ii] = 0;
  }
  ret.w = w;
  ret.h = h;
  return ret;
}
function rtSet(rt: Room, x: number, y: number, v: number): void {
  rt[x + y * rt.w] = v;
}
function roomTempBuffered(w: number, h: number): Room {
  return roomTemp(w + 2, h + 2);
}
function rtSetBuffered(rt: Room, x: number, y: number, v: number): void {
  assert(x >= 0 && x < rt.w - 2);
  assert(y >= 0 && y < rt.h - 2);
  rt[x + 1 + (y + 1) * rt.w] = v;
}
function rtGet(rt: Room, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= rt.w || y >= rt.h) {
    return 0;
  }
  return rt[x + y * rt.w];
}
function rtGetBuffered(rt: Room, x: number, y: number): number {
  return rtGet(rt, x+1, y+1);
}
function rtDebug(rt: Room): string {
  let rows = [];
  for (let yy = 0; yy < rt.h; ++yy) {
    let row = [];
    for (let xx = 0; xx < rt.w; ++xx) {
      row.push(rt[xx + yy * rt.w] ? '.' : '#');
    }
    rows.push(row);
  }
  if (rt.door_opts) {
    for (let ii = 0; ii < rt.door_opts.length; ++ii) {
      let pos = rt.door_opts[ii];
      let x = pos % rt.w;
      let y = (pos - x) / rt.w;
      rows[y][x] = '+';
    }
  }
  return rows.map((row) => row.join('')).reverse().join('\n');
}
function rtOverlay(dest: Room, rt: Room, x: number, y: number, v?: number): number {
  let ret = 0;
  for (let yy = 0; yy < rt.h; ++yy) {
    let dest_y = (y + yy);
    for (let xx = 0; xx < rt.w; ++xx) {
      if (rt[xx + yy * rt.w]) {
        let dest_x = x + xx;
        assert(dest_y > 0 && dest_y < dest.h - 1);
        assert(dest_x > 0 && dest_x < dest.w - 1);
        dest[dest_x + dest_y * dest.w] = v || rt[xx + yy * rt.w];
        ret++;
      }
    }
  }
  return ret;
}

function markRandomDoors(rand: Rand, rt: Room): void {
  let doors: number[][] = [[],[],[],[]];
  const delta = [1, rt.w, -1, -rt.w];
  for (let ii = 0; ii < rt.length; ++ii) {
    if (!rt[ii]) { // solid
      for (let jj = 0; jj < 4; ++jj) {
        if (rt[ii + delta[jj]]) { // neighbor is open
          doors[jj].push(ii);
        }
      }
    }
  }
  let door_opts: number[] = [];
  for (let ii = 0; ii < doors.length; ++ii) {
    let opts = doors[ii];
    if (opts.length) {
      let choice = opts[rand.range(opts.length)];
      if (door_opts.indexOf(choice) === -1) {
        door_opts.push(choice);
      }
    }
  }
  shuffleArray(rand, door_opts);
  rt.door_opts = door_opts;
}

function generateRoomOrganic(rand: Rand, w: number, h: number, min_size: number): Room {
  let rt = roomTempBuffered(w, h);
  for (let yy = 0; yy < h; ++yy) {
    for (let xx = 0; xx < w; ++xx) {
      if (rand.random() < 0.45) {
        rtSetBuffered(rt, xx, yy, 1);
      }
    }
  }
  let rtnext = roomTempBuffered(w, h);
  for (let gen = 0; gen < 4; ++gen) {
    for (let ii = 0; ii < rt.length; ++ii) {
      let neighbors = 0;
      for (let dx = -1; dx <= 1; ++dx) {
        for (let dy = -1; dy <= 1; ++dy) {
          if (dx || dy) {
            neighbors += rt[ii + dx + dy * rt.w] || 0;
          }
        }
      }
      rtnext[ii] = neighbors < 2 ? 0 : neighbors >= 5 ? 1 : rt[ii];
    }
    let t = rt;
    rt = rtnext;
    rtnext = t;
  }
  // Find biggest connected set, and return that
  let biggest_set = 0;
  let biggest_size = 0;
  let fill_id = 1;
  const delta = [1, rt.w, -1, -rt.w];
  for (let ii = 0; ii < rt.length; ++ii) {
    if (rt[ii] === 1) {
      ++fill_id;
      let count = 1;
      let todo = [ii];
      while (todo.length) {
        let pos = todo.pop()!;
        for (let jj = 0; jj < 4; ++jj) {
          let p2 = pos + delta[jj];
          if (rt[p2] === 1) {
            ++count;
            rt[p2] = fill_id;
            todo.push(p2);
          }
        }
      }
      if (count > biggest_size) {
        biggest_size = count;
        biggest_set = fill_id;
      }
    }
  }
  if (biggest_size < min_size) {
    // try again
    return generateRoomOrganic(rand, w, h, min_size);
  }
  for (let ii = 0; ii < rt.length; ++ii) {
    rt[ii] = rt[ii] === biggest_set ? 1 : 0;
  }
  rt.need_doors = false;
  markRandomDoors(rand, rt);
  return rt;
}

const tetronimos = [
  ['####'],
  ['##',
   '##'],
  [' # ',
   '###'],
  [' ##',
   '## '],
  ['## ',
   ' ##'],
  ['###',
   '  #'],
  ['  #',
   '###'],
];
function generateRoomTetronimo(rand: Rand): Room {
  let rt = roomTempBuffered(4,4);
  let tet = tetronimos[rand.range(tetronimos.length)];
  let rot = rand.range(4);
  let dx = DX[rot];
  let dy = DY[rot];
  let x0 = dx < 0 || dy > 0 ? 3 : 0;
  let y0 = dy < 0 || dx < 0 ? 3 : 0;
  for (let yy = 0; yy < tet.length; ++yy) {
    let row = tet[yy];
    for (let xx = 0; xx < row.length; ++xx) {
      if (row[xx] === '#') {
        rtSetBuffered(rt, x0 + xx * dx + yy * -dy, y0 + xx * dy + yy * dx, 1);
      }
    }
  }
  rt.need_doors = true;
  rt.allow_hallway = false;
  markRandomDoors(rand, rt);
  return rt;
}

function generateSmallRect(rand: Rand, minsize: number, maxsize: number): Room {
  let sizex = minsize + rand.range(maxsize - minsize + 1);
  let sizey = minsize + rand.range(maxsize - minsize + 1);
  if (sizex + sizey === 2) {
    // No 1x1 rooms
    if (rand.range(2)) {
      sizex++;
    } else {
      sizey++;
    }
  }
  if (max(sizex, sizey) - min(sizex, sizey) > 1) {
    // too oblong
    if (sizex < sizey) {
      sizey--;
    } else {
      sizex--;
    }
  }
  let rt = roomTempBuffered(sizex, sizey);
  for (let yy = 0; yy < sizey; ++yy) {
    for (let xx = 0; xx < sizex; ++xx) {
      rtSetBuffered(rt, xx, yy, 1);
    }
  }
  rt.need_doors = true;
  rt.allow_hallway = false;
  markRandomDoors(rand, rt);
  return rt;
}

function generateRoomRect2(rand: Rand): Room {
  let minsize = 2;
  let maxsize = 5;
  let sizex1 = minsize + rand.range(maxsize - minsize + 1);
  let sizey1 = minsize + rand.range(maxsize - minsize + 1);
  let sizex2 = minsize + rand.range(maxsize - minsize + 1);
  let sizey2 = minsize + rand.range(maxsize - minsize + 1);
  let up = rand.range(2);
  let xover = rand.range(sizex2-1) + 1;
  let yover = rand.range(sizey2-1) + 1;
  let xextra = max(0, sizex2 - xover - sizex1);
  let yextra = max(0, sizey2 - yover - sizey1);

  let rt = roomTempBuffered(sizex1 + xover + xextra, sizey1 + yover + yextra);
  let y1 = (up ? 0 : yover) + yextra;
  for (let yy = 0; yy < sizey1; ++yy) {
    for (let xx = 0; xx < sizex1; ++xx) {
      rtSetBuffered(rt, xx + xextra, yy + y1, 1);
    }
  }
  y1 = up ? yextra + sizey1 + yover - sizey2 : 0;
  for (let yy = 0; yy < sizey2; ++yy) {
    for (let xx = 0; xx < sizex2; ++xx) {
      rtSetBuffered(rt, xextra + sizex1 + xover - sizex2 + xx, yy + y1, 1);
    }
  }
  markRandomDoors(rand, rt);
  return rt;
}

function generateRoomCircleDiameter(d: number): Room {
  let rt = roomTempBuffered(d, d);
  let mid = (d - 1) / 2;
  let r = d / 2 - 0.25;
  for (let yy = 0; yy < d; ++yy) {
    let dy = yy - mid;
    for (let xx = 0; xx < d; ++xx) {
      let dx = xx - mid;
      if (dx*dx + dy*dy < r * r) {
        rtSetBuffered(rt, xx, yy, 1);
      }
    }
  }
  if (d === 3) {
    rt.allow_hallway = false;
  }
  return rt;
}
// for (let ii = 3; ii <= 10; ++ii) {
//   console.log(`${ii}:\n${rtDebug(generateRoomCircleDiameter(ii))}`);
// }

function generateRoomCircle(rand: Rand): Room {
  let minsize = 3;
  let maxsize = 8;
  let d = minsize + rand.range(maxsize - minsize + 1);
  let rt = generateRoomCircleDiameter(d);
  // Doors only centered on the edges
  rt.door_opts = [
    round(d / 2 + rand.random()),
    round(d / 2 + rand.random()) + (rt.h-1) * rt.w,
    round(d / 2 + rand.random()) * rt.w,
    rt.w-1 + round(d / 2 + rand.random()) * rt.w,
  ];
  // markRandomDoors(rand, rt);
  return rt;
}


function addHallway(rand: Rand, room: Room): Room {
  let len = 3 + rand.range(4);
  assert(room.door_opts);
  let door_idx = room.door_opts[rand.range(room.door_opts.length)];
  let door_x = door_idx % room.w;
  let door_y = (door_idx - door_x) / room.w;
  let dir_options = [];
  outer:
  for (let ii = 0; ii < 4; ++ii) {
    let dx = DX[ii];
    let dy = DY[ii];
    if (!rtGet(room, door_x - dx, door_y - dy)) {
      continue;
    }
    for (let jj = 1; jj < len; ++jj) {
      if (rtGet(room, door_x + dx * jj, door_y + dy * jj)) {
        continue outer;
      }
    }
    dir_options.push(ii);
  }
  if (!dir_options.length) {
    console.log(`Could not add hallway to room\n${rtDebug(room)}`);
    return room;
  }
  let dir = dir_options[rand.range(dir_options.length)];
  let dx = DX[dir];
  let dy = DY[dir];
  let rt = roomTemp(room.w + abs(dx) * len, room.h + abs(dy) * len);
  let shiftx = dx < 0 ? len : 0;
  let shifty = dy < 0 ? len : 0;
  rtOverlay(rt, room, shiftx, shifty);
  if (room.need_doors) {
    // add a door between the hallway and the room
    rt.walls = rt.walls || [];
    rt.walls.push([door_x + shiftx, door_y + shifty, (dir + 2) % 4, WallType.DOOR]);
  }
  let hall_x: number;
  let hall_y: number;
  assert(len);
  for (let ii = 0; ii < len; ++ii) {
    hall_x = door_x + shiftx + dx * ii;
    hall_y = door_y + shifty + dy * ii;
    rtSet(rt, hall_x, hall_y, 1);
  }
  rt.need_doors = false; // or, inherit?
  let door_opts = [];
  for (let ii = 0; ii < 4; ++ii) {
    let idx = hall_x! + DX[ii] + (hall_y! + DY[ii]) * rt.w;
    if (!rt[idx]) {
      door_opts.push(idx);
    }
  }
  assert(door_opts.length);
  if (!door_opts.length) {
    console.log(`Could not add doors to end of hallway of room\n${rtDebug(rt)}`);
    return room;
  }
  shuffleArray(rand, door_opts);
  rt.door_opts = door_opts;
  //console.log(`Added hallway to\n${rtDebug(room)}\nAnd got\n${rtDebug(rt)}\n`);
  return rt;
}

function pruneRoom(room: Room): Room {
  // shrink to minimum size of easier/faster placing
  let minx = Infinity;
  let maxx = 0;
  let miny = Infinity;
  let maxy = 0;
  for (let yy = 0; yy < room.h; ++yy) {
    for (let xx = 0; xx < room.w; ++xx) {
      if (room[xx + yy*room.w]) {
        minx = min(minx, xx);
        maxx = max(maxx, xx);
        miny = min(miny, yy);
        maxy = max(maxy, yy);
      }
    }
  }
  let ret = roomTempBuffered(maxx - minx + 1, maxy - miny + 1);
  let shiftx = -(minx - 1);
  let shifty = -(miny - 1);
  for (let yy = miny; yy <= maxy; ++yy) {
    for (let xx = minx; xx <= maxx; ++xx) {
      rtSetBuffered(ret, xx - minx, yy - miny, room[xx + yy*room.w]);
    }
  }
  assert(room.door_opts);
  ret.door_opts = room.door_opts.map((idx) => {
    let door_x = idx % room.w;
    let door_y = (idx - door_x) / room.w;
    return door_x + shiftx + (door_y + shifty) * ret.w;
  });
  ret.need_doors = room.need_doors;
  if (room.walls) {
    ret.walls = room.walls.map((arr) => {
      arr[0] += shiftx;
      arr[1] += shifty;
      return arr;
    });
  }
  return ret;
}

const generators: Partial<Record<string, (rand: Rand) => Room>> = {
  small_rect: function (rand: Rand): Room {
    return generateSmallRect(rand, 1,3);
  },
  organic_small: function (rand: Rand): Room {
    return generateRoomOrganic(rand, 4, 4, 4);
  },
  organic_large: function (rand: Rand): Room {
    return generateRoomOrganic(rand, 6, 6, 4);
  },
  tetronimo: generateRoomTetronimo,
  rect2: generateRoomRect2,
  circle: generateRoomCircle,
};

function generateRoom(rand: Rand, gen_params: GenParamsBrogue, general_progress: number): Room {
  // returns: map of cell types (just open / solid?) and a flag saying if we must
  // be connected via doorways, plus door_opts attachment points

  let { odds_total, odds, hallway_chance } = gen_params;
  if (!odds_total) {
    odds_total = 0;
    for (let key in odds) {
      odds_total += odds[key]!;
      assert(generators[key]);
    }
    gen_params.odds_total = odds_total;
  }

  let choice = rand.random() * odds_total;
  let type: string;
  for (let key in odds) {
    choice -= odds[key]!;
    type = key;
    if (choice <= 0) {
      break;
    }
  }
  assert(type!);
  let gen = generators[type];
  assert(gen);
  let room = gen(rand);
  if (room.allow_hallway !== false && general_progress < 0.7 && rand.random() < hallway_chance) {
    room = addHallway(rand, room);
  }
  return pruneRoom(room);
}

type PrivateGenData = {
  work: Room;
  farthest_room: RoomID;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function descsFromParams(params: GenParamsBrogue) {
  let wall_descs = {} as Record<WallType, WallDesc>;
  for (let type_str in params.wall_ids) {
    let type = type_str as WallType;
    wall_descs[type] = crawlerGetWallDesc(params.wall_ids[type]);
  }

  let cell_descs = {} as Record<CellType, CellDesc>;
  for (let type_str in params.cell_ids) {
    let type = type_str as CellType;
    cell_descs[type] = crawlerGetCellDesc(params.cell_ids[type]);
  }

  return {
    wall_descs,
    cell_descs,
  };
}

function generateLevelBrogue(floor_id: number, seed: string, params: GenParamsBrogue): CrawlerLevel {
  let { w, h, max_rooms, passageway_chance, shops, closets, secrets } = params;
  let rand = randCreate(mashString(seed));
  let last_room_id = 0;
  let work = roomTempBuffered(w, h);
  let rooms: Room[] = [];

  let { wall_descs, cell_descs } = descsFromParams(params);

  let hwalls: WallDesc[] = new Array(w * (h + 1));
  for (let ii = 0; ii < hwalls.length; ++ii) {
    hwalls[ii] = wall_descs[WallType.OPEN];
  }
  let vwalls: WallDesc[] = new Array((w + 1) * h);
  for (let ii = 0; ii < vwalls.length; ++ii) {
    vwalls[ii] = wall_descs[WallType.OPEN];
  }

  function placeRoom(room: Room, x: number, y: number): void {
    let id = room.id = ++last_room_id;
    rooms[id] = room;
    room.place_at = [x,y];
    room.size = rtOverlay(work, room, x, y, id);
    if (room.walls) {
      for (let ii = 0; ii < room.walls.length; ++ii) {
        let arr = room.walls[ii];
        let [xx, yy, dir, tile] = arr;
        xx += x - 1;
        yy += y - 1;
        if (dir === 2) {
          dir = 0;
          xx--;
        } else if (dir === 3) {
          dir = 1;
          yy--;
        }
        if (dir === 0) {
          vwalls[(xx+1)*h+yy] = wall_descs[tile];
        } else if (dir === 1) {
          hwalls[(yy+1)*w+xx] = wall_descs[tile];
        }
      }
    }
    // console.log(rtDebug(work));
  }
  let work_delta = [1,work.w,-1,-work.w];
  function findGoodPlace(room: Room): [number, number] | null {
    let possible_places = [];
    for (let ii = 0; ii < work.length; ++ii) {
      if (work[ii]) {
        let ok = false;
        for (let jj = 0; jj < 4; ++jj) {
          if (!work[ii + work_delta[jj]]) {
            ok = true;
            break;
          }
        }
        if (ok) {
          // TODO: ignore existing doors?
          possible_places.push(ii);
        }
      }
    }
    while (possible_places.length) {
      let idx = rand.range(possible_places.length);
      let pos = possible_places[idx];
      let pos_x = pos % work.w;
      let pos_y = (pos - pos_x) / work.w;
      ridx(possible_places, idx);
      assert(room.door_opts);
      next_door:
      for (let door_idx = 0; door_idx < room.door_opts.length; ++door_idx) {
        let door_pos_idx = room.door_opts[door_idx];
        // try lining up `room` on `work` with `door_pos_idx` overlapping `pos`
        let door_x = door_pos_idx % room.w;
        let door_y = (door_pos_idx - door_x) / room.w;
        let room_x = pos_x - door_x;
        let room_y = pos_y - door_y;
        if (room_x < 0 || room_y < 0 || room_x + room.w > work.w || room_y + room.h > work.h) {
          // does not fit in `work`
          continue;
        }
        for (let yy = 0; yy < room.h; ++yy) {
          for (let xx = 0; xx < room.w; ++xx) {
            if (room[xx + yy * room.w]) {
              // we're part of the room
              if (work[room_x + xx + (room_y + yy) * work.w]) {
                // overlaps with part of another room
                continue next_door;
              }
            }
          }
        }
        // it fits!
        room.doors = room.doors || [];
        room.doors.push([room_x + door_x, room_y + door_y]);
        room.parent_id = work[pos];
        return [room_x, room_y];
      }
    }
    if (false) {
      console.log(`Could not place room\n${rtDebug(room)}`);
    }
    return null;
  }

  let entrance = [
    5 + rand.range(w - 10),
    5 + rand.range(h - 10),
  ];

  let first_room = generateRoomOrganic(rand, 10, 10, 10);
  first_room.has_entrance = true;
  placeRoom(first_room, entrance[0] - 5, entrance[1] - 5);

  let num_tries = max_rooms * 3;
  let num_success = 0;
  for (let ii = 0; ii < num_tries && num_success < max_rooms; ++ii) {
    let room = generateRoom(rand, params, ii / num_tries);
    // try to place it so that a door overlaps an existing room, and nothing else overlaps
    let place = findGoodPlace(room);
    if (place) {
      ++num_success;
      placeRoom(room, place[0], place[1]);
    }
  }
  console.log(`Placed ${num_success}/${max_rooms} rooms`);

  // Allocate some closets, some of which will be secret rooms
  let possible_closets = [];
  for (let yy = 0; yy < h; ++yy) {
    nextcell:
    for (let xx = 0; xx < w; ++xx) {
      if (rtGetBuffered(work, xx, yy)) {
        continue;
      }
      // an empty, unfilled tile
      let neighbors = 0;
      for (let dir = 0; dir < 4; ++dir) {
        let x2 = xx + DX[dir];
        let y2 = yy + DY[dir];
        let neighbor = rtGetBuffered(work, x2, y2);
        let nroom = rooms[neighbor];
        if (!nroom) {
          continue;
        }
        if (nroom.has_entrance) {
          // don't want a closet on the main room due to how the entrance stairs are placed
          continue nextcell;
        }
        neighbors++;
      }
      // prefer closets in cells with the most walls/open neighbors
      possible_closets.push([xx,yy, neighbors + rand.random()]);
    }
  }
  possible_closets.sort((a, b) => b[2] - a[2]);
  let num_closets = 0;
  let closet_rooms = [];
  outer:
  while (num_closets < closets && possible_closets.length) {
    let r = rand.random();
    let idx = floor(r * r * r * possible_closets.length);
    let pos = possible_closets[idx];
    possible_closets.splice(idx, 1);
    let [xx, yy] = pos;
    let d0 = rand.range(4);
    for (let ii = 0; ii < 4; ++ii) {
      let dir = (ii + d0) % 4;
      let x2 = xx + DX[dir];
      let y2 = yy + DY[dir];
      let neighbor = rtGetBuffered(work, x2, y2);
      let nroom = rooms[neighbor];
      if (!nroom || nroom.has_entrance) {
        continue;
      }
      let closet_room = roomTemp(1,1);
      rtSet(closet_room, 0, 0, 1);
      closet_room.doors = closet_room.doors || [];
      closet_room.doors.push([x2+1, y2+1, WallType.DOOR]);
      closet_room.parent_id = neighbor;
      placeRoom(closet_room, xx+1, yy+1);
      closet_rooms.push(closet_room.id);
      ++num_closets;
      continue outer;
    }
  }
  console.log(`Placed ${num_closets} closets`);

  // Generate walls between all rooms
  let wall_segments = [];
  for (let yy = 0; yy <= h; ++yy) {
    for (let xx = 0; xx < w; ++xx) {
      let above = work[xx + 1 + yy * work.w];
      let below = work[xx + 1 + (yy + 1) * work.w];
      if (above !== below && hwalls[yy*w + xx].open_vis) {
        hwalls[yy*w + xx] = wall_descs[WallType.SOLID];
        wall_segments.push([xx,yy,SOUTH]);
      }
    }
  }
  for (let yy = 0; yy < h; ++yy) {
    for (let xx = 0; xx <= w; ++xx) {
      let left = work[xx + (yy + 1) * work.w];
      let right = work[xx + 1 + (yy + 1) * work.w];
      if (left !== right && vwalls[xx*h + yy].open_vis) {
        vwalls[xx*h + yy] = wall_descs[WallType.SOLID];
        wall_segments.push([xx,yy,WEST]);
      }
    }
  }

  // Add loops, generate adjacency information
  let room_dist = new Array(rooms.length);
  for (let ii = 1; ii < rooms.length; ++ii) {
    rooms[ii].adj = [];
    let arr = room_dist[ii] = new Array(rooms.length);
    for (let jj = 1; jj < arr.length; ++jj) {
      arr[jj] = Infinity;
    }
  }
  for (let room_id = 1; room_id < rooms.length; ++room_id) {
    let room = rooms[room_id];
    if (!room.parent_id) {
      continue;
    }
    assert(!isFinite(room_dist[room.parent_id][room.id]));
    room_dist[room.parent_id][room.id] = 1;
    room_dist[room.id][room.parent_id] = 1;
    // Track adjacency for later use
    room.adj!.push(room.parent_id);
    let parent = rooms[room.parent_id];
    parent.adj!.push(room_id);
  }
  function updateRoomDist(): void {
    for (let pivot = 1; pivot < rooms.length; ++pivot) {
      for (let ii = 1; ii < rooms.length; ++ii) {
        for (let jj = ii + 1; jj < rooms.length; ++jj) {
          let combined = room_dist[ii][pivot] + room_dist[pivot][jj];
          if (combined < room_dist[ii][jj]) {
            room_dist[ii][jj] = room_dist[jj][ii] = combined;
          }
        }
      }
    }
  }
  updateRoomDist();
  num_tries = 500;
  let num_loops = 0;
  let max_add_loops = 10;
  let secret_add_loops = 2;
  const min_loop_dist = 4;
  while (num_tries && max_add_loops && wall_segments.length) {
    --num_tries;
    let idx = rand.range(wall_segments.length);
    let seg = wall_segments[idx];
    ridx(wall_segments, idx);
    let [xx, yy, dir] = seg;
    let room = rooms[work[xx+1 + (yy + 1) * work.w]];
    let nx = xx + DX[dir];
    let ny = yy + DY[dir];
    let nroom = rooms[work[nx+1 + (ny + 1) * work.w]];
    if (!room || !nroom) {
      continue;
    }
    let dist = room_dist[room.id][nroom.id];
    if (dist < min_loop_dist) {
      continue;
    }
    // Maybe only connect if at least one of the room is large?  Will leave better alcoves/buildings/shops
    --max_add_loops;
    let tile = wall_descs[max_add_loops < secret_add_loops ? WallType.SECRET_DOOR : WallType.DOOR];
    if (dir === SOUTH) {
      hwalls[yy*w + xx] = tile;
    } else if (dir === WEST) {
      vwalls[xx*h + yy] = tile;
    }
    assert(room.adj.indexOf(nroom.id) === -1);
    room_dist[room.id][nroom.id] = 1;
    room_dist[nroom.id][room.id] = 1;
    room.adj.push(nroom.id);
    nroom.adj.push(room.id);
    ++num_loops;
    updateRoomDist();
  }
  console.log(`Added ${num_loops} loops`);

  // Find room farthest (in terms of doors) from the entrance (room 1)
  let farthest_room = 1;
  let farthest_dist = 0;
  let farthest_count = 1;
  for (let room_id = 2; room_id < rooms.length; ++room_id) {
    let d = room_dist[1][room_id];
    assert(isFinite(d));
    let room = rooms[room_id];
    assert(room.size);
    if (room.adj.length > 1 || room.size < 2) {
      // skip non-leaf rooms and rooms of size 1
      continue;
    }
    let better = d > farthest_dist;
    let same = d === farthest_dist;
    if (same) {
      better = room.size > rooms[farthest_room].size!;
      same = room.size === rooms[farthest_room].size;
    }
    if (!better && !same) {
      continue;
    }
    if (same) {
      ++farthest_count;
    }
    if (better || same && !rand.range(farthest_count)) {
      farthest_room = room_id;
      if (better) {
        farthest_dist = d;
        farthest_count = 1;
      }
    }
  }
  rooms[farthest_room].has_exit = true;

  // Convert all but a couple secret rooms into closets
  closet_rooms = closet_rooms.filter((a) => {
    // Only potentially keep those that are still leaves
    let room = rooms[a];
    if (room.adj.length === 1) {
      return true;
    } else {
      return false;
    }
  });
  if (closet_rooms.length) {
    closet_rooms.sort((a, b) => {
      let da = room_dist[1][a];
      let db = room_dist[1][b];
      return da - db;
    });
    let keep: Partial<Record<number, true>> = {};
    for (let ii = 0; ii < secrets; ++ii) {
      let r = rand.random();
      r = floor(r * r * r * closet_rooms.length);
      if (!keep[r]) {
        keep[r] = true;
        let room = rooms[closet_rooms[r]];
        room.secret = true;
        room.doors![0][2] = WallType.SECRET_DOOR;
        rooms[room.adj[0]].adj_secret = (rooms[room.adj[0]].adj_secret || 0) + 1;
      }
    }
    console.log(`Kept ${Object.keys(keep).length} secret rooms`);
  }

  // Add shops (and other interesting things?)
  //   Should these be generalized as engines?  In practice, we want shops to move
  //   in after clearing out enemies and engines?
  let leafs = [];
  for (let ii = 1; ii < rooms.length; ++ii) {
    let room = rooms[ii];
    assert(room.size);
    let eff_adj = room.adj.length - (room.adj_secret || 0);
    if (room.has_exit || room.has_entrance || room.secret || eff_adj > 1 || room.size > 6) {
      continue;
    }
    let priority = 0;
    if (room.size > 4) {
      priority -= 100;
    } else if (room.size > 1) {
      priority += 100;
    }
    priority += max(100 - room_dist[1][ii], 0);
    priority += rand.random();
    leafs.push([priority, ii]);
  }
  leafs.sort((a, b) => a[0] - b[0]);
  let room_tiles: Partial<Record<RoomID, CellDesc>> = {};
  let shop_opts = params.shop_cell_ids.slice(0);
  shuffleArray(rand, shop_opts);
  for (let ii = 0; ii < shops; ++ii) {
    for (let jj = 0; jj < shop_opts.length && leafs.length; ++jj) {
      let tile = shop_opts[jj];
      let room_id = leafs.pop()![1];
      rooms[room_id].need_doors = true;
      room_tiles[room_id] = crawlerGetCellDesc(tile);
    }
  }


  function numWallsAtCorner(cx: number, cy: number): number {
    cx--;
    cy--;
    let ret = 0;
    if (cx > 0 && !hwalls[cy*w + cx-1].open_vis) {
      ret++;
    }
    if (cx < w && !hwalls[cy*w + cx].open_vis) {
      ret++;
    }
    if (cy > 0 && !vwalls[cx*h + cy-1].open_vis) {
      ret++;
    }
    if (cy < h && !vwalls[cx*h + cy].open_vis) {
      ret++;
    }
    return ret;
  }

  // fill in doors into walls
  for (let ii = 1; ii < rooms.length; ++ii) {
    let room = rooms[ii];
    if (room.doors) {
      for (let kk = 0; kk < room.doors.length; ++kk) {
        let [doorx, doory, tile] = room.doors[kk];
        tile = tile || WallType.DOOR;
        //let cell = cells[doorx + doory * w];
        let adjacent_room = rooms[work[doorx + doory * work.w]];
        assert(adjacent_room);
        assert(adjacent_room !== room);
        let avail_dirs = [];
        for (let jj = 0; jj < 4; ++jj) {
          let nx = doorx + DX[jj];
          let ny = doory + DY[jj];
          if (work[nx + ny*work.w] === ii) {
            avail_dirs.push(jj);
          }
        }
        assert(avail_dirs.length);
        let dir = avail_dirs[rand.range(avail_dirs.length)];
        let nx = doorx + DX[dir];
        let ny = doory + DY[dir];
        let new_wall = tile;
        if (!(adjacent_room.need_doors || room.need_doors) && tile === WallType.DOOR &&
          rand.random() < passageway_chance
        ) {
          // where possible, cut out instead of adding a door (seems rarely an option
          //   on organic, so do this as often as possible?)
          let ok = true;
          if (dir === EAST) {
            ok = ok && numWallsAtCorner(doorx + 1, doory) >= 3;
            ok = ok && numWallsAtCorner(doorx + 1, doory + 1) >= 3;
          } else if (dir === NORTH) {
            ok = ok && numWallsAtCorner(doorx, doory + 1) >= 3;
            ok = ok && numWallsAtCorner(doorx + 1, doory + 1) >= 3;
          } else if (dir === WEST) {
            ok = ok && numWallsAtCorner(doorx, doory) >= 3;
            ok = ok && numWallsAtCorner(doorx, doory + 1) >= 3;
          } else if (dir === SOUTH) {
            ok = ok && numWallsAtCorner(doorx, doory) >= 3;
            ok = ok && numWallsAtCorner(doorx + 1, doory) >= 3;
          }
          if (ok) {
            new_wall = WallType.OPEN;
          }
        }
        let new_wall_desc = wall_descs[new_wall];
        if (dir === EAST) {
          vwalls[(nx-1)*h + ny-1] = new_wall_desc;
        } else if (dir === NORTH) {
          hwalls[(ny-1)*w + nx-1] = new_wall_desc;
        } else if (dir === WEST) {
          vwalls[(doorx-1)*h + doory-1] = new_wall_desc;
        } else {
          hwalls[(doory-1)*w + doorx-1] = new_wall_desc;
        }
      }
    }
  }

  let level = createLevel();
  level.alloc(w, h);
  let { cells } = level;
  // fill from work data
  for (let yy = 0; yy < h; ++yy) {
    for (let xx = 0; xx < w; ++xx) {
      let cell = cells[xx + yy * w];
      let room_id = work[xx + 1 + (yy + 1) * work.w];
      if (!room_id) {
        cell.desc = cell_descs[CellType.SOLID];
      } else {
        cell.desc = room_tiles[room_id] || cell_descs[CellType.OPEN];
      }
    }
  }
  for (let ii = 1; ii < rooms.length; ++ii) {
    // let room = rooms[ii];
    // DEBUG: Visualize door options
    // for (let jj = 0; jj < room.door_opts.length; ++jj) {
    //   let pidx = room.door_opts[jj];
    //   let doorx = pidx % room.w;
    //   let doory = (pidx - doorx) / room.w;
    //   doorx += room.place_at[0] - 1;
    //   doory += room.place_at[1] - 1;
    //   let cell = cells[doorx + doory * w];
    //   assert(cell.type === SOLID);
    //   cell.type = SHOP_1;
    //   cell.solid = false;
    // }
    // DEBUG: Visualize chosen doors
    // if (room.doors) {
    //   for (let jj = 0; jj < room.doors.length; ++jj) {
    //     let [doorx, doory] = room.doors[jj];
    //     let cell = cells[doorx + doory * w];
    //     cell.type = 5; // SHOP_1
    //     cell.solid = false;
    //   }
    // }
  }

  level.fillFromHVWalls(hwalls, vwalls);

  let gen_data: PrivateGenData = {
    work,
    farthest_room,
  };
  level.gen_data = gen_data;

  level.setVstyle('demo');

  return level;
}

function connectLevelBrogue(generator: LevelGenerator, floor_id: number, seed: string, params: GenParamsBrogue): void {
  let level = generator.getLevelGenerated(floor_id);
  let { w, h, cells } = level;
  let { work, farthest_room } = level.gen_data as PrivateGenData;
  let rand = randCreate(mashString(seed));
  let { enemies_min, enemies_random, pits_min, pits_random } = params;

  let { wall_descs, cell_descs } = descsFromParams(params);

  // Place an entrance in room 1
  function getStairPos(room_id: RoomID): [number, number] {
    let best_pair: [number,number] | null = null;
    let best_adjwalls = 0;
    let num_ties = 1;
    for (let yy = 0; yy < h; ++yy) {
      outer:
      for (let xx = 0; xx < w; ++xx) {
        let cell = cells[xx + yy * w];
        if (cell.desc !== cell_descs[CellType.OPEN] || work[xx+1 + (yy+1) * work.w] !== room_id) {
          // something special, or solid, or not the right room
          continue;
        }
        let best = 0;
        let nadjwalls = 0;
        for (let ii = 0; ii < 8; ++ii) {
          if (!cell.walls[ii % 4].open_move) {
            nadjwalls++;
          } else if (!cell.walls[ii % 4].open_vis) {
            // something special
            continue outer;
          } else {
            if (nadjwalls > best) {
              best = nadjwalls;
            }
            nadjwalls = 0;
          }
        }
        if (best === best_adjwalls) {
          ++num_ties;
        }
        if (best > best_adjwalls || best === best_adjwalls && !rand.range(num_ties)) {
          if (best > best_adjwalls) {
            num_ties = 1;
          }
          best_adjwalls = best;
          best_pair = [xx,yy];
        }
      }
    }
    assert(best_pair);
    return best_pair;
  }

  function addDefaultEvents(x: number, y: number, cell_desc: CellDesc): void {
    let { default_events } = cell_desc;
    if (default_events) {
      let cell = level.getCell(x, y)!;
      for (let ii = 0; ii < default_events.length; ++ii) {
        let key = default_events[ii];
        let param = '';
        let idx = key.indexOf(' ');
        if (idx !== -1) {
          param = key.slice(idx + 1);
          key = key.slice(0, idx);
        }
        cell.addEvent(key, param);
      }
    }
  }

  function placeStair(
    pair: readonly [number, number],
    cell_tile: CellType,
    try_push_back: boolean
  ): [number, number, DirType] {
    let cell = cells[pair[0] + pair[1]*w];
    let opens: DirType[] = [];
    for (let ii = 0 as DirType; ii < 4; ++ii) {
      if (cell.walls[ii].open_vis) {
        opens.push(ii);
      }
    }
    assert(opens.length);
    let door = rand.range(opens.length);
    let ret = opens[door];
    if (try_push_back) {
      let back_dir = (ret + 2) % 4;
      // Can we push it back into the wall instead?
      let back_pos = [pair[0] + DX[back_dir], pair[1] + DY[back_dir]] as const;
      let back = level.getCell(back_pos[0], back_pos[1]);
      if (back && !back.desc.open_vis) {
        // Open it up, then spawn it back one
        level.setCell(back_pos[0], back_pos[1], cell_descs[CellType.OPEN]);
        level.setWall(back_pos[0], back_pos[1], ret, wall_descs[WallType.OPEN]);
        return placeStair(back_pos, cell_tile, false);
      }
    }
    // Nope, place it here, surround it with walls and a door
    let cell_desc = cell_descs[cell_tile];
    assert(cell_desc.advertised_wall_desc);
    level.setCell(pair[0], pair[1], cell_desc);
    addDefaultEvents(pair[0], pair[1], cell_desc);
    level.setWall(pair[0], pair[1], ret, cell_desc.advertised_wall_desc);
    ridx(opens, door);
    for (let ii = 0; ii < opens.length; ++ii) {
      let dir = opens[ii];
      level.setWall(pair[0], pair[1], dir, wall_descs[WallType.SOLID]);
    }
    return [pair[0], pair[1], ret];
  }
  // TODO: use cell_desc.special_pos to populate level.special_pos
  level.special_pos.stairs_in = placeStair(getStairPos(1),
    floor_id === 0 ? CellType.ENTRANCE : CellType.STAIRS_IN,
    true);

  level.special_pos.stairs_out = placeStair(getStairPos(farthest_room),
    CellType.STAIRS_OUT, true);

  let open_cells = [];
  for (let ii = 0; ii < cells.length; ++ii) {
    let cell = cells[ii];
    if (cell.desc === cell_descs[CellType.OPEN]) {
      open_cells.push(ii);
    }
  }

  // Place pits
  // TODO: These need to not block connectivity!
  let num_pits = pits_min + rand.range(pits_random);
  for (let ii = 0; ii < num_pits && open_cells.length; ++ii) {
    let idx = rand.range(open_cells.length);
    let pos = open_cells[idx];
    ridx(open_cells, idx);
    cells[pos].desc = cell_descs[CellType.PIT];
    let xx = pos % w;
    let yy = (pos - xx) / w;
    addDefaultEvents(xx, yy, cells[pos].desc);
  }

  // Place monsters
  let num_enemies = enemies_min + rand.range(enemies_random);
  let initial_entities = [];
  for (let ii = 0; ii < num_enemies && open_cells.length; ++ii) {
    let idx = rand.range(open_cells.length);
    let pos = open_cells[idx];
    let xx = pos % w;
    let yy = (pos - xx) / w;
    ridx(open_cells, idx);
    let enemy_type = rand.range(3);
    initial_entities.push({
      type: `enemy${enemy_type}`,
      pos: [xx,yy,0],
    });
  }
  level.initial_entities = initial_entities;
}

function generateLevel(
  floor_id: number,
  seed: string,
  params: GenParamsAny | null
): CrawlerLevel {
  params = params || default_gen_params;
  // eslint-disable-next-line default-case
  switch (params.type) {
    case 'brogue':
      return generateLevelBrogue(floor_id, seed, params.brogue || default_gen_params.brogue);
  }
  assert(false);
}

function connectLevel(
  generator: LevelGenerator,
  floor_id: number,
  seed: string,
  params: GenParamsAny | null
): void {
  params = params || default_gen_params;
  // eslint-disable-next-line default-case
  switch (params.type) {
    case 'brogue':
      return connectLevelBrogue(generator, floor_id, seed, params.brogue || default_gen_params.brogue);
  }
  assert(false);
}

export type LevelGeneratorParam = { seed: string };
export type LevelGenerator = LevelGeneratorImpl;
class LevelGeneratorImpl {
  spire_seed: string;
  seed_override: string | null = null;
  level_gen_params: GenParamsWrapBrogue | null = null; // use defaults
  levels: CrawlerLevel[];

  provider: (floor_id: number, cb: (level_data: CrawlerLevelSerialized)=> void) => void;
  constructor(param: LevelGeneratorParam) {
    this.spire_seed = param.seed;
    this.provider = this.provideLevel.bind(this);
    this.levels = [];
  }

  setSeed(seed: string): void {
    this.spire_seed = seed;
  }

  getLevelGenerated(floor_id: number): CrawlerLevel {
    assert(isFinite(floor_id));
    if (!this.levels[floor_id]) {
      this.levels[floor_id] = generateLevel(floor_id,
        `${this.seed_override || this.spire_seed}_f${floor_id}`,
        this.level_gen_params);
    }
    return this.levels[floor_id];
  }

  provideLevel(floor_id: number, cb: (level_data: CrawlerLevelSerialized)=> void): void {
    this.getLevelGenerated(floor_id);
    if (!this.levels[floor_id].connected) {
      connectLevel(this, floor_id,
        `${this.seed_override || this.spire_seed}_fc${floor_id}`,
        this.level_gen_params);
      this.levels[floor_id].finalize();
      this.levels[floor_id].connected = true;
    }
    cb(this.levels[floor_id].serialize());
  }

  resetAllLevels(): void {
    this.levels = [];
  }
}

export function levelGeneratorCreate(param: LevelGeneratorParam):LevelGenerator {
  return new LevelGeneratorImpl(param);
}
