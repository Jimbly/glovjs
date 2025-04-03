import { autoAtlasTextureOpts } from 'glov/client/autoatlas';
import * as settings from 'glov/client/settings';
import {
  vec2,
} from 'glov/common/vmath';
import { crawlerOnFilterChange } from './crawler_play';
import {
  crawlerRenderInit,
  crawlerRenderStartup,
} from './crawler_render';

function renderResetFilter(): void {
  let ss = {
    filter_min: settings.filter ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST,
    filter_mag: settings.filter === 1 ? gl.LINEAR : gl.NEAREST,
    force_mipmaps: true,
  };
  autoAtlasTextureOpts('utumno', {
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
  });
  autoAtlasTextureOpts('whitebox', ss);
  autoAtlasTextureOpts('demo', {
    filter_min: gl.NEAREST,
    filter_mag: gl.NEAREST,
  });
  autoAtlasTextureOpts('spireish', ss);
}

export function renderAppStartup(): void {
  crawlerRenderStartup();

  crawlerRenderInit({
    passes: [{
      // floor and ceiling
      name: 'bg',
      alpha_blend: false,
    }, {
      // pillars and floor/ceiling details
      name: 'details',
      neighbor_draw: true,
      alpha_blend: true,
    }, {
      // walls, details, with z-testing
      name: 'default',
      need_split_near: true,
      alpha_blend: false,
    }, {
      // alpha-blended world details
      name: 'celldetails',
      neighbor_draw: false,
      alpha_blend: true,
    }],
    atlas_aliases: {
      default: 'demo',
    },
    split_dist: 2.8,
    angle_offs: 0, // 9.5,
    pos_offs: vec2(0/*0.3*/, -0.95),
  });

  crawlerOnFilterChange(renderResetFilter);
  renderResetFilter();
}
