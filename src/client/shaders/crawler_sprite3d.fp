#pragma WebGL2

#include "crawler_common.fp"

varying lowp vec4 interp_color;

void main(void) {
  gl_FragColor = crawlerShader(interp_color);
}
