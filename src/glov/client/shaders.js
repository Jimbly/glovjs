// Portions Copyright 2019 Jimb Esser (https://github.com/Jimbly/)
// Released under MIT License: https://opensource.org/licenses/MIT

export const MAX_SEMANTIC = 5;

const assert = require('assert');
const engine = require('./engine.js');
const { errorReportClear, errorReportSetDetails, glovErrorReport } = require('./error_report.js');
const { filewatchOn } = require('./filewatch.js');
const { matchAll } = require('glov/common/util.js');
const { texturesUnloadDynamic } = require('./textures.js');
const { webFSGetFile } = require('./webfs.js');

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
let globals_used;
let global_defines;

let error_fp;
let error_vp;

let shaders = [];

const vp_attr_regex = /attribute [^ ]+ ([^ ;]+);/g;
const uniform_regex = /uniform (?:(?:low|medium|high)p )?((?:(?:vec|mat)\d(?:x\d)?|float) [^ ;]+);/g;
const sampler_regex = /uniform sampler(?:2D|Cube) ([^ ;]+);/g;
const include_regex = /\n#include "([^"]+)"/g;

const type_size = {
  float: 1,
  vec2: 2*1,
  vec3: 3*1,
  vec4: 4*1,
  mat3: 3*3,
  mat4: 4*4,
};

function loadInclude(filename) {
  let text = webFSGetFile(filename, 'text');
  return `\n// from include "${filename}":\n${text}\n`;
}

export function shadersResetState() {
  for (let ii = 0; ii < shaders.length; ++ii) {
    let shader = shaders[ii];
    if (shader.programs) {
      for (let fpid in shader.programs) {
        let prog = shader.programs[fpid];
        //gl.useProgram(prog.handle);
        for (let jj = 0; jj < prog.uniforms.length; ++jj) {
          let unif = prog.uniforms[jj];
          for (let kk = 0; kk < unif.size; ++kk) {
            unif.value[kk] = NaN;
          }
          //uniformSetValue(unif);
        }
      }
    }
  }
  bound_prog = null;
  gl.useProgram(null);
}

function setGLErrorReportDetails() {
  // Set some debug details we might want
  let details = {
    max_fragment_uniform_vectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    max_varying_vectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
    max_vertex_attribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
    max_vertex_uniform_vectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    webgl: engine.webgl2 ? 2 : 1,
  };
  let debug_info = gl.getExtension('WEBGL_debug_renderer_info');
  if (debug_info) {
    details.renderer_unmasked = gl.getParameter(debug_info.UNMASKED_RENDERER_WEBGL);
    details.vendor_unmasked = gl.getParameter(debug_info.UNMASKED_VENDOR_WEBGL);
  }
  for (let key in details) {
    errorReportSetDetails(key, details[key]);
  }
}

let report_queued = false;
let shader_errors;
let shader_errors_any_fatal;
let reported_shader_errors = false;
function reportShaderError(non_fatal, err) {
  function doReport() {
    report_queued = false;
    setGLErrorReportDetails();
    let msg = `Shader error(s):\n    ${shader_errors.join('\n    ')}`;
    reported_shader_errors = true;
    if (!shader_errors_any_fatal) {
      glovErrorReport(false, msg, 'shaders.js');
    } else {
      assert(false, msg);
    }
    shader_errors = null;
  }
  if (!report_queued) {
    setTimeout(doReport, 1000);
    report_queued = true;
    shader_errors = [];
    shader_errors_any_fatal = false;
  }
  shader_errors_any_fatal = shader_errors_any_fatal || !non_fatal;
  shader_errors.push(err);
}

function parseIncludes(parent_name, text) {
  let supplied_uniforms = {};
  text.replace(uniform_regex, function (str, key) {
    supplied_uniforms[key] = true;
  });
  text = text.replace(include_regex, function (str, filename) {
    let include_path = parent_name.split('/');
    include_path.pop();
    include_path.push(filename);
    include_path = include_path.join('/');
    let replacement = loadInclude(include_path);
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
  '#define textureCube texture',
  ''
].join('\n');
const webgl2_header_vp = [
  webgl2_header,
  '#define varying out',
  '#define attribute in',
  ''
].join('\n');

function Shader(params) {
  let { filename, defines, non_fatal } = params;
  assert.equal(typeof filename, 'string');
  let type = filename.endsWith('.fp') ? gl.FRAGMENT_SHADER : filename.endsWith('.vp') ? gl.VERTEX_SHADER : 0;
  assert(type);
  this.type = type;
  this.filename = filename;
  this.non_fatal = non_fatal;
  this.defines_arr = (defines || []);
  this.defines = this.defines_arr.map((a) => `#define ${a}\n`).join('');
  this.shader = gl.createShader(type);
  this.id = ++last_id;
  if (type === gl.VERTEX_SHADER) {
    this.programs = {};
  }
  shaders.push(this);
  this.compile();
}

Shader.prototype.compile = function () {
  let { type, filename } = this;
  let header = '';
  let text = webFSGetFile(filename, 'text');
  if (engine.webgl2 && text.includes('#pragma WebGL2')) {
    header = type === gl.VERTEX_SHADER ? webgl2_header_vp : webgl2_header_fp;
  }
  text = `${header}${global_defines}${this.defines}${text}`;
  text = parseIncludes(filename, text);
  text = text.replace(/#pragma WebGL2?/g, '');
  if (type === gl.VERTEX_SHADER) {
    this.attributes = matchAll(text, vp_attr_regex);
    // Ensure they are known names so we can give them indices
    // Add to semantic[] above as needed
    this.attributes.forEach((v) => assert(semantic[v] !== undefined));
  } else {
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
    this.valid = false;
    let error_text = gl.getShaderInfoLog(this.shader);
    if (error_text) { // sometimes null on iOS
      error_text = error_text.replace(/\0/g, '').trim();
    }
    if (this.defines_arr.length) {
      filename += `(${this.defines_arr.join(',')})`;
    }
    console[this.non_fatal ? 'warn' : 'error'](`Error compiling ${filename}: ${error_text}`);
    reportShaderError(this.non_fatal, `${filename}: ${error_text}`);
    console.log(text.split('\n').map((line, idx) => `${idx+1}: ${line}`).join('\n'));
  } else {
    this.valid = true;
  }
};

export function create(filename) {
  if (typeof filename === 'object') {
    return new Shader(filename);
  }
  return new Shader({ filename });
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

let require_prelink = false;
export function shadersRequirePrelink(ensure) {
  let old = require_prelink;
  require_prelink = ensure;
  return old;
}

function link(vp, fp) {
  assert(!require_prelink);
  let prog = vp.programs[fp.id] = {
    handle: gl.createProgram(),
    uniforms: null,
  };
  if (!prog.handle) {
    assert(false, `gl.createProgram() returned ${prog.handle}${gl.createProgram() ? ', retry would succeed' : ''}`);
  }
  gl.attachShader(prog.handle, vp.shader);
  gl.attachShader(prog.handle, fp.shader);
  // call this for all relevant semantic
  for (let ii = 0; ii < vp.attributes.length; ++ii) {
    gl.bindAttribLocation(prog.handle, semantic[vp.attributes[ii]], vp.attributes[ii]);
  }
  gl.linkProgram(prog.handle);

  prog.valid = gl.getProgramParameter(prog.handle, gl.LINK_STATUS);
  if (!prog.valid) {
    reportShaderError(false, `Shader link error (${vp.filename} & ${fp.filename}):` +
      ` ${gl.getProgramInfoLog(prog.handle)}`);
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
    globals_used[name] = true;
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

export function prelink(vp, fp, params = {}) {
  // In theory, only need to link, not bind, but let's push it through the pipe as far as it can to be safe.
  bind(vp, fp, params);
}

const reserved = { WEBGL2: 1 };
export function addReservedDefine(key) {
  reserved[key] = 1;
}
let internal_defines = {};
function applyDefines() {
  global_defines = Object.keys(engine.defines).filter((v) => !reserved[v])
    .concat(Object.keys(internal_defines))
    .map((v) => `#define ${v}\n`)
    .join('');
}

function shaderReload() {
  shadersRequirePrelink(false);
  if (shaders.length) {
    if (reported_shader_errors) {
      errorReportClear();
      reported_shader_errors = false;
    }
    gl.useProgram(null);
    for (let ii = 0; ii < shaders.length; ++ii) {
      let programs = shaders[ii].programs;
      if (programs) {
        for (let id in programs) {
          gl.deleteProgram(programs[id].handle);
        }
        shaders[ii].programs = {};
      }
    }
    for (let ii = 0; ii < shaders.length; ++ii) {
      shaders[ii].compile();
    }
    texturesUnloadDynamic();
  }
}

export function handleDefinesChanged() {
  applyDefines();
  shaderReload();
}

export function setInternalDefines(new_values) {
  for (let key in new_values) {
    if (new_values[key]) {
      internal_defines[key] = new_values[key];
    } else {
      delete internal_defines[key];
    }
  }
  handleDefinesChanged();
}

function onShaderChange(filename) {
  shaderReload();
}

export function startup(_globals) {
  applyDefines();
  globals = _globals;
  globals_used = {};

  error_fp = create('glov/shaders/error.fp');
  error_vp = create('glov/shaders/error.vp');

  filewatchOn('.fp', onShaderChange);
  filewatchOn('.vp', onShaderChange);
}

export function addGlobal(key, vec) {
  assert(!globals[key]);
  assert(!globals_used[key]); // A shader has already been prelinked referencing this global
  globals[key] = vec;
}
