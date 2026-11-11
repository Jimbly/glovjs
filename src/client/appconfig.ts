import { setStoragePrefix } from 'glov/client/local_storage';

// This is run before requiring anything else that might load from local storage

let ls_key = 'glovjs-playground';
if (window.conf_env === 'multiplayer') {
  ls_key = 'glovjs-multiplayer';
} else if (window.conf_env === 'entity') {
  ls_key = 'glovjs-multiplayer';
}
setStoragePrefix(ls_key);
