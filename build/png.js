const assert = require('assert');
const { PNG } = require('pngjs');

// const PNG_GRAYSCALE = 0;
const PNG_RGB = 2;
const PNG_RGBA = 6;

// Returns { err, img: { width, height, data } }
function pngRead(file_contents) {
  let img;
  try {
    img = PNG.sync.read(file_contents);
  } catch (e) {
    if (e.toString().indexOf('at end of stream') !== -1) {
      // Chrome stated adding an extra 0?!
      // Also, Photoshop sometimes adds an entire extra PNG file?!
      // Slice down to the expected location derived from IEND (repeatedly, in case that's part of a zlib string)
      let contents = file_contents;
      while (true) {
        let idx = contents.lastIndexOf('IEND');
        if (idx === -1) {
          // something else at the end
          return { err: e };
          break;
        }
        contents = contents.slice(0, idx + 8);
        try {
          img = PNG.sync.read(contents);
          break;
        } catch (e2) {
          contents = contents.slice(0, idx);
        }
      }
    } else {
      return { err: e };
    }
  }
  let { width, height, data } = img;
  assert.equal(width * height * 4, data.length);
  return { img };
}
exports.pngRead = pngRead;


function pngAlloc({ width, height, byte_depth }) {
  let colorType = byte_depth === 3 ? PNG_RGB : PNG_RGBA;
  let ret = new PNG({ width, height, colorType });
  let num_bytes = width * height * 4;
  assert.equal(ret.data.length, num_bytes);
  return ret;
}
exports.pngAlloc = pngAlloc;

// img is from pngAlloc or pngRead
function pngWrite(img) {
  return PNG.sync.write(img);
}
exports.pngWrite = pngWrite;
