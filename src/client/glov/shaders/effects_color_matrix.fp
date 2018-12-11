#ifdef GL_ES
#define TZ_LOWP lowp
precision highp float;
precision highp int;
#else
#define TZ_LOWP
#endif
varying vec4 tz_TexCoord[1];

vec3 _r0019;
uniform vec4 colorMatrix[3];
uniform sampler2D inputTexture0;

void main()
{
vec4 _color;
vec4 _mutc;
_color = texture2D(inputTexture0, tz_TexCoord[0].xy);
_mutc = _color;
_mutc.w = 1.0;
_r0019.x = dot(colorMatrix[0], _mutc);
_r0019.y = dot(colorMatrix[1], _mutc);
_r0019.z = dot(colorMatrix[2], _mutc);
_mutc.xyz = _r0019;
_mutc.w = _color.w;
gl_FragColor = _mutc;
}