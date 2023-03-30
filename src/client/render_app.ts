import * as settings from 'glov/client/settings';
import {
  vec2,
} from 'glov/common/vmath';
import {
  crawlerRenderInit,
  crawlerRenderStartup,
} from './crawler_render';

const spritesheet_crawlertest = require('./img/crawlertest');
const spritesheet_whitebox = require('./img/whitebox');

export function renderResetFilter(): void {
  let ss = {
    filter_min: settings.filter ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST,
    filter_mag: settings.filter ? gl.LINEAR : gl.NEAREST,
    force_mipmaps: true,
  };
  spritesheet_whitebox.sprite.texs[0].setSamplerState(ss);
  spritesheet_crawlertest.sprite.texs[0].setSamplerState(ss);
}

export function renderAppStartup(): void {
  crawlerRenderStartup();

  crawlerRenderInit({
    passes: [{
      // floor and ceiling
      name: 'bg',
    }, {
      // pillars and floor/ceiling details
      name: 'details',
      neighbor_draw: true,
    }, {
      // walls, details, with z-testing
      name: 'default',
      need_split_near: true,
    }],
    spritesheets: {
      default: spritesheet_crawlertest,
      demo: spritesheet_crawlertest,
      whitebox: spritesheet_whitebox,
    },
    split_dist: 2.8,
    angle_offs: 0, // 9.5,
    pos_offs: vec2(0/*0.3*/, -0.95),
  });

  renderResetFilter();
}
