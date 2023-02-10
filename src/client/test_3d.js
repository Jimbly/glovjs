import * as mat4LookAt from 'gl-mat4/lookAt';
import * as engine from 'glov/client/engine.js';
import * as mat4ScaleRotateTranslate from 'glov/client/mat4ScaleRotateTranslate.js';
import * as models from 'glov/client/models.js';
import { qRotateZ, quat } from 'glov/client/quat.js';
import * as textures from 'glov/client/textures.js';
import { mat4, zaxis, zero_vec } from 'glov/common/vmath.js';

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
  textures.bind(0, textures.textures.error);
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [1,1,0.03]);
  models.models.box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [0,0,0]);
  models.models.box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [1,0,0.01]);
  models.models.box.draw({ mat: mat_obj });
  mat4ScaleRotateTranslate(mat_obj, 1, rot, [0,1,0.02]);
  models.models.box.draw({ mat: mat_obj });
}
