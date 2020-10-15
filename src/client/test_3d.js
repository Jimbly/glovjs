const engine = require('./glov/engine.js');
const mat4LookAt = require('gl-mat4/lookat');
const models = require('./glov/models.js');
const { mat4, zaxis, zero_vec } = require('./glov/vmath.js');
const { quat, qRotateZ } = require('./glov/quat.js');
const mat4ScaleRotateTranslate = require('./glov/mat4ScaleRotateTranslate.js');

let mat_view = mat4();
let mat_obj = mat4();
let rot = quat();

export function test3D() {
  if (!models.models.box) {
    models.startup();
  }
  engine.start3DRendering();
  mat4LookAt(mat_view, [5,4,3], zero_vec, zaxis);
  engine.setGlobalMatrices(mat_view);
  qRotateZ(rot, rot, engine.frame_dt * 0.001);
  mat4ScaleRotateTranslate(mat_obj, 1, rot, zero_vec);
  models.models.box.draw(mat_obj);
}
