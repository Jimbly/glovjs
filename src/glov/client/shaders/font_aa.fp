#pragma WebGL2

precision lowp float;

varying vec2 interp_texcoord;
varying lowp vec4 interp_color;
uniform sampler2D tex0;
uniform mediump vec4 param0;
void main()
{
  // Body
  float sdf = texture2D(tex0,interp_texcoord).r;
  float blend_t = clamp(sdf * param0.x + param0.y, 0.0, 1.0);
  #ifdef NOPREMUL
  gl_FragColor = vec4(interp_color.rgb, interp_color.a * blend_t);
  #else
  // TODO: do on CPU?
  vec4 premul_color = vec4(interp_color.rgb * interp_color.a, interp_color.a);
  gl_FragColor = premul_color * blend_t;
  #endif
}
