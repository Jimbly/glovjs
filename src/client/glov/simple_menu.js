const glov_engine = require('./engine.js');
let glov_ui;

let { GlovMenuItem } = require('./selection_box.js');

class GlovSimpleMenu {
  constructor(params) {
    params = params || {};
    this.items = (params.items || []).map((item) => new GlovMenuItem(item));
    this.width = params.width || glov_ui.button_width;
    this.selected = 0;
  }

  run(x, y, z) {
  }

  isSelected(tag_or_index) {
    if (typeof tag_or_index === 'number') {
      return this.selected === tag_or_index;
    }
    return this.items[this.selected].tag === tag_or_index;
  }
}

export function create(...args) {
  if (!glov_ui) {
    glov_ui = glov_engine.glov_ui;
  }
  return new GlovSimpleMenu(...args);
}
