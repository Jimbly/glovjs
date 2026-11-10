/* globals Document, Event, Navigator, Location */
import assert from 'assert';
import { EventEmitter } from 'glov/common/tiny-events';
import { arrayToSet } from 'glov/common/util';

// an empty window object should have been initialized by sdlmain.js
assert(typeof window !== 'undefined');
assert.equal(window.conf_platform, 'sdl');

let listeners = new EventEmitter();

const KNOWN_EVENTS = arrayToSet(['keyup', 'keydown', 'blur', 'focus']);
function addEventListener(who: string, id: string, cb: (ev: Event) => unknown): void {
  if (id.startsWith('moz') || id.startsWith('webkit') || id === 'test') {
    // silently ignored
    return;
  }
  if (!KNOWN_EVENTS[id]) {
    console.log(`Unhandled ${who} listener for ${id} attempted`);
  }
  listeners.on(id, cb);
}

export function sdlWindowEmit(id: string, ev: unknown): void {
  listeners.emit(id, ev);
}

assert(typeof document === 'undefined');
class DummyElement {
  style = {};
  focus(): void {
    // nothing
  }
  addEventListener = addEventListener.bind(null, 'element');
}
let dummy_element = new DummyElement();
class DummyLocation {
  protocol = 'mock';
  href = 'mockhref';
  host = 'localhostmock';
  pathname = 'mockpathname';
  toString(): string {
    return 'mock';
  }
}
class DummyNavigator {
  userAgent = 'Node.js/sdl';
  language = 'en-US';
  languages = ['en-US'];
  platform = process.platform;
}

class DummyDocument {
  getElementById(): DummyElement {
    return dummy_element;
  }
  addEventListener = addEventListener.bind(null, 'document');
  hidden = false;
}

globalThis.document = window.document = new DummyDocument() as unknown as Document;
window.addEventListener = addEventListener.bind(null, 'window') as typeof window.addEventListener;
window.navigator = new DummyNavigator() as unknown as Navigator;
window.location = new DummyLocation() as (Location & string);

// Note: this is currently `false` in build.pkg/dist-dev/
window.glov_platform_devmode = !(process as unknown as { pkg: unknown }).pkg;

// Expose globals that are looked for on `window` in GLOV.js code, but also as unscoped globals
window.performance = globalThis.performance;
(globalThis as unknown as { Z: Record<string, number> }).Z = window.Z = {};
