
let scissor_test: boolean;
export function glScissorTest(value?: boolean): boolean {
  if (value !== undefined) {
    if (value !== scissor_test) {
      scissor_test = value;
      if (value) {
        gl.enable(gl.SCISSOR_TEST);
      } else {
        gl.disable(gl.SCISSOR_TEST);
      }
    }
  }
  return scissor_test;
}

let depth_test: boolean;
export function glDepthTest(value?: boolean): boolean {
  if (value !== undefined) {
    if (value !== depth_test) {
      depth_test = value;
      if (value) {
        gl.enable(gl.DEPTH_TEST);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }
    }
  }
  return depth_test;
}
