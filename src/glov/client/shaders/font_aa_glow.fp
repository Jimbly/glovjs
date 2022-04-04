#pragma WebGL2

precision lowp float;

varying vec2 interp_texcoord;
varying lowp vec4 interp_color;
uniform sampler2D tex0;
uniform mediump vec4 param0;
uniform vec4 glowColor;
uniform mediump vec4 glowParams;
void main()
{
  // Body
  float sdf = texture2D(tex0, interp_texcoord).r;
  float blend_t = clamp(sdf * param0.x + param0.y, 0.0, 1.0);
  // Glow
  vec2 glow_coord = interp_texcoord + glowParams.xy;
  float sdf_glow = texture2D(tex0, glow_coord).r;
  float glow_t = clamp(sdf_glow * glowParams.z + glowParams.w, 0.0, 1.0);
  // Composite
  #ifdef NOPREMUL
  vec4 my_glow_color = vec4(glowColor.xyz, glow_t * glowColor.w);
  gl_FragColor = mix(my_glow_color, interp_color, blend_t);
  #else
  vec4 premul_glow_color = vec4(glowColor.xyz * glowColor.w, glowColor.w);
  vec4 premul_color = vec4(interp_color.rgb * interp_color.a, interp_color.a);
  vec4 my_glow_color = premul_glow_color * glow_t;
  gl_FragColor = mix(my_glow_color, premul_color, blend_t);
  #endif
}
