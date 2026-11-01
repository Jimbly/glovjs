const { pngRead: pngReadNative, pngWrite } = require('alphafix');
const { drawImageBilinear } = require('./png');

function bitblt(dest, srcx, srcy, w, h, destx, desty) {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  let src = this;
  let src_data = src.data;
  let src_stride = src.width * 4;
  let dest_data = dest.data;
  let dest_stride = dest.width * 4;
  let row_size = w * 4;
  for (let yy = 0; yy < h; ++yy) {
    let src_start = (srcy + yy) * src_stride + srcx * 4;
    src_data.copy(dest_data,
      (desty + yy) * dest_stride + destx * 4,
      src_start,
      src_start + row_size);
  }
  return src;
}

function pngAlloc({ width, height, byte_depth, comment }) {
  return {
    width,
    height,
    data: Buffer.alloc(width * height * 4),
    bitblt,
  };
}

function pngRead(data) {
  try {
    let img = pngReadNative(data, { bpp: 4 });
    img.bitblt = bitblt;
    return { img };
  } catch (err) {
    return { err };
  }
}


module.exports = {
  drawImageBilinear,
  pngAlloc,
  pngRead,
  pngWrite,
};
