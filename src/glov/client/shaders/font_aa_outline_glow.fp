#pragma WebGL2

precision lowp float;

varying highp vec2 interp_texcoord;
varying lowp vec4 interp_color;
uniform sampler2D tex0;
uniform mediump vec4 param0;
uniform vec4 outlineColor;
uniform vec4 glowColor;
uniform mediump vec4 glowParams;

void main()
{
  // Body
  float sdf = texture2D(tex0, interp_texcoord).r;
  float blend_t = clamp(sdf * param0.x + param0.y, 0.0, 1.0);
  // Outline
  float outline_t = clamp(sdf * param0.x + param0.z, 0.0, 1.0);
  // Glow
  vec2 glow_coord = interp_texcoord + glowParams.xy;
  float sdf_glow = texture2D(tex0, glow_coord).r;
  float glow_t = clamp(sdf_glow * glowParams.z + glowParams.w, 0.0, 1.0);

  // Composite
  #ifdef NOPREMUL
  // Outline on top of glow
  vec4 my_glow_color = vec4(glowColor.xyz, glow_t * glowColor.w);
  outline_t = outline_t * outlineColor.w;
  vec4 outcolor = mix(my_glow_color, outlineColor, outline_t);
  // Body on top of that
  gl_FragColor = mix(outcolor, interp_color, blend_t);
  #else
  vec4 premul_glow_color = vec4(glowColor.xyz * glowColor.w, glowColor.w);
  vec4 premul_outline_color = vec4(outlineColor.xyz * outlineColor.w, outlineColor.w);
  vec4 premul_color = vec4(interp_color.rgb * interp_color.a, interp_color.a);
  // Outline on top of glow
  vec4 my_outline_color = premul_outline_color * outline_t;
  vec4 my_glow_color = premul_glow_color * glow_t;
  // Equivalent to glBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  vec4 outcolor = my_outline_color + (1.0 - my_outline_color.a) * my_glow_color;
  // Body on top of that
  gl_FragColor = mix(outcolor, premul_color, blend_t);
  #endif
}
