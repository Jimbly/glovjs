const {
  FRIEND_ADDED,
  FRIEND_ADDED_AUTO,
  FRIEND_REMOVED,
  FRIEND_BLOCKED,
} = require('./enums.js');

export enum FriendStatus {
  Added = FRIEND_ADDED,
  AddedAuto = FRIEND_ADDED_AUTO,
  Removed = FRIEND_REMOVED,
  Blocked = FRIEND_BLOCKED,
}

export interface FriendData {
  status: FriendStatus;
  ids?: Record<string, string>;
}

export type FriendsData = Record<string, FriendData>;
