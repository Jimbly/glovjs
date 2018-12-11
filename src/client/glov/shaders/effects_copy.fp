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
  gl_FragColor = texture2D(inputTexture0, tz_TexCoord[0].xy);
}
