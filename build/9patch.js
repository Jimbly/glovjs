/* eslint-disable @stylistic/max-len */
const assert = require('assert');
const { pngAlloc } = require('./png');

function parse9Patch(job, img, img_name, ignore_pad) {
  let did_error = false;
  function parseRow(x0, y0, dx, dy) {
    let ws = [];
    let lastcoord = dx ? x0 : y0;
    let lastv = false;
    let { data, width, height } = img;
    assert.equal(data.length, width * height * 4);
    let xx = x0;
    let yy = y0;
    while (dx ? xx < width - 1 : yy < height - 1) {
      let idx = (xx + yy * width) * 4;
      let v;
      let a = data[idx + 3];
      if (!a) {
        // transparent
        v = false;
      } else {
        let r = data[idx];
        let g = data[idx + 1];
        let b = data[idx + 2];
        if (a === 255 && !r && !g && !b) {
          // black
          v = true;
        } else if (a === 255 && r === 255 && g === 255 && b === 255) {
          // white
          v = false;
        } else {
          if (!did_error) {
            job.error(`Error parsing 9-patch file "${img.source_name}": found a pixel other than black, white, or invisible at ${xx},${yy}`);
            did_error = true;
          }
        }
      }
      if (v !== lastv) {
        ws.push((dx ? xx : yy) - lastcoord);
        lastv = v;
        lastcoord = (dx ? xx : yy);
      }
      xx += dx;
      yy += dy;
    }
    ws.push((dx ? width : height) - 1 - lastcoord);
    return ws;
  }
  let ws = parseRow(1, 0, 1, 0);
  let hs = parseRow(0, 1, 0, 1);
  let padh;
  let padv;
  if (!ignore_pad) {
    // currently underused, parse the padding values from the 9-patch as well
    padh = parseRow(1, img.height - 1, 1, 0);
    padv = parseRow(img.width - 1, 1, 0, 1);
    if (padh.length === 1 && padv.length === 1) {
      padh = undefined;
      padv = undefined;
    }
  }
  let new_img = pngAlloc({ width: img.width - 2, height: img.height - 2, byte_depth: 4, comment: `9-patch:${img_name}` });
  img.bitblt(new_img, 1, 1, img.width - 2, img.height - 2, 0, 0);
  return {
    img: new_img,
    ws, hs,
    padh, padv,
  };
}

function encode9Patch(param) {
  let { img, ws, hs, padh, padv } = param;

  let new_img = pngAlloc({ width: img.width + 2, height: img.height + 2, byte_depth: 4, comment: '9-patch:encode' });
  img.bitblt(new_img, 0, 0, img.width, img.height, 1, 1);
  img = new_img;
  let { data, width, height } = img;
  function paintRow(x0, y0, dx, dy, values) {
    let v = false;
    let x = x0;
    let y = y0;
    for (let ii = 0; ii < values.length; ++ii) {
      let w = values[ii];
      while (w) {
        let idx = (y * width + x) * 4;
        data[idx++] = v ? 0 : 255;
        data[idx++] = v ? 0 : 255;
        data[idx++] = v ? 0 : 255;
        data[idx++] = 255;
        x += dx;
        y += dy;
        --w;
      }
      v = !v;
    }
  }
  paintRow(1, 0, 1, 0, ws);
  paintRow(0, 1, 0, 1, hs);
  if (padh) {
    paintRow(1, height - 1, 1, 0, padh);
    paintRow(width - 1, 1, 0, 1, padv);
  }

  return img;
}

module.exports = {
  parse9Patch,
  encode9Patch,
};
