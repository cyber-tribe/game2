export type TerrainType = "grass" | "desert" | "snow" | "rock";

export interface Heightmap {
  width: number;
  height: number;
  terrain: TerrainType;
  /** Vertex heights, indexed [y][x], size (height+1) x (width+1). */
  vertices: number[][];
  /**
   * How much longer a vertex stays impassable rock (from a volcano),
   * indexed like `vertices`. 0 means ordinary ground. Chipped away by
   * raiseVertex — see docs/game-system.md's 火山, "復旧には大量の地形
   * 操作が必要".
   */
  rockHardness: number[][];
  /**
   * Per-vertex: is this a crevice torn open by an earthquake?
   *
   * Separate from elevation on purpose. A crevice is not merely low ground
   * — the original's 地震 (docs/original-miracles.md #13) opens a fissure
   * that kills anyone who falls in and stays until it is repaired, and a
   * later 花 will close it while ヘラクレス walks over it unharmed. None of
   * that is expressible as "this vertex is at elevation 0"; low ground is
   * something walkers stand on quite happily.
   */
  crevice: boolean[][];
  /**
   * Current sea level — starts at MIN_ELEVATION and only ever rises, via
   * applyFlood. Anything at or below it is water, per docs/game-system.md's
   * 洪水, "海面を1段上昇させる".
   */
  waterLevel: number;
}

/** Elevation is clamped to this range — 0 is sea level. */
export const MIN_ELEVATION = 0;
export const MAX_ELEVATION = 20;

/**
 * Simple smooth pseudo-random heightmap for prototyping the renderer.
 * Real terrain generation belongs to a later worldgen step.
 *
 * The wave's frequencies are deliberately high relative to
 * HOUSE_UPGRADE_FLATNESS_RADIUS's 5x5 window: at the original, much lower
 * frequencies (0.35/0.3/0.15), the terrain changed so slowly from vertex to
 * vertex that rounding alone left large naturally-flat plateaus — on a
 * fresh 20x20 map, about 15% of vertices already qualified for a "castle"
 * house's flatness requirement and 95%+ for "lodge", with zero player
 * terraforming. That let a match's population/mana explode within under a
 * minute (see plan/0043-terrain-roughness.md) since the core "flatten your
 * land to grow a house" loop was already done by worldgen. At these
 * frequencies a fresh map has ~0% castle-ready and single-digit %
 * manor-ready vertices — reaching those tiers again requires actually
 * terraforming.
 *
 * The amplitudes were trimmed down from the original 1.5/1.5/2 (see
 * plan/0073-grass-cliff-legibility.md) once fixing that renderer's cliff
 * legibility bug made this same wave's true roughness visible for the
 * first time: at the original amplitude, 18% of all adjacent vertex pairs
 * differed by 3 or more units, rendering as a wall of cliffs almost
 * everywhere — nothing like the reference game's mostly-flat plains with
 * occasional drops. Trimmed to 1.2/1.2/1.6, adjacent 3+-unit steps drop to
 * under 7% while keeping castle-flatness at 0% (manor rises modestly, from
 * 2.5% to ~6% — still a small minority, and still far from the "manor
 * nearly free" territory the frequency change above was fixing).
 */
export function createHeightmap(
  width: number,
  height: number,
  terrain: TerrainType = "grass",
): Heightmap {
  const vertices: number[][] = [];
  const rockHardness: number[][] = [];
  for (let y = 0; y <= height; y++) {
    const row: number[] = [];
    for (let x = 0; x <= width; x++) {
      const wave =
        Math.sin(x * 1.3) * 1.2 +
        Math.cos(y * 1.1) * 1.2 +
        Math.sin((x - y) * 0.9) * 1.6;
      row.push(Math.max(0, Math.round(wave + 3)));
    }
    vertices.push(row);
    rockHardness.push(new Array(width + 1).fill(0));
  }
  const crevice = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  return { width, height, terrain, vertices, rockHardness, crevice, waterLevel: MIN_ELEVATION };
}

/**
 * A per-match restriction on which direction raiseVertex may be called in —
 * per docs/game-system.md's "各ワールドは地形タイプ・初期配置...使用可能
 * な奇跡の制限などが異なり": a stage-shaped rule variation on top of the
 * random terrain type, rather than every match offering the exact same
 * "raise or lower, your choice" terraforming. "both" is the ordinary case;
 * "raiseOnly"/"lowerOnly" force a match to only ever level land by raising
 * the lower ground up (or lowering the higher ground down) to match its
 * surroundings — still fully capable of flattening land (docs/game-
 * system.md's core loop), just constrained to one direction. See
 * isTerrainEditAllowed, which both the player's own taps and
 * enemyTerraform.ts's AI are gated through equally ("敵の神はプレイヤーと
 * 同じルールで介入する").
 */
export type TerrainEditRule = "both" | "raiseOnly" | "lowerOnly";

/** Whether raiseVertex(..., delta) is permitted under `rule` — see TerrainEditRule. */
export function isTerrainEditAllowed(rule: TerrainEditRule, delta: number): boolean {
  if (rule === "raiseOnly") return delta > 0;
  if (rule === "lowerOnly") return delta < 0;
  return true;
}

/**
 * Weighted-random pick of one TerrainEditRule for a fresh match — see
 * game/constants.ts's TERRAIN_EDIT_RULE_WEIGHTS, main.ts's only caller.
 * `rng` is injectable (in [0, 1), defaults to Math.random) for
 * deterministic tests.
 */
export function pickTerrainEditRule(
  weights: Record<TerrainEditRule, number>,
  rng: () => number = Math.random,
): TerrainEditRule {
  const entries = Object.entries(weights) as [TerrainEditRule, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);

  let roll = rng() * total;
  for (const [rule, weight] of entries) {
    if (roll < weight) return rule;
    roll -= weight;
  }
  return entries[entries.length - 1][0];
}

/**
 * Raises (positive delta) or lowers (negative delta) a single vertex,
 * clamped to [MIN_ELEVATION, MAX_ELEVATION]. Mutates the heightmap in
 * place — per docs/game-system.md this is the most basic divine power,
 * meant to be called once per player click, not per frame. Does not itself
 * check TerrainEditRule — callers (main.ts's applyTool, enemyTerraform.ts)
 * are expected to have already gated the call through isTerrainEditAllowed.
 */
export function raiseVertex(heightmap: Heightmap, x: number, y: number, delta: number): void {
  const row = heightmap.vertices[y];
  if (!row || row[x] === undefined) return;
  row[x] = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, row[x] + delta));

  const hardnessRow = heightmap.rockHardness[y];
  if (hardnessRow[x] > 0) hardnessRow[x] -= 1;
  // Filling a fissure back in closes it. The original has 花 (#7) for
  // repairing torn ground and this will move there when that exists; until
  // then, terraforming is the only repair the game has, and a crevice
  // nothing can ever close would be a permanent hole in the map.
  if (heightmap.crevice[y][x] && heightmap.vertices[y][x] > MIN_ELEVATION) heightmap.crevice[y][x] = false;
}

/**
 * Raises/lowers an entire tile (all 4 corner vertices) by the same delta —
 * the player's basic terraforming tool now edits a whole tile face at once
 * rather than a single corner point, per the original game's tile-based
 * land-raising (see plan/0065-tile-based-terraform.md). Each corner is
 * still clamped and chips rockHardness independently via raiseVertex, so a
 * tile straddling MAX_ELEVATION or partly-cooled volcano rock behaves the
 * same as 4 individual taps would.
 */
export function raiseTile(heightmap: Heightmap, tileX: number, tileY: number, delta: number): void {
  raiseVertex(heightmap, tileX, tileY, delta);
  raiseVertex(heightmap, tileX + 1, tileY, delta);
  raiseVertex(heightmap, tileX + 1, tileY + 1, delta);
  raiseVertex(heightmap, tileX, tileY + 1, delta);
}

/**
 * Sets a whole tile's 4 corners as close to `elevation` as `rule` allows
 * (clamped to [MIN_ELEVATION, MAX_ELEVATION]) — the "平坦化" tool's basic
 * operation (main.ts), for leveling a bumpy plot in one action instead of
 * raiseTile's repeated +1/-1 nudges, which fight over corners shared with
 * every neighboring tile and rarely converge on a clean flat plot by hand
 * (per feedback: "平地が作りたくてもうまく作れない"). Under a restricted
 * rule, a corner that would need the forbidden direction to reach
 * `elevation` is left untouched rather than moved — per TerrainEditRule's
 * own doc comment, raiseOnly/lowerOnly stay "still fully capable of
 * flattening land ... just constrained to one direction": main.ts picks
 * `elevation` as that direction's own natural target (the tile's highest
 * corner under raiseOnly, lowest under lowerOnly), so an ordinary tile
 * still fully levels in one call despite the restriction. Doesn't touch
 * rockHardness — this is a land-shaping tool, not a way to cool volcano
 * rock (see raiseVertex for that).
 */
export function flattenTile(heightmap: Heightmap, tileX: number, tileY: number, elevation: number, rule: TerrainEditRule): void {
  const clamped = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation));
  const corners: [number, number][] = [
    [tileX, tileY],
    [tileX + 1, tileY],
    [tileX + 1, tileY + 1],
    [tileX, tileY + 1],
  ];

  for (const [x, y] of corners) {
    const row = heightmap.vertices[y];
    if (!row || row[x] === undefined) continue;
    const delta = clamped - row[x];
    if (delta !== 0 && isTerrainEditAllowed(rule, delta)) row[x] = clamped;
  }
}

/**
 * Bilinearly interpolated elevation at a fractional tile-space point,
 * clamped to the grid. Shared by the renderer (to place things on the
 * surface) and by game logic (to decide what's dry land).
 */
export function sampleElevation(heightmap: Heightmap, x: number, y: number): number {
  const { width, height, vertices } = heightmap;
  const cx = Math.min(Math.max(x, 0), width);
  const cy = Math.min(Math.max(y, 0), height);
  const x0 = Math.min(Math.floor(cx), width - 1);
  const y0 = Math.min(Math.floor(cy), height - 1);
  const tx = cx - x0;
  const ty = cy - y0;

  const h00 = vertices[y0][x0];
  const h10 = vertices[y0][x0 + 1];
  const h01 = vertices[y0 + 1][x0];
  const h11 = vertices[y0 + 1][x0 + 1];

  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * ty;
}

/** True if the vertex nearest (x, y) is volcano rock — see applyVolcano. */
export function isRock(heightmap: Heightmap, x: number, y: number): boolean {
  const cx = Math.round(Math.min(Math.max(x, 0), heightmap.width));
  const cy = Math.round(Math.min(Math.max(y, 0), heightmap.height));
  return heightmap.rockHardness[cy][cx] > 0;
}

/**
 * Sea level and below can't be built on or safely settled — per
 * docs/game-system.md, "海には建物を建てられず、通常の民は入ると溺れる".
 * Sea level is `heightmap.waterLevel`, which starts at MIN_ELEVATION but
 * can rise (see applyFlood). Volcano rock can't be built on either, per
 * "岩の上には建築できない".
 */
export function isBuildable(heightmap: Heightmap, x: number, y: number): boolean {
  return sampleElevation(heightmap, x, y) > heightmap.waterLevel && !isRock(heightmap, x, y) && !isCrevice(heightmap, x, y);
}

/** Whether the vertex nearest (x, y) is a crevice — see Heightmap.crevice and applyEarthquake. */
export function isCrevice(heightmap: Heightmap, x: number, y: number): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  return heightmap.crevice[vy][vx];
}

/** Whether tile (tileX, tileY) itself — not just one corner — sits at/below sea level, same test IsoRenderer's redraw() uses to pick a water tile's fill. */
function isWaterTile(heightmap: Heightmap, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= heightmap.width || tileY >= heightmap.height) return false;
  return sampleElevation(heightmap, tileX + 0.5, tileY + 0.5) <= heightmap.waterLevel;
}

/**
 * Whether the tile containing (x, y) is part of a genuine 2x2-or-larger
 * body of water — checked as any of the 4 axis-aligned 2x2 tile blocks
 * that include this tile being entirely underwater (isWaterTile), rather
 * than treating a single half-submerged tile at a shoreline as equally
 * dangerous. Per feedback: "4マス水が正方形になるとその中にいる人は
 * 溺れる" ("once 4 tiles form a square of water, whoever's inside
 * drowns") — see systems/drowning.ts, the one caller, for what actually
 * happens to a walker caught in one.
 */
export function isInWaterPool(heightmap: Heightmap, x: number, y: number): boolean {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  for (const [dx, dy] of [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ] as const) {
    const bx = tileX + dx;
    const by = tileY + dy;
    if (isWaterTile(heightmap, bx, by) && isWaterTile(heightmap, bx + 1, by) && isWaterTile(heightmap, bx, by + 1) && isWaterTile(heightmap, bx + 1, by + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * How many vertices within `radius` of the vertex nearest (x, y) share its
 * exact height — a proxy for "how much flat land surrounds this point".
 * Used to decide whether a house's surroundings are flat enough to
 * support a bigger building, per docs/game-system.md's "周囲の地形を
 * さらに平らにすると自動でアップグレードされる".
 */
export function countFlatNeighbors(heightmap: Heightmap, x: number, y: number, radius: number): number {
  const { width, height, vertices } = heightmap;
  const cx = Math.round(Math.min(Math.max(x, 0), width));
  const cy = Math.round(Math.min(Math.max(y, 0), height));
  const centerHeight = vertices[cy][cx];

  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > height) continue;
    const row = vertices[vy];
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > width) continue;
      if (row[vx] === centerHeight) count++;
    }
  }
  return count;
}

/**
 * Finds the vertex within `radius` of the vertex nearest (x, y) whose
 * height differs most from that center vertex, plus the one-step delta
 * (+1/-1) that would move it toward matching. Returns null once the whole
 * neighborhood is already flat. This is countFlatNeighbors' complement:
 * where that measures "how flat is it", this picks the single edit that
 * flattens it the most — used to let the enemy AI terraform around its
 * own houses the same way a player's taps do (see
 * game/systems/enemyTerraform.ts).
 */
export function findLeastFlatVertex(
  heightmap: Heightmap,
  x: number,
  y: number,
  radius: number,
): { x: number; y: number; delta: -1 | 1 } | null {
  const { width, height, vertices } = heightmap;
  const cx = Math.round(Math.min(Math.max(x, 0), width));
  const cy = Math.round(Math.min(Math.max(y, 0), height));
  const centerHeight = vertices[cy][cx];

  let best: { x: number; y: number; delta: -1 | 1 } | null = null;
  let bestDiff = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > height) continue;
    const row = vertices[vy];
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > width) continue;
      const diff = row[vx] - centerHeight;
      if (Math.abs(diff) > Math.abs(bestDiff)) {
        bestDiff = diff;
        best = { x: vx, y: vy, delta: diff > 0 ? -1 : 1 };
      }
    }
  }

  return best;
}

/**
 * Radius (in vertices) and per-vertex height swing of a default
 * earthquake. Matches HOUSE_UPGRADE_FLATNESS_RADIUS (2) rather than
 * exceeding it: earthquake is meant as "中" tier economic disruption
 * (Populous's own earthquake softens up one settlement's land, it isn't
 * a top-tier wipe like volcano/flood/armageddon), so its footprint
 * shouldn't reach further than the flatness check it's meant to spoil.
 * Previously 3 (a 7x7 area) — comfortably wider than volcano's own
 * radius despite costing half as much, letting one cheap cast wreck
 * several houses' flatness at once.
 */
/** How many vertices long a crevice runs, before its own random wander. */
export const DEFAULT_EARTHQUAKE_LENGTH = 10;

/**
 * How far the crack may wander sideways from its nominal heading, per step,
 * in vertices. Zero would draw a ruler line; this is what makes it read as
 * ground tearing rather than a trench being dug.
 */
const EARTHQUAKE_WANDER = 0.3;

/**
 * Radius still used by callers that need "roughly how much ground an
 * earthquake disturbs" — the enemy AI's target picking and the swamp
 * collapse it triggers. The crevice itself is a line, not a disc, so this
 * is only ever an approximation of its footprint.
 */
export const DEFAULT_EARTHQUAKE_RADIUS = 2;

/**
 * The original's 地震 (docs/original-miracles.md #13): a long fissure torn
 * from a point in a chosen direction.
 *
 * This replaces a circular patch of random raise/lower. The original is
 * explicit that the direction is aimed — "方向はポインタで示される" — and
 * that what it leaves behind is a crevice that kills whoever falls in and
 * persists until repaired, not merely churned ground. Randomly nudging a
 * disc up and down gave neither: it had no direction to aim, and its only
 * lasting effect was to make the area briefly unflat.
 *
 * The crack is carved to MIN_ELEVATION and marked in `crevice`, which is
 * what makes it lethal (see systems/crevice.ts) and unbuildable (see
 * isBuildable). It wanders as it runs, so it reads as torn ground.
 */
export function applyEarthquake(
  heightmap: Heightmap,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  length: number = DEFAULT_EARTHQUAKE_LENGTH,
  rng: () => number = Math.random,
): void {
  const magnitude = Math.hypot(directionX, directionY);
  // A cast with no direction at all still has to do something rather than
  // silently no-op; east is as good as any other arbitrary choice.
  const stepX = magnitude === 0 ? 1 : directionX / magnitude;
  const stepY = magnitude === 0 ? 0 : directionY / magnitude;

  let x = originX;
  let y = originY;

  for (let step = 0; step < length; step++) {
    // Perpendicular wander, so the crack drifts off its heading without
    // ever doubling back along it.
    const wander = (rng() * 2 - 1) * EARTHQUAKE_WANDER;
    x += stepX + -stepY * wander;
    y += stepY + stepX * wander;

    const vx = Math.round(x);
    const vy = Math.round(y);
    if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return;

    // The centreline only. A tile renders as torn if any of its four
    // corners is, so one marked vertex already reads as a crack a couple of
    // tiles wide on screen; marking a second, perpendicular vertex per step
    // turned it into a black blob rather than a fissure. Lethality does not
    // need the extra width either — creviceSystem samples every tick, and a
    // walker crossing a one-vertex band is inside it for tens of ticks.
    tearCrevice(heightmap, vx, vy);
  }
}

function tearCrevice(heightmap: Heightmap, x: number, y: number): void {
  if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) return;
  heightmap.vertices[y][x] = MIN_ELEVATION;
  heightmap.crevice[y][x] = true;
}

export const DEFAULT_VOLCANO_RADIUS = 1;
export const VOLCANO_ROCK_HARDNESS = 20;

/** How far below MAX_ELEVATION (the crater rim) applyVolcano's own crater floor and outer slope sit — see its doc comment. */
export const VOLCANO_CRATER_DEPTH = 3;
export const VOLCANO_OUTER_DROP = 6;

/**
 * Heaves the footprint within `radius` of (centerX, centerY) into a real
 * cone-with-crater shape and covers it in rock — docs/game-system.md's
 * "対象地点を高く隆起させ、岩石で覆う", refined per plan/0087's "外側：
 * 低い→中間：高い→火口縁：さらに高い→中央：少し低い": the ring exactly
 * `radius` vertices out (the crater rim) sits at MAX_ELEVATION, the exact
 * center dips VOLCANO_CRATER_DEPTH below that (the crater floor — still a
 * genuine peak versus the surroundings, just lower than its own rim), and
 * anything further out but still inside the square footprint (radius=1's
 * diagonal corners, since the loop below is a Chebyshev/square footprint —
 * see volcano.ts's own doc comment) sits VOLCANO_OUTER_DROP below the rim,
 * i.e. the cone's outer slope. At radius 0 there's no rim to speak of, so
 * the single affected vertex is just a bare peak at MAX_ELEVATION, same as
 * before this shape existed. Unlike an earthquake this is deterministic
 * and one-directional: it always builds a peak, never a pit. The rock
 * makes the area unbuildable (see isBuildable) until enough later
 * raiseVertex calls chip its hardness down to 0 — "復旧には大量の地形
 * 操作が必要".
 */
export function applyVolcano(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_VOLCANO_RADIUS,
  hardness: number = VOLCANO_ROCK_HARDNESS,
): void {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      const distance = Math.hypot(dx, dy);
      const elevation =
        distance < 0.5
          ? radius >= 1
            ? MAX_ELEVATION - VOLCANO_CRATER_DEPTH
            : MAX_ELEVATION
          : distance <= radius + 0.01
            ? MAX_ELEVATION
            : MAX_ELEVATION - VOLCANO_OUTER_DROP;
      heightmap.vertices[vy][vx] = elevation;
      heightmap.rockHardness[vy][vx] = hardness;
    }
  }
}


/**
 * How far a tsunami reaches from its origin, in vertices.
 *
 * Measured against a real map rather than picked: at radius 8 a cast took
 * roughly 30 vertices of a 64x64 world — a patch a few tiles across, for
 * the second-priciest miracle in the game. At 12 it erases a settlement's
 * worth of low ground, which is the weight the mana cost is asking for.
 */
export const DEFAULT_TSUNAMI_RADIUS = 12;
/**
 * How far above sea level the wave stands at its origin. Land higher than
 * this is never touched, however close it is — the original's "高い土地は
 * 影響を受けない".
 *
 * Calibrated against the terrain createHeightmap actually produces, not
 * against the 0-20 elevation range in the abstract: a fresh map runs 0-7
 * with a median of 3, so at height 3 a tsunami reached 16 vertices of a
 * 64x64 map and was invisible in play. At 5 it takes the ordinary low
 * ground of its target area and leaves the peaks — which is the shape the
 * miracle is supposed to have.
 */
export const DEFAULT_TSUNAMI_HEIGHT = 5;

/** Height of the reef applyReef leaves above sea level. */
export const REEF_HEIGHT = 1;
/**
 * A reef's rock hardness. Lower than VOLCANO_ROCK_HARDNESS: a reef is a
 * breakwater the player is expected to build and later clear, not the
 * long-term land denial a volcano is.
 */
export const REEF_HARDNESS = 6;

/**
 * The wave's height at `distance` from its origin — full height at the
 * center, tapering to nothing at the rim.
 */
function tsunamiHeightAt(distance: number, radius: number, height: number): number {
  if (distance >= radius) return 0;
  return height * (1 - distance / radius);
}

/**
 * The original's 津波 (docs/original-miracles.md #29): a wave spreading
 * outward from one point, drowning and eroding low ground while leaving
 * high ground alone.
 *
 * This replaces applyFlood, which raised `waterLevel` for the whole world
 * by one step. That was the single most un-original miracle game2 had: a
 * global sea-level change cannot be defended against, cannot be aimed, and
 * hurts the caster exactly as much as the target, so there was no play in
 * it at all. A tsunami is a *directed* attack with two defences the player
 * can actually build — high ground and reefs — which is what makes it a
 * move rather than a coin flip.
 *
 * Land within reach and standing below the wave's crest is eroded to sea
 * level ("低い土地を水没・侵食します"), which turns it to water. Sea level
 * itself never moves. Anything left standing on the newly-drowned ground
 * is swept away by game/flood.ts's drownFlood, exactly as before — it
 * tests against `waterLevel`, and eroded vertices now sit at it.
 */
export function applyTsunami(
  heightmap: Heightmap,
  originX: number,
  originY: number,
  radius: number = DEFAULT_TSUNAMI_RADIUS,
  height: number = DEFAULT_TSUNAMI_HEIGHT,
): void {
  const ox = Math.round(originX);
  const oy = Math.round(originY);
  if (ox < 0 || oy < 0 || ox > heightmap.width || oy > heightmap.height) return;

  // A spreading wavefront, not a stamped circle. The difference is what
  // makes a barrier mean anything: water flows *around* an obstacle and is
  // stopped only by one that actually separates it from the ground behind.
  //
  // An earlier version tested each vertex independently, with a
  // line-of-sight check back to the origin. On real terrain (createHeightmap
  // produces a bumpy 0-7 range) every isolated bump cast a straight shadow,
  // so the result was a scatter of unconnected puddles rather than an
  // inundation — and a deliberate ridge, the thing the player is supposed to
  // build, was worth no more than the noise around it.
  const flooded = new Set<number>();
  const key = (x: number, y: number) => y * (heightmap.width + 1) + x;
  const queue: [number, number][] = [[ox, oy]];
  const seen = new Set<number>([key(ox, oy)]);

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > heightmap.width || ny > heightmap.height) continue;
      if (seen.has(key(nx, ny))) continue;

      const distance = Math.hypot(nx - ox, ny - oy);
      if (distance > radius) continue;

      // Rock breaks the wave outright, whatever its height. The original
      // states plainly that a 岩礁 stops a tsunami, and a reef sits at sea
      // level by construction (see applyReef) — so if height alone decided,
      // a reef would only ever stop the weakest waves, which are exactly the
      // ones nobody needs defending against. Volcanic rock blocks too, which
      // is consistent: rock is rock.
      if (heightmap.rockHardness[ny][nx] > 0) continue;

      const crest = heightmap.waterLevel + tsunamiHeightAt(distance, radius, height);
      if (heightmap.vertices[ny][nx] > crest) continue;

      seen.add(key(nx, ny));
      flooded.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }

  if (heightmap.vertices[oy][ox] <= heightmap.waterLevel + height) flooded.add(key(ox, oy));

  for (const k of flooded) {
    heightmap.vertices[Math.floor(k / (heightmap.width + 1))][k % (heightmap.width + 1)] = heightmap.waterLevel;
  }
}

/**
 * The original's 岩礁 (docs/original-miracles.md #25): rock raised out of
 * the sea. Not buildable land — isBuildable rejects rock — but it stands
 * above the water, and so it stops a tsunami (see tsunamiReaches).
 *
 * Only meaningful on water: on dry land this would just be a small,
 * pointless volcano, so it refuses to place there.
 *
 * One reef is not a breakwater. applyTsunami spreads as a front and flows
 * around a partial barrier, so sheltering a coast means building a wall of
 * these across the wave's approach — which is why they are cheap
 * (REEF_MANA_COST). A single cast that switched off the enemy's most
 * expensive miracle would be the more boring mechanic.
 */
export function applyReef(heightmap: Heightmap, x: number, y: number, hardness: number = REEF_HARDNESS): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  if (heightmap.vertices[vy][vx] > heightmap.waterLevel) return false;

  heightmap.vertices[vy][vx] = Math.min(MAX_ELEVATION, heightmap.waterLevel + REEF_HEIGHT);
  heightmap.rockHardness[vy][vx] = hardness;
  return true;
}
