#pragma WebGL2

precision lowp float;

uniform sampler2D tex0;
uniform sampler2D tex1;

varying vec2 interp_texcoord;
// varying vec3 interp_pos_ws;

uniform vec2 lod_bias;
vec3 unit_vec = vec3(1.0, 1.0, 1.0);

#ifndef NOFOG
varying vec2 interp_fog_param;
uniform vec3 fog_color;
vec3 applyFogVS(in vec3 albedo) {
  return fog_color * interp_fog_param.x + albedo * interp_fog_param.y;
}
#endif

varying lowp vec4 interp_color;

mediump vec4 crawlerShader2(vec4 color) {
  vec4 texture0 = texture2D(tex0, interp_texcoord.xy, lod_bias.x); // lod bias of -1 only if pixely=strict mode?
  vec4 texture1 = texture2D(tex1, interp_texcoord.xy, lod_bias.x);
  vec4 text = mix(texture0, texture1, lod_bias.y);
  vec4 albedo = color * text;
  if (albedo.a <= 0.0)
    discard;

  vec4 ret = albedo;

  #ifndef NOFOG
  ret.rgb = applyFogVS(albedo.rgb);
  #endif
  return ret;
}

void main(void) {
  gl_FragColor = crawlerShader2(interp_color);
}
