import { BufferImageSource, Container, Graphics, Texture } from "pixi.js";
import { MAX_ELEVATION, sampleElevation, VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";

// Sized for finger taps rather than mouse clicks: at scale 1 adjacent
// vertices sit 32px/16px apart on screen, which pickVertex's default
// maxDistance is tuned around — see plan/archived/0009-pan-for-vertex-picking.md.
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
const ELEVATION_STEP = 16;

/**
 * Time constant (seconds) for how fast the on-screen terrain height eases
 * toward its real value after an edit — see `update()`. Small enough that
 * a single raise/lower tap still feels immediate (~3 time constants, or
 * ~150ms, to visually settle) rather than sluggish.
 */
const ELEVATION_EASE_TIME_CONSTANT = 0.05;

/**
 * Tile tops (see redraw()'s tileElevation) round to the nearest multiple
 * of this many elevation units before rendering — the underlying data
 * itself stays at full resolution (createHeightmap's own generation noise
 * is deliberately rough at the single-unit level, see its doc comment, to
 * keep a castle's worth of flatness from being free), only what gets
 * *drawn* is coarsened. Without this, nearly every adjacent tile pair
 * differed by at least 1 unit, and once cliff walls were fixed to
 * actually be visible (plan/0073-grass-cliff-legibility.md), that meant a
 * distinct wall on almost every tile boundary — a map that reads as
 * "wall-to-wall cliffs" instead of the reference game's mostly-flat plains
 * with occasional real drops. Rounding to the nearest 2 units merges most
 * of that routine 1-unit noise into shared flat plateaus, leaving only
 * genuine multi-unit differences (a volcano, an earthquake, several taps
 * of deliberate terraforming) as visible cliffs.
 */
const VISUAL_ELEVATION_BUCKET = 2;

/** Rounds a raw elevation to the nearest VISUAL_ELEVATION_BUCKET step — see its own doc comment. */
function bucketElevation(elevation: number): number {
  return Math.round(elevation / VISUAL_ELEVATION_BUCKET) * VISUAL_ELEVATION_BUCKET;
}

const TERRAIN_COLOR: Record<Heightmap["terrain"], number> = {
  grass: 0x4a8c3f,
  desert: 0xd6b25e,
  snow: 0xe8f0f5,
  rock: 0x6b5a4a,
};

const WATER_COLOR = 0x2a5f8c;

/**
 * A single flat solid color read as "のっぺり" (flat, lifeless) next to the
 * original game's turf, which dithers between two greens in a fine speckle
 * rather than one uniform fill — see createDitherTexture. Only grass gets
 * this treatment for now, since that's specifically what was flagged;
 * desert/snow/rock stay plain TERRAIN_COLOR fills.
 */
const GRASS_SPECKLE_COLOR = lerpColor(TERRAIN_COLOR.grass, 0x000000, 0.3);
/**
 * Size (px, at scale 1) of one repeat of the grass dither texture — see
 * createDitherTexture. Small relative to a tile (64x32px) so it tiles
 * several times across each tile, reading as a fine even stipple like the
 * reference art rather than a few large blotches.
 */
const GRASS_DITHER_SIZE = 8;
/** Fraction of the dither texture's pixels that get GRASS_SPECKLE_COLOR rather than the plain grass color. */
const GRASS_SPECKLE_DENSITY = 0.35;

/**
 * The most a cliff wall ever darkens from the ground color it's shaded
 * from (see drawCliffWalls' `color` argument), for whichever two of the
 * tile's four wall directions face away from the fixed light source — see
 * CLIFF_LIT_SHADE_AMOUNT's doc comment for the other two. Reached once the
 * drop is CLIFF_FULL_SHADE_DROP units or more (see drawCliffWalls);
 * smaller drops scale down from here. Picked to read clearly as a shaded
 * vertical face against the flat-shaded top colors above without going
 * fully black (which made tall cliffs look like silhouette cutouts).
 */
const CLIFF_SHADE_AMOUNT = 0.3;

/**
 * The most a cliff wall ever darkens, for the two wall directions facing
 * *toward* the fixed light source — see CLIFF_SHADE_AMOUNT for the other
 * two. Every wall used to get the exact same flat shade regardless of
 * which way it faced, which read as "no lighting at all" once the
 * reference screenshot the player pointed back to was checked side by
 * side with this renderer's own output: real Populous shades a plateau's
 * two visible cliff faces at distinctly different brightness — this
 * renderer's flat single-tone walls were the missing "lighting and
 * shadow" the player then called out directly. Kept lighter than
 * CLIFF_SHADE_AMOUNT but still darker than the top (0 would make a lit
 * wall exactly as bright as the ground it descends from, erasing the edge
 * between them again).
 */
const CLIFF_LIT_SHADE_AMOUNT = 0.12;

/**
 * Elevation-unit drop at which a cliff wall's shading maxes out at
 * CLIFF_SHADE_AMOUNT/CLIFF_LIT_SHADE_AMOUNT — see drawCliffWalls. Below
 * this, the shade scales down proportionally with the drop instead of
 * jumping straight to full strength. Set to 2 full VISUAL_ELEVATION_
 * BUCKET steps: since every rendered elevation is now rounded to that
 * bucket, the smallest drop that can ever actually render is exactly one
 * bucket's worth — this keeps that smallest, most common case (two
 * adjacent terrace levels) at half shading strength rather than jumping
 * straight to full drama, while a real multi-level cliff (a volcano, an
 * earthquake, several taps of deliberate terraforming) still reads at
 * full strength.
 */
const CLIFF_FULL_SHADE_DROP = 2 * VISUAL_ELEVATION_BUCKET;

/**
 * A grass cliff's wall is shaded from this earthy tone instead of grass's
 * own green (see redraw()'s wallBaseColor) — per feedback that a same-hue
 * darkened wall barely read as a distinct "cross-section" at all: darkened
 * 35% toward black, TERRAIN_COLOR.grass lands at (48, 91, 41), almost the
 * exact same color as GRASS_SPECKLE_COLOR's own dark speckle pixels (51,
 * 98, 40) — so a cliff right under a dark speckle pixel had essentially
 * zero contrast against it. A brown "exposed dirt" base (a hue change, not
 * just a luminance one) stays legible against grass regardless of which
 * dither pixel happens to sit above it, and matches how the reference
 * game — and most terrain-based city-builders — render a cliff cutting
 * through turf: green on top, dirt on the sides.
 */
const GRASS_CLIFF_COLOR = 0x8a6a45;

/**
 * Minimum height difference (in elevation units) between a tile and its
 * neighbor before a cliff wall is drawn — filters out floating-point noise
 * from the easing animation (see update()) so a wall doesn't flicker in
 * and out for a difference of a few hundredths of a unit.
 */
const CLIFF_MIN_STEP = 0.05;

/**
 * Volcano rock (see applyVolcano/rockHardness) used to just render as
 * plain TERRAIN_COLOR.rock — indistinguishable from an ordinary rocky
 * hillside, with nothing to say "this used to be lava". Two rounds of
 * feedback narrowed this down:
 *
 * 1. A single hardness→orange gradient across the *entire* tile just read
 *    as a brown/orange mountain — nothing in it looked dark enough to
 *    contrast against. Real depictions (Terraria's Underworld, Stardew
 *    Valley's Volcano Dungeon, Minecraft's lava) keep the rock itself dark
 *    (obsidian/ash/charcoal) and show lava as a small, separately colored
 *    bright element against that dark base.
 * 2. Glowing cracks scattered across *every* rock tile still wasn't it —
 *    ordinary volcano art (see the reference image) shows magma only near
 *    the top, flowing down the slope in a few distinct streams, with the
 *    rest of the cone plain dark rock. applyVolcano raises its whole
 *    footprint to a flat MAX_ELEVATION plateau (no gradual cone slope to
 *    speak of), so the closest equivalent of "the slope" is the rim where
 *    that plateau meets ordinary lower ground. So lava is drawn only on
 *    rim tiles (isRockTile with a non-rock/out-of-bounds neighbor) as a
 *    streak spilling from that shared edge toward the lower ground;
 *    interior tiles (surrounded by other rock tiles on all sides) stay
 *    plain dark rock, same as the cone body in the reference image.
 *
 * Cools toward nothing as raiseVertex chips rockHardness down, per
 * "頑張れば平地に戻せる" (heightmap.ts's rockHardness doc comment).
 */
const VOLCANO_ROCK_COLOR = 0x1a120f;
const LAVA_CORE_COLOR = 0xfff4c2;
const LAVA_GLOW_COLOR = 0xff5a12;
/** Radians/second the lava glow's pulse advances — see volcanoGlowIntensity. */
const LAVA_PULSE_SPEED = 3;
/** How much the pulse swings the glow up/down around its hardness-driven base level. */
const LAVA_PULSE_DEPTH = 0.25;
/**
 * Floor under a flow's opacity once there's any glow at all, so it still
 * reads as visibly lit rather than fading to near-invisible thin lines —
 * only the length/count of flows should really telegraph "almost cooled",
 * not their opacity dropping to nothing.
 */
const LAVA_MIN_ALPHA = 0.7;

/** Linearly interpolates each RGB channel between two 0xRRGGBB colors. */
function lerpColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * clamped);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Deterministic pseudo-random value in [0, 1) for a tile's (x, y) — used to
 * give each volcano tile its own fixed crack angles and pulse phase, so
 * they don't all flicker in unison or reshuffle every frame. Same trick as
 * EntityLayer's walkCycle (a hash of position, not real randomness). Fine
 * for volcano tiles, which range over the whole map's worth of (x, y) —
 * not a good fit for createDitherTexture's tiny fixed pixel grid, see
 * ditherPixelHash below.
 */
function tileHash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * A separate integer hash for createDitherTexture, rather than reusing
 * tileHash above: that one is a classic "sin of a big number" hash, which
 * only decorrelates well across a wide, closely-spaced range of inputs.
 * Sampled at just the 8x8 (or so) integer grid createDitherTexture actually
 * needs, it instead aliased into a small number of repeating diagonal
 * bands — reading as a handful of large triangular blotches, not a fine
 * speckle, per feedback that the grass texture "isn't good". This bit-
 * mixing hash (integer multiply + xor-shift, the "hash32shift" family)
 * has no such periodicity: every (x, y) pair gets a well-scattered value
 * even at this small a domain.
 */
function ditherPixelHash(x: number, y: number): number {
  let h = (x * 0x1f1f1f1f) ^ (y * 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Builds a small tileable two-tone speckled texture, one pixel decided at
 * a time by ditherPixelHash — mimics the original game's dithered ground
 * instead of this renderer's flat single-color fills. `size` is kept small
 * (see GRASS_DITHER_SIZE) so `addressMode: "repeat"` tiles it several times
 * across one map tile; `scaleMode: "nearest"` keeps the speckles crisp
 * pixels rather than blurring them into a smooth gradient. Works without a
 * live GL context — BufferImageSource takes raw pixel bytes directly, so
 * this runs the same in a headless test as in the browser.
 */
function createDitherTexture(size: number, baseColor: number, speckleColor: number, density: number): Texture {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = ditherPixelHash(x, y) < density ? speckleColor : baseColor;
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
 * Filled with textureSpace: "global" wherever it's used (see redraw()) so
 * the speckles stay fixed to the ground and pan/zoom/rotate along with the
 * terrain, like a texture actually painted onto it, rather than sliding
 * around as if it were laid over the screen.
 */
const GRASS_FILL = {
  texture: createDitherTexture(GRASS_DITHER_SIZE, TERRAIN_COLOR.grass, GRASS_SPECKLE_COLOR, GRASS_SPECKLE_DENSITY),
  textureSpace: "global" as const,
};

/**
 * How brightly a volcano tile's lava should glow right now: a base level
 * from how much rockHardness is left (0 once it's fully cooled back to
 * ordinary ground), gently pulsing over time like real embers rather than
 * sitting at a flat brightness. Pulled out as a pure function so both the
 * hardness falloff and the pulse are unit-testable without a Graphics/
 * canvas context.
 */
export function volcanoGlowIntensity(
  hardness: number,
  maxHardness: number,
  elapsedTime: number,
  phaseSeed: number,
): number {
  const base = maxHardness > 0 ? Math.max(0, Math.min(1, hardness / maxHardness)) : 0;
  const pulse = 1 - LAVA_PULSE_DEPTH + LAVA_PULSE_DEPTH * Math.sin(elapsedTime * LAVA_PULSE_SPEED + phaseSeed * Math.PI * 2);
  return base * pulse;
}

export interface TileBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Extra tiles of padding around the exact projected screen rectangle in
 * visibleTileBounds — a raised vertex sits higher on screen (smaller sy)
 * than the flat (elevation-0) inverse projection assumes, by up to
 * MAX_ELEVATION*ELEVATION_STEP px. Since ELEVATION_STEP equals TILE_HEIGHT/2
 * here, that's exactly MAX_ELEVATION of "sum" (= sy/(TILE_HEIGHT/2)), which
 * splits evenly between tileX and tileY (each is (sum±diff)/2) — so half of
 * MAX_ELEVATION covers it, plus a little slack for the lava-flow pass's own
 * overshoot past a rock tile's edges, so a tall mountain's peak or a swamp/
 * farmland tint just past the exact edge never pops in/out as the camera
 * pans. (`diff` — sx/(TILE_WIDTH/2) — has no elevation term at all, so it
 * never needs padding; padding every side the same is just simpler than
 * tracking that asymmetry.) The same margin also covers a cliff wall (see
 * drawCliffWalls) belonging to a tile just past the edge of `bounds` — a
 * wall is at most this tall too, since it's just the gap between two
 * tiles' own elevations.
 */
const TILE_BOUNDS_MARGIN = Math.ceil(MAX_ELEVATION / 2) + 2;

/**
 * Which tiles could possibly be visible given the 4 corners of the screen,
 * expressed in renderer.view's local space (e.g. via `view.toLocal(...)` on
 * each screen corner) — the inverse of toScreen, ignoring each vertex's own
 * elevation (accounted for instead by padding the result — see
 * TILE_BOUNDS_MARGIN). Lets redraw() skip tiles nowhere near the camera
 * instead of rebuilding the whole map's mesh every frame regardless of
 * zoom/pan — necessary once the map is much bigger than a single screen
 * (see plan/0062-original-scale-map.md), the same technical constraint the
 * original game's own hardware was built around. Pulled out as a pure
 * function so the tile selection is unit-testable without a Graphics/
 * canvas context or a live PixiJS view.
 */
export function visibleTileBounds(
  localCorners: readonly { x: number; y: number }[],
  mapWidth: number,
  mapHeight: number,
  margin = TILE_BOUNDS_MARGIN,
): TileBounds {
  let minTileX = Infinity;
  let maxTileX = -Infinity;
  let minTileY = Infinity;
  let maxTileY = -Infinity;

  for (const { x: sx, y: sy } of localCorners) {
    // Inverse of toScreen(x, y, 0): sx = (x-y)*(TILE_WIDTH/2), sy = (x+y)*(TILE_HEIGHT/2).
    const sum = sy / (TILE_HEIGHT / 2);
    const diff = sx / (TILE_WIDTH / 2);
    const tileX = (sum + diff) / 2;
    const tileY = (sum - diff) / 2;
    minTileX = Math.min(minTileX, tileX);
    maxTileX = Math.max(maxTileX, tileX);
    minTileY = Math.min(minTileY, tileY);
    maxTileY = Math.max(maxTileY, tileY);
  }

  return {
    minX: Math.max(0, Math.floor(minTileX - margin)),
    maxX: Math.min(mapWidth - 1, Math.ceil(maxTileX + margin)),
    minY: Math.max(0, Math.floor(minTileY - margin)),
    maxY: Math.min(mapHeight - 1, Math.ceil(maxTileY + margin)),
  };
}

/**
 * Whether a (fractional, e.g. a walker mid-stride) tile-space point falls
 * within `bounds` — `bounds` names the tiles a camera view covers (see
 * visibleTileBounds), each spanning [x, x+1), so a point sitting exactly on
 * the far vertex of the last visible tile (x = bounds.maxX + 1) still
 * counts. Used by main.ts's "is any of the player's own walkers/houses/
 * shrine currently on screen" check — see
 * plan/0063-visibility-gated-casting.md.
 */
export function isWithinTileBounds(point: { x: number; y: number }, bounds: TileBounds): boolean {
  return (
    point.x >= bounds.minX && point.x <= bounds.maxX + 1 && point.y >= bounds.minY && point.y <= bounds.maxY + 1
  );
}

/**
 * Renders a heightmap as terraced isometric blocks, one flat-topped block
 * per tile with a shaded vertical cliff face wherever it sits higher than
 * a neighboring tile — see redraw(). Deliberately not a smooth per-vertex
 * mesh (each tile's 4 corners individually at their own height, producing
 * continuous slopes): the original game's stepped, plateau-and-cliff look
 * reads far better at this game's low tile-per-screen zoom level than a
 * smooth ramp does, and matches the reference art the terracing was
 * modeled on. See plan/0064-terraced-terrain.md.
 */
export class IsoRenderer {
  readonly view = new Container();
  readonly heightmap: Heightmap;
  private readonly graphics = new Graphics();

  /**
   * The height actually drawn on screen for each vertex — separate from
   * heightmap.vertices (which stays the instantly-updated, authoritative
   * value every game-logic check reads: flatness, buildability, walker
   * footing). `update()` eases this toward heightmap.vertices each frame
   * so a raise/lower/earthquake/volcano visibly rises or falls instead of
   * snapping instantly, per the "terrain edits should feel good — this is
   * the operation a player touches most" feedback.
   */
  private displayVertices: number[][];

  /** Seconds since construction — drives the lava-crack pulse in redraw(). */
  private elapsedTime = 0;

  /**
   * Whether the last redraw() found any glowing lava within its bounds —
   * see isAnimating(). One-redraw-old by nature (set at the end of
   * redraw(), read before the next one), which just means a volcano's
   * pulse can take one extra frame to resume after it first pans into
   * view — imperceptible in practice.
   */
  private hasActiveLava = false;

  constructor(heightmap: Heightmap) {
    this.heightmap = heightmap;
    this.displayVertices = heightmap.vertices.map((row) => [...row]);
    this.view.addChild(this.graphics);
    this.redraw();
  }

  /**
   * Eases displayVertices toward the real heightmap.vertices. Call once
   * per frame, before redraw(). Frame-rate independent: the fraction
   * covered per call depends only on deltaSeconds, not on how often this
   * runs.
   */
  update(deltaSeconds: number): void {
    this.elapsedTime += deltaSeconds;
    const { vertices } = this.heightmap;
    const t = 1 - Math.exp(-deltaSeconds / ELEVATION_EASE_TIME_CONSTANT);

    for (let y = 0; y < this.displayVertices.length; y++) {
      const displayRow = this.displayVertices[y];
      const targetRow = vertices[y];
      for (let x = 0; x < displayRow.length; x++) {
        const delta = targetRow[x] - displayRow[x];
        displayRow[x] = Math.abs(delta) < 0.01 ? targetRow[x] : displayRow[x] + delta * t;
      }
    }
  }

  /**
   * Whether redraw() is worth calling again even though the camera itself
   * hasn't moved — terrain still easing toward a recent edit (see
   * displayVertices), or a volcano's lava still pulsing — somewhere within
   * `bounds`. Lets the caller (main.ts's ticker) skip rebuilding the whole
   * terrain mesh on a frame where nothing *visible* would actually look
   * different — the dominant cost once the map is much bigger than one
   * screen (see plan/0062-original-scale-map.md). Scoped to `bounds`
   * rather than the whole map on purpose: the enemy AI terraforms and
   * fights continuously wherever its own houses are, often nowhere near
   * the player's current view, and that shouldn't by itself keep forcing
   * full redraws of a part of the map nobody's even looking at.
   */
  isAnimating(bounds: TileBounds): boolean {
    return this.isEasing(bounds) || this.hasActiveLava;
  }

  /** Vertex coordinates run 0..width/height inclusive — one past a tile's own x/y. */
  private isEasing(bounds: TileBounds): boolean {
    const { vertices } = this.heightmap;
    const maxVertexY = Math.min(bounds.maxY + 1, vertices.length - 1);
    const maxVertexX = Math.min(bounds.maxX + 1, vertices[0].length - 1);
    for (let y = bounds.minY; y <= maxVertexY; y++) {
      const displayRow = this.displayVertices[y];
      const targetRow = vertices[y];
      for (let x = bounds.minX; x <= maxVertexX; x++) {
        if (Math.abs(targetRow[x] - displayRow[x]) >= 0.01) return true;
      }
    }
    return false;
  }

  /** Total screen-space width/height (at scale 1) of the diamond the map projects to. */
  get mapPixelWidth(): number {
    return (this.heightmap.width + this.heightmap.height) * (TILE_WIDTH / 2);
  }

  get mapPixelHeight(): number {
    return (this.heightmap.width + this.heightmap.height) * (TILE_HEIGHT / 2);
  }

  /**
   * Projects a fractional tile-space point (e.g. a walker mid-stride
   * between vertices) to screen space, sitting on the interpolated
   * terrain surface below it.
   */
  project(x: number, y: number): { sx: number; sy: number } {
    return this.toScreen(x, y, sampleElevation(this.heightmap, x, y));
  }

  /**
   * Finds the grid vertex closest to a point in this.view's local space
   * (e.g. from `view.toLocal(pointerEvent.global)`), for turning a tap
   * into "which vertex did the player grab". `maxDistance` is in actual
   * screen pixels regardless of the view's current zoom (it's converted
   * to local-space units internally), so a finger's tap tolerance stays
   * constant even if the map is scaled down. Returns null past that
   * distance from every vertex.
   */
  pickVertex(localX: number, localY: number, maxDistance = 40): { x: number; y: number } | null {
    const { width, height, vertices } = this.heightmap;
    const localMaxDistance = maxDistance / this.view.scale.x;
    let best: { x: number; y: number } | null = null;
    let bestDistance = localMaxDistance;

    for (let y = 0; y <= height; y++) {
      for (let x = 0; x <= width; x++) {
        const { sx, sy } = this.toScreen(x, y, vertices[y][x]);
        const distance = Math.hypot(sx - localX, sy - localY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }

    return best;
  }

  /**
   * Finds the tile whose flat-topped block (see redraw()) center is
   * closest to a point in this.view's local space — the tile-face analog
   * of pickVertex, used by the raise/lower terrain tool so one edit
   * affects a whole tile at once instead of a single corner point, per
   * the original game's tile-based terraforming (see
   * plan/0065-tile-based-terraform.md). Same maxDistance semantics as
   * pickVertex. A tile's center sits at its 4 corners' average height —
   * exactly what `sampleElevation` at the tile's midpoint (x+0.5, y+0.5)
   * already computes, so this reads the true heightmap rather than
   * duplicating that average here.
   */
  pickTile(localX: number, localY: number, maxDistance = 40): { x: number; y: number } | null {
    const { width, height } = this.heightmap;
    const localMaxDistance = maxDistance / this.view.scale.x;
    let best: { x: number; y: number } | null = null;
    let bestDistance = localMaxDistance;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const elevation = sampleElevation(this.heightmap, x + 0.5, y + 0.5);
        const { sx, sy } = this.toScreen(x + 0.5, y + 0.5, elevation);
        const distance = Math.hypot(sx - localX, sy - localY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }

    return best;
  }

  /**
   * Rebuilds the terrain from the current display heights (see
   * displayVertices) — call after editing the heightmap, and every frame
   * update() runs, so an in-progress ease keeps redrawing until it settles.
   *
   * `bounds` (see visibleTileBounds) restricts the rebuild to just those
   * tiles, for maps much bigger than a single screen — omit it (as the
   * constructor and tests do) to rebuild the whole map, e.g. for an
   * initial full-map render before any camera/viewport exists yet.
   */
  redraw(bounds?: TileBounds): void {
    const { width, height, rockHardness, waterLevel, terrain } = this.heightmap;
    const vertices = this.displayVertices;
    const graphics = this.graphics;
    graphics.clear();

    const minX = bounds?.minX ?? 0;
    const maxX = bounds?.maxX ?? width - 1;
    const minY = bounds?.minY ?? 0;
    const maxY = bounds?.maxY ?? height - 1;
    const boundsWidth = maxX - minX + 1;
    const boundsHeight = maxY - minY + 1;

    // A tile's flat-topped block height (see the class doc comment) is the
    // average of its 4 (possibly uneven) corner vertices. Not just a
    // lookup into a precomputed grid: drawCliffWalls needs this for a
    // tile's neighbors too, which can sit just outside `bounds` — reading
    // straight from `vertices` (the true, unbounded map) instead keeps
    // that correct without needing to pad a bounded grid. Off the edge of
    // the map reads as sea level, so an elevated tile at the map's border
    // still gets a cliff wall down to it instead of just stopping bare —
    // like the edge of a diorama base.
    const tileElevation = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= width || y >= height
        ? 0
        : bucketElevation((vertices[y][x] + vertices[y][x + 1] + vertices[y + 1][x + 1] + vertices[y + 1][x]) / 4);

    // Precomputed once so the lava-flow pass (below) can look at each rock
    // tile's neighbors without recomputing isRockTile for them repeatedly.
    // Indexed by offset from (minX, minY), not by true tile coordinates —
    // drawLavaFlow's isRim treats anything outside this same bounded window
    // as non-rock, same as it already treats the true map edge. That can
    // only misjudge a rim right at the edge of `bounds`, which — thanks to
    // visibleTileBounds' own padding — is always well past what's actually
    // on screen.
    const isRockTile: boolean[][] = [];
    const avgHardnessGrid: number[][] = [];
    for (let y = minY; y <= maxY; y++) {
      const rockRow: boolean[] = [];
      const hardnessRow: number[] = [];
      for (let x = minX; x <= maxX; x++) {
        const cornerHardness = [
          rockHardness[y][x],
          rockHardness[y][x + 1],
          rockHardness[y + 1][x + 1],
          rockHardness[y + 1][x],
        ];
        rockRow.push(cornerHardness.some((h) => h > 0));
        hardnessRow.push(cornerHardness.reduce((sum, h) => sum + h, 0) / 4);
      }
      isRockTile.push(rockRow);
      avgHardnessGrid.push(hardnessRow);
    }
    this.hasActiveLava = isRockTile.some((row) => row.some(Boolean));

    // Pass 1: every tile's flat top plus its own cliff walls. Walked in
    // back-to-front diagonal (x+y) order over `bounds` — not the simpler
    // row-major order the old smooth mesh used — because a tall cliff wall
    // (up to MAX_ELEVATION*ELEVATION_STEP px) can reach far enough up the
    // screen to overlap tiles several rows behind it; only strict
    // painter's-algorithm order draws those correctly. A wall never
    // overlaps its own tile's top or its neighbor's top (it fills exactly
    // the elevation gap between them), so within a single tile, top-then-
    // walls order doesn't matter — only the across-tile order does.
    for (let d = minX + minY; d <= maxX + maxY; d++) {
      const yStart = Math.max(minY, d - maxX);
      const yEnd = Math.min(maxY, d - minX);
      for (let y = yStart; y <= yEnd; y++) {
        const x = d - y;
        const elevation = tileElevation(x, y);
        const p0 = this.toScreen(x, y, elevation);
        const p1 = this.toScreen(x + 1, y, elevation);
        const p2 = this.toScreen(x + 1, y + 1, elevation);
        const p3 = this.toScreen(x, y + 1, elevation);

        const isWater = elevation <= waterLevel;
        const isRock = isRockTile[y - minY][x - minX];
        // The plain flat color for the top — drawCliffWalls shades a wall
        // by darkening whatever base color it's given, and a dithered wall
        // face isn't worth the complexity the top face's texture already
        // solves.
        const color = isWater ? WATER_COLOR : isRock ? VOLCANO_ROCK_COLOR : TERRAIN_COLOR[terrain];
        const isGrassGround = !isWater && !isRock && terrain === "grass";
        // Grass ground alone gets the dithered look (see GRASS_FILL) —
        // water and rock already read fine as flat colors.
        const topFill = isGrassGround ? GRASS_FILL : color;
        // A grass cliff is shaded from an earthy tone instead of grass's
        // own green — see GRASS_CLIFF_COLOR's doc comment for why a same-
        // hue darkened wall wasn't legible enough against the dither.
        const wallBaseColor = isGrassGround ? GRASS_CLIFF_COLOR : color;

        graphics
          .poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
          .fill(topFill)
          .stroke({ width: 1, color: 0x000000, alpha: 0.15 });

        this.drawCliffWalls(graphics, x, y, elevation, wallBaseColor, tileElevation);
      }
    }

    // Pass 2: lava flows, rim tiles only (see VOLCANO_ROCK_COLOR's doc comment).
    // Kept separate so a flow can never end up hidden underneath a
    // later-drawn neighboring tile — flows always paint on top, regardless
    // of draw order.
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!isRockTile[y - minY][x - minX]) continue;
        const elevation = tileElevation(x, y);
        if (elevation <= waterLevel) continue;

        const p0 = this.toScreen(x, y, elevation);
        const p1 = this.toScreen(x + 1, y, elevation);
        const p2 = this.toScreen(x + 1, y + 1, elevation);
        const p3 = this.toScreen(x, y + 1, elevation);
        this.drawLavaFlow(
          graphics,
          x,
          y,
          p0,
          p1,
          p2,
          p3,
          avgHardnessGrid[y - minY][x - minX],
          isRockTile,
          minX,
          minY,
          boundsWidth,
          boundsHeight,
        );
      }
    }
  }

  /**
   * Draws a shaded vertical wall on each of this tile's 4 edges where a
   * neighboring tile sits lower — the "cliff face" that makes the terrain
   * read as stepped plateaus rather than a continuous ramp. A tile with no
   * lower neighbors (flat ground, or the low side of a slope) draws none.
   * `color` is the wall's own base color to shade darker — usually the same
   * flat color as the tile's top, but not always (see redraw()'s
   * wallBaseColor/GRASS_CLIFF_COLOR).
   *
   * The fixed light source sits toward the map's north-east (-y/+x in
   * toScreen's own coordinates — see drawLavaFlow's isRim comment on which
   * edge is which): the north and east walls (this tile's outward-facing
   * normal pointing that way) face toward it and shade up to CLIFF_LIT_
   * SHADE_AMOUNT's lighter maximum; south and west face away and shade up
   * to CLIFF_SHADE_AMOUNT's darker one — see CLIFF_FULL_SHADE_DROP for how
   * a small drop scales down from that maximum. Matches the two-tone
   * brightness split between a plateau's two faces in the reference
   * screenshot this scheme was checked against.
   */
  private drawCliffWalls(
    graphics: Graphics,
    x: number,
    y: number,
    elevation: number,
    color: number,
    tileElevation: (x: number, y: number) => number,
  ): void {
    const addWall = (
      neighborX: number,
      neighborY: number,
      edgeA: { x: number; y: number },
      edgeB: { x: number; y: number },
      maxShade: number,
    ) => {
      const neighborElevation = tileElevation(neighborX, neighborY);
      const drop = elevation - neighborElevation;
      if (drop <= CLIFF_MIN_STEP) return;

      // Scales linearly up to CLIFF_FULL_SHADE_DROP's worth of drop, then
      // holds at maxShade — see that constant's doc comment for why a
      // small ripple shouldn't shade as dramatically as a real cliff.
      const shadeAmount = maxShade * Math.min(1, drop / CLIFF_FULL_SHADE_DROP);
      const wallColor = lerpColor(color, 0x000000, shadeAmount);

      const topA = this.toScreen(edgeA.x, edgeA.y, elevation);
      const topB = this.toScreen(edgeB.x, edgeB.y, elevation);
      const bottomB = this.toScreen(edgeB.x, edgeB.y, neighborElevation);
      const bottomA = this.toScreen(edgeA.x, edgeA.y, neighborElevation);

      graphics.poly([topA.sx, topA.sy, topB.sx, topB.sy, bottomB.sx, bottomB.sy, bottomA.sx, bottomA.sy]).fill(wallColor);
    };

    addWall(x, y - 1, { x, y }, { x: x + 1, y }, CLIFF_LIT_SHADE_AMOUNT); // north: faces -y, toward the light
    addWall(x + 1, y, { x: x + 1, y }, { x: x + 1, y: y + 1 }, CLIFF_LIT_SHADE_AMOUNT); // east: faces +x, toward the light
    addWall(x, y + 1, { x: x + 1, y: y + 1 }, { x, y: y + 1 }, CLIFF_SHADE_AMOUNT); // south: faces +y, away from the light
    addWall(x - 1, y, { x, y: y + 1 }, { x, y }, CLIFF_SHADE_AMOUNT); // west: faces -x, away from the light
  }

  /**
   * A rock tile is "rim" if at least one of its 4 neighboring tiles isn't
   * rock (or is off the edge of the map) — the boundary where applyVolcano's
   * flat-topped plateau drops back to ordinary ground. Only rim tiles get a
   * lava flow, one per such neighboring edge, spilling from that shared
   * edge toward the lower ground on the other side — see VOLCANO_ROCK_
   * COLOR's doc comment. An interior tile (rock on all 4 sides) stays plain
   * dark rock, same as a real cone's solid body away from its rim.
   */
  private drawLavaFlow(
    graphics: Graphics,
    x: number,
    y: number,
    p0: { sx: number; sy: number },
    p1: { sx: number; sy: number },
    p2: { sx: number; sy: number },
    p3: { sx: number; sy: number },
    avgHardness: number,
    isRockTile: boolean[][],
    boundsMinX: number,
    boundsMinY: number,
    boundsWidth: number,
    boundsHeight: number,
  ): void {
    const intensity = volcanoGlowIntensity(avgHardness, VOLCANO_ROCK_HARDNESS, this.elapsedTime, tileHash(x, y));
    if (intensity <= 0.02) return;

    // x/y here (and so nx/ny) are true tile coordinates, kept stable
    // regardless of the current camera/bounds — only tileHash above needs
    // that stability (a tile's own pulse phase shouldn't shift as the
    // player pans). isRockTile itself is offset by (boundsMinX, boundsMinY)
    // — see redraw() — so lookups into it need converting back first.
    const isRim = (nx: number, ny: number) => {
      const lx = nx - boundsMinX;
      const ly = ny - boundsMinY;
      return lx < 0 || ly < 0 || lx >= boundsWidth || ly >= boundsHeight || !isRockTile[ly][lx];
    };

    // Each tile edge here is named by the neighbor it borders — see toScreen:
    // north (y-1) and west (x-1) sit higher on screen than south/east.
    const edges: [{ sx: number; sy: number }, { sx: number; sy: number }][] = [];
    if (isRim(x, y - 1)) edges.push([p0, p1]);
    if (isRim(x + 1, y)) edges.push([p1, p2]);
    if (isRim(x, y + 1)) edges.push([p2, p3]);
    if (isRim(x - 1, y)) edges.push([p3, p0]);
    if (edges.length === 0) return;

    const alpha = LAVA_MIN_ALPHA + (1 - LAVA_MIN_ALPHA) * intensity;
    const flowColor = lerpColor(LAVA_GLOW_COLOR, LAVA_CORE_COLOR, intensity);
    const flowLength = 8 + 16 * intensity;

    for (const [a, b] of edges) {
      const midX = (a.sx + b.sx) / 2;
      const midY = (a.sy + b.sy) / 2;
      // A teardrop spilling from the rim edge down-screen toward the lower
      // ground on the other side of it — wide at the edge, tapering to a
      // point, like magma dribbling over a rim rather than a hard-edged bar.
      graphics
        .poly([a.sx, a.sy, b.sx, b.sy, midX, midY + flowLength])
        .fill({ color: flowColor, alpha });
      // A bright vent glow where the flow spills over the rim.
      graphics.circle(midX, midY, 2 + 2 * intensity).fill({ color: LAVA_CORE_COLOR, alpha });
    }
  }

  private toScreen(x: number, y: number, elevation: number) {
    return {
      sx: (x - y) * (TILE_WIDTH / 2),
      sy: (x + y) * (TILE_HEIGHT / 2) - elevation * ELEVATION_STEP,
    };
  }
}
