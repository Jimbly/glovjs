// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

const assert = require('assert');
const engine = require('./engine.js');
const fs = require('fs');
const { matchAll } = require('../../common/util.js');

let last_id = 0;

let bound_prog = null;

export const semantic = {
  'ATTR0': 0,
  'POSITION': 0,
  'ATTR1': 1,
  'COLOR': 1,
  'COLOR_0': 1,
  'ATTR2': 2,
  'TEXCOORD': 2,
  'TEXCOORD_0': 2,
  'ATTR3': 3,
  'NORMAL': 3,
  'ATTR4': 4,
  'TEXCOORD_1': 4,
};

export let globals;
let defines;

let error_fp;
let error_vp;

const vp_attr_regex = /attribute [^ ]+ ([^ ;]+);/g;
const uniform_regex = /uniform (?:(?:low|medium|high)p )?((?:(?:vec|mat)\d(?:x\d)?|float) [^ ;]+);/g;
const sampler_regex = /uniform sampler2D ([^ ;]+);/g;
const include_regex = /\n#include "([^"]+)"/g;

const type_size = {
  float: 1,
  vec2: 2*1,
  vec3: 3*1,
  vec4: 4*1,
  mat3: 3*3,
  mat4: 4*4,
};

let includes = {};

export function addInclude(key, text) {
  assert(!includes[key]);
  includes[key] = `\n// from include "${key}":\n${text}\n`;
}

let report_queued = false;
let shader_errors;
function reportShaderError(err) {
  function doReport() {
    assert(false, `Shader error(s):\n    ${shader_errors.join('\n    ')}`);
    shader_errors = null;
  }
  if (!report_queued) {
    setTimeout(doReport, 1000);
    report_queued = true;
    shader_errors = [];
  }
  shader_errors.push(err);
}

function parseIncludes(text) {
  let supplied_uniforms = {};
  text.replace(uniform_regex, function (str, key) {
    supplied_uniforms[key] = true;
  });
  text = text.replace(include_regex, function (str, filename) {
    let replacement = includes[filename];
    if (!replacement) {
      console.error(`Could not evaluate ${str}`);
      return str;
    }
    // Remove duplicate uniforms
    replacement = replacement.replace(uniform_regex, function (str2, key) {
      if (supplied_uniforms[key]) {
        return `// [removed ${key}]`;
      }
      supplied_uniforms[key] = true;
      return str2;
    });
    return replacement;
  });
  return text;
}

const webgl2_header = [
  '#version 300 es',
  '#define WEBGL2',
].join('\n');
const webgl2_header_fp = [
  webgl2_header,
  '#define varying in',
  'out lowp vec4 fragColor;',
  '#define gl_FragColor fragColor',
  '#define texture2D texture',
  ''
].join('\n');
const webgl2_header_vp = [
  webgl2_header,
  '#define varying out',
  '#define attribute in',
  ''
].join('\n');

function Shader(type, name, text) {
  assert.equal(typeof text, 'string');
  this.name = name;
  let header = '';
  if (engine.webgl2 && text.indexOf('#pragma WebGL2') !== -1) {
    header = type === gl.VERTEX_SHADER ? webgl2_header_vp : webgl2_header_fp;
  }
  text = `${header}${defines}${text}`;
  text = parseIncludes(text);
  text = text.replace(/#pragma WebGL2?/g, '');
  this.shader = gl.createShader(type);
  if (type === gl.VERTEX_SHADER) {
    this.programs = {};
    this.attributes = matchAll(text, vp_attr_regex);
    // Ensure they are known names so we can give them indices
    // Add to semantic[] above as needed
    this.attributes.forEach((v) => assert(semantic[v] !== undefined));
  } else {
    this.id = ++last_id;
    this.samplers = matchAll(text, sampler_regex);
    // Ensure all samplers end in a unique number
    let found = [];
    this.samplers.forEach((v) => {
      let num = Number(v.slice(-1));
      assert(!isNaN(num));
      assert(!found[num]);
      found[num] = true;
    });
  }
  this.uniforms = matchAll(text, uniform_regex);
  // Ensure a known type
  this.uniforms.forEach((v) => {
    let type_name = v.split(' ')[0];
    assert(type_size[type_name]);
  });
  gl.shaderSource(this.shader, text);
  gl.compileShader(this.shader);

  if (!gl.getShaderParameter(this.shader, gl.COMPILE_STATUS)) {
    let error_text = gl.getShaderInfoLog(this.shader)
      .replace(/\0/g, '')
      .trim();
    console.error(`Error compiling ${name}: ${error_text}`);
    reportShaderError(`${name}: ${error_text}`);
    // eslint-disable-next-line newline-per-chained-call
    console.log(text.split('\n').map((line, idx) => `${idx+1}: ${line}`).join('\n'));
  }
}

export function create(type, name, text) {
  return new Shader(type, name, text);
}

function uniformSetValue(unif) {
  switch (unif.width) { // eslint-disable-line default-case
    case 1:
      gl.uniform1fv(unif.location, unif.value);
      break;
    case 2:
      gl.uniform2fv(unif.location, unif.value);
      break;
    case 3:
      gl.uniform3fv(unif.location, unif.value);
      break;
    case 4:
      gl.uniform4fv(unif.location, unif.value);
      break;
    case 9:
      gl.uniformMatrix3fv(unif.location, false, unif.value);
      break;
    case 16:
      gl.uniformMatrix4fv(unif.location, false, unif.value);
      break;
  }
}

function link(vp, fp) {
  let prog = vp.programs[fp.id] = {
    handle: gl.createProgram(),
    uniforms: null,
  };
  gl.attachShader(prog.handle, vp.shader);
  gl.attachShader(prog.handle, fp.shader);
  // call this for all relevant semantic
  for (let ii = 0; ii < vp.attributes.length; ++ii) {
    gl.bindAttribLocation(prog.handle, semantic[vp.attributes[ii]], vp.attributes[ii]);
  }
  gl.linkProgram(prog.handle);

  prog.valid = gl.getProgramParameter(prog.handle, gl.LINK_STATUS);
  if (!prog.valid) {
    reportShaderError(`Shader link error (${vp.name} & ${fp.name}): ${gl.getProgramInfoLog(prog.handle)}`);
    console.error(`Shader link error: ${gl.getProgramInfoLog(prog.handle)}`);
  }

  gl.useProgram(prog.handle);
  bound_prog = prog;

  let uniforms = vp.uniforms.slice(0);
  for (let ii = 0; ii < fp.uniforms.length; ++ii) {
    let name = fp.uniforms[ii];
    if (uniforms.indexOf(name) === -1) {
      uniforms.push(name);
    }
  }
  prog.uniforms = uniforms.map((v) => {
    v = v.split(' ');
    let type = v[0];
    let name = v[1];
    let count = 1;
    let m = name.match(/([^[]+)\[(\d+)\]/);
    if (m) {
      name = m[1];
      count = Number(m[2]);
    }
    let location = gl.getUniformLocation(prog.handle, name);
    if (location === null) {
      // Not in either shader, (commented out?), remove (via filter below)
      return null;
    }
    let width = type_size[type];
    let size = width * count;
    let glob = globals[name];
    let value = new Float32Array(size);
    // set initial value
    let unif = {
      name,
      size,
      width,
      count,
      value,
      location,
      glob,
    };
    uniformSetValue(unif);
    return unif;
  }).filter((v) => v);

  for (let ii = 0; ii < fp.samplers.length; ++ii) {
    let name = fp.samplers[ii];
    let num = Number(name.slice(-1));
    let location = gl.getUniformLocation(prog.handle, name);
    if (location !== null) {
      gl.uniform1i(location, num);
    }
  }
  return prog;
}

export function bind(vp, fp, params) {
  let prog = vp.programs[fp.id];
  if (!prog) {
    prog = link(vp, fp);
  }
  if (!prog.valid) {
    prog = link(vp, error_fp);
    if (!prog.valid) {
      prog = link(error_vp, error_fp);
    }
    vp.programs[fp.id] = prog;
  }
  if (prog !== bound_prog) {
    bound_prog = prog;
    gl.useProgram(prog.handle);
  }
  for (let ii = 0; ii < prog.uniforms.length; ++ii) {
    let unif = prog.uniforms[ii];
    let value = params[unif.name] || unif.glob;
    if (!value) {
      continue;
    }
    let diff = false;
    for (let jj = 0; jj < unif.size; ++jj) {
      if (value[jj] !== unif.value[jj]) {
        diff = true;
        break;
      }
    }
    if (diff) {
      for (let jj = 0; jj < unif.size; ++jj) {
        unif.value[jj] = value[jj];
      }
      uniformSetValue(unif);
    }
  }
}

const reserved = { WEBGL2: 1 };
export function startup(_globals) {
  defines = Object.keys(engine.defines)
    .map((v) => (reserved[v] ? '' : `#define ${v}\n`))
    .join('');
  globals = _globals;

  error_fp = create(gl.FRAGMENT_SHADER, 'error.fp', fs.readFileSync(`${__dirname}/shaders/error.fp`, 'utf8'));
  error_vp = create(gl.VERTEX_SHADER, 'error.vp', fs.readFileSync(`${__dirname}/shaders/error.vp`, 'utf8'));
}

export function addGlobal(key, vec) {
  assert(!globals[key]);
  globals[key] = vec;
}
