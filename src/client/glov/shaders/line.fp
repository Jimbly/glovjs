#pragma WebGL2

precision lowp float;

varying vec2 interp_texcoord;
varying lowp vec4 interp_color;
vec4 _ret_0;
uniform sampler2D tex0;
uniform vec4 param0;

void main()
{
  float texture0 = texture2D(tex0,interp_texcoord).r;

  // explicit:
  // float half_w_in_pixels = param0.x;
  // float tex_delta_for_pixel = param0.y;
  // // distance from left side of fragment to edge of line
  // float left_dist = (1.0 - (texture0 - tex_delta_for_pixel*0.5)) / tex_delta_for_pixel - half_w_in_pixels;
  // // distance from right side of fragment to edge of line
  // float right_dist = ((texture0 + tex_delta_for_pixel*0.5) - 1.0) / tex_delta_for_pixel - half_w_in_pixels;
  // float v = 1.0 - clamp(right_dist, 0.0, 1.0) - clamp(left_dist, 0.0, 1.0);

  // refactor into MAD constants:
  // float inv_tex_delta = 1.0 / tex_delta_for_pixel;
  // float A = 0.5 + inv_tex_delta - half_w_in_pixels;
  // float B = 0.5 - inv_tex_delta - half_w_in_pixels;
  // float left_dist = -texture0*inv_tex_delta + A;
  // float right_dist = texture0*inv_tex_delta + B;
  // float v = 1.0 - clamp(right_dist, 0.0, 1.0) - clamp(left_dist, 0.0, 1.0);

  // super-efficient:
  // float left_dist = -texture0 * param0.x + param0.y;
  // float right_dist = texture0 * param0.x + param0.z;
  // float v = 1.0 - clamp(right_dist, 0.0, 1.0) - clamp(left_dist, 0.0, 1.0);

  // implicit from single sample and add precise/spread param
  // float half_w_in_pixels = param0.x;
  // float tex_delta_for_pixel = param0.y;
  // float step_start = 1.0 - (half_w_in_pixels + 0.5) * tex_delta_for_pixel;
  // float step_end = step_start + tex_delta_for_pixel;
  // float precise = 1.0;
  // step_start = mix(tex_delta_for_pixel, step_start, precise);
  // step_end = mix(1.0, step_end, precise);
  // float v = clamp((texture0 - step_start) / (step_end - step_start), 0.0, 1.0);
  // v = min(v, half_w_in_pixels*2.0); // ensures no more than 50% coverage from a w=0.5 line going diagonal

  // refactor into MAD constants:
  // float half_w_in_pixels = param0.x;
  // float tex_delta_for_pixel = param0.y;
  // float step_start = 1.0 - (half_w_in_pixels + 0.5) * tex_delta_for_pixel;
  // float step_end = step_start + tex_delta_for_pixel;
  // float precise = 1.0;
  // step_start = mix(tex_delta_for_pixel, step_start, precise);
  // step_end = mix(1.0, step_end, precise);
  // float A = 1.0 / (step_end - step_start);
  // float B = -step_start * A;
  // float v = clamp(texture0 * A + B, 0.0, 1.0);

  // super-efficient:
  float v = clamp(texture0 * param0.x + param0.y, 0.0, 1.0);


  // This is maybe better AA in pixely views, except where line width is less
  //   than one pixel, then lines start disappearing a bit.  In full-res views
  //   it makes things a little more jagged, so disabled for now.
  //float smoothv = v * v * (3.0 - 2.0 * v); // = smoothstep(0.0, 1.0, v)
  //gl_FragColor = vec4(interp_color.rgb, interp_color.a * smoothv);
  gl_FragColor = vec4(interp_color.rgb, interp_color.a * v);

  // v = texture0;
  //gl_FragColor = vec4(v,v,v, 1.0);
}
