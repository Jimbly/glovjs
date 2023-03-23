precision lowp float;

uniform sampler2D tex0;

varying vec2 interp_texcoord;
// varying vec3 interp_pos_ws;

#ifdef TINTED
uniform sampler2D tex1;
uniform vec3 tint0;
uniform vec3 tint1;
uniform vec3 tint2;
#endif
uniform vec2 lod_bias;
vec3 unit_vec = vec3(1.0, 1.0, 1.0);

#ifndef NOFOG
varying vec2 interp_fog_param;
vec3 applyFogVS(in vec3 albedo) {
  // vec3 fog_color = vec3(0.0);
  // return fog_color * interp_fog_param.x + albedo * interp_fog_param.y;
  return albedo * interp_fog_param.y;
}
#endif

mediump vec4 crawlerShader(vec4 color) {
  vec4 texture0 = texture2D(tex0, interp_texcoord.xy, lod_bias.x); // lod bias of -1 only if pixely=strict mode?
  vec4 albedo = color * texture0;
  if (albedo.a <= 0.0)
    discard;

  #ifdef TINTED
  vec4 texture1 = texture2D(tex1, interp_texcoord.xy, lod_bias.x); // lod bias of -1 only if pixely=strict mode?
  albedo.rgb *= mix(mix(mix(unit_vec, tint2, texture1.b), tint1, texture1.g), tint0, texture1.r);
  #endif

  vec4 ret = albedo;

  #ifndef NOFOG
  ret.rgb = applyFogVS(albedo.rgb);
  #endif
  return ret;
}
