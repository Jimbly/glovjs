#pragma WebGL2

#ifndef WEBGL2
#extension GL_EXT_frag_depth : enable
#endif

precision lowp float;

varying vec2 interp_texcoord;

uniform sampler2D inputTexture0;
uniform sampler2D inputTexture1;
void main()
{
  gl_FragColor = texture2D(inputTexture0, interp_texcoord);
  float depth = texture2D(inputTexture1, interp_texcoord).x;
  #ifdef WEBGL2
  gl_FragDepth = depth;
  #else
  gl_FragDepthEXT = depth;
  #endif
}
