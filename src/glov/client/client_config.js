const assert = require('assert');

// Type
export const MODE_DEVELOPMENT = Boolean(String(document.location).match(/^https?:\/\/localhost/));
export const MODE_PRODUCTION = !MODE_DEVELOPMENT;

// Platform
export const PLATFORM_WEB = window.conf_platform === 'web';
export const PLATFORM_FBINSTANT = window.conf_platform === 'fbinstant';
export const PLATFORM_ANDROID = window.conf_platform === 'android';
export const PLATFORM_IOS = window.conf_platform === 'ios';
export const PLATFORM_MOBILE = PLATFORM_ANDROID || PLATFORM_IOS;

assert(PLATFORM_WEB || PLATFORM_FBINSTANT || PLATFORM_ANDROID || PLATFORM_IOS);

if (MODE_DEVELOPMENT) {
  assert(PLATFORM_WEB || !window.FB);
  assert(PLATFORM_FBINSTANT || !window.FBInstant);
  assert(PLATFORM_ANDROID === Boolean(window.androidwrapper));
  assert(PLATFORM_IOS === Boolean(window.webkit?.messageHandlers?.iosWrapper));
}

// Environment
export const ENVIRONMENT = window.conf_env;
