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
  return { width, height, terrain, vertices, rockHardness, waterLevel: MIN_ELEVATION };
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
  return sampleElevation(heightmap, x, y) > heightmap.waterLevel && !isRock(heightmap, x, y);
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
export const DEFAULT_EARTHQUAKE_RADIUS = 2;
export const DEFAULT_EARTHQUAKE_MAX_DELTA = 4;

/**
 * Randomly heaves or drops every vertex within `radius` of (centerX,
 * centerY), each by an independent delta in [-maxDelta, maxDelta] —
 * docs/game-system.md's "対象範囲の地形をランダムに隆起・陥没させ、
 * 平地を壊す". Breaking up flat land this way is what makes earthquake
 * useful against enemy settlements: createHouseUpgradeSystem reacts to
 * the resulting drop in flatness by downgrading houses caught in it.
 */
export function applyEarthquake(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_EARTHQUAKE_RADIUS,
  maxDelta: number = DEFAULT_EARTHQUAKE_MAX_DELTA,
  rng: () => number = Math.random,
): void {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      const delta = Math.round((rng() * 2 - 1) * maxDelta);
      raiseVertex(heightmap, vx, vy, delta);
    }
  }
}

/** Radius (in vertices) and rock hardness of a default volcano. */
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

/** How much a single flood cast raises the sea level. */
export const DEFAULT_FLOOD_AMOUNT = 1;

/**
 * How much a single flood cast cools every existing volcanic rock vertex
 * on the map, map-wide — see applyFlood's doc comment on why this exists.
 * Matches what one raiseVertex hit chips off a single vertex, so a flood
 * is worth roughly "one terraforming click on every rock tile at once".
 */
export const FLOOD_ROCK_COOLING = 1;

/**
 * Permanently raises the sea level — docs/game-system.md's 洪水,
 * "海面を1段上昇させる". Cumulative: casting it again raises it further.
 * Clamped to MAX_ELEVATION (an all-water map). Doesn't touch `vertices`
 * or evict anyone standing on newly-submerged ground itself — see
 * game/flood.ts's drownFlood for that.
 *
 * Also a combo with 火山: every existing rockHardness vertex cools by
 * FLOOD_ROCK_COOLING, map-wide. A literal "lava submerged by the rising
 * sea" trigger would almost never fire in practice — volcano vertices sit
 * at MAX_ELEVATION (see applyVolcano) while a single flood only raises
 * water by DEFAULT_FLOOD_AMOUNT, so actually drowning a peak would take
 * dozens of casts — so this instead treats the whole rising water table
 * as giving every raging volcano on the map a meaningful shove toward
 * recovering (see raiseVertex's own rockHardness chipping), rather than
 * being a mechanic nobody can ever actually trigger.
 */
export function applyFlood(heightmap: Heightmap, amount: number = DEFAULT_FLOOD_AMOUNT): void {
  heightmap.waterLevel = Math.min(MAX_ELEVATION, heightmap.waterLevel + amount);

  for (const row of heightmap.rockHardness) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] > 0) row[x] = Math.max(0, row[x] - FLOOD_ROCK_COOLING);
    }
  }
}
