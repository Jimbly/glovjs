#pragma WebGL2

#ifndef WEBGL2
#if defined(SSAA4X) || defined(ANISOTROPYBASEDAA) || defined(DEMASTER)
#extension GL_OES_standard_derivatives : enable
#endif
#endif

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
uniform vec3 fog_color;
vec3 applyFogVS(in vec3 albedo) {
  return fog_color * interp_fog_param.x + albedo * interp_fog_param.y;
  // return albedo * interp_fog_param.y;
}
#endif

vec4 color_edge = vec4(0.0, 0.0, 0.0, 1.0);
vec4 color_wall = vec4(1.0, 1.0, 1.0, 1.0);

mediump float brick(in vec2 coords) {
  vec2 t0 = coords * vec2(128.0, 32.0);
  t0 = t0 - fract(t0);
  float v0 = t0.x + t0.y * 1024.0;
  return v0;
}

mediump vec4 crawlerShader(vec4 color) {
  #if defined(DEMASTER)
  // test of 2x1 bricks with procedural edge detection
  vec2 dx = 1.01 * dFdx(interp_texcoord.xy);
  vec2 dy = 1.01 * dFdy(interp_texcoord.xy);
  float v0 = brick(interp_texcoord);
  float v1 = brick(interp_texcoord + dx);
  float v2 = brick(interp_texcoord + dy);
  float v3 = brick(interp_texcoord + dx + dy);
  vec4 texture0 = color_wall;
  if (v0 != v1) {
    if (v0 != v2) {
      texture0 = color_edge;
    } else if (v0 != v3) {
      texture0 = color_edge;
    }
  } else if (v0 != v2) {
    texture0 = color_edge;
  }
  //float v = fract((t0.x * 117.0 + t0.y * 217.0) / 256.0);
  //texture0 = vec4(0.5 + v * 0.5, 0.0, 0.0, 1.);
  #elif defined(SSAA4X)
  // simple 4x super sampled - if we want this, would be better to render to a 4x sized FBO and downsample, maybe?
  vec2 dx = dFdx(interp_texcoord.xy) * 0.5;
  vec2 dy = dFdy(interp_texcoord.xy) * 0.5;
  vec4 texture0a = texture2D(tex0, interp_texcoord.xy);
  vec4 texture0b = texture2D(tex0, interp_texcoord.xy + dx);
  vec4 texture0c = texture2D(tex0, interp_texcoord.xy + dy);
  vec4 texture0d = texture2D(tex0, interp_texcoord.xy + dx + dy);
  vec4 texture0 = 0.25 * (texture0a + texture0b + texture0c + texture0d);
  #elif defined(ANISOTROPYBASEDAA)
  // blend between pixel sampled and 4xSS based on how "diagonal" (anisotropic) the texture projection is
  vec2 dx = dFdx(interp_texcoord.xy);
  vec2 dy = dFdy(interp_texcoord.xy);
  vec4 texture0a = texture2D(tex0, interp_texcoord.xy, lod_bias.x);
  vec2 coordb = interp_texcoord.xy + dx;
  vec4 texture0b = texture2D(tex0, coordb, lod_bias.x);
  vec4 texture0c = texture2D(tex0, interp_texcoord.xy + dy, lod_bias.x);
  vec4 texture0d = texture2D(tex0, interp_texcoord.xy + dx + dy, lod_bias.x);
  vec4 texture0_blend = 0.25 * (texture0a + texture0b + texture0c + texture0d);
  vec2 texpx = vec2(1024.0, 128.0);
  dx *= texpx;
  dy *= texpx;
  float maxd = max(length(dx), length(dy));
  float xweight = abs(dx.x - dx.y) / maxd;
  float yweight = abs(dy.x - dy.y) / maxd;
  float linearness = min(xweight, yweight); // basically just anisotropy?
  vec4 texture0 = mix(texture0_blend, texture0a, clamp(linearness, 0.0, 1.0));
  #else
  vec4 texture0 = texture2D(tex0, interp_texcoord.xy, lod_bias.x); // lod bias of -1 only if pixely=strict mode?
  #endif
  vec4 albedo = color * texture0;
  if (albedo.a <= 0.0)
    discard;

  #ifdef TINTED
  #if defined(SSAA4X)
  vec4 texture1a = texture2D(tex1, interp_texcoord.xy);
  vec4 texture1b = texture2D(tex1, interp_texcoord.xy + dx);
  vec4 texture1c = texture2D(tex1, interp_texcoord.xy + dy);
  vec4 texture1d = texture2D(tex1, interp_texcoord.xy + dx + dy);
  texture0a.rgb *= mix(mix(mix(unit_vec, tint2, texture1a.b), tint1, texture1a.g), tint0, texture1a.r);
  texture0b.rgb *= mix(mix(mix(unit_vec, tint2, texture1b.b), tint1, texture1b.g), tint0, texture1b.r);
  texture0c.rgb *= mix(mix(mix(unit_vec, tint2, texture1c.b), tint1, texture1c.g), tint0, texture1c.r);
  texture0d.rgb *= mix(mix(mix(unit_vec, tint2, texture1d.b), tint1, texture1d.g), tint0, texture1d.r);
  texture0.rgb = 0.25 * (texture0a.rgb + texture0b.rgb + texture0c.rgb + texture0d.rgb);
  albedo = color * texture0;
  #else
  vec4 texture1 = texture2D(tex1, interp_texcoord.xy, lod_bias.x); // lod bias of -1 only if pixely=strict mode?
  albedo.rgb *= mix(mix(mix(unit_vec, tint2, texture1.b), tint1, texture1.g), tint0, texture1.r);
  #endif

  #endif

  vec4 ret = albedo;

  #ifndef NOFOG
  ret.rgb = applyFogVS(albedo.rgb);
  #endif
  return ret;
}
