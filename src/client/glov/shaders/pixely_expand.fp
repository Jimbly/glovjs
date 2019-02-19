#ifdef GL_ES
#define TZ_LOWP lowp
precision highp float;
precision highp int;
#else
#define TZ_LOWP
#endif

varying vec4 tz_TexCoord[1];
uniform sampler2D inputTexture0;

void main()
{
  vec3 color = texture2D(inputTexture0, tz_TexCoord[0].xy).rgb;
  vec2 pxpos = tz_TexCoord[0].xy * vec2(320, 240);
  vec2 fpart = pxpos - floor(pxpos);
  vec2 ramp = 1.0 - abs(1.0 - fpart * 2.0);
  float vfade = clamp(ramp.g * 2.0, 0.0, 1.0) * 0.25 + 0.75;
  float hfade = clamp(ramp.r * 2.0, 0.0, 1.0) * 0.25 + 0.75;
  vec3 fade3 = vec3(max(hfade, 1.0 - 0.5 * fpart.r), hfade, max(hfade, 0.5 + 0.5 * fpart.r));
  fade3 = min(fade3, vfade);
  gl_FragColor = vec4(color * fade3, 1.0);
}
