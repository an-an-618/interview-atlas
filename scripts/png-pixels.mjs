import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

// Decode the RGB/RGBA PNG screenshots emitted by Playwright without adding a
// runtime or test dependency. Inspect actual glyph pixels, not just DOM state.
export function screenshotPixels(png) {
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8, "expected an 8-bit screenshot");
  const channels = png[25] === 6 ? 4 : png[25] === 2 ? 3 : 0;
  assert.ok(channels, "expected RGB or RGBA screenshot");
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const a = x >= channels ? pixels[index - channels] : 0;
      const b = y ? pixels[index - stride] : 0;
      const c = y && x >= channels ? pixels[index - stride - channels] : 0;
      pixels[index] = (raw[y * (stride + 1) + x + 1]
        + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
    }
  }
  return {
    darkPixels(rect) {
      let count = 0;
      for (let y = Math.max(0, Math.ceil(rect.y)); y < Math.min(height, Math.floor(rect.y + rect.height)); y++) {
        for (let x = Math.max(0, Math.ceil(rect.x)); x < Math.min(width, Math.floor(rect.x + rect.width)); x++) {
          const i = (y * width + x) * channels;
          if (pixels[i] < 140 && pixels[i + 1] < 140 && pixels[i + 2] < 140) count++;
        }
      }
      return count;
    },
  };
}
