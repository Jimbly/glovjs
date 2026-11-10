// This is run before requiring anything else that might load from local storage

let ls_key = 'glovjs-playground';
if (window.conf_env === 'multiplayer') {
  ls_key = 'glovjs-multiplayer';
} else if (window.conf_env === 'entity') {
  ls_key = 'glovjs-multiplayer';
}
require('glov/client/local_storage').setStoragePrefix(ls_key);

require('glov/common/platform').platformRegister('sdl', {
  devmode: 'auto',
  reload: true,
  reload_updates: true,
  random_creation_name: false,
  exit: true,
});
