import fs from 'fs';
import pngjs from 'pngjs';
const createContext = require('@kmamal/gl');
const sdl = require('@kmamal/sdl');

const window = sdl.video.createWindow({
  // fullscreen: true,
  resizable: true,
  opengl: true,
});

const { pixelWidth: width, pixelHeight: height } = window;

// Cached window size, kept up to date by the 'resize' event.  Don't read the
// window.width/pixelWidth/etc. getters while rendering: they poll for events
// internally, which can process the close event and destroy the window in the
// middle of a frame.
const view = { w: window.width, h: window.height, pw: width, ph: height };
const gl = createContext(width, height, { window });
const ext = gl.getExtension('STACKGL_resize_drawingbuffer');

// console.log(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)); WebGL GLSL ES 1.0 stack-gl
const vertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertexShader, `#version 100
  attribute vec2 position;
  varying vec2 uv;

  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
    uv = (position + vec2(1.0)) / 2.0;
  }
`);
gl.compileShader(vertexShader);
if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
  console.log('vertex shader error:', gl.getShaderInfoLog(vertexShader));
  process.exit(1);
}

const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, `#version 100
  precision highp float;
  varying vec2 uv;

  void main() {
    gl_FragColor = vec4(uv.y, uv.x, 0.5, 1.0);
  }
`);
gl.compileShader(fragmentShader);
if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
  console.log('fragment shader error:', gl.getShaderInfoLog(fragmentShader));
  process.exit(1);
}

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
gl.validateProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.log('linking error:', gl.getProgramInfoLog(program));
  process.exit();
}
gl.detachShader(program, vertexShader);
gl.detachShader(program, fragmentShader);
gl.deleteShader(vertexShader);
gl.deleteShader(fragmentShader);

const arrayBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  ...[-1, 1],
  ...[1, 1],
  ...[-1, -1],
  ...[1, -1],
]), gl.STATIC_DRAW);
const attribPosition = gl.getAttribLocation(program, 'position');
gl.vertexAttribPointer(attribPosition, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(attribPosition);

gl.useProgram(program);

gl.clearColor(1, 0, 0, 1);

// ---- Sprite rendering (textured quad, alpha blended) ----
const spriteVS = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(spriteVS, `
  attribute vec2 position;
  uniform vec2 u_center; // NDC
  uniform vec2 u_half;   // half-size in NDC
  varying vec2 uv;

  void main() {
    gl_Position = vec4(position * u_half + u_center, 0.0, 1.0);
    // position.y = +1 is the top of the quad; image row 0 is the top of the image
    uv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  }
`);
gl.compileShader(spriteVS);
if (!gl.getShaderParameter(spriteVS, gl.COMPILE_STATUS)) {
  console.log('sprite vertex shader error:', gl.getShaderInfoLog(spriteVS));
  process.exit(1);
}

const spriteFS = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(spriteFS, `
  precision highp float;
  uniform sampler2D u_tex;
  uniform vec3 u_tint; // multiplied into rgb; (1,1,1) = unchanged
  varying vec2 uv;

  void main() {
    vec4 c = texture2D(u_tex, uv);
    gl_FragColor = vec4(c.rgb * u_tint, c.a);
  }
`);
gl.compileShader(spriteFS);
if (!gl.getShaderParameter(spriteFS, gl.COMPILE_STATUS)) {
  console.log('sprite fragment shader error:', gl.getShaderInfoLog(spriteFS));
  process.exit(1);
}

const spriteProgram = gl.createProgram();
gl.attachShader(spriteProgram, spriteVS);
gl.attachShader(spriteProgram, spriteFS);
gl.linkProgram(spriteProgram);
if (!gl.getProgramParameter(spriteProgram, gl.LINK_STATUS)) {
  console.log('sprite linking error:', gl.getProgramInfoLog(spriteProgram));
  process.exit(1);
}
gl.detachShader(spriteProgram, spriteVS);
gl.detachShader(spriteProgram, spriteFS);
gl.deleteShader(spriteVS);
gl.deleteShader(spriteFS);

const spriteAttribPosition = gl.getAttribLocation(spriteProgram, 'position');
const spriteUCenter = gl.getUniformLocation(spriteProgram, 'u_center');
const spriteUHalf = gl.getUniformLocation(spriteProgram, 'u_half');
const spriteUTex = gl.getUniformLocation(spriteProgram, 'u_tex');
const spriteUTint = gl.getUniformLocation(spriteProgram, 'u_tint');

function loadTexture(path) {
  const png = pngjs.PNG.sync.read(fs.readFileSync(path)); // always RGBA, 8 bits/channel
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // NPOT texture: must use CLAMP_TO_EDGE and no mipmaps (WebGL 1)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // NEAREST keeps pixel art crisp when scaled up; use LINEAR for smooth scaling
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, png.width, png.height, 0, gl.RGBA,
    gl.UNSIGNED_BYTE, new Uint8Array(png.data));
  return { tex, width: png.width, height: png.height };
}

// await initAudio()
// setListener({ pos: [ 0, 0, 0 ], forward: [ 0, 0, -1 ], up: [ 0, 1, 0 ] })
// const buttonClickSound = loadSound(new URL('./button_click.ogg', import.meta.url))

const button = loadTexture(__dirname + '/img/test.png');

const BUTTON_HEIGHT_FRACTION = 0.1;

// Screen rect (in pixels, origin top-left) of a sprite centered in the viewport
function centeredSpriteRect(sprite, heightFraction, vpW, vpH) {
  const h = vpH * heightFraction;
  const w = h * sprite.width / sprite.height;
  return { x: (vpW - w) / 2, y: (vpH - h) / 2, w, h };
}

// Draw a texture centered on screen, `heightFraction` of the viewport height tall.
// `brightness` < 1 darkens it.
function drawCenteredSprite(sprite, heightFraction, vpW, vpH, brightness) {
  if (brightness === undefined) {
    brightness = 1;
  }
  const { w, h } = centeredSpriteRect(sprite, heightFraction, vpW, vpH);

  gl.useProgram(spriteProgram);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Reuse the unit quad (arrayBuffer is still bound)
  gl.vertexAttribPointer(spriteAttribPosition, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(spriteAttribPosition);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sprite.tex);
  gl.uniform1i(spriteUTex, 0);
  gl.uniform2f(spriteUCenter, 0, 0);
  gl.uniform3f(spriteUTint, brightness, brightness, brightness);
  gl.uniform2f(spriteUHalf, w / vpW, h / vpH);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.disable(gl.BLEND);
  gl.useProgram(program);
  gl.vertexAttribPointer(attribPosition, 2, gl.FLOAT, false, 0, 0);
}

let buttonPressed = false;

// Is the mouse event position (window coordinates) over the button sprite?
function hitButton({ x, y }) {
  // Event coordinates are in window units; the sprite rect is in pixels
  const px = x * view.pw / view.w;
  const py = y * view.ph / view.h;
  const r = centeredSpriteRect(button, BUTTON_HEIGHT_FRACTION, view.pw, view.ph);
  return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
}

window.on('mouseButtonDown', (e) => {
  if (e.button === sdl.mouse.BUTTON.LEFT && hitButton(e)) {
    buttonPressed = true;
    // Test: play from a random position near the listener (+X right, -Z forward)
    const position = [(Math.random() * 2 - 1) * 4, 0, (Math.random() * 2 - 1) * 3];
    console.log('click at', position.map((c) => c.toFixed(1)).join(', '));
    // playSound(buttonClickSound, 1, { position });
  }
});

window.on('mouseButtonUp', (e) => {
  if (e.button === sdl.mouse.BUTTON.LEFT) {
    if (buttonPressed && hitButton(e)) {
      console.log('button clicked');
    }
    buttonPressed = false;
  }
});

const render = () => {
  // Keep the viewport in sync with the window every frame; the EGL surface is
  // resized lazily by ANGLE, so don't rely on the 'resize' event timing alone.
  // gl.viewport(0, 0, window.pixelWidth, window.pixelHeight)
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  drawCenteredSprite(button, BUTTON_HEIGHT_FRACTION, view.pw, view.ph, buttonPressed ? 0.5 : 1);
  gl.swap();
};

let tic = Date.now();
let frames = 0;

// Draw one frame and update the FPS counter (does not schedule another frame)
function frame() {
  render();

  frames++;
  const toc = Date.now();
  const elapsed = (toc - tic) / 1e3;
  if (elapsed >= 1) {
    const fps = Math.round(frames / elapsed);
    window.setTitle(`FPS: ${fps}`);
    tic = toc;
    frames = 0;
  }
}

window.on('keyDown', ({ key, alt }) => {
  if (key === 'f11' || (alt && (key === 'return' || key === 'enter'))) {
    window.setFullscreen(!window.fullscreen);
  }
  if (key === 'escape') {
    process.exit(0);
  }
});

window.on('expose', render);

window.on('resize', (param) => {
  console.log('resize', param);
  const { width: w, height: h, pixelWidth: pw, pixelHeight: ph } = param;
  Object.assign(view, { w, h, pw, ph });
  ext.resize(pw, ph);
  gl.viewport(0, 0, w, h);
  gl.swap();
  // On Windows, dragging the window edge runs a modal OS loop that blocks the
  // Node event loop (setTimeout never fires), but SDL still dispatches 'resize'
  // events from inside it.  Render here so the window keeps updating.
  frame();
});

function doFrame() {
  if (window.destroyed) {
    return;
  }
  frame();
  setTimeout(doFrame, 0);
}
doFrame();
