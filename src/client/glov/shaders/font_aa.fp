varying vec4 tz_TexCoord[1];
varying TZ_LOWP vec4 tz_Color;
vec4 _ret_0;
uniform sampler2D tex0;
uniform vec4 param0;
void main()
{
  float texture0=texture2D(tex0,tz_TexCoord[0].xy).r;
  float res = clamp(texture0 * param0.x + param0.y, 0.0, 1.0);
  gl_FragColor = vec4(tz_Color.rgb, tz_Color.a * res);
}
