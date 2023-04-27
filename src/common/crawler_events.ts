import assert from 'assert';
import { isInteger, merge } from 'glov/common/util';
import {
  CrawlerScriptAPI,
  CrawlerScriptEventMapIcon,
  CrawlerScriptWhen,
  crawlerScriptRegisterEvent,
  crawlerScriptRegisterFunc,
} from './crawler_script';
import {
  CrawlerCell,
  DIR_CELL,
  DirType,
  DirTypeOrCell,
  dirMod,
} from './crawler_state';

export type DialogIconFunc = (param: string, script_api: CrawlerScriptAPI) => CrawlerScriptEventMapIcon;
let DIALOG_ICONS: Partial<Record<string, DialogIconFunc>> = {};
export function dialogIconsRegister(data: Record<string, DialogIconFunc>): void {
  merge(DIALOG_ICONS, data);
}
export function dialogMapIcon(id: string, param: string, script_api: CrawlerScriptAPI): CrawlerScriptEventMapIcon {
  let dlg = DIALOG_ICONS[id];
  if (!dlg) {
    return CrawlerScriptEventMapIcon.NONE;
  }
  return dlg(param || '', script_api);
}


crawlerScriptRegisterFunc('KEY', function (
  script_api: CrawlerScriptAPI, cell: CrawlerCell, dir: DirTypeOrCell
): boolean {
  let key_name = cell.getKeyNameForWall(dir);
  if (!key_name && dir !== DIR_CELL) {
    script_api.setPos([cell.x, cell.y]);
    let neighbor = script_api.getCellRelative(dir);
    if (neighbor) {
      key_name = neighbor.getKeyNameForWall(dirMod(dir + 2));
    }
    if (!key_name) {
      key_name = cell.getKeyNameForWall(DIR_CELL);
    }
    if (!key_name && neighbor) {
      key_name = neighbor.getKeyNameForWall(DIR_CELL);
    }
  }
  return script_api.keyGet(key_name || 'missingkey');
});


crawlerScriptRegisterEvent({
  key: 'key_set',
  when: CrawlerScriptWhen.PRE, // Must be PRE so that the if happens before the server applies it
  // map_icon: CrawlerScriptEventMapIcon.EXCLAIMATION,
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    if (!param && cell.props?.key_cell) {
      param = cell.props?.key_cell;
    }
    if (!param) {
      api.status('key_pickup', '"key_set" event requires a string parameter');
    } else {
      if (!api.keyGet(param)) {
        api.keySet(param);
        api.status('key_pickup', `Acquired key "${param}"`);
      }
    }
  },
});

crawlerScriptRegisterEvent({
  key: 'key_clear',
  when: CrawlerScriptWhen.PRE, // Must be PRE so that the if happens before the server applies it
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    if (!param && cell.props?.key_cell) {
      param = cell.props?.key_cell;
    }
    if (!param) {
      api.status('key_pickup', '"key_clear" event requires a string parameter');
    } else {
      if (api.keyGet(param)) {
        api.keyClear(param);
        api.status('key_pickup', `Cleared key "${param}"`);
      }
    }
  },
});

crawlerScriptRegisterEvent({
  key: 'key_toggle',
  when: CrawlerScriptWhen.PRE, // Must be PRE so that the if happens before the server applies it
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    if (!param && cell.props?.key_cell) {
      param = cell.props?.key_cell;
    }
    if (!param) {
      api.status('key_pickup', '"key_toggle" event requires a string parameter');
    } else {
      if (api.keyGet(param)) {
        api.keyClear(param);
        api.status('key_pickup', `Cleared key "${param}"`);
      } else {
        api.keySet(param);
        api.status('key_pickup', `Acquired key "${param}"`);
      }
    }
  },
});

crawlerScriptRegisterEvent({
  key: 'floor_delta', // 1/-1 [keeprot] [special_pos_key]
  when: CrawlerScriptWhen.POST,
  map_icon: CrawlerScriptEventMapIcon.NONE,
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    let params = param.split(' ');
    let delta = Number(params[0]);
    if (api.getFloor() + delta < 0) {
      api.status('stairs', 'This is where you came in, try to find the stairs down instead.');
      return;
    }
    let idx = 1;
    let keep_rot = false;
    if (params[idx] === 'keeprot') {
      keep_rot = true;
      idx++;
    }
    let special_pos = params[idx++] || (delta < 0 ? 'stairs_out' : 'stairs_in');
    if (!delta || !isInteger(delta) || params.length > idx) {
      api.status('floor_delta', '"floor_delta" event requires a parameter in the form: +/-N [keeprot] [special_key]');
      return;
    }
    api.floorDelta(delta, special_pos, keep_rot);
  },
});

function parseRot(s: string): DirType | null | undefined {
  if (!s) {
    return undefined;
  }
  let v = Number(s);
  if (isInteger(v) && (v === 0 || v === 1 || v === 2 || v === 3)) {
    return v;
  } else {
    let idx = 'ENWS'.indexOf(s.toUpperCase());
    if (idx !== -1) {
      assert(idx === 0 || idx === 1 || idx === 2 || idx === 3);
      return idx;
    }
  }
  return null;
}

crawlerScriptRegisterEvent({
  key: 'floor_abs', // floor x y [rot]
  when: CrawlerScriptWhen.POST,
  map_icon: CrawlerScriptEventMapIcon.NONE,
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    let params = param.split(' ');
    let floor_id = Number(params[0]);
    if (params[0] === 'same') {
      floor_id = api.getFloor();
    }
    let x = Number(params[1]);
    let y = Number(params[2]);
    let rot = parseRot(params[3]);
    if (!isInteger(floor_id) || !isInteger(x) || !isInteger(y)) {
      api.status('floor_abs', '"floor_abs" event requires a parameter in the form: floor#|same x y [rot]');
      return;
    }
    if (rot === null) {
      rot = undefined;
    }
    api.floorAbsolute(floor_id, x, y, rot);
  },
});

crawlerScriptRegisterEvent({
  key: 'floor_pit', // 1/-1 [special_pos_key | x y rot]
  when: CrawlerScriptWhen.POST,
  map_icon: CrawlerScriptEventMapIcon.NONE,
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    let params = param.split(' ');
    let delta = Number(params[0]);
    if (api.getFloor() + delta < 0) {
      api.status('floor_pit', 'floor_pit: invalid floor delta.');
      return;
    }
    if (!delta || !isInteger(delta) || !(params.length === 1 || params.length === 2 || params.length === 4)) {
      api.status('floor_pit', '"floor_pit" event requires a parameter in the form: +/-N [special_key | x y rot]');
      return;
    }
    let special_pos: string | undefined;
    let pos: [number, number, DirType] | undefined;
    if (params.length <= 2) {
      special_pos = params[1] || (delta < 0 ? 'stairs_out' : 'stairs_in');
    } else {
      assert(params.length === 4);
      let x = Number(params[1]);
      let y = Number(params[2]);
      let rot = parseRot(params[3]);
      if (!isInteger(x) || !isInteger(y)) {
        api.status('floor_pit', '"floor_pit" event requires a parameter in the form: +/-N [special_key | x y rot]');
        return;
      }
      if (rot === null || rot === undefined) {
        api.status('floor_pit', '"floor_pit" event requires a parameter in the form: +/-N [special_key | x y rot]');
        return;
      }
      pos = [x, y, rot];
    }
    api.startPit(api.getFloor() + delta, special_pos, pos);
  },
});

crawlerScriptRegisterEvent({
  key: 'move', // rot
  when: CrawlerScriptWhen.POST,
  map_icon: CrawlerScriptEventMapIcon.NONE,
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    let rot = parseRot(param);
    if (rot === null || rot === undefined) {
      api.status('move', '"move" event requires a single direction parameter 0-3 or NSEW');
      return;
    }
    api.forceMove(rot);
  },
});

crawlerScriptRegisterEvent({
  key: 'sign',
  when: CrawlerScriptWhen.PRE,
  map_icon: CrawlerScriptEventMapIcon.NONE,
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    api.dialog('sign', param || '...');
  },
});

crawlerScriptRegisterEvent({
  key: 'dialog', // id [string parameter]
  when: CrawlerScriptWhen.PRE,
  map_icon: (api: CrawlerScriptAPI, param: string) => {
    let idx = param.indexOf(' ');
    let id = param;
    if (idx !== -1) {
      id = param.slice(0, idx);
      param = param.slice(idx + 1);
    } else {
      param = '';
    }
    return dialogMapIcon(id, param, api);
  },
  func: (api: CrawlerScriptAPI, cell: CrawlerCell, param: string) => {
    if (!param) {
      return api.status('dialog', 'Missing dialog ID');
    }
    let idx = param.indexOf(' ');
    let id = param;
    if (idx !== -1) {
      id = param.slice(0, idx);
      param = param.slice(idx + 1);
    } else {
      param = '';
    }
    api.dialog(id, param);
  },
});
