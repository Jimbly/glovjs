const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { asyncEachSeries } = require('glov-async');
const gb = require('glov-build');
const { pack } = require('texture-compressor/dist/cli/lib/index');
const {
  FORMAT_ASTC,
  FORMAT_PACK,
  FORMAT_PNG,
  FORMAT_DXT,
  TEXPROC_COMPRESSED_HEADER,
} = require('../src/glov/common/texpack_common');
const {
  drawImageBilinear,
  pngAlloc,
  pngRead,
  pngWrite,
} = require('./png.js');
const { texPackMakeTXP } = require('./texpack');

const { floor } = Math;

module.exports = function () {
  function tempPngName() {
    let temp_dir = fs.realpathSync(os.tmpdir());
    return `${path.join(temp_dir, String(Math.random()).slice(2, 8))}.png`;
  }
  function passThrough(png_data, has_alpha, next) {
    return next(null, png_data);
  }

  function ktxToImages(debug, buf, next) {
    const KTX_HEADER = [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x31, 0x31, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A];
    let idx = 0;
    for (let ii = 0; ii < KTX_HEADER.length; ++ii) {
      if (buf[idx++] !== KTX_HEADER[ii]) {
        return void next(`${debug}: Unexpected KTX header (${buf.slice(0, 5).toString('utf8')}) expected "KTX11"`);
      }
    }
    let endian = buf.readUint32LE(idx);
    let file_big_endian = false;
    if (endian === 0x04030201) {
      // good
    } else if (endian === 0x01020304) {
      file_big_endian = true;
    } else {
      return void next(`${debug}: unknown endian value 0x${endian.toString(16)})`);
    }
    function readInt() {
      let r = file_big_endian ? buf.readUint32BE(idx) : buf.readUint32LE(idx);
      idx += 4;
      return r;
    }
    let ints = [];
    for (let ii = 0; ii < 13; ++ii) {
      ints.push(readInt());
    }
    let err;
    function check(val, expected, msg) {
      if (!err && val !== expected) {
        // fs.writeFileSync('c:/temp/temp.ktx', buf);
        err = `${debug}: ${msg} (expected 0x${expected.toString(16)} found 0x${val.toString(16)})`;
      }
    }
    check(ints[0], 0x04030201, 'wrong endianness');
    check(ints[1], 0, 'glType - must be compressed texture');
    // let gl_type_size = ints[2]; // for endian swapping
    check(ints[3], 0, 'glFormat - must be compressed texture');
    let gl_internal_format = ints[4]; // e.g. gl.COMPRESSED_RGBA_S3TC_DXT5_EXT
    let gl_base_internal_format = ints[5]; // gl.RGBA or gl.RGB
    let tex_width = Math.max(1, ints[6]);
    assert(tex_width);
    let tex_height = Math.max(1, ints[7]);
    assert(tex_height);
    check(ints[8], 0, 'pixelDepth - 3D texture not supported');
    check(ints[9], 0, 'numberOfArrayElements - 3D texture not supported');
    check(ints[10], 1, 'numberOfFaces - cube maps not supported');
    check(ints[11], 1, 'numberOfMipmapLevels - premade mips not expected'); // TODO: maybe support
    let keyvalue_size = ints[12];
    if (err) {
      return void next(err);
    }
    idx += keyvalue_size; // skip keyvalue data if there is any
    let imgs = [];

    let size = readInt();
    imgs.push(buf.slice(idx, idx + size));
    idx += (size + 3) & ~3;
    assert.equal(idx, buf.length);
    let header = Buffer.alloc(4*5);
    header.writeUInt32LE(TEXPROC_COMPRESSED_HEADER, 0);
    header.writeUInt32LE(gl_internal_format, 4);
    header.writeUInt32LE(gl_base_internal_format, 8);
    header.writeUInt32LE(tex_width, 12);
    header.writeUInt32LE(tex_height, 16);
    let out = Buffer.concat([header, imgs[0]]);
    next(null, out);
  }

  function compressedWrite(png_data, param, next) {
    let temp_file = tempPngName();
    let out_file = temp_file.replace(/\.png$/, '.ktx');
    fs.writeFile(temp_file, png_data, function (err) {
      if (err) {
        return void next(err);
      }

      pack({
        ...param,
        input: temp_file,
        output: out_file,
        verbose: false,
      }).then(function () {
        fs.readFile(out_file, function (err, data) {
          if (err) {
            return void next(err);
          }
          // parse KTX data and return just the astc data
          ktxToImages(param.compression, data, next);
        });
      }, function (err) {
        next(err);
      });
    });
  }

  function astcWrite(astcmode, png_data, has_alpha, next) {
    astcmode = (astcmode || '4x4').toLowerCase();
    compressedWrite(png_data, {
      type: 'astc',
      compression: `ASTC_${astcmode}`,
      //  ASTC_4x4, ASTC_5x4, ASTC_5x5, ASTC_6x5, ASTC_6x6, ASTC_8x5, ASTC_8x6,
      //  ASTC_8x8, ASTC_10x5, ASTC_10x6, ASTC_10x8, ASTC_10x10, ASTC_12x10, ASTC_12x12,
      quality: 'astcmedium',
      // astcveryfast, astcfast, astcmedium, astcthorough, astcexhaustive,
    }, next);
  }
  function dxtWrite(dxtmode, png_data, has_alpha, next) {
    // DXT1 = no alpha; DXT1A = alpha cutout, 4bpp; DXT5 = 1+smoothalpha, 8bpp; DXT3=4-bit alpha
    dxtmode = (dxtmode || 'auto').toUpperCase();
    let compression =
      (dxtmode === 'AUTO') ? has_alpha ? 'DXT5' : 'DXT1' : dxtmode.toUpperCase();
    compressedWrite(png_data, {
      type: 's3tc',
      compression,
      quality: 'normal', // superfast,fast,normal,better,uber
    }, next);
  }

  function findTexOpt(job, base_name, next) {
    function searchFolder(filename) {
      let folder = path.dirname(filename);
      if (!folder || folder === '.') {
        return void next(null);
      }
      job.depAdd(`client_texopt:${folder}/folder.texopt`, function (err, file) {
        if (!err && file) {
          assert(file.contents);
          let obj = JSON.parse(file.contents);
          return void next(obj);
        }
        searchFolder(folder);
      });
    }
    job.depAdd(`client_texopt:${base_name}.texopt`, function (err, file) {
      if (!err && file) {
        assert(file.contents);
        let obj = JSON.parse(file.contents);
        return void next(obj);
      }
      searchFolder(base_name);
    });
  }
  function makeMipmapsArray(img) {
    let { width, height } = img;
    let tile_w = width;
    let num_images = height / tile_w;
    assert.equal(floor(num_images), num_images);
    let last_x = 0;
    let last_y = 0;
    let last_w = tile_w;
    const next_x = 0;
    const next_y = 0;
    let ret = [];
    while (last_w > 1) {
      let next_w = floor(last_w/2);

      let dest2 = pngAlloc({ width: next_w, height: next_w * num_images, byte_depth: 4 });
      ret.push(dest2);

      // resize and copy from last_x/y -> next_x/y
      for (let frame = 0; frame < num_images; ++frame) {
        drawImageBilinear(dest2, 4, next_x, next_y + next_w * frame, next_w, next_w,
          img, 4, last_x, last_y + last_w * frame, last_w, last_w, 0xF);
      }

      last_w = next_w;
      img = dest2;
    }
    return ret;
  }
  function makeMipmapsFlat(img) {
    let { width, height } = img;
    let last_w = width;
    let last_h = height;
    let ret = [];
    while (last_w > 1) {
      let next_w = floor(last_w/2);
      let next_h = floor(last_h/2);

      let dest2 = pngAlloc({ width: next_w, height: next_h, byte_depth: 4 });
      ret.push(dest2);

      drawImageBilinear(dest2, 4, 0, 0, next_w, next_w,
        img, 4, 0, 0, last_w, last_w, 0xF);

      last_w = next_w;
      last_h = next_h;
      img = dest2;
    }
    return ret;
  }
  function texproc(job, done) {
    let file = job.getFile();
    let filename = file.relative;
    let base_name = filename.slice(0, -path.extname(filename).length);
    findTexOpt(job, base_name, function (texopt) {
      if (!texopt) {
        job.out(file);
        return void done();
      }
      let flags = 0;
      if (texopt.packed_mipmaps) {
        flags |= FORMAT_PACK;
      } else if (texopt.packed_mipmaps !== false && (
        texopt.formats.includes('astc') || texopt.formats.includes('astc')
      )) {
        // a compressed format can never auto-generate mipmaps, so, pack them in here
        flags |= FORMAT_PACK;
      }
      if (!flags && !texopt.formats) {
        // no valid options?  does nothing currently
        return void done('Unknown texopt format: expected packed_mipmaps: true or formats');
      }
      let formats = texopt.formats || ['png'];
      let subfiles = [];
      subfiles.push(file.contents); // if we're doing packed mips, we always start with the base, as-is
      let out_by_format = [];
      for (let ii = 0; ii < formats.length; ++ii) {
        let format = formats[ii];
        let out_elem = {
          txp_flags: flags & FORMAT_PACK,
          format,
          out: [],
        };
        out_by_format.push(out_elem);
        if (format === 'png') {
          flags |= FORMAT_PNG;
          out_elem.writer = passThrough;
          out_elem.ext = 'png';
          out_elem.packext = 'txp';
          out_elem.txp_flags |= FORMAT_PNG;
        } else if (format === 'astc') {
          flags |= FORMAT_ASTC;
          out_elem.writer = astcWrite.bind(null, texopt.astcmode);
          out_elem.ext = 'astc';
          out_elem.packext = 'txp-astc';
          out_elem.txp_flags |= FORMAT_ASTC;
        } else if (format === 'dxt') {
          flags |= FORMAT_DXT;
          out_elem.writer = dxtWrite.bind(null, texopt.dxtmode);
          out_elem.ext = 'dxt';
          out_elem.packext = 'txp-dxt';
          out_elem.txp_flags |= FORMAT_DXT;
        } else {
          return void done(`Unknown texopt format: "${format}"`);
        }
      }

      job.out({
        contents: JSON.stringify(flags),
        relative: `${base_name}.tflag`,
      });

      let { err, img } = pngRead(file.contents);
      if (err) {
        return void done(err);
      }

      let has_alpha = false;
      for (let ii = 3; ii < img.data.length; ii += 4) {
        if (img.data[ii] !== 255) {
          has_alpha = true;
          break;
        }
      }

      if (flags & FORMAT_PACK) {
        let is_array = filename.includes('.array.');
        let mipmaps;
        if (is_array) {
          mipmaps = makeMipmapsArray(img);
          assert(mipmaps.length);
        } else {
          mipmaps = makeMipmapsFlat(img);
          assert(mipmaps.length);
        }
        for (let ii = 0; ii < mipmaps.length; ++ii) {
          subfiles.push(pngWrite(mipmaps[ii]));
        }
      }
      asyncEachSeries(out_by_format, function (out_elem, next) {
        asyncEachSeries(subfiles, function (subfile, next, idx) {
          out_elem.writer(subfile, has_alpha, function (err, outdata) {
            out_elem.out[idx] = outdata;
            next(err);
          });
        }, function (err) {
          next(err);
        });
      }, function (err) {
        if (err) {
          return void done(err);
        }

        for (let jj = 0; jj < out_by_format.length; ++jj) {
          let out_elem = out_by_format[jj];
          let { out, ext, packext, txp_flags } = out_elem;
          let num_files = out.length;
          if (flags & FORMAT_PACK) {
            assert(num_files > 1);
            job.out({
              relative: `${base_name}.${packext}`,
              contents: texPackMakeTXP(txp_flags, out),
            });
          } else {
            assert.equal(num_files, 1);
            job.out({
              relative: `${base_name}.${ext}`,
              contents: out[0],
            });
          }
        }

        done();
      });

    });

  }
  return {
    type: gb.SINGLE,
    func: texproc,
    version: [
      texproc,
      findTexOpt,
      makeMipmapsArray,
      module.exports,
    ],
  };
};
