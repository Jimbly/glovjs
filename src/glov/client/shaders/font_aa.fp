#pragma WebGL2

precision lowp float;

varying vec2 interp_texcoord;
varying lowp vec4 interp_color;
uniform sampler2D tex0;
uniform mediump vec4 param0;
void main()
{
  float texture0 = texture2D(tex0,interp_texcoord).r;
  float res = clamp(texture0 * param0.x + param0.y, 0.0, 1.0);
  gl_FragColor = vec4(interp_color.rgb, interp_color.a * res);
}
