import { BufferImageSource, Texture } from "pixi.js";

/**
 * The pixel-buffer plumbing shared by every small tileable pixel-art
 * texture this renderer builds (terrain dither, water waves, swamp mud) —
 * fills a `size`x`size` RGBA buffer one pixel at a time via `colorAt`,
 * tileable (`addressMode: "repeat"`) and crisp (`scaleMode: "nearest"`) so
 * it reads as a repeating hand-drawn pattern rather than a blurred
 * gradient. Works without a live GL context — BufferImageSource takes raw
 * pixel bytes directly, so this runs the same in a headless test as in the
 * browser.
 */
export function createPatternTexture(size: number, colorAt: (x: number, y: number) => number): Texture {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = colorAt(x, y);
      const i = (y * size + x) * 4;
      pixels[i] = (color >> 16) & 0xff;
      pixels[i + 1] = (color >> 8) & 0xff;
      pixels[i + 2] = color & 0xff;
      pixels[i + 3] = 255;
    }
  }
  const source = new BufferImageSource({
    resource: pixels,
    width: size,
    height: size,
    addressMode: "repeat",
    scaleMode: "nearest",
  });
  return new Texture({ source });
}

/**
 * A separate integer hash from a classic "sin of a big number" hash: that
 * kind only decorrelates well across a wide, closely-spaced range of
 * inputs, and aliases into a handful of repeating diagonal bands when
 * sampled at the small integer grid a dither texture actually needs (read
 * as a few large triangular blotches, not a fine speckle — see
 * plan/archived/0073-grass-cliff-legibility.md). This bit-mixing hash
 * (integer multiply + xor-shift, the "hash32shift" family) has no such
 * periodicity: every (x, y) pair gets a well-scattered value even at this
 * small a domain.
 */
export function ditherPixelHash(x: number, y: number): number {
  let h = (x * 0x1f1f1f1f) ^ (y * 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Builds a two-tone speckled texture — see createPatternTexture/ditherPixelHash. */
export function createDitherTexture(size: number, baseColor: number, speckleColor: number, density: number): Texture {
  return createPatternTexture(size, (x, y) => (ditherPixelHash(x, y) < density ? speckleColor : baseColor));
}
