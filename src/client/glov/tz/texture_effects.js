/* eslint class-methods-use-this:off */
/* global VMath: false */

const assert = require('assert');
const fs = require('fs');

// Generated from assets/shaders/textureeffects.cgfx
let textureeffects_cgfx = {
  'version': 1,
  'name': 'textureeffects.cgfx',
  'samplers': {
    'inputTexture0': {
      'MinFilter': 9729,
      'MagFilter': 9729,
      'WrapS': 33071,
      'WrapT': 33071
    },
    'inputTexture1': {
      'MinFilter': 9729,
      'MagFilter': 9729,
      'WrapS': 33071,
      'WrapT': 33071
    },
    'inputTexture2': {
      'MinFilter': 9729,
      'MagFilter': 9729,
      'WrapS': 33071,
      'WrapT': 33071
    },
    'distortTexture': {
      'MinFilter': 9729,
      'MagFilter': 9729,
      'WrapS': 10497,
      'WrapT': 10497
    }
  },
  'parameters': {
    'strength': {
      'type': 'float',
      'columns': 2
    },
    'transform': {
      'type': 'float',
      'rows': 2,
      'columns': 3
    },
    'invTransform': {
      'type': 'float',
      'rows': 2,
      'columns': 2
    },
    'colorMatrix': {
      'type': 'float',
      'rows': 3,
      'columns': 4
    },
    'sampleRadius': {
      'type': 'float',
      'columns': 2
    },
    'bloomThreshold': {
      'type': 'float'
    },
    'thresholdCutoff': {
      'type': 'float'
    },
    'bloomSaturation': {
      'type': 'float'
    },
    'originalSaturation': {
      'type': 'float'
    },
    'bloomIntensity': {
      'type': 'float'
    },
    'originalIntensity': {
      'type': 'float'
    },
    'inputTexture0': {
      'type': 'sampler2D'
    },
    'inputTexture1': {
      'type': 'sampler2D'
    },
    'inputTexture2': {
      'type': 'sampler2D'
    },
    'distortTexture': {
      'type': 'sampler2D'
    },
    'Gauss': {
      'type': 'float',
      'rows': 9,
      'values': [0.93, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]
    }
  },
  'techniques': {
    'distort': [
      {
        'parameters': ['strength', 'transform', 'invTransform', 'inputTexture0', 'distortTexture'],
        'semantics': ['ATTR0', 'ATTR8'],
        'states': {
          'DepthTestEnable': false,
          'DepthMask': false,
          'CullFaceEnable': false,
          'BlendEnable': false
        },
        'programs': ['vp_copy', 'fp_distort']
      }
    ],
    'copyColorMatrix': [
      {
        'parameters': ['colorMatrix', 'inputTexture0'],
        'semantics': ['ATTR0', 'ATTR8'],
        'states': {
          'DepthTestEnable': false,
          'DepthMask': false,
          'CullFaceEnable': false,
          'BlendEnable': false
        },
        'programs': ['vp_copy', 'fp_colorMatrix']
      }
    ],
    'bloomThreshold': [
      {
        'parameters': ['bloomThreshold', 'thresholdCutoff', 'inputTexture0'],
        'semantics': ['ATTR0', 'ATTR8'],
        'states': {
          'DepthTestEnable': false,
          'DepthMask': false,
          'CullFaceEnable': false,
          'BlendEnable': false
        },
        'programs': ['vp_copy', 'fp_bloom_threshold']
      }
    ],
    'bloomMerge': [
      {
        'parameters': [
          'bloomSaturation', 'originalSaturation', 'bloomIntensity', 'originalIntensity',
          'inputTexture0', 'inputTexture1'
        ],
        'semantics': ['ATTR0', 'ATTR8'],
        'states': {
          'DepthTestEnable': false,
          'DepthMask': false,
          'CullFaceEnable': false,
          'BlendEnable': false
        },
        'programs': ['vp_copy', 'fp_bloom_merge']
      }
    ],
    'gaussianBlur': [
      {
        'parameters': ['sampleRadius', 'inputTexture0', 'Gauss'],
        'semantics': ['ATTR0', 'ATTR8'],
        'states': {
          'DepthTestEnable': false,
          'DepthMask': false,
          'CullFaceEnable': false,
          'BlendEnable': false
        },
        'programs': ['vp_copy', 'fp_gaussian_blur']
      }
    ]
  },
  'programs': {
    'fp_gaussian_blur': {
      'type': 'fragment',
      'code': fs.readFileSync(`${__dirname}/../shaders/effects_gaussian_blur.fp`, 'utf8'),
    },
    'vp_copy': {
      'type': 'vertex',
      'code': fs.readFileSync(`${__dirname}/../shaders/effects_copy.vp`, 'utf8'),
    },
    'fp_bloom_merge': {
      'type': 'fragment',
      'code': fs.readFileSync(`${__dirname}/../shaders/effects_bloom_merge.fp`, 'utf8'),
    },
    'fp_bloom_threshold': {
      'type': 'fragment',
      'code': fs.readFileSync(`${__dirname}/../shaders/effects_bloom_threshold.fp`, 'utf8'),
    },
    'fp_colorMatrix': {
      'type': 'fragment',
      'code': fs.readFileSync(`${__dirname}/../shaders/effects_color_matrix.fp`, 'utf8'),
    },
    'fp_distort': {
      'type': 'fragment',
      'code': fs.readFileSync(`${__dirname}/../shaders/effects_distort.fp`, 'utf8'),
    }
  }
};

export class TextureEffects {
  constructor(params) {
    this.graphicsDevice = params.graphicsDevice;

    let gd = this.graphicsDevice;

    let staticVertexBufferParams = {
      numVertices: 4,
      attributes: ['FLOAT2', 'FLOAT2'],
      dynamic: false,
      data: [
        -1, -1, 0, 0,
        1, -1, 1, 0,
        -1, 1, 0, 1,
        1, 1, 1, 1
      ]
    };

    this.staticVertexBuffer = gd.createVertexBuffer(staticVertexBufferParams);
    this.screenVertexBuffer = null;
    this.screenVertexBufferLast = null;

    this.effectParams = {
      technique: null,
      params: null,
      destination: null
    };

    this.quadSemantics = gd.createSemantics(['POSITION', 'TEXCOORD0']);
    this.quadPrimitive = gd.PRIMITIVE_TRIANGLE_STRIP;

    // Distort effect.
    // ---------------
    this.distortParameters = gd.createTechniqueParameters({
      inputTexture0: null,
      distortTexture: null,
      strength: [0, 0],
      transform: [0, 0, 0, 0, 0, 0],
      invTransform: [0, 0, 0, 0]
    });

    // Color matrix effect.
    // --------------------
    this.colorMatrixParameters = gd.createTechniqueParameters({
      inputTexture0: null,
      colorMatrix: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    });

    // Bloom effect.
    // ------------
    this.bloomThresholdParameters = gd.createTechniqueParameters({
      inputTexture0: null,
      bloomThreshold: 0,
      thresholdCuttoff: 0
    });

    this.bloomMergeParameters = gd.createTechniqueParameters({
      inputTexture0: null,
      inputTexture1: null,
      bloomIntensity: 0,
      bloomSaturation: 0,
      originalIntensity: 0,
      originalSaturation: 0
    });

    // Gaussian Blur effect.
    // ---------------------
    // (also used by bloom)
    this.gaussianBlurParameters = gd.createTechniqueParameters({
      inputTexture0: null,
      sampleRadius: [1, 1]
    });

    // Shader embedding.
    // -----------------
    // Generated from assets/shaders/textureeffects.cgfx
    let shader = gd.createShader(textureeffects_cgfx);

    this.distortTechnique = shader.getTechnique('distort');
    this.colorMatrixTechnique = shader.getTechnique('copyColorMatrix');
    this.bloomThresholdTechnique = shader.getTechnique('bloomThreshold');
    this.bloomMergeTechnique = shader.getTechnique('bloomMerge');
    this.gaussianBlurTechnique = shader.getTechnique('gaussianBlur');
  }

  grayScaleMatrix(dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }
    dst[0] = 0.2126;
    dst[1] = 0.2126;
    dst[2] = 0.2126;
    dst[3] = 0.7152;
    dst[4] = 0.7152;
    dst[5] = 0.7152;
    dst[6] = 0.0722;
    dst[7] = 0.0722;
    dst[8] = 0.0722;
    dst[9] = dst[10] = dst[11] = 0;
    return dst;
  }

  sepiaMatrix(dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }
    dst[0] = 0.393;
    dst[1] = 0.349;
    dst[2] = 0.272;
    dst[3] = 0.769;
    dst[4] = 0.686;
    dst[5] = 0.534;
    dst[6] = 0.189;
    dst[7] = 0.168;
    dst[8] = 0.131;
    dst[9] = dst[10] = dst[11] = 0;
    return dst;
  }

  negativeMatrix(dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }
    dst[0] = dst[4] = dst[8] = -1;
    dst[1] = dst[2] = dst[3] = dst[5] = dst[6] = dst[7] = 0;
    dst[9] = dst[10] = dst[11] = 1;
    return dst;
  }

  saturationMatrix(saturationScale, dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }
    let is = (1 - saturationScale);
    dst[0] = (is * 0.2126) + saturationScale;
    dst[1] = (is * 0.2126);
    dst[2] = (is * 0.2126);
    dst[3] = (is * 0.7152);
    dst[4] = (is * 0.7152) + saturationScale;
    dst[5] = (is * 0.7152);
    dst[6] = (is * 0.0722);
    dst[7] = (is * 0.0722);
    dst[8] = (is * 0.0722) + saturationScale;
    dst[9] = dst[10] = dst[11] = 0;
    return dst;
  }

  hueMatrix(angle, dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }

    ////
    //// Uncomment to calculate new coeffecients should luminance
    //// values 0.2126 0.7152 0.0722 change.
    //let lumR = 0.2126;
    //let lumG = 0.7152;
    //let lumB = 0.0722;
    ////
    //let r23 = Math.sqrt(2 / 3);
    //let r12 = 1 / Math.sqrt(2);
    //let r13 = 1 / Math.sqrt(3);
    //let r16 = 1 / Math.sqrt(6);
    //let M = [r23, 0, r13, -r16, r12, r13, -r16, -r12, r13, 0, 0, 0];
    //let zx = (r23 * lumR) - (r16 * lumG) - (r16 * lumB);
    //let zy =                (r12 * lumG) - (r12 * lumB);
    //let zz = (r13 * lumR) + (r13 * lumG) + (r13 * lumB);
    //let x = zx / zz;
    //let y = zy / zz;
    //let C = [1, 0, x, 0, 1, y, 0, 0, 1, 0, 0, 0];
    //M = VMath.m43Mul(M, C, M);
    //console.log("Pre transform = ", M);
    //let E = [1, 0, -x, 0, 1, -y, 0, 0, 1, 0, 0, 0];
    //let N = [r23, -r16, -r16, 0, r12, -r12, r13, r13, r13, 0, 0, 0];
    //VMath.m43Mul(E, N, N);
    //console.log("Post transform = ", N);
    ////
    //// Final matrix is then: m43Mul(Pre, [c, s, 0, -s, c, 0, 0, 0, 1, 0, 0, 0, ], Post);
    //// for c = cos(angle), s = sin(angle)
    ////
    //let out = "";
    //out += "let c = Math.cos(angle);\n";
    //out += "let s = Math.sin(angle);\n";
    //out += "dst[0] = (" + (N[0]*M[0]+N[3]*M[1]) + " * c) + (" + (N[3]*M[0]-N[0]*M[1]) + " * s) + " + lumR+";\n";
    //out += "dst[1] = (" + (-lumR)               + " * c) + (" + (N[4]*M[0]-N[1]*M[1]) + " * s) + " + lumR+";\n";
    //out += "dst[2] = (" + (-lumR)               + " * c) + (" + (N[5]*M[0]-N[2]*M[1]) + " * s) + " + lumR+";\n";
    //out += "dst[3] = (" + (-lumG)               + " * c) + (" + (N[3]*M[3]-N[0]*M[4]) + " * s) + " + lumG+";\n";
    //out += "dst[4] = (" + (N[1]*M[3]+N[4]*M[4]) + " * c) + (" + (N[4]*M[3]-N[1]*M[4]) + " * s) + " + lumG+";\n";
    //out += "dst[5] = (" + (-lumG)               + " * c) + (" + (N[5]*M[3]-N[2]*M[4]) + " * s) + " + lumG+";\n";
    //out += "dst[6] = (" + (-lumB)               + " * c) + (" + (N[3]*M[6]-N[0]*M[7]) + " * s) + " + lumB+";\n";
    //out += "dst[7] = (" + (-lumB)               + " * c) + (" + (N[4]*M[6]-N[1]*M[7]) + " * s) + " + lumB+";\n";
    //out += "dst[8] = (" + (N[2]*M[6]+N[5]*M[7]) + " * c) + (" + (N[5]*M[6]-N[2]*M[7]) + " * s) + " + lumB+";\n";
    //console.log(out);
    let c = Math.cos(angle);
    let s = Math.sin(angle);
    dst[0] = (0.7874 * c) + (-0.3712362230889293 * s) + 0.2126;
    dst[1] = (-0.2126 * c) + (0.20611404610069642 * s) + 0.2126;
    dst[2] = (-0.2126 * c) + (-0.9485864922785551 * s) + 0.2126;
    dst[3] = (-0.7152 * c) + (-0.4962902913954023 * s) + 0.7152;
    dst[4] = (0.2848 * c) + (0.08105997779422341 * s) + 0.7152;
    dst[5] = (-0.7152 * c) + (0.6584102469838492 * s) + 0.7152;
    dst[6] = (-0.0722 * c) + (0.8675265144843316 * s) + 0.0722;
    dst[7] = (-0.0722 * c) + (-0.28717402389491986 * s) + 0.0722;
    dst[8] = (0.9278 * c) + (0.290176245294706 * s) + 0.0722;
    dst[9] = dst[10] = dst[11] = 0;

    return dst;
  }

  brightnessMatrix(brightnessOffset, dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }

    dst[0] = dst[4] = dst[8] = 1;
    dst[1] = dst[2] = dst[3] = dst[5] = dst[6] = dst[7] = 0;
    dst[9] = dst[10] = dst[11] = brightnessOffset;

    return dst;
  }

  additiveMatrix(additiveRGB, dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }

    dst[0] = dst[4] = dst[8] = 1;
    dst[1] = dst[2] = dst[3] = dst[5] = dst[6] = dst[7] = 0;
    dst[9] = additiveRGB[0];
    dst[10] = additiveRGB[1];
    dst[11] = additiveRGB[2];

    return dst;
  }

  contrastMatrix(contrastScale, dst) {
    if (dst === undefined) {
      dst = VMath.m43BuildIdentity();
    }

    dst[0] = dst[4] = dst[8] = contrastScale;
    dst[1] = dst[2] = dst[3] = dst[5] = dst[6] = dst[7] = 0;
    dst[9] = dst[10] = dst[11] = 0.5 * (1 - contrastScale);

    return dst;
  }

  applyBloomTODO(params) {
    // TODO: Update for RTBBCTT
    let source = params.source;
    let blur1 = params.blurTarget1;
    let blur2 = params.blurTarget2;
    let dest = params.destination;
    if (!source || !dest || !blur1 || !blur2 || !blur1.colorTexture0 ||
      !blur2.colorTexture0 || blur1 === blur2 || blur1 === dest ||
      source === blur1.colorTexture0 || source === dest.colorTexture0) {
      return false;
    }

    let effectParams = this.effectParams;
    let techparams;

    // Threshold copy.
    techparams = this.bloomThresholdParameters;
    effectParams.technique = this.bloomThresholdTechnique;
    effectParams.params = techparams;

    techparams.bloomThreshold = (params.bloomThreshold !== undefined) ? params.bloomThreshold : 0.65;
    techparams.thresholdCutoff = Math.exp((params.thresholdCutoff !== undefined) ? params.thresholdCutoff : 3);
    techparams.inputTexture0 = source;
    effectParams.destination = blur1;
    this.applyEffect(effectParams);

    // Gaussian blur.
    techparams = this.gaussianBlurParameters;
    effectParams.technique = this.gaussianBlurTechnique;
    effectParams.params = techparams;

    let sampleRadius = (params.blurRadius || 20);
    techparams.sampleRadius[0] = sampleRadius / source.width;
    techparams.sampleRadius[1] = 0;
    techparams.inputTexture0 = blur1.colorTexture0;
    effectParams.destination = blur2;
    this.applyEffect(effectParams);

    techparams.sampleRadius[0] = 0;
    techparams.sampleRadius[1] = sampleRadius / source.height;
    techparams.inputTexture0 = blur2.colorTexture0;
    effectParams.destination = blur1;
    this.applyEffect(effectParams);

    // Merge.
    techparams = this.bloomMergeParameters;
    effectParams.technique = this.bloomMergeTechnique;
    effectParams.params = techparams;

    techparams.bloomIntensity = (params.bloomIntensity !== undefined) ? params.bloomIntensity : 1.2;
    techparams.bloomSaturation = (params.bloomSaturation !== undefined) ? params.bloomSaturation : 1.2;
    techparams.originalIntensity = (params.originalIntensity !== undefined) ? params.originalIntensity : 1.0;
    techparams.originalSaturation = (params.originalSaturation !== undefined) ? params.originalSaturation : 1.0;
    techparams.inputTexture0 = source;
    techparams.inputTexture1 = blur1.colorTexture0;
    effectParams.destination = dest;
    this.applyEffect(effectParams);

    return true;
  }

  applyGaussianBlur(params) {
    let source = params.source;
    let blur = params.blurTarget;
    assert(source);
    assert(blur);
    assert(source !== blur);

    let effectParams = this.effectParams;
    let techparams = this.gaussianBlurParameters;
    effectParams.technique = this.gaussianBlurTechnique;
    effectParams.params = techparams;

    let sampleRadius = (params.blurRadius || 5);
    techparams.sampleRadius[0] = sampleRadius / source.width;
    techparams.sampleRadius[1] = 0;
    techparams.inputTexture0 = source;
    effectParams.coord_source = source;
    this.applyEffect(effectParams);
    blur.copyTexImage();

    techparams.sampleRadius[0] = 0;
    techparams.sampleRadius[1] = sampleRadius / source.height;
    techparams.inputTexture0 = blur;
    effectParams.coord_source = techparams.inputTexture0;
    this.applyEffect(effectParams);

    return true;
  }

  applyColorMatrix(params) {
    let source = params.source;
    assert(source);

    let effectParams = this.effectParams;
    let techparams = this.colorMatrixParameters;
    effectParams.technique = this.colorMatrixTechnique;
    effectParams.params = techparams;

    let matrix = params.colorMatrix;
    let mout = techparams.colorMatrix;

    mout[0] = matrix[0];
    mout[1] = matrix[3];
    mout[2] = matrix[6];
    mout[3] = matrix[9];
    mout[4] = matrix[1];
    mout[5] = matrix[4];
    mout[6] = matrix[7];
    mout[7] = matrix[10];
    mout[8] = matrix[2];
    mout[9] = matrix[5];
    mout[10] = matrix[8];
    mout[11] = matrix[11];

    techparams.inputTexture0 = source;
    effectParams.coord_source = source;
    this.applyEffect(effectParams);

    return true;
  }

  applyDistortTODO(params) {
    // TODO: Update for RTBBCTT
    let source = params.source;
    let dest = params.destination;
    let distort = params.distortion;
    if (!source || !dest || !distort || !dest.colorTexture0 ||
      source === dest.colorTexture0 || distort === dest.colorTexture0) {
      return false;
    }

    // input transform.
    //  a b tx
    //  c d ty
    let a;
    let b;
    let c;
    let d;
    let tx;
    let ty;

    let transform = params.transform;
    if (transform) {
      // transform col-major.
      a = transform[0];
      b = transform[2];
      tx = transform[4];
      c = transform[1];
      d = transform[3];
      ty = transform[5];
    } else {
      a = d = 1;
      b = c = 0;
      tx = ty = 0;
    }

    let effectParams = this.effectParams;
    let techparams = this.distortParameters;
    effectParams.technique = this.distortTechnique;
    effectParams.params = techparams;

    // TODO: Cache 'transform', 'invTransform', etc in the code below
    techparams.transform[0] = a;
    techparams.transform[1] = b;
    techparams.transform[2] = tx;
    techparams.transform[3] = c;
    techparams.transform[4] = d;
    techparams.transform[5] = ty;

    // Compute inverse transform to use in distort texture displacement..
    let idet = 1 / (a * d - b * c);
    let ia = techparams.invTransform[0] = (idet * d);
    let ib = techparams.invTransform[1] = (idet * -b);
    let ic = techparams.invTransform[2] = (idet * -c);
    let id = techparams.invTransform[3] = (idet * a);

    // Compute max pixel offset after transform for normalisation.
    let x1 = ((ia + ib) * (ia + ib)) + ((ic + id) * (ic + id));
    let x2 = ((ia - ib) * (ia - ib)) + ((ic - id) * (ic - id));
    let x3 = ((-ia + ib) * (-ia + ib)) + ((-ic + id) * (-ic + id));
    let x4 = ((-ia - ib) * (-ia - ib)) + ((-ic - id) * (-ic - id));
    let xmax = 0.5 * Math.sqrt(Math.max(x1, x2, x3, x4));

    let strength = (params.strength || 10);
    techparams.strength[0] = strength / (source.width * xmax);
    techparams.strength[1] = strength / (source.height * xmax);

    techparams.inputTexture0 = source;
    techparams.distortTexture = distort;
    effectParams.destination = dest;
    this.applyEffect(effectParams);

    return true;
  }

  applyEffect(effect) {
    let graphicsDevice = this.graphicsDevice;

    graphicsDevice.setTechnique(effect.technique);
    graphicsDevice.setTechniqueParameters(effect.params);

    graphicsDevice.setStream(this.getScreenVertexBuffer(effect.coord_source), this.quadSemantics);
    graphicsDevice.draw(this.quadPrimitive, 4);
  }

  getScreenVertexBuffer(coord_source) {
    assert(coord_source);
    let gd = this.graphicsDevice;
    let graphicsDeviceWidth = gd.width;
    let graphicsDeviceHeight = gd.height;
    let u1 = graphicsDeviceWidth / coord_source.width;
    let v1 = graphicsDeviceHeight / coord_source.height;
    let flip = !coord_source.rtbbctt;
    if (this.screenVertexBufferLast && this.screenVertexBufferLast[0] === u1 &&
      this.screenVertexBufferLast[1] === v1 && this.screenVertexBuffer[2] === flip) {
      return this.screenVertexBuffer;
    }
    this.screenVertexBufferLast = [u1, v1, flip];
    let staticVertexBufferParams = {
      numVertices: 4,
      attributes: ['FLOAT2', 'FLOAT2'],
      dynamic: false,
      data: [
        -1, -1, 0, flip ? v1 : 0,
        1, -1, u1, flip ? v1 : 0,
        -1, 1, 0, flip ? 0 : v1,
        1, 1, u1, flip ? 0 : v1
      ]
    };

    if (this.screenVertexBuffer) {
      this.screenVertexBuffer.destroy();
      this.screenVertexBuffer = null;
    }

    this.screenVertexBuffer = gd.createVertexBuffer(staticVertexBufferParams);
    return this.screenVertexBuffer;
  }

  destroy() {
    this.staticVertexBuffer.destroy();
    if (this.screenVertexBuffer) {
      this.screenVertexBuffer.destroy();
      this.screenVertexBuffer = null;
    }

    delete this.graphicsDevice;
  }
}
