#pragma WebGL2

precision lowp float;

uniform sampler2D tex0;

varying vec2 interp_texcoord;
// varying vec3 interp_pos_ws;

uniform vec2 lod_bias;
vec3 unit_vec = vec3(1.0, 1.0, 1.0);

#ifndef NOFOG
varying vec2 interp_fog_param;
uniform vec3 fog_color;
vec3 applyFogVS(in vec3 albedo) {
  return fog_color * interp_fog_param.x + albedo * interp_fog_param.y;
  // return albedo * interp_fog_param.y;
}
#endif

mediump vec4 crawlerShader(vec4 color) {
  vec4 texture0 = texture2D(tex0, interp_texcoord.xy, lod_bias.x);
  vec4 texture1 = texture2D(tex0, interp_texcoord.xy + color.xy, lod_bias.x);
  vec4 albedo = mix(texture0, texture1, color.z);
  if (albedo.a <= 0.0)
    discard;

  vec4 ret = albedo;

  #ifndef NOFOG
  ret.rgb = applyFogVS(albedo.rgb);
  #endif
  return ret;
}

varying lowp vec4 interp_color;

void main(void) {
  gl_FragColor = crawlerShader(interp_color);
}
