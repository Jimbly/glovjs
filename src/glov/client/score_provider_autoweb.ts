/* eslint-env browser */
export const PROVIDER_AUTO_WEB = 'auto_web';

import assert from 'assert';
import {
  ScoreUserInfo,
  ScoreUserProvider,
  fetchJSON2Timeout,
  scoreGetScoreHost,
} from './score';

import type { ErrorCallback } from 'glov/common/types';

type UserAllocResponse = { userid: string };

const PLAYER_NAME_KEY = 'ld.player_name';
const USERID_KEY = 'score.userid';

let lsd = (function (): Partial<Record<string, string>> {
  try {
    localStorage.setItem('test', 'test');
    localStorage.removeItem('test');
    return localStorage;
  } catch (e) {
    return {};
  }
}());


export const score_user_provider_auto_web: ScoreUserProvider = {
  provider_id: PROVIDER_AUTO_WEB,
  getAuthToken(cb: ErrorCallback<string | null, string>): void {
    cb(null, null);
  },
  getAccountInfo(cb: ErrorCallback<ScoreUserInfo, string>): void {
    let display_name: string | null = null;
    if (lsd[PLAYER_NAME_KEY]) {
      display_name = lsd[PLAYER_NAME_KEY]!;
    }
    if (lsd[USERID_KEY]) {
      let user_id = lsd[USERID_KEY]!;
      if (user_id.startsWith('w')) {
        console.log(`Using existing ScoreAPI Auto-Web UserID: "${user_id}"`);
        return cb(null, {
          user_id,
          display_name,
        });
      }
    }

    let url = `${scoreGetScoreHost()}/api/useralloc`;
    fetchJSON2Timeout<UserAllocResponse>(url, 20000, function (err: string | undefined, res: UserAllocResponse) {
      if (err) {
        return cb(err);
      }
      assert(res);
      assert(res.userid);
      assert.equal(typeof res.userid, 'string');
      lsd[USERID_KEY] = res.userid;
      console.log(`Allocated new ScoreAPI Auto-Web UserID: "${res.userid}"`);
      cb(null, {
        user_id: res.userid,
        display_name,
      });
    });
  },
  setName(name: string): void {
    lsd[PLAYER_NAME_KEY] = name;
  }
};
