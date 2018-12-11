#ifdef GL_ES
#define TZ_LOWP lowp
precision highp float;
precision highp int;
#else
#define TZ_LOWP
#endif
varying vec4 tz_TexCoord[1];

vec4 _ret_0;
vec4 _TMP2;
vec4 _TMP1;
vec2 _c0022;
vec2 _c0024;
uniform vec2 sampleRadius;
uniform sampler2D inputTexture0;
uniform float Gauss[9];

void main()
{
vec2 _step;
vec4 _color;
vec2 _dir;
_step = sampleRadius / 9.0;
_color = texture2D(inputTexture0, tz_TexCoord[0].xy);
_c0022 = tz_TexCoord[0].xy + _step;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[0];
_c0024 = tz_TexCoord[0].xy - _step;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[0];
_dir = _step + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[1];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[1];
_dir = _dir + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[2];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[2];
_dir = _dir + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[3];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[3];
_dir = _dir + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[4];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[4];
_dir = _dir + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[5];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[5];
_dir = _dir + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[6];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[6];
_dir = _dir + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[7];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[7];
_dir = _dir + _step;
_c0022 = tz_TexCoord[0].xy + _dir;
_TMP1 = texture2D(inputTexture0, _c0022);
_color = _color + _TMP1 * Gauss[8];
_c0024 = tz_TexCoord[0].xy - _dir;
_TMP2 = texture2D(inputTexture0, _c0024);
_color = _color + _TMP2 * Gauss[8];
_ret_0 = _color * 9.94035751E-02;
gl_FragColor = _ret_0;
}
