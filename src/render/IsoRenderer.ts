import { Container, Graphics, Texture } from "pixi.js";
import { MAX_ELEVATION, REEF_HARDNESS, sampleElevation, VOLCANO_ROCK_HARDNESS, type Heightmap } from "../world/heightmap";
import { GAME_PALETTE } from "./palette";
import { createPatternTexture, createTurfTexture, type TurfSpec } from "./patternTexture";

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
 * Terrain renders as a true per-vertex mesh — one square per tile, using
 * its own 4 corners' actual heights, shaded by how much that square's own
 * slope faces a fixed light (see faceBrightnessOf) — rather than a
 * flat-topped block with a separate vertical "cliff wall".
 *
 * Squares, not triangles, because the reference art's land is a grid of
 * quads: one cell per map square, continuous across the cell, with no
 * diagonal seam anywhere in it. This renderer used to split each tile into
 * two independently-shaded triangles, which put a crease down one diagonal
 * of every uneven tile — and always the *same* diagonal, so rough ground
 * picked up a faint corduroy grain running one way across the whole world.
 * See fillTerrainQuad and polygonNormal for how a tile whose 4 corners do
 * not lie in one plane still gets a single normal to shade by.
 * Per feedback holding this renderer's own output up against a reference
 * screenshot: "そもそも2段3段の段差があっても坂になるだけで、断層には
 * なりません" ("even a 2-3 unit step just becomes a slope, not a cliff") —
 * every reference image shown across this and the earlier grass/cliff
 * legibility work agrees: an ordinary hill is a shaded slope, and the only
 * hard vertical drop is the map's own outer edge (see drawEdgeWall) — never
 * routine terrain. An earlier version tried the opposite: flatten every
 * tile to its own average height and paint a flat-shaded vertical wall
 * wherever that differed from a neighbor (plan/archived/0064-terraced-terrain.md),
 * tuning the wall's darkness down for small drops and rounding elevations
 * to hide createHeightmap's routine 1-2 unit noise (plan/0073-grass-cliff-
 * legibility.md) — but no amount of tuning a wall's *color* fixes a slope
 * being rendered as a wall in the first place. This mesh needs none of
 * that: a small height difference between adjacent tiles becomes a
 * gently-tilted, gently-shaded square purely from its own geometry; a
 * genuinely steep one becomes a dramatically-shaded, steeply-tilted one —
 * both from the exact same code path, with no separate threshold, bucket,
 * or wall-vs-slope decision anywhere.
 */

/**
 * The fixed light direction every face (interior slopes and the map's
 * own edge walls alike, see faceBrightnessOf/drawEdgeWall) is shaded
 * against, expressed in the same (x, y, elevation) space toScreen projects
 * from — i.e. before isometric projection distorts angles, not in screen
 * pixels. Sits mostly overhead with a north-east tilt (-y/+x), continuing
 * the same "sun in the north-east" convention plan/0073-grass-cliff-
 * legibility.md picked for its own (now-removed) north/east-lit cliff
 * walls — a face tilted toward -y/+x still reads as the brighter one.
 * Pre-normalized so faceBrightness's dot product needs no further
 * scaling.
 */
const LIGHT_DIRECTION = normalize3({ x: 1, y: -1, z: 2 });

/**
 * faceBrightness's own output for a perfectly flat, upward-facing
 * face — i.e. dot(LIGHT_DIRECTION, {x:0,y:0,z:1}). Used to calibrate
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
 * How close a tile's corner heights need to be to each other to treat it
 * as "exactly flat" (see fillTerrainQuad) — filters out floating-point
 * noise from the easing animation (see update()) so a barely-mid-ease tile
 * doesn't flicker between the dithered flat look and a faintly-shaded
 * sloped one for a difference of a few hundredths of a unit.
 */
const FLAT_EPSILON = 0.02;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * The (non-normalized) normal of a closed polygon, by Newell's method.
 *
 * For a planar polygon this is exactly the plane's normal — so for a
 * triangle it agrees with the usual (b-a) x (c-a) cross product. What
 * makes it the right tool here is the case a cross product cannot answer:
 * a terrain tile's 4 corners can warp into a saddle, and Newell's gives
 * such a polygon the area-weighted average of its own surface rather than
 * arbitrarily privileging one diagonal. That is what lets a tile be drawn
 * as one square instead of two triangles — see fillTerrainQuad.
 */
function polygonNormal(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    x += (p.y - q.y) * (p.z + q.z);
    y += (p.z - q.z) * (p.x + q.x);
    z += (p.x - q.x) * (p.y + q.y);
  }
  return { x, y, z };
}

/**
 * A face's brightness relative to flat ground (1 = unmodified), from how
 * directly its normal points toward LIGHT_DIRECTION — given here as that
 * normal, so a terrain square passes its polygon normal (faceBrightnessOf)
 * and an edge wall its fixed per-direction one (drawEdgeWall).
 * >1 for a face tilted toward the light (lightens, capped
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

/**
 * A face's brightness from its own corners, in (x, y, elevation) space —
 * the value fillTerrainQuad hands to turfFillFor. Exported so the shading
 * rules can be checked directly (steeper shades further from flat; facing
 * the light lightens, facing away darkens) rather than inferred from what
 * colour a tile came out.
 */
export function faceBrightnessOf(points: readonly Vec3[]): number {
  return faceBrightness(polygonNormal(points));
}

/**
 * Scales `color` by `brightness` — see faceBrightness. Darker than 1 and
 * lighter than 1 are the same operation, a straight per-channel multiply,
 * clamped where a channel would overflow.
 *
 * Lightening used to lerp toward white instead, which washes the colour out
 * as well as brightening it. That was invisible while a lit slope was one
 * flat fill, but turf makes it obvious: a sunlit patch of grass came out
 * grey-green next to the saturated green around it, where the reference art
 * keeps the same colour and simply turns it up. A multiply holds hue and
 * saturation until a channel actually clips.
 */
function shadeColor(color: number, brightness: number): number {
  if (brightness === 1) return color;
  const scale = (shift: number) => Math.min(255, Math.round(((color >> shift) & 0xff) * brightness));
  return (scale(16) << 16) | (scale(8) << 8) | scale(0);
}

/**
 * Sourced from GAME_PALETTE rather than its own hex literals, per the
 *改修指示's "ゲーム全体を限定された共通paletteで描画する" — and, since
 * plan/archived/0088-palette-calibration.md, those values are sampled off the
 * original's own screenshots. Grass in particular is an olive/khaki, not
 * the spring green this renderer used to draw. Snow has no reference
 * screenshot to sample from (none of the 11 shows a snow map), so it stays
 * a harmonized guess: a cold off-white against the same warm stone.
 */
export const TERRAIN_COLOR: Record<Heightmap["terrain"], number> = {
  grass: GAME_PALETTE.grassMid,
  desert: GAME_PALETTE.soilLight,
  snow: 0xd8dce0,
  rock: GAME_PALETTE.stoneDark,
};

const WATER_COLOR = GAME_PALETTE.waterMid;
/**
 * Torn ground (see Heightmap.crevice). Near-black, and deliberately darker
 * than anything else on the map: a crevice kills whoever walks into it, so
 * it has to read as a hole at a glance rather than as one more shade of
 * terrain.
 */
const CREVICE_COLOR = 0x120e08;

/**
 * A 城壁 (see Heightmap.wall). A cold grey, and the one terrain color here
 * taken from outside GAME_PALETTE's own stone family on purpose: that
 * family is the warm khaki this world is *made of* — soilLight (desert
 * terrain) is 0x9f8c6d and stoneLight is 0xa1916f, four values apart
 * across all three channels — so a wall painted in it disappears into
 * desert ground entirely, which was exactly what the first build of this
 * did. A wall is the one piece of the map a player has to recognize
 * without looking twice: walking into it is the difference between a plan
 * working and not. Cold grey reads as masonry against every terrain here
 * (olive grass, khaki soil, dark volcanic stone) and stays clearly darker
 * than the cold off-white of snow. Undithered like rock and crevices (see
 * hasOwnColor); applyWall's own elevation bump gives it a lit face and a
 * shadowed one.
 */
const WALL_COLOR = 0x8d8f96;

/**
 * A 地下巨石 (see Heightmap.boulder). The same cold grey family as a wall
 * — they are both raised stone, and reading as the same material is
 * right — but markedly darker, because the two are told apart by size and
 * shape on screen rather than by hue: a wall is a chain of small blocks, a
 * boulder is one big dome. Both stay well clear of the warm khaki this
 * world's own ground is made of (see WALL_COLOR on why that matters).
 */
const BOULDER_COLOR = 0x5b5f66;

/**
 * Woodland (see Heightmap.forest). Read from above, a forest is canopy —
 * darker and denser than the turf around it — so it gets its own base
 * colour and its own, much denser weave rather than a tint of grass.
 * Being obviously distinct matters for play, not just looks: a forest is
 * fuel, and the player has to see at a glance what a fire would run
 * through.
 */
const FOREST_COLOR = GAME_PALETTE.grassDark;
const FOREST_SPECKLE_COLOR = 0x1e3a12;
/**
 * Paving (see Heightmap.road). Bare stone, deliberately the one surface on
 * the map with no colour of its own: a road is worth seeing at a glance
 * because of where it runs, not because it is pretty, and its real job —
 * being the line 毒カビ cannot cross — is only legible if the eye can
 * follow the whole run of it across whatever terrain it was laid on.
 */
const ROAD_COLOR = GAME_PALETTE.stoneLight;
const ROAD_SPECKLE_COLOR = GAME_PALETTE.stoneDark;
/**
 * Ground a 火柱 burned barren (see Heightmap.scorched). Ash: darker than
 * any terrain but not the near-black of a crevice, because a crevice is a
 * hole you fall into and this is ground you can still walk on — you just
 * cannot build on it until a 花 brings it back.
 */
const SCORCHED_COLOR = 0x2b2119;
const SCORCHED_SPECKLE_COLOR = 0x4a3a2c;
/**
 * 毒カビ (see Heightmap.fungus). The mana purple, which appears nowhere
 * else on the ground — rot has to be unmistakable at a glance, because
 * every tick a walker spends standing in it is fatal, and the player is
 * usually looking at the whole map rather than at their own feet.
 */
const FUNGUS_COLOR = GAME_PALETTE.manaAccent;
const FUNGUS_SPECKLE_COLOR = GAME_PALETTE.manaHighlight;

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
/**
 * The bands the map's cut side is painted in, from the rim downward — see
 * drawEdgeWall. `depth` is how far below that point's own surface the band
 * ends, in elevation units; the last band runs to sea level whatever is
 * left.
 *
 * Three, in the order the original's own floating slab shows them: a light
 * band right under the rim, browner ground below it, and near-black rock at
 * the bottom. Taken from GAME_PALETTE's soil family rather than new
 * literals — this is the same earth farmland is tinted with, seen edge-on.
 */
export const EDGE_STRATA: readonly { depth: number; color: number }[] = [
  { depth: 0.9, color: GAME_PALETTE.soilLight },
  { depth: 2.4, color: GAME_PALETTE.soilMid },
  { depth: Infinity, color: GAME_PALETTE.stoneShadow },
];

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
 * One frame of a simple pixel-art water animation — per plan/archived/0087's
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
    // highlight rather than filling half of each band — per plan/archived/0087's
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
/**
 * The turf pattern each kind of ground is woven from — see
 * patternTexture.ts's createTurfTexture.
 *
 * Three tones each, not two. The reference art's ground is a weave of light
 * and dark marks over a mid base; a two-tone speckle can only ever read as
 * noise on a flat colour, which is what this renderer's ground used to be.
 * Each kind keeps the colours it already had and gains the third from its
 * own family, so nothing changes hue here — only the surface it draws.
 */
const TURF_SPEC = {
  grass: { base: TERRAIN_COLOR.grass, grain: GAME_PALETTE.grassLight, counterGrain: GAME_PALETTE.grassDark, density: 0.26, markLength: 12 },
  desert: { base: TERRAIN_COLOR.desert, grain: GAME_PALETTE.soilLight, counterGrain: GAME_PALETTE.soilMid, density: 0.24, markLength: 14 },
  snow: { base: TERRAIN_COLOR.snow, grain: 0xffffff, counterGrain: GAME_PALETTE.stoneLight, density: 0.2, markLength: 16 },
  // Coarser and shorter: gravel is broken, not grown, so its marks read as
  // chips rather than blades — the "Grassより粗いpattern" the old
  // ROCK_DITHER_SIZE was after, expressed in the grain instead of the grid.
  rock: { base: TERRAIN_COLOR.rock, grain: GAME_PALETTE.stoneLight, counterGrain: GAME_PALETTE.stoneShadow, density: 0.3, markLength: 6 },
  forest: { base: FOREST_COLOR, grain: GAME_PALETTE.grassMid, counterGrain: FOREST_SPECKLE_COLOR, density: 0.42, markLength: 8 },
  // Laid stone: the marks run the length of the road, which is to say along
  // the tile grid, so a road reads as courses of paving rather than rubble.
  road: { base: ROAD_COLOR, grain: GAME_PALETTE.stoneHighlight, counterGrain: ROAD_SPECKLE_COLOR, density: 0.22, markLength: 20 },
  fungus: { base: FUNGUS_COLOR, grain: FUNGUS_SPECKLE_COLOR, counterGrain: 0x2a1140, density: 0.4, markLength: 5 },
  scorched: { base: SCORCHED_COLOR, grain: SCORCHED_SPECKLE_COLOR, counterGrain: 0x151009, density: 0.28, markLength: 7 },
} as const satisfies Record<string, TurfSpec>;

export type TurfKind = keyof typeof TURF_SPEC;

/**
 * One repeat of a turf texture is exactly one tile.
 *
 * Tile origins land on multiples of (TILE_WIDTH/2, TILE_HEIGHT/2) in screen
 * space and ELEVATION_STEP is TILE_HEIGHT/2 as well, so with
 * textureSpace: "global" every tile at every whole elevation samples this
 * repeat at one of four phases — the weave belongs to the grid rather than
 * sliding across it, and those four phases are what keep neighbouring
 * cells from all looking identical.
 */
const TURF_WIDTH = TILE_WIDTH;
const TURF_HEIGHT = TILE_HEIGHT;

/**
 * How finely a face's brightness is quantized before it picks a turf
 * texture — see turfFill.
 *
 * Ground is textured at every angle now, and a texture cannot be tinted
 * toward white by a multiply the way shadeColor tints a plain colour, so
 * each shade is a pre-shaded texture of its own, built on first use and
 * cached. Quantizing is what keeps that a couple of dozen textures rather
 * than one per distinct slope on the map; at this step size two adjacent
 * buckets differ by about one 8-bit level on a mid tone, which is below
 * what a seam would show.
 */
const TURF_SHADE_STEPS = 24;

/**
 * How much one elevation step lightens the ground it covers.
 *
 * Without this the map does not show height at all. Shading here is
 * Lambert (see faceBrightnessOf): it reads a face's *slope*, and
 * fillTerrainQuad gives every flat tile a brightness of exactly 1 — so a
 * plateau at elevation 2 and a plateau at elevation 7 are drawn
 * **pixel-identical**, and in an isometric view the only remaining cue,
 * vertical screen position, is indistinguishable from depth. Per feedback:
 * 「高度が読み取りにくいです。上なのか下なのか分かりにくいので、平坦に
 * するためには上げたら良いのか下げたら良いのかがわからない」.
 *
 * Lighter is higher, which is the language the world map already speaks
 * (see Minimap's terrainColorAt, 「高さを4段階の明暗に量子化」 per
 * plan/archived/0087) — the two views should not disagree about which way
 * is up. The original's own players read heights as countable steps
 * (「1段まで下げたほうが」「3段以上の土地」 in the walkthrough), so the
 * information is meant to be on the map.
 *
 * Deliberately smaller than the slope range (MAX_SLOPE_DARKEN /
 * MAX_SLOPE_LIGHTEN): on a slope the Lambert term dominates and should,
 * because there the shape is already visible. This is for the flats, where
 * there is currently no signal whatsoever.
 */
const HEIGHT_TINT_PER_STEP = 0.08;

/**
 * Ceiling on that tint. Placed so the whole band createHeightmap actually
 * generates (0〜7) stays strictly monotonic — every step in it is a step
 * you can see — and only ground raised past that, a mountain or a
 * volcano's 20, saturates rather than blowing out to white. Terrain that
 * high is steep terrain, where the Lambert term is already doing the work.
 * The clamp's other end is never reached: MIN_ELEVATION is 0, which sits
 * inside it.
 */
const MAX_HEIGHT_TINT = 0.32;

/**
 * The elevation that reads as neutral, i.e. exactly the terrain's own
 * colour — the median of what createHeightmap generates (0〜7, median 3).
 * Fixed rather than tracking waterLevel: "lighter is higher" is only worth
 * learning if it means the same thing all match, and a flood would
 * otherwise silently repaint every hill the player had already read.
 */
const HEIGHT_TINT_MIDPOINT = 3;

/** See HEIGHT_TINT_PER_STEP. Exported so the shading test can hold the rule. */
export function heightTint(elevation: number): number {
  const offset = (elevation - HEIGHT_TINT_MIDPOINT) * HEIGHT_TINT_PER_STEP;
  return 1 + Math.max(-MAX_HEIGHT_TINT, Math.min(MAX_HEIGHT_TINT, offset));
}

const turfFills = new Map<string, { texture: Texture; textureSpace: "global" }>();

/**
 * The turf fill for one kind of ground at one brightness — see
 * TURF_SHADE_STEPS for why this is a cache of pre-shaded textures rather
 * than one texture and a tint.
 */
export function turfFillFor(kind: TurfKind, brightness: number): { texture: Texture; textureSpace: "global" } {
  const bucket = Math.round(brightness * TURF_SHADE_STEPS);
  const key = `${kind}:${bucket}`;
  const cached = turfFills.get(key);
  if (cached) return cached;

  const shade = bucket / TURF_SHADE_STEPS;
  const spec = TURF_SPEC[kind];
  const fill = {
    texture: createTurfTexture(TURF_WIDTH, TURF_HEIGHT, {
      ...spec,
      base: shadeColor(spec.base, shade),
      grain: shadeColor(spec.grain, shade),
      counterGrain: shadeColor(spec.counterGrain, shade),
    }),
    textureSpace: "global" as const,
  };
  turfFills.set(key, fill);
  return fill;
}

/**
 * What is on top of a tile's ordinary terrain, if anything — see
 * redraw()'s own precedence and fillTerrainQuad. Only surfaces that
 * are still *ground* (walkable, shaded and dithered like terrain) belong
 * here; water, rock and crevices replace the ground entirely and are
 * handled by hasOwnColor instead.
 */
type GroundSurface = "terrain" | "forest" | "road" | "fungus" | "scorched";

const SURFACE_COLOR: Record<Exclude<GroundSurface, "terrain">, number> = {
  forest: FOREST_COLOR,
  road: ROAD_COLOR,
  fungus: FUNGUS_COLOR,
  scorched: SCORCHED_COLOR,
};

/** Size (px) of one repeat of the water wave texture — see createWaveTexture. */
const WATER_WAVE_SIZE = 16;
const WATER_WAVE_COLOR = lerpColor(WATER_COLOR, 0xffffff, 0.35);
/** How many distinct animation frames the water cycles through — see WATER_FRAMES/waterFrameIndex. */
const WATER_FRAME_COUNT = 3;
/** Frames per second the water animation advances — slow and gentle, per plan/archived/0087's "動いて見える" rather than a fast realistic ripple. */
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
 * from how much rockHardness is left above `coldHardness`, gently pulsing
 * over time like real embers rather than sitting at a flat brightness.
 * Pulled out as a pure function so both the hardness falloff and the pulse
 * are unit-testable without a Graphics/canvas context.
 *
 * `coldHardness` is the hardness at which stone is simply stone. It
 * defaults to REEF_HARDNESS because that is exactly what a 岩礁 is: rock
 * standing in the sea, made — per the original — by 「海底火山を噴火させ」,
 * but standing there cold. Reefs set rockHardness like a volcano flow
 * does, so without a floor they glowed like one: a player's own breakwater
 * came out of the water looking like molten lava, indistinguishable at a
 * glance from an enemy volcano. The dark volcanic stone is right for a
 * reef; the fire is not.
 *
 * A volcano cooling to that same hardness stops glowing too, which is the
 * same statement read the other way: rock glows only while it is hotter
 * than a reef.
 */
export function volcanoGlowIntensity(
  hardness: number,
  maxHardness: number,
  elapsedTime: number,
  phaseSeed: number,
  coldHardness: number = REEF_HARDNESS,
): number {
  const range = maxHardness - coldHardness;
  const base = range > 0 ? Math.max(0, Math.min(1, (hardness - coldHardness) / range)) : 0;
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
 * (see plan/archived/0062-original-scale-map.md), the same technical constraint the
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
 * plan/archived/0063-visibility-gated-casting.md.
 */
export function isWithinTileBounds(point: { x: number; y: number }, bounds: TileBounds): boolean {
  return (
    point.x >= bounds.minX && point.x <= bounds.maxX + 1 && point.y >= bounds.minY && point.y <= bounds.maxY + 1
  );
}

/**
 * Renders a heightmap as a true per-vertex isometric mesh: each tile is a
 * square using its own 4 corners' actual heights, so a height
 * difference between tiles reads as a continuous, shaded slope rather than
 * a flat block with a separate vertical cliff face — see redraw() and
 * LIGHT_DIRECTION's own doc comment for why (plan/0073-grass-cliff-
 * legibility.md's "追記" section, and plan/archived/0064-terraced-terrain.md for
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
   * screen (see plan/archived/0062-original-scale-map.md). Scoped to `bounds`
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
   * plan/archived/0065-tile-based-terraform.md). Same maxDistance semantics as
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
    const { width, height, rockHardness, forest, crevice, scorched, road, fungus, wall, boulder, waterLevel, terrain } = this.heightmap;
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
        const isCreviceTile = crevice[y][x] || crevice[y][x + 1] || crevice[y + 1][x + 1] || crevice[y + 1][x];
        const isWallTile = wall[y][x] || wall[y][x + 1] || wall[y + 1][x + 1] || wall[y + 1][x];
        const isBoulderTile = boulder[y][x] || boulder[y][x + 1] || boulder[y + 1][x + 1] || boulder[y + 1][x];
        // Woodland, paving and rot are all ordinary ground wearing a
        // different surface, so they lose to every kind of ground that is
        // *not* ordinary — a crevice torn through a forest is a hole, not
        // trees. Among themselves the danger wins: a vertex is never both
        // paved and rotten (see applyRoad), but a tile has four corners, so
        // a tile on the boundary can touch one of each, and the one worth
        // seeing there is the 毒カビ.
        const anyCorner = (layer: boolean[][]) =>
          layer[y][x] || layer[y][x + 1] || layer[y + 1][x + 1] || layer[y + 1][x];
        const isOrdinaryGround = !isCreviceTile && !isWater && !isRock && !isWallTile && !isBoulderTile;
        // Ash beats paving and canopy — both burned away when the pillar
        // crossed them — but loses to rot, which is the one that kills.
        const surface: GroundSurface = !isOrdinaryGround
          ? "terrain"
          : anyCorner(fungus)
            ? "fungus"
            : anyCorner(scorched)
              ? "scorched"
              : anyCorner(road)
                ? "road"
                : anyCorner(forest)
                  ? "forest"
                  : "terrain";
        // A wall loses only to the two things that destroy it (a crevice
        // torn under it, a flood risen over it) and to the lava that buries
        // it — everything below is ground it stands on rather than
        // something that replaces it.
        const baseColor = isCreviceTile
          ? CREVICE_COLOR
          : isWater
            ? WATER_COLOR
            : isRock
              ? VOLCANO_ROCK_COLOR
              : isBoulderTile
                ? BOULDER_COLOR
                : isWallTile
                  ? WALL_COLOR
                  : surface === "terrain"
                    ? TERRAIN_COLOR[terrain]
                    : SURFACE_COLOR[surface];

        if (isWater && !isCreviceTile) {
          // Water always reads as a single flat, unshaded plane — never a
          // sloped/shaded seabed showing through — at its own tile's
          // average depth, same as before this became a per-vertex mesh.
          // No stroke (see fillTerrainQuad's own doc comment on why):
          // a whole lake is one continuous color, so outlining every tile
          // seam would draw a visible grid across it for no reason. A
          // simple pixel wave animation (see WATER_FRAMES/waterFrameIndex)
          // replaces the old flat WATER_COLOR fill, per plan/archived/0087.
          const p0 = this.toScreen(x, y, avgElevation);
          const p1 = this.toScreen(x + 1, y, avgElevation);
          const p2 = this.toScreen(x + 1, y + 1, avgElevation);
          const p3 = this.toScreen(x, y + 1, avgElevation);
          graphics
            .poly([p0.sx, p0.sy, p1.sx, p1.sy, p2.sx, p2.sy, p3.sx, p3.sy])
            .fill(WATER_FRAMES[waterFrameIndex(this.elapsedTime)]);
        } else {
          // One square per map cell, the way the reference art's land grid
          // is built — see fillTerrainQuad for why this is not split into
          // triangles and how a saddle-shaped tile still gets a normal.
          const corners: [Vec3, Vec3, Vec3, Vec3] = [
            { x, y, z: h00 },
            { x: x + 1, y, z: h10 },
            { x: x + 1, y: y + 1, z: h11 },
            { x, y: y + 1, z: h01 },
          ];
          const hasOwnColor = isRock || isCreviceTile || isWallTile || isBoulderTile;
          this.fillTerrainQuad(graphics, corners, baseColor, terrain, hasOwnColor, surface);
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
   * Fills one terrain tile as a single square (`corners` in (x, y,
   * elevation) space, wound a -> b -> c -> d around the tile) with its
   * base color, tinted by the brightness of that square's own face — see
   * faceBrightnessOf and LIGHT_DIRECTION's own doc comment.
   *
   * One square, not two triangles. The reference art's land is a grid of
   * quads — one texture cell per map square, continuous across the cell —
   * and splitting each into a pair of independently-shaded triangles put a
   * seam down a diagonal that the original has nothing corresponding to.
   * On a saddle-shaped tile (all 4 corners at different heights) the two
   * halves took visibly different brightnesses, so the diagonal showed as
   * a crease; worse, *which* diagonal it fell along was an arbitrary
   * choice of this code, and every tile on the map made the same one — so
   * rough ground read with a faint corduroy grain running one way across
   * the whole world. Newell's method (see polygonNormal) gives such a tile
   * one area-weighted normal, so the square shades as the single surface
   * it is meant to be.
   *
   * Ground is textured at every angle (see TURF_SPEC/turfFill), which is
   * how the reference art draws it: there is no flat colour anywhere on
   * that land, only turf catching more or less light. This used to texture
   * *flat* tiles only and paint every slope a plain shaded colour, which
   * on ordinary rolling ground meant almost the whole map was flat colour
   * — the single biggest reason it read as polygons rather than as a
   * painted world.
   *
   * Flattening land is still visibly rewarded, which was the other job the
   * old flat-only dither did: level ground is the only ground that comes
   * out at its own unshaded tone, so a finished plot still reads as a
   * calm, bright patch against the shifting shades of the slopes around it
   * (the core "flatten to build" loop, see createHeightmap's own doc
   * comment). What it no longer does is change *surface* as well as tone.
   *
   * Deliberately no stroke on the tile's own outline: two adjacent tiles
   * that end up the exact same shaded color (the ordinary case on flat or
   * gently-sloped ground, since brightness is continuous) are meant to
   * read as one seamless surface. An outline on every tile regardless drew
   * a fine diamond-grid wireframe over the *entire* map — on real mobile
   * hardware, glaringly visible even over otherwise flat grass — per
   * feedback: "これじゃ視認性が悪すぎます、原作に可能な限り揃えてくだ
   * さい". The reference art itself never outlines a facet seam; only an
   * actual brightness change (a real slope or cliff) reads as an edge
   * there, exactly like this now does with the stroke gone.
   */
  private fillTerrainQuad(
    graphics: Graphics,
    corners: readonly [Vec3, Vec3, Vec3, Vec3],
    baseColor: number,
    terrain: Heightmap["terrain"],
    hasOwnColor: boolean,
    surface: GroundSurface = "terrain",
  ): void {
    const points: number[] = [];
    for (const corner of corners) {
      const projected = this.toScreen(corner.x, corner.y, corner.z);
      points.push(projected.sx, projected.sy);
    }
    const isFlat = corners.every((corner) => Math.abs(corner.z - corners[0].z) < FLAT_EPSILON);
    // Slope *and* height. The Lambert term alone says nothing about a flat
    // tile — see HEIGHT_TINT_PER_STEP, which is the whole reason the second
    // factor is here.
    const averageZ = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4;
    const brightness = (isFlat ? 1 : faceBrightnessOf(corners)) * heightTint(averageZ);

    // `hasOwnColor` marks the tiles that are not ordinary ground at all —
    // a crevice, a wall, a boulder, cooling lava rock. Those replace the
    // ground rather than growing on it, so they keep their own flat shaded
    // colour; turf would silently paint a freshly-torn crevice as grass (it
    // is carved dead flat to the floor, so it hits every "ordinary ground"
    // path there is).
    //
    // `surface` picks *which* turf ordinary ground is wearing — canopy,
    // paving, rot, or the terrain's own.
    const fill = hasOwnColor
      ? shadeColor(baseColor, brightness)
      : turfFillFor(surface === "terrain" ? terrain : surface, brightness);

    graphics.poly(points).fill(fill);
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
   *
   * The wall is painted as EDGE_STRATA — soil over subsoil over bedrock —
   * not as the surface's own color extruded downward. The original's world
   * is a slab floating in black space and its cut side plainly shows earth:
   * a light band hugging the rim, then browner ground, then near-black rock
   * at the bottom, whatever is growing on top. Extruding the surface color
   * gave a green field a green underside, i.e. a world made of grass all the
   * way down, and lost the one thing that reads as "this is a piece of land
   * lifted out of the ground".
   *
   * Bands are measured *down from each end's own top*, so they follow the
   * rim's contour the way real strata under a cut bank do, rather than
   * sitting at fixed world heights and slicing across a slope.
   */
  private drawEdgeWall(graphics: Graphics, edgeA: Vec3, edgeB: Vec3, _baseColor: number, outwardNormal: Vec3): void {
    if (Math.max(edgeA.z, edgeB.z) < FLAT_EPSILON) return; // already at/below sea level — nothing to drop down to

    const brightness = faceBrightness(outwardNormal);
    let above = 0;

    for (const band of EDGE_STRATA) {
      // Each end's own top and bottom for this band, clamped at sea level:
      // a shallow corner runs out of depth before a tall one does, and the
      // band simply pinches shut there.
      const topZA = Math.max(0, edgeA.z - above);
      const topZB = Math.max(0, edgeB.z - above);
      const bottomZA = Math.max(0, edgeA.z - band.depth);
      const bottomZB = Math.max(0, edgeB.z - band.depth);
      above = band.depth;

      if (topZA - bottomZA < FLAT_EPSILON && topZB - bottomZB < FLAT_EPSILON) continue;

      const topA = this.toScreen(edgeA.x, edgeA.y, topZA);
      const topB = this.toScreen(edgeB.x, edgeB.y, topZB);
      const bottomB = this.toScreen(edgeB.x, edgeB.y, bottomZB);
      const bottomA = this.toScreen(edgeA.x, edgeA.y, bottomZA);

      graphics
        .poly([topA.sx, topA.sy, topB.sx, topB.sy, bottomB.sx, bottomB.sy, bottomA.sx, bottomA.sy])
        .fill(shadeColor(band.color, brightness));
    }
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
