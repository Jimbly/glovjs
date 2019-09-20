// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

// Vector math functions required by the rest of the engine taken piecemeal from
// gl-matrix and related, as well as some generic math utilities

const { vec4 } = require('./vmath.js');
const { acos, cos, sin, sqrt } = Math;

const EPSILON = 0.000001;

exports.unit_quat = vec4(0, 0, 0, -1);

export function quat() {
  return vec4(0, 0, 0, -1);
}
exports.createQuat = quat;

// qi == "quaterion in-place" operation

// Not completely sure we need this part of normalizing?  Some libraries have it, others do not
export function qiNegW(q) {
  if (q[3] > 0) {
    q[0] *= -1;
    q[1] *= -1;
    q[2] *= -1;
    q[3] *= -1;
  }
}

export function qiNormalize(q) {
  let l = sqrt(q[0] * q[0] + q[1] * q[1] +
                    q[2] * q[2] + q[3] * q[3]);
  if (l !== 0) {
    let il = 1.0 / l;
    q[0] *= il;
    q[1] *= il;
    q[2] *= il;
    q[3] *= il;
  }
  qiNegW(q);
}

// axis must be normalized
export function qFromAxisAngle(out, axis, angle) {
  angle *= 0.5;
  let s = sin(angle);
  out[0] = s * axis[0];
  out[1] = s * axis[1];
  out[2] = s * axis[2];
  out[3] = cos(angle);
  qiNegW(out);
  return out;
}

export function qFromYPR(out, yaw, pitch, roll) {
  let s_pitch = sin(pitch*0.5);
  let c_pitch = cos(pitch*0.5);
  let s_yaw = sin(yaw*0.5);
  let c_yaw = cos(yaw*0.5);
  let s_roll = sin(roll*0.5);
  let c_roll = cos(roll*0.5);
  let c_pitch_c_yaw = c_pitch*c_yaw;
  let s_pitch_s_yaw = s_pitch*s_yaw;
  let s_pitch_c_yaw = s_pitch*c_yaw;
  let c_pitch_s_yaw = c_pitch*s_yaw;

  out[0] = s_pitch_c_yaw * c_roll - c_pitch_s_yaw * s_roll;
  out[1] = s_pitch_s_yaw * c_roll + c_pitch_c_yaw * s_roll;
  out[2] = c_pitch_s_yaw * c_roll + s_pitch_c_yaw * s_roll;
  out[3] = c_pitch_c_yaw * c_roll - s_pitch_s_yaw * s_roll;

  qiNormalize(out);
  return out;
}

// export function qToYPR(ypr, q) {
//   let xx = q[0] * q[0];
//   let yy = q[1] * q[1];
//   let zz = q[2] * q[2];
//   let asinparam = 2 * (q[3] * q[0] + q[1] * q[2]);
//   let y;
//   let p;
//   let r;
//   if (abs(asinparam) > 0.99999) {
//     let sign = (asinparam < 0) ? -1 : 1;
//     y = sign * 2 * atan2(q[2], q[0]);
//     p = sign * PI/2;
//     r = 0;
//     if (y < -PI) {
//       y += 2 * PI;
//     }
//     if (y > PI) {
//       y -= 2 * PI;
//     }
//   } else {
//     y = atan2(
//       2 * (q[3] * q[2] - q[0] * q[1]),
//       1 - 2 * (xx + zz)
//     );
//     p = asin(asinparam);
//     r = atan2(
//       2 * (q[3] * q[1] - q[0] * q[2]),
//       1 - 2 * (xx + yy)
//     );
//   }
//   v3set(ypr, y, p, r);
// }

export function qRotateZ(out, a, rad) {
  rad *= 0.5;

  let ax = a[0];
  let ay = a[1];
  let az = a[2];
  let aw = a[3];
  let bz = sin(rad);
  let bw = cos(rad);

  out[0] = ax * bw + ay * bz;
  out[1] = ay * bw - ax * bz;
  out[2] = az * bw + aw * bz;
  out[3] = aw * bw - az * bz;
  return out;
}


export function qSlerp(out, t, a, b) {
  // benchmarks:
  //    http://jsperf.com/quaternion-slerp-implementations
  let ax = a[0];
  let ay = a[1];
  let az = a[2];
  let aw = a[3];
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];

  let scale0;
  let scale1;

  // calc cosine
  let cosom = ax * bx + ay * by + az * bz + aw * bw;
  // adjust signs (if necessary)
  if (cosom < 0.0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  // calculate coefficients
  if ((1.0 - cosom) > EPSILON) {
    // standard case (slerp)
    let omega = acos(cosom);
    let sinom = sin(omega);
    scale0 = sin((1.0 - t) * omega) / sinom;
    scale1 = sin(t * omega) / sinom;
  } else {
    // "from" and "to" quaternions are very close
    //  ... so we can do a linear interpolation
    scale0 = 1.0 - t;
    scale1 = t;
  }
  // calculate final values
  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;

  return out;
}
