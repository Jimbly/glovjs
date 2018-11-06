/*global VMath: false */

class GlovCamera {
  constructor(graphics_device, draw_2d) {
    this.graphics_device = graphics_device;
    this.draw_2d = draw_2d;
    this.params = {
      scaleMode: 'scale',
      viewportRectangle: VMath.v4Build(0, 0, 100, 100)
    };
    this.data = new VMath.F32Array(7); // x0, y0, x1, y1, x_scale, y_scale, css_to_real
    this.data[6] = window.devicePixelRatio || 1; /* css_to_real */
    this.set2D(0, 0, graphics_device.width, graphics_device.height);
    this.tick();
  }

  // Sets the 2D "camera" used to translate sprite positions to screen space.  Affects sprites queued
  //  after this call
  set2D(x0, y0, x1, y1) {
    this.data[0] = x0;
    this.data[1] = y0;
    this.data[2] = x1;
    this.data[3] = y1;
    this.reapply();
  }

  x0() {
    return this.data[0];
  }
  y0() {
    return this.data[1];
  }
  x1() {
    return this.data[2];
  }
  y1() {
    return this.data[3];
  }
  xScale() {
    return this.data[4];
  }
  yScale() {
    return this.data[5];
  }

  reapply() {
    this.data[4] = this.screen_width / (this.data[2] - this.data[0]);
    this.data[5] = this.screen_height / (this.data[3] - this.data[1]);
  }

  physicalToVirtual(dst, src) {
    dst[0] = src[0] * this.data[6] / this.data[4] + this.data[0];
    dst[1] = src[1] * this.data[6] / this.data[5] + this.data[1];
  }

  virtualToPhysical(dst, src) {
    dst[0] = (src[0] - this.data[0]) * this.data[4] / this.data[6];
    dst[1] = (src[1] - this.data[1]) * this.data[5] / this.data[6];
  }

  // Drawing area 0,0-w,h
  // But keep the aspect ratio of those things drawn to be correct
  // This may create a padding or margin on either bottom or sides of the screen
  set2DAspectFixed(w, h) {
    let inv_aspect = h / w;
    let inv_desired_aspect = this.screen_height / this.screen_width;
    if (inv_aspect > inv_desired_aspect) {
      let margin = (h / inv_desired_aspect - w) / 2;
      this.set2D(-margin, 0, w + margin, h);
    } else {
      let margin = (w * inv_desired_aspect - h) / 2;
      this.set2D(0, -margin, w, h + margin);
    }
  }

  zoom(x, y, factor) {
    let inv_factor = 1.0 / factor;
    this.set2D(
      x - (x - this.x0()) * inv_factor,
      y - (y - this.y0()) * inv_factor,
      x + (this.x1() - x) * inv_factor,
      y + (this.y1() - y) * inv_factor);
  }


  tick() {
    let graphics_device = this.graphics_device;
    this.screen_width = graphics_device.width;
    this.screen_height = graphics_device.height;
    this.reapply();

    this.params.viewportRectangle[2] = this.screen_width;
    this.params.viewportRectangle[3] = this.screen_height;

    // let screen_width = graphics_device.width;
    // let screen_height = graphics_device.height;
    // let screen_aspect = screen_width / screen_height;
    // let view_aspect = game_width / game_height;
    // if (screen_aspect > view_aspect) {
    //   let viewport_width = game_height * screen_aspect;
    //   let half_diff = (viewport_width - game_width) / 2;
    //   this.params.viewportRectangle = [-half_diff, 0, game_width + half_diff, game_height];
    // } else {
    //   let viewport_height = game_width / screen_aspect;
    //   let half_diff = (viewport_height - game_height) / 2;
    //   this.params.viewportRectangle = [0, -half_diff, game_width, game_height + half_diff];
    // }
    this.draw_2d.configure(this.params);
  }
}

export function create(...args) {
  return new GlovCamera(...args);
}
