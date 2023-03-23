#pragma WebGL2

precision lowp float;

uniform sampler2D tex0;
uniform lowp vec4 color1;
uniform lowp vec2 tex_offs;

varying lowp vec4 interp_color;
varying vec2 interp_texcoord;

void main(void) {
  vec4 texA = texture2D(tex0,interp_texcoord + tex_offs);
  vec4 texB = texture2D(tex0,interp_texcoord);
  gl_FragColor = vec4(texA.rgb * texB.rgb, texA.a * interp_color.a);
}
