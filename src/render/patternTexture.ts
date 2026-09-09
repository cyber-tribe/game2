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
  return createRectPatternTexture(size, size, colorAt);
}

/** createPatternTexture for a pattern that isn't square — see createTurfTexture, whose repeat is one tile (64x32). */
export function createRectPatternTexture(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => number,
): Texture {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = colorAt(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = (color >> 16) & 0xff;
      pixels[i + 1] = (color >> 8) & 0xff;
      pixels[i + 2] = color & 0xff;
      pixels[i + 3] = 255;
    }
  }
  const source = new BufferImageSource({
    resource: pixels,
    width,
    height,
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

/**
 * The two isometric axes at a pixel, as integers that stay consistent
 * across the texture's own wrap.
 *
 * A tile's edges project to 2:1 diagonals — (x,y)->(x+1,y) runs down-right
 * at (2,1) on screen and (x,y)->(x,y+1) down-left at (2,-1) — so those two
 * directions, not screen x and y, are the grain of everything that grows on
 * this ground. `along` is constant while moving down-left and `across`
 * while moving down-right, which is what lets createTurfTexture lay marks
 * that run one way or the other.
 *
 * Both are taken modulo TURF_WIDTH because that is what makes the result
 * tile: stepping a full texture width in x, or a full height in y, changes
 * either quantity by exactly TURF_WIDTH.
 */
export function isoAxes(x: number, y: number, width: number): { along: number; across: number } {
  const wrap = (v: number) => ((v % width) + width) % width;
  return { along: wrap(x + 2 * y), across: wrap(x - 2 * y) };
}

export interface TurfSpec {
  /** The ground itself. */
  base: number;
  /** Marks laid along the tile's own down-right edge direction. */
  grain: number;
  /** Marks laid the other way, along its down-left edge — what makes the surface read as woven rather than combed. */
  counterGrain: number;
  /** Fraction of the surface each set of marks covers. */
  density: number;
  /** How long one mark is, in isoAxes units (4 per pixel step along its own direction). */
  markLength: number;
}

/**
 * Turf, drawn along the tile grid's own two diagonals rather than as
 * isotropic noise — see isoAxes.
 *
 * The reference art's ground is not a speckle. It is a weave: short marks
 * running along the two directions a map square's own edges take on screen,
 * so each cell reads as a patch of something growing *on that square*, and
 * neighbouring cells meet in the chevrons visible all over the original's
 * grassland. A hash sampled straight from (x, y) has no direction in it at
 * all, and that is what made this renderer's ground read as static laid
 * over the world instead of turf laid on it.
 *
 * The repeat is exactly one tile (64x32). Tile origins land on multiples of
 * (32, 16) in screen space and ELEVATION_STEP is 16, so with
 * textureSpace: "global" every tile at every whole elevation samples this
 * at one of four phases — the pattern belongs to the grid rather than
 * sliding across it, and the four phases give neighbouring cells the
 * variety a single-phase repeat would not have.
 */
export function createTurfTexture(width: number, height: number, spec: TurfSpec, seed = 0): Texture {
  return createRectPatternTexture(width, height, (x, y) => {
    const { along, across } = isoAxes(x, y, width);
    // Marks running down-right: `across` is constant along one, so chunking
    // `along` cuts that line into marks of markLength.
    if (ditherPixelHash(Math.floor(along / spec.markLength) + seed, across) < spec.density) return spec.grain;
    // And the same the other way.
    if (ditherPixelHash(along, Math.floor(across / spec.markLength) + seed + 7) < spec.density) {
      return spec.counterGrain;
    }
    return spec.base;
  });
}
