#pragma WebGL2

#define TINTED

#include "crawler_common.fp"

uniform vec4 debug_color;

void main(void) {
  gl_FragColor = crawlerShader(debug_color);
}
