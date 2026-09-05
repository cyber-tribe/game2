import { Container, Graphics, Texture } from "pixi.js";
import { MAX_ELEVATION, sampleElevation, VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";
import { createDitherTexture, createPatternTexture } from "./patternTexture";

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
 * Terrain renders as a true per-vertex mesh — each tile a pair of triangles
 * using its own 4 corners' actual heights, shaded by how much each
 * triangle's own slope faces a fixed light (see triangleBrightness) —
 * rather than a flat-topped block with a separate vertical "cliff wall".
 * Per feedback holding this renderer's own output up against a reference
 * screenshot: "そもそも2段3段の段差があっても坂になるだけで、断層には
 * なりません" ("even a 2-3 unit step just becomes a slope, not a cliff") —
 * every reference image shown across this and the earlier grass/cliff
 * legibility work agrees: an ordinary hill is a shaded slope, and the only
 * hard vertical drop is the map's own outer edge (see drawEdgeWall) — never
 * routine terrain. An earlier version tried the opposite: flatten every
 * tile to its own average height and paint a flat-shaded vertical wall
 * wherever that differed from a neighbor (plan/0064-terraced-terrain.md),
 * tuning the wall's darkness down for small drops and rounding elevations
 * to hide createHeightmap's routine 1-2 unit noise (plan/0073-grass-cliff-
 * legibility.md) — but no amount of tuning a wall's *color* fixes a slope
 * being rendered as a wall in the first place. This mesh needs none of
 * that: a small height difference between adjacent tiles becomes a
 * gently-tilted, gently-shaded triangle purely from its own geometry; a
 * genuinely steep one becomes a dramatically-shaded, steeply-tilted one —
 * both from the exact same code path, with no separate threshold, bucket,
 * or wall-vs-slope decision anywhere.
 */

/**
 * The fixed light direction every triangle (interior slopes and the map's
 * own edge walls alike, see triangleBrightness/drawEdgeWall) is shaded
 * against, expressed in the same (x, y, elevation) space toScreen projects
 * from — i.e. before isometric projection distorts angles, not in screen
 * pixels. Sits mostly overhead with a north-east tilt (-y/+x), continuing
 * the same "sun in the north-east" convention plan/0073-grass-cliff-
 * legibility.md picked for its own (now-removed) north/east-lit cliff
 * walls — a face tilted toward -y/+x still reads as the brighter one.
 * Pre-normalized so triangleBrightness's dot product needs no further
 * scaling.
 */
const LIGHT_DIRECTION = normalize3({ x: 1, y: -1, z: 2 });

/**
 * triangleBrightness's own output for a perfectly flat, upward-facing
 * triangle — i.e. dot(LIGHT_DIRECTION, {x:0,y:0,z:1}). Used to calibrate
 * relative brightness so flat ground (by far the most common case) always
 * renders at exactly its own base color, unmodified — only sloped or
 * vertical faces shift away from 1.
 */
const FLAT_FACE_BRIGHTNESS = LIGHT_DIRECTION.z;

/** How far a steeply shadowed face (facing away from LIGHT_DIRECTION) darkens from its base color, at most. */
const MAX_SLOPE_DARKEN = 0.55;
/** How far a steeply lit face (facing toward LIGHT_DIRECTION) lightens from its base color, at most. */
const MAX_SLOPE_LIGHTEN = 0.25;

/**
 * How close two adjacent corner heights need to be to treat a triangle as
 * "exactly flat" (see redraw()'s isFlatTriangle) — filters out floating-
 * point noise from the easing animation (see update()) so a barely-
 * mid-ease triangle doesn't flicker between the dithered flat look and a
 * faintly-shaded sloped one for a difference of a few hundredths of a unit.
 */
const FLAT_EPSILON = 0.02;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** The (non-normalized) normal of the plane through 3 points, via (b-a) x (c-a). */
function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx };
}

/**
 * A triangle/wall's brightness relative to flat ground (1 = unmodified),
 * from how directly its own face (given as a, b, c in (x, y, elevation)
 * space, or a precomputed normal — see drawEdgeWall) points toward
 * LIGHT_DIRECTION. >1 for a face tilted toward the light (lightens, capped
 * by MAX_SLOPE_LIGHTEN below), <1 for one tilted away (darkens, capped by
 * MAX_SLOPE_DARKEN) — see shadeColor for how this turns into an actual
 * color.
 */
function faceBrightness(normal: Vec3): number {
  const n = normalize3(normal);
  const dot = n.x * LIGHT_DIRECTION.x + n.y * LIGHT_DIRECTION.y + n.z * LIGHT_DIRECTION.z;
  const deviation = dot - FLAT_FACE_BRIGHTNESS;
  if (deviation < 0) {
    // Normalized against the full possible range below flat (down to a
    // face pointing exactly opposite the light) so even the most extreme
    // shadow still only reaches MAX_SLOPE_DARKEN, never further.
    return 1 - MAX_SLOPE_DARKEN * Math.min(1, -deviation / (FLAT_FACE_BRIGHTNESS + 1));
  }
  return 1 + MAX_SLOPE_LIGHTEN * Math.min(1, deviation / (1 - FLAT_FACE_BRIGHTNESS));
}

function triangleBrightness(a: Vec3, b: Vec3, c: Vec3): number {
  return faceBrightness(triangleNormal(a, b, c));
}

/** Tints `color` toward black (brightness < 1) or white (brightness > 1) — see faceBrightness. */
function shadeColor(color: number, brightness: number): number {
  if (brightness < 1) return lerpColor(color, 0x000000, 1 - brightness);
  return lerpColor(color, 0xffffff, brightness - 1);
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
 * original game's turf, which dithers between two tones in a fine speckle
 * rather than one uniform fill — see createDitherTexture. Originally only
 * grass got this treatment; plan/0087-terrain-texture-unification.md gives
 * every terrain its own dithered pattern instead of a flat fill, per
 * "全terrainに固有pixel patternを持たせる".
 */
const GRASS_SPECKLE_COLOR = lerpColor(TERRAIN_COLOR.grass, 0x000000, 0.3);
/**
 * Size (px, at scale 1) of one repeat of a terrain's dither texture — see
 * createDitherTexture. Small relative to a tile (64x32px) so it tiles
 * several times across each tile, reading as a fine even stipple like the
 * reference art rather than a few large blotches. Rock uses a larger size
 * than the others — "Grassより粗いpattern" — so its speckle reads as
 * chunkier gravel rather than the same fine stipple as turf.
 */
const DITHER_SIZE = 8;
const ROCK_DITHER_SIZE = 12;
/** Fraction of each terrain's dither texture that gets its speckle color rather than its plain base color. */
const GRASS_SPECKLE_DENSITY = 0.35;
const DESERT_SPECKLE_COLOR = lerpColor(TERRAIN_COLOR.desert, 0x3a2410, 0.35);
const DESERT_SPECKLE_DENSITY = 0.15;
const SNOW_SPECKLE_COLOR = 0xffffff;
const SNOW_SPECKLE_DENSITY = 0.2;
const ROCK_SPECKLE_COLOR = lerpColor(TERRAIN_COLOR.rock, 0x000000, 0.35);
const ROCK_SPECKLE_DENSITY = 0.4;

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
 * patternTexture.ts's own ditherPixelHash.
 */
function tileHash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * One frame of a simple pixel-art water animation — per plan/0087's
 * "SFCゲームとして動いて見える水" (not a realistic shader/reflection): a
 * few horizontal wave-crest bands, offset by `phase` (0..1) so consecutive
 * frames read as the crests scrolling sideways. `phase` shifts the sine
 * argument by a full period times itself, so frame i/N tiles seamlessly
 * into frame (i+1)/N.
 */
/** How many wave-crest bands repeat across one WATER_WAVE_SIZE-wide texture tile — see createWaveTexture. */
const WATER_WAVE_CYCLES = 3;

function createWaveTexture(size: number, baseColor: number, waveColor: number, phase: number): Texture {
  return createPatternTexture(size, (x, y) => {
    // A gentle per-row offset (y * 0.4, not a steep diagonal) keeps this
    // reading as wavy crest lines rather than a rigid horizontal stripe,
    // and a high threshold (0.75) keeps the crest itself a thin
    // highlight rather than filling half of each band — per plan/0087's
    // own "リアルな水ではなくSFCゲームとして動いて見える水" (a couple of
    // thin bright pixels, not a bold candy-stripe).
    const wave = Math.sin(((x / size) * WATER_WAVE_CYCLES + phase) * Math.PI * 2 + y * 0.4);
    return wave > 0.75 ? waveColor : baseColor;
  });
}

/**
 * One dithered fill per terrain type, each filled with textureSpace:
 * "global" wherever it's used (see redraw()) so the speckles stay fixed to
 * the ground and pan/zoom/rotate along with the terrain, like a texture
 * actually painted onto it, rather than sliding around as if it were laid
 * over the screen.
 */
const TERRAIN_FILL: Record<Heightmap["terrain"], { texture: Texture; textureSpace: "global" }> = {
  grass: {
    texture: createDitherTexture(DITHER_SIZE, TERRAIN_COLOR.grass, GRASS_SPECKLE_COLOR, GRASS_SPECKLE_DENSITY),
    textureSpace: "global",
  },
  desert: {
    texture: createDitherTexture(DITHER_SIZE, TERRAIN_COLOR.desert, DESERT_SPECKLE_COLOR, DESERT_SPECKLE_DENSITY),
    textureSpace: "global",
  },
  snow: {
    texture: createDitherTexture(DITHER_SIZE, TERRAIN_COLOR.snow, SNOW_SPECKLE_COLOR, SNOW_SPECKLE_DENSITY),
    textureSpace: "global",
  },
  rock: {
    texture: createDitherTexture(ROCK_DITHER_SIZE, TERRAIN_COLOR.rock, ROCK_SPECKLE_COLOR, ROCK_SPECKLE_DENSITY),
    textureSpace: "global",
  },
};

/** Size (px) of one repeat of the water wave texture — see createWaveTexture. */
const WATER_WAVE_SIZE = 16;
const WATER_WAVE_COLOR = lerpColor(WATER_COLOR, 0xffffff, 0.35);
/** How many distinct animation frames the water cycles through — see WATER_FRAMES/waterFrameIndex. */
const WATER_FRAME_COUNT = 3;
/** Frames per second the water animation advances — slow and gentle, per plan/0087's "動いて見える" rather than a fast realistic ripple. */
const WATER_FRAME_RATE = 2;
const WATER_FRAMES: { texture: Texture; textureSpace: "global" }[] = Array.from({ length: WATER_FRAME_COUNT }, (_, i) => ({
  texture: createWaveTexture(WATER_WAVE_SIZE, WATER_COLOR, WATER_WAVE_COLOR, i / WATER_FRAME_COUNT),
  textureSpace: "global",
}));

/** Which of WATER_FRAMES should be showing right now — pulled out as a pure function so the cadence is unit-testable. */
export function waterFrameIndex(elapsedTime: number): number {
  return Math.floor(elapsedTime * WATER_FRAME_RATE) % WATER_FRAME_COUNT;
}

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
 * tracking that asymmetry.) The same margin also covers a map-edge wall
 * (see drawEdgeWall) belonging to a tile just past the edge of `bounds` —
 * a wall is at most this tall too, since it's just the gap between a
 * boundary vertex's own elevation and sea level.
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
 * Renders a heightmap as a true per-vertex isometric mesh: each tile is a
 * pair of triangles using its own 4 corners' actual heights, so a height
 * difference between tiles reads as a continuous, shaded slope rather than
 * a flat block with a separate vertical cliff face — see redraw() and
 * LIGHT_DIRECTION's own doc comment for why (plan/0073-grass-cliff-
 * legibility.md's "追記" section, and plan/0064-terraced-terrain.md for
 * the flat-block approach this replaced). The map's own outer edge is the
 * one place that still gets a genuine vertical wall (see drawEdgeWall) —
 * every reference image checked against this renderer agrees a real,
 * original-game map ends in a hard drop at its border, not a slope.
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

    // Pass 1: every tile's own sloped, shaded mesh (see the class doc
    // comment) plus a genuine vertical wall wherever it sits on the map's
    // own outer edge (see drawEdgeWall). Walked in back-to-front diagonal
    // (x+y) order, not the simpler row-major order a plain per-vertex loop
    // could use — a steep enough slope (up to MAX_ELEVATION*ELEVATION_STEP
    // px of rise across one tile) can still reach far enough up the screen
    // to overlap tiles several rows behind it, and only strict painter's-
    // algorithm order draws those correctly.
    for (let d = minX + minY; d <= maxX + maxY; d++) {
      const yStart = Math.max(minY, d - maxX);
      const yEnd = Math.min(maxY, d - minX);
      for (let y = yStart; y <= yEnd; y++) {
        const x = d - y;
        const h00 = vertices[y][x];
        const h10 = vertices[y][x + 1];
        const h11 = vertices[y + 1][x + 1];
        const h01 = vertices[y + 1][x];
        const avgElevation = (h00 + h10 + h11 + h01) / 4;

        const isWater = avgElevation <= waterLevel;
        const isRock = isRockTile[y - minY][x - minX];
        const baseColor = isWater ? WATER_COLOR : isRock ? VOLCANO_ROCK_COLOR : TERRAIN_COLOR[terrain];

        if (isWater) {
          // Water always reads as a single flat, unshaded plane — never a
          // sloped/shaded seabed showing through — at its own tile's
          // average depth, same as before this became a per-vertex mesh.
          // No stroke (see fillTerrainTriangle's own doc comment on why):
          // a whole lake is one continuous color, so outlining every tile
          // seam would draw a visible grid across it for no reason. A
          // simple pixel wave animation (see WATER_FRAMES/waterFrameIndex)
          // replaces the old flat WATER_COLOR fill, per plan/0087.
          const p0 = this.toScreen(x, y, avgElevation);
          const p1 = this.toScreen(x + 1, y, avgElevation);
          const p2 = this.toScreen(x + 1, y + 1, avgElevation);
          const p3 = this.toScreen(x, y + 1, avgElevation);
          graphics
            .poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
            .fill(WATER_FRAMES[waterFrameIndex(this.elapsedTime)]);
        } else {
          const a: Vec3 = { x, y, z: h00 };
          const b: Vec3 = { x: x + 1, y, z: h10 };
          const c: Vec3 = { x: x + 1, y: y + 1, z: h11 };
          const d2: Vec3 = { x, y: y + 1, z: h01 };
          // Split along the (x,y)-(x+1,y+1) diagonal into 2 triangles —
          // 3 points are always planar, so each triangle (unlike the full
          // 4-corner quad, which can warp into a non-planar "saddle" when
          // all 4 corners differ) has one well-defined normal to shade by.
          this.fillTerrainTriangle(graphics, a, b, c, baseColor, terrain, isRock);
          this.fillTerrainTriangle(graphics, a, c, d2, baseColor, terrain, isRock);
        }

        // The map's own outer edge always gets a genuine vertical wall
        // down to elevation 0 — see drawEdgeWall and the class doc comment
        // on why this is the one place a hard drop (rather than a slope)
        // is still correct.
        if (y === 0) this.drawEdgeWall(graphics, { x, y, z: h00 }, { x: x + 1, y, z: h10 }, baseColor, { x: 0, y: -1, z: 0 });
        if (x === width - 1) {
          this.drawEdgeWall(graphics, { x: x + 1, y, z: h10 }, { x: x + 1, y: y + 1, z: h11 }, baseColor, { x: 1, y: 0, z: 0 });
        }
        if (y === height - 1) {
          this.drawEdgeWall(graphics, { x: x + 1, y: y + 1, z: h11 }, { x, y: y + 1, z: h01 }, baseColor, { x: 0, y: 1, z: 0 });
        }
        if (x === 0) this.drawEdgeWall(graphics, { x, y: y + 1, z: h01 }, { x, y, z: h00 }, baseColor, { x: -1, y: 0, z: 0 });
      }
    }

    // Pass 2: lava flows, rim tiles only (see VOLCANO_ROCK_COLOR's doc comment).
    // Kept separate so a flow can never end up hidden underneath a
    // later-drawn neighboring tile — flows always paint on top, regardless
    // of draw order.
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!isRockTile[y - minY][x - minX]) continue;
        const elevation = (vertices[y][x] + vertices[y][x + 1] + vertices[y + 1][x + 1] + vertices[y + 1][x]) / 4;
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
   * Fills one terrain triangle (`a`, `b`, `c` in (x, y, elevation) space)
   * with its base color, tinted by triangleBrightness — see that function
   * and LIGHT_DIRECTION's own doc comment. Every terrain gets its own
   * dithered look (see TERRAIN_FILL) only when the triangle is exactly
   * flat: a sloped triangle shades as a plain tinted color instead — a
   * dithered *and* tilted face wasn't worth the complexity, and it
   * usefully doubles as a visible reward for actually flattening land
   * (the core "flatten to build" loop, see createHeightmap's own doc
   * comment): a manicured, flattened plot reads distinctly from the rough,
   * gently-shaded slopes of untouched terrain right next to it.
   *
   * Deliberately no stroke on the triangle's own outline: two adjacent
   * triangles that end up the exact same shaded color (the ordinary case
   * on flat or gently-sloped ground, since brightness is continuous) are
   * meant to read as one seamless surface. An outline on every triangle
   * regardless drew a fine diamond-grid wireframe over the *entire* map —
   * on real mobile hardware, glaringly visible even over otherwise flat
   * grass — per feedback: "これじゃ視認性が悪すぎます、原作に可能な限り
   * 揃えてください". The reference art itself never outlines a facet
   * seam; only an actual brightness change (a real slope or cliff) reads
   * as an edge there, exactly like this now does with the stroke gone.
   */
  private fillTerrainTriangle(
    graphics: Graphics,
    a: Vec3,
    b: Vec3,
    c: Vec3,
    baseColor: number,
    terrain: Heightmap["terrain"],
    isRock: boolean,
  ): void {
    const pa = this.toScreen(a.x, a.y, a.z);
    const pb = this.toScreen(b.x, b.y, b.z);
    const pc = this.toScreen(c.x, c.y, c.z);
    const isFlat = Math.abs(a.z - b.z) < FLAT_EPSILON && Math.abs(b.z - c.z) < FLAT_EPSILON;

    const fill = isFlat && !isRock ? TERRAIN_FILL[terrain] : shadeColor(baseColor, isFlat ? 1 : triangleBrightness(a, b, c));

    graphics.poly([pa.sx, pa.sy, pb.sx, pb.sy, pc.sx, pc.sy]).fill(fill);
  }

  /**
   * Draws a genuine vertical wall from one real map-boundary edge (`edgeA`
   * -> `edgeB`, both in (x, y, elevation) space, at the tile's own actual
   * corner heights) straight down to elevation 0 — the map's own outer
   * "diorama base" edge, the one place a hard drop is still correct (see
   * the class doc comment). `outwardNormal` is fixed per edge direction
   * (north/east/south/west) rather than computed from the wall's own
   * geometry: every point on a north (or south/east/west) edge shares the
   * same x (or y) coordinate by definition, so the wall is always exactly
   * vertical and planar regardless of edgeA/edgeB's own heights — its
   * normal never actually depends on them.
   */
  private drawEdgeWall(graphics: Graphics, edgeA: Vec3, edgeB: Vec3, baseColor: number, outwardNormal: Vec3): void {
    if (Math.max(edgeA.z, edgeB.z) < FLAT_EPSILON) return; // already at/below sea level — nothing to drop down to

    const topA = this.toScreen(edgeA.x, edgeA.y, edgeA.z);
    const topB = this.toScreen(edgeB.x, edgeB.y, edgeB.z);
    const bottomB = this.toScreen(edgeB.x, edgeB.y, 0);
    const bottomA = this.toScreen(edgeA.x, edgeA.y, 0);
    const color = shadeColor(baseColor, faceBrightness(outwardNormal));

    graphics.poly([topA.sx, topA.sy, topB.sx, topB.sy, bottomB.sx, bottomB.sy, bottomA.sx, bottomA.sy]).fill(color);
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
