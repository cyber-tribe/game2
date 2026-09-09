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
   * Per-vertex: does woodland stand here?
   *
   * The original's 森 (docs/original-miracles.md #6) speeds the growth of
   * the people near it — and burns. Both halves matter: on its own a
   * forest is a modest economic buff, but it is also the fuel that turns
   * 火の雨 from a small circle into a firestorm, which is the first
   * interaction the original's design actually asks for.
   */
  forest: boolean[][];
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
   * Per-vertex: has fire burned this ground barren?
   *
   * The original's 火柱 (docs/original-miracles.md #21) 「地面を荒地化し」 —
   * a moving pillar of flame that leaves dead ground behind it. Kept as its
   * own layer rather than reusing rockHardness (a volcano's rock) because
   * the two are healed the same way but are not the same thing: rock is
   * chipped down by repeated terraforming, ash simply *is* barren until
   * something makes it live again (applyFlower).
   */
  scorched: boolean[][];
  /**
   * Per-vertex: is this ground paved?
   *
   * The original's 道 (docs/original-miracles.md #11) speeds the people who
   * walk on it — and, far more importantly, **stops 毒カビ from spreading
   * across it**. That second half is why a road is terrain rather than a
   * cosmetic overlay: it is the only piece of ground the fungus below
   * cannot cross, so paving a line ahead of an outbreak is a genuine act of
   * quarantine ("防疫としての地形制御", docs/original-miracles.md's own
   * interaction table).
   */
  road: boolean[][];
  /**
   * Per-vertex: is this ground rotting under 毒カビ?
   *
   * The original's 毒カビ (docs/original-miracles.md #9) is "増殖する沼に
   * 近い。複数設置すると大繁殖し建物や信者を飲み込む。自然消滅すること
   * もある" — so unlike every other layer here it changes on its own, tick
   * by tick, in both directions. See spreadFungus for the growth/withering
   * rule and systems/fungus.ts for what standing in it costs.
   */
  fungus: boolean[][];
  /**
   * Per-vertex: does a 城壁 stand here?
   *
   * The original's 城壁 (docs/original-miracles.md #12) is 「信者の進行を
   * 遮る壁。英雄以外は越えられない」 — the only piece of terrain in this
   * game whose whole purpose is to *not* be walked over. Every other layer
   * changes what standing somewhere costs; this one changes where walking
   * can go at all (see systems/movement.ts).
   *
   * A boolean rather than a height threshold even though applyWall also
   * raises the ground it stands on: elevation is what a wall *looks* like,
   * and steep ground has never stopped anyone in this game. Keeping the
   * barrier as its own layer is also what lets a crevice or a lava flow
   * cut a wall down (see tearCrevice/applyVolcano) by clearing one flag,
   * without having to remember what the ground under it used to be.
   */
  wall: boolean[][];
  /**
   * Per-vertex: has a 地下巨石 come up here?
   *
   * The original's #14 「発動地点を大きく隆起させ岩を発生。大規模建築の
   * 障害になり、海へ沈めるまで消えない」 — stone raised out of the ground
   * purely to deny it. Its own layer rather than more rockHardness (the
   * volcano's rock) because the two are not the same stone: lava rock
   * cools, glows while it does (see IsoRenderer's volcanoGlowIntensity)
   * and chips away under repeated terraforming, while a boulder is cold,
   * inert, and — per the original's own wording — goes away only when it
   * is put under the sea (see raiseVertex).
   */
  boulder: boolean[][];
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
 * minute (see plan/archived/0043-terrain-roughness.md) since the core "flatten your
 * land to grow a house" loop was already done by worldgen. At these
 * frequencies a fresh map has ~0% castle-ready and single-digit %
 * manor-ready vertices — reaching those tiers again requires actually
 * terraforming.
 *
 * The amplitudes were trimmed down from the original 1.5/1.5/2 (see
 * plan/archived/0073-grass-cliff-legibility.md) once fixing that renderer's cliff
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
  const forest = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  const crevice = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  const scorched = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  const road = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  const fungus = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  const wall = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  const boulder = Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
  return { width, height, terrain, vertices, rockHardness, forest, crevice, scorched, road, fungus, wall, boulder, waterLevel: MIN_ELEVATION };
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
export type TerrainEditRule = "both" | "raiseOnly" | "lowerOnly" | "neither";

/**
 * Whether raiseVertex(..., delta) is permitted under `rule` — see
 * TerrainEditRule.
 *
 * The original has all three restricted kinds: 「土地上げ不可ステージ」,
 * 「土地下げ不可ステージ」 and 「土地上下不可ステージ」. The last one takes
 * the game's basic verb away entirely, and the article says plainly what
 * is left when it does: 「よって神業で敵の住める土地をゼロにすることに
 * なる」. You still build on the flat ground you were given, and everything
 * else has to be a miracle.
 */
export function isTerrainEditAllowed(rule: TerrainEditRule, delta: number): boolean {
  if (rule === "raiseOnly") return delta > 0;
  if (rule === "lowerOnly") return delta < 0;
  if (rule === "neither") return false;
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
  // 「城壁にかかる土地上下ができなくなる」. A wall pins the ground it stands
  // on: the barrier is the point of the miracle, and land you could simply
  // lower out from under it would not be one. It is also the only way to
  // spend a cheap 城壁 to deny an opponent's terraforming, which is what
  // makes it worth casting at all (the original calls it hard to use).
  if (heightmap.wall[y][x]) return;
  row[x] = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, row[x] + delta));

  const hardnessRow = heightmap.rockHardness[y];
  if (hardnessRow[x] > 0) hardnessRow[x] -= 1;
  // 「海へ沈めるまで消えない」 (docs/original-miracles.md #14), read
  // literally: a 地下巨石 is not chipped away like lava rock, however long
  // you dig at it — it is gone the moment the ground it stands on is under
  // the sea, and not one tap before. That is the whole cost of casting it
  // on someone's land: they cannot level it, they have to drown it, and
  // what they get back is water rather than the plain they wanted.
  if (heightmap.boulder[y][x] && row[x] <= heightmap.waterLevel) heightmap.boulder[y][x] = false;
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
 * land-raising (see plan/archived/0065-tile-based-terraform.md). Each corner is
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
    if (delta === 0 || !isTerrainEditAllowed(rule, delta)) continue;
    row[x] = clamped;
    // Same rule as raiseVertex: a 地下巨石 whose ground ends up under the
    // sea is gone. Levelling a plot down into the water has to remove it
    // for the same reason digging does, or which tool the player reached
    // for would decide whether the stone was destructible.
    if (heightmap.boulder[y][x] && row[x] <= heightmap.waterLevel) heightmap.boulder[y][x] = false;
  }
}

/**
 * How many tiles across one 自動整地 levels — 「Xボタンで建物を中心に
 * 7x7マスの平地を確保」. See planAutoFlatten.
 *
 * Deliberately the original's number rather than one derived from
 * HOUSE_UPGRADE_FLATNESS_RADIUS: 7x7 tiles is 8x8 vertices, comfortably
 * more than the 5x5 vertex window countFlatNeighbors checks at radius 2,
 * so a plot secured this way actually carries the house all the way to
 * 城砦 instead of landing exactly on the threshold.
 */
export const AUTO_FLATTEN_SIZE = 7;

/** Whether flattenTile would move any of this tile's corners. */
function tileNeedsFlattening(
  heightmap: Heightmap,
  tileX: number,
  tileY: number,
  elevation: number,
  rule: TerrainEditRule,
): boolean {
  const clamped = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation));
  for (const [x, y] of [
    [tileX, tileY],
    [tileX + 1, tileY],
    [tileX + 1, tileY + 1],
    [tileX, tileY + 1],
  ] as const) {
    const row = heightmap.vertices[y];
    if (!row || row[x] === undefined) continue;
    const delta = clamped - row[x];
    if (delta !== 0 && isTerrainEditAllowed(rule, delta)) return true;
  }
  return false;
}

/**
 * The original's 自動整地 (「Xボタンで建物を中心に7x7マスの平地を確保」),
 * one of the two conveniences the original is praised for by name —
 * 「操作性も練られている」.
 *
 * game2's own 平坦化 is a brush: the player drags it over a plot and every
 * tile the gesture touches is levelled to the elevation the first tile
 * seeded. That works, but securing the plot a house needs to reach 城砦
 * means dragging accurately over 49 tiles, and the original hands the same
 * result to one button press aimed at the building itself.
 *
 * This plans the edit rather than performing it, so the caller can price it
 * (one TERRAIN_EDIT_MANA_COST per tile, exactly what doing it by hand
 * costs — this is an ergonomic convenience, not a discount) and refuse the
 * whole thing before spending anything.
 *
 * The target elevation comes from the *centre* tile only, under the same
 * rule the brush uses for the tile that seeds a stroke. Averaging the whole
 * 7x7 would shift the ground under the building the plot is being levelled
 * for; taking the centre keeps the house exactly where it stands and moves
 * the surroundings to meet it.
 *
 * `isEditable` filters out tiles the caller isn't allowed to reshape (the
 * enemy-territory restriction some worlds impose). Those are skipped rather
 * than failing the cast, and — since they're absent from the returned list
 * — never charged for.
 */
export function planAutoFlatten(
  heightmap: Heightmap,
  centerTileX: number,
  centerTileY: number,
  rule: TerrainEditRule,
  size: number = AUTO_FLATTEN_SIZE,
  isEditable: (tile: { x: number; y: number }) => boolean = () => true,
): { elevation: number; tiles: { x: number; y: number }[] } {
  const cx = Math.min(Math.max(Math.round(centerTileX), 0), heightmap.width - 1);
  const cy = Math.min(Math.max(Math.round(centerTileY), 0), heightmap.height - 1);

  const corners = [
    heightmap.vertices[cy][cx],
    heightmap.vertices[cy][cx + 1],
    heightmap.vertices[cy + 1][cx + 1],
    heightmap.vertices[cy + 1][cx],
  ];
  // Rounded, unlike the brush's fractional average: the brush's target is
  // whatever the first tile of a stroke happened to average to, but a plot
  // this tool "secures" should land on a whole terrace, so a second press
  // on the same house is a no-op (and free) rather than forever chasing a
  // fractional height no neighbouring tile shares.
  const elevation =
    rule === "raiseOnly"
      ? Math.max(...corners)
      : rule === "lowerOnly"
        ? Math.min(...corners)
        : Math.round(corners.reduce((sum, h) => sum + h, 0) / corners.length);

  const back = Math.floor((size - 1) / 2);
  const tiles: { x: number; y: number }[] = [];
  for (let dy = 0; dy < size; dy++) {
    const y = cy + dy - back;
    if (y < 0 || y >= heightmap.height) continue;
    for (let dx = 0; dx < size; dx++) {
      const x = cx + dx - back;
      if (x < 0 || x >= heightmap.width) continue;
      if (!isEditable({ x, y })) continue;
      if (!tileNeedsFlattening(heightmap, x, y, elevation, rule)) continue;
      tiles.push({ x, y });
    }
  }

  return { elevation, tiles };
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
 * "岩の上には建築できない". Nor is ground already eaten by 毒カビ, which
 * "建物や信者を飲み込む" (docs/original-miracles.md #9) — a house cannot be
 * raised on the rot that would swallow it — nor ground a 火柱 has burned
 * barren (#21's 「地面を荒地化し」).
 */
export function isBuildable(heightmap: Heightmap, x: number, y: number): boolean {
  return (
    sampleElevation(heightmap, x, y) > heightmap.waterLevel &&
    !isRock(heightmap, x, y) &&
    !isCrevice(heightmap, x, y) &&
    !isFungus(heightmap, x, y) &&
    !isScorched(heightmap, x, y) &&
    !isWall(heightmap, x, y) &&
    !isBoulder(heightmap, x, y)
  );
}

/**
 * Burns every land vertex within `radius` of (x, y) barren, returning the
 * ones it took — the 「地面を荒地化」 that 火柱 (#21), 雷 (#16) and 嵐
 * (#18) all leave behind.
 *
 * Water is left alone (nothing there to burn) and so is ground already
 * dead, so a second strike on the same spot reports no new damage and the
 * caller can tell a redraw is unnecessary.
 */
export function scorchGround(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const burned: { x: number; y: number }[] = [];

  for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (heightmap.vertices[vy][vx] <= Math.max(MIN_ELEVATION, heightmap.waterLevel)) continue;
      if (heightmap.scorched[vy][vx]) continue;

      heightmap.scorched[vy][vx] = true;
      heightmap.forest[vy][vx] = false;
      heightmap.road[vy][vx] = false;
      heightmap.fungus[vy][vx] = false;
      burned.push({ x: vx, y: vy });
    }
  }

  return burned;
}

/** Whether the vertex nearest (x, y) has been burned barren — see Heightmap.scorched. */
export function isScorched(heightmap: Heightmap, x: number, y: number): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  return heightmap.scorched[vy][vx];
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
 *
 * Returns the vertices it tore, in the order it tore them. That is what
 * game/quake.ts holds on to so the ground can go on shaking along the
 * fissure for a while afterwards — 「地震が続いている間は修復が出来ない」 —
 * and it is a line rather than a disc, so the caller needs the line itself
 * rather than a centre and a radius.
 */
export function applyEarthquake(
  heightmap: Heightmap,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  length: number = DEFAULT_EARTHQUAKE_LENGTH,
  rng: () => number = Math.random,
): { x: number; y: number }[] {
  const magnitude = Math.hypot(directionX, directionY);
  // A cast with no direction at all still has to do something rather than
  // silently no-op; east is as good as any other arbitrary choice.
  const stepX = magnitude === 0 ? 1 : directionX / magnitude;
  const stepY = magnitude === 0 ? 0 : directionY / magnitude;

  let x = originX;
  let y = originY;
  const torn: { x: number; y: number }[] = [];

  for (let step = 0; step < length; step++) {
    // Perpendicular wander, so the crack drifts off its heading without
    // ever doubling back along it.
    const wander = (rng() * 2 - 1) * EARTHQUAKE_WANDER;
    x += stepX + -stepY * wander;
    y += stepY + stepX * wander;

    const vx = Math.round(x);
    const vy = Math.round(y);
    if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return torn;

    // The centreline only. A tile renders as torn if any of its four
    // corners is, so one marked vertex already reads as a crack a couple of
    // tiles wide on screen; marking a second, perpendicular vertex per step
    // turned it into a black blob rather than a fissure. Lethality does not
    // need the extra width either — creviceSystem samples every tick, and a
    // walker crossing a one-vertex band is inside it for tens of ticks.
    tearCrevice(heightmap, vx, vy);
    torn.push({ x: vx, y: vy });
  }

  return torn;
}

function tearCrevice(heightmap: Heightmap, x: number, y: number): void {
  if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) return;
  heightmap.vertices[y][x] = MIN_ELEVATION;
  heightmap.crevice[y][x] = true;
  heightmap.boulder[y][x] = false;
  // A fissure opening under a 城壁 takes the wall down with it — the ground
  // it stood on is gone. This is the answer to a wall, and the reason one
  // can be cast at all: 地震 has a direction (see applyEarthquake), so a
  // wall is broken by aiming a crack *through* it, not by out-spending it.
  heightmap.wall[y][x] = false;
}

export const DEFAULT_VOLCANO_RADIUS = 1;

/**
 * How many vertices of lava one eruption produces, beyond the cone itself.
 *
 * A budget rather than a radius: lava runs downhill and pools, so the same
 * volume covers a long tongue down a valley or a wide puddle on a plain,
 * which is the whole reason the flow is worth simulating instead of
 * stamping another disc.
 */
export const DEFAULT_LAVA_VOLUME = 36;
export const VOLCANO_ROCK_HARDNESS = 20;

/** How far below MAX_ELEVATION (the crater rim) applyVolcano's own crater floor and outer slope sit — see its doc comment. */
export const VOLCANO_CRATER_DEPTH = 3;
export const VOLCANO_OUTER_DROP = 6;

/**
 * How far beyond the cone's own footprint the eruption's puddles form, in
 * vertices — 原作「火山の外周には水たまりができ、溶岩流をそこで止める」.
 */
export const VOLCANO_PUDDLE_RING = 2;

/**
 * How many puddles one eruption melts out around its base.
 *
 * Deliberately a handful rather than a closed moat. A ring of water all the
 * way around would seal the crater and there would be no lava flow at all —
 * and the flow is what the miracle is played around (see flowLava). Five
 * puddles on a ring of roughly twenty vertices block a few directions and
 * leave the rest open, so the lava picks its way out between them, which is
 * both what 「水たまり」 (plural, scattered) says and the more interesting
 * shape.
 */
export const VOLCANO_PUDDLES = 5;

/**
 * Heaves the footprint within `radius` of (centerX, centerY) into a real
 * cone-with-crater shape and covers it in rock — docs/game-system.md's
 * "対象地点を高く隆起させ、岩石で覆う", refined per plan/archived/0087's "外側：
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
  lavaVolume: number = DEFAULT_LAVA_VOLUME,
  puddles: number = VOLCANO_PUDDLES,
  rng: () => number = Math.random,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const covered: { x: number; y: number }[] = [];

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
      // Nothing built survives being the side of a volcano — see wall's
      // own doc comment on why a barrier has to be breakable at all. A
      // 地下巨石 becomes part of the cone: still unbuildable, but lava rock
      // now, which cools and chips like the rest of it.
      heightmap.wall[vy][vx] = false;
      heightmap.boulder[vy][vx] = false;
      covered.push({ x: vx, y: vy });
    }
  }

  // Melted before the lava runs, because they are what it runs *around* —
  // see meltPuddles and flowLava's "water is where the flow ends".
  covered.push(...meltPuddles(heightmap, cx, cy, radius + VOLCANO_PUDDLE_RING, puddles, rng));
  covered.push(...flowLava(heightmap, cx, cy, radius, hardness, lavaVolume));
  return covered;
}

/**
 * Sinks a few vertices around the cone's skirt to sea level — 原作「火山の
 * 外周には水たまりができ、溶岩流をそこで止める」.
 *
 * Scattered on a ring rather than drawn as one, for the reason
 * VOLCANO_PUDDLES gives: a closed moat would bottle the eruption up
 * entirely. Their angles are evenly spaced and then jittered, so an
 * eruption never produces the same rosette twice but also never drops all
 * five puddles on one side.
 *
 * Returns them as covered ground: a house that finds itself in a new pond
 * is as gone as one under the lava, and eruptVolcano is what clears it.
 */
function meltPuddles(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  ringRadius: number,
  count: number,
  rng: () => number,
): { x: number; y: number }[] {
  const melted: { x: number; y: number }[] = [];
  if (count <= 0 || ringRadius <= 0) return melted;

  for (let i = 0; i < count; i++) {
    const angle = ((i + rng()) / count) * Math.PI * 2;
    const x = Math.round(centerX + Math.cos(angle) * ringRadius);
    const y = Math.round(centerY + Math.sin(angle) * ringRadius);
    if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) continue;
    if (heightmap.vertices[y][x] <= heightmap.waterLevel) continue; // already water

    heightmap.vertices[y][x] = heightmap.waterLevel;
    // Water is not rock, and nothing built stands in it. A crevice that
    // filled with water is simply a pond, so the tear is cleared too.
    heightmap.rockHardness[y][x] = 0;
    heightmap.crevice[y][x] = false;
    heightmap.wall[y][x] = false;
    heightmap.boulder[y][x] = false;
    heightmap.forest[y][x] = false;
    heightmap.fungus[y][x] = false;
    heightmap.road[y][x] = false;
    heightmap.scorched[y][x] = false;
    melted.push({ x, y });
  }

  return melted;
}

/**
 * Runs lava out of the crater and downhill until it runs out — the
 * original's "火口から溶岩を流します。溶岩は土地を建築不能な状態へ変え、
 * 水地形で止まります" (docs/original-miracles.md #24).
 *
 * Always takes the *lowest* vertex on its frontier next, which is what
 * makes it run down valleys and pool in hollows rather than expand as a
 * disc. The old volcano had no flow at all: it raised a cone, covered
 * exactly that cone in rock, and stopped — so it denied a fixed patch of
 * land regardless of what the land around it looked like.
 *
 * **Water stops it.** That is the interaction the miracle is played
 * around: a channel or a lake is a firebreak, and higher ground is not —
 * lava climbs nothing, but it will happily go around.
 *
 * Not implemented: the original also notes lava can push further out once
 * the water it stopped against is filled in. That needs the flow to be a
 * living thing that resumes later, rather than resolved at cast time, and
 * is deliberately left for when there is a reason to build it.
 */
function flowLava(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number,
  hardness: number,
  volume: number,
): { x: number; y: number }[] {
  const covered: { x: number; y: number }[] = [];
  const key = (x: number, y: number) => y * (heightmap.width + 1) + x;
  const seen = new Set<number>();
  const frontier: { x: number; y: number }[] = [];

  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) return;
    if (seen.has(key(x, y))) return;
    seen.add(key(x, y));
    // Water is where the flow ends: marked seen so it is never
    // reconsidered, never taken, and never crossed.
    if (heightmap.vertices[y][x] <= heightmap.waterLevel) return;
    frontier.push({ x, y });
  };

  // Seed from the cone's own footprint, so lava leaves the mountain from
  // every side rather than squeezing out of one vertex.
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) continue;
      seen.add(key(x, y));
      consider(x + 1, y);
      consider(x - 1, y);
      consider(x, y + 1);
      consider(x, y - 1);
    }
  }

  // One vertex at a time, always the lowest on the whole frontier — never
  // a ring at a time. Expanding by rings looked equivalent but is not: with
  // a modest volume the flow spent its whole budget on the first ring and
  // never got anywhere, so lava could not run *down a valley*, which is the
  // one thing this simulation exists to do.
  for (let remaining = volume; remaining > 0 && frontier.length > 0; remaining--) {
    let lowest = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (heightmap.vertices[frontier[i].y][frontier[i].x] < heightmap.vertices[frontier[lowest].y][frontier[lowest].x]) {
        lowest = i;
      }
    }
    const { x, y } = frontier.splice(lowest, 1)[0];

    heightmap.rockHardness[y][x] = hardness;
    // Lava buries a 城壁 and a 地下巨石 the same way the cone does.
    heightmap.wall[y][x] = false;
    heightmap.boulder[y][x] = false;
    covered.push({ x, y });

    consider(x + 1, y);
    consider(x - 1, y);
    consider(x, y + 1);
    consider(x, y - 1);
  }

  return covered;
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
 * How many vertices long one 岩礁 cast is. The original is specific about
 * the shape — 「海面上に建物が建てられない土地を**線分状に**発生させる」 —
 * and the shape is the whole miracle: a breakwater is a line or it is
 * nothing. See applyReef.
 */
export const REEF_LENGTH = 5;

/**
 * The headings a reef segment can lie along. Only half the compass: a
 * segment and its reverse are the same line. Listed in the order ties are
 * resolved, so a cast in open water — where every heading is as good as
 * every other — always lays the same predictable east–west bar.
 */
const REEF_HEADINGS = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
] as const;

/** How many vertices of a length-`length` segment from (cx, cy) are open water. */
function reefWaterSpan(
  heightmap: Heightmap,
  cx: number,
  cy: number,
  heading: { x: number; y: number },
  length: number,
): number {
  const back = Math.floor((length - 1) / 2);
  let span = 0;
  for (let step = 0; step < length; step++) {
    const vx = cx + heading.x * (step - back);
    const vy = cy + heading.y * (step - back);
    if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) continue;
    if (heightmap.vertices[vy][vx] > heightmap.waterLevel) continue;
    span++;
  }
  return span;
}

/**
 * The heading a reef cast at (cx, cy) lies along: whichever one keeps the
 * most of the segment on open water.
 *
 * That single rule gives the behaviour a breakwater needs without needing
 * to reason about coastlines explicitly. Hugging a shore, the heading
 * running *along* the water is the one parallel to the coast, so the reef
 * shelters the beach behind it instead of jutting out to sea; inside a
 * channel it follows the channel; in open water every heading ties and the
 * first listed wins.
 */
function reefHeading(heightmap: Heightmap, cx: number, cy: number, length: number): { x: number; y: number } {
  let best: { x: number; y: number } = REEF_HEADINGS[0];
  let bestSpan = -1;
  for (const heading of REEF_HEADINGS) {
    const span = reefWaterSpan(heightmap, cx, cy, heading, length);
    if (span > bestSpan) {
      bestSpan = span;
      best = heading;
    }
  }
  return best;
}

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
 * One cast lays a *line* of reef — REEF_LENGTH vertices centred on the tap
 * — not a single stone. The original says so outright
 * (「**線分状に**発生させる」), and the shape is the entire point: applyTsunami
 * spreads as a front and flows around a partial barrier, so a lone vertex
 * shelters nothing at all. game2 used to place exactly one, which left the
 * player tapping the same coast five or six times to build what the
 * original hands them in a single cast — the miracle's own defensive role
 * ("津波の侵食を防ぐ効果も") delegated to the player's patience.
 *
 * The segment lies along whichever heading keeps it on open water (see
 * reefHeading), which against a shore is the one parallel to it — so the
 * reef shelters the beach behind it rather than jutting out to sea. Land is
 * never overwritten: vertices of the segment that are already above water
 * are skipped, so a reef laid against a headland wraps up to it and stops.
 *
 * Returns the vertices actually raised, so a cast that would do nothing can
 * be refused rather than silently charged for.
 */
export function applyReef(
  heightmap: Heightmap,
  x: number,
  y: number,
  hardness: number = REEF_HARDNESS,
  length: number = REEF_LENGTH,
): { x: number; y: number }[] {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const raised: { x: number; y: number }[] = [];
  if (cx < 0 || cy < 0 || cx > heightmap.width || cy > heightmap.height) return raised;
  if (heightmap.vertices[cy][cx] > heightmap.waterLevel) return raised;

  const heading = reefHeading(heightmap, cx, cy, length);
  // Centred on the tap: an odd length puts the tapped vertex in the middle,
  // an even one leans the extra vertex forward along the heading.
  const back = Math.floor((length - 1) / 2);

  for (let step = 0; step < length; step++) {
    const vx = cx + heading.x * (step - back);
    const vy = cy + heading.y * (step - back);
    if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) continue;
    if (heightmap.vertices[vy][vx] > heightmap.waterLevel) continue;

    heightmap.vertices[vy][vx] = Math.min(MAX_ELEVATION, heightmap.waterLevel + REEF_HEIGHT);
    heightmap.rockHardness[vy][vx] = hardness;
    raised.push({ x: vx, y: vy });
  }

  return raised;
}

/** How far from its cast point a forest plants trees, in vertices. */
export const DEFAULT_FOREST_RADIUS = 3;

/** Whether woodland stands at the vertex nearest (x, y) — see Heightmap.forest. */
export function isForest(heightmap: Heightmap, x: number, y: number): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  return heightmap.forest[vy][vx];
}

/**
 * The original's 森 (docs/original-miracles.md #6): trees over the ground
 * around a point.
 *
 * Only on land that could be built on — trees do not grow on water, on
 * volcanic rock, or below the sea. Returns the vertices planted, so the
 * caller can tell whether the cast did anything at all.
 */
export function applyForest(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_FOREST_RADIUS,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const planted: { x: number; y: number }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (heightmap.forest[vy][vx]) continue;
      if (!isBuildable(heightmap, vx, vy)) continue;

      heightmap.forest[vy][vx] = true;
      planted.push({ x: vx, y: vy });
    }
  }

  return planted;
}

/** How far from its cast point fire rain falls, before any spread through woodland. */
export const DEFAULT_FIRE_RAIN_RADIUS = 3;

/**
 * The original's 火の雨 (docs/original-miracles.md #22): fire over an area
 * — and, through woodland, far beyond it.
 *
 * "森を作ってから火の雨を使うと広範囲へ延焼する" is the first interaction
 * the original's own design asks for, and it is the reason both of these
 * exist in the same change. On bare ground this is a small circle. Dropped
 * on a forest it runs the length of the woodland, burning it away as it
 * goes — so a forest is an investment that can be turned against its
 * owner, which is exactly the sort of thing that makes 29 miracles worth
 * having rather than 29 damage numbers.
 *
 * Returns every vertex that burned, for the caller to clear of houses and
 * walkers (see game/fire.ts).
 */
export function applyFireRain(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_FIRE_RAIN_RADIUS,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const key = (x: number, y: number) => y * (heightmap.width + 1) + x;
  const burned = new Map<number, { x: number; y: number }>();
  const queue: { x: number; y: number }[] = [];

  const burn = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) return;
    if (burned.has(key(x, y))) return;
    burned.set(key(x, y), { x, y });
    // Woodland carries the fire onward; bare ground does not. Burnt trees
    // are gone, which also stops the fire from looping back on itself.
    if (heightmap.forest[y][x]) {
      heightmap.forest[y][x] = false;
      queue.push({ x, y });
    }
  };

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.hypot(dx, dy) > radius) continue;
      burn(cx + dx, cy + dy);
    }
  }

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    burn(x + 1, y);
    burn(x - 1, y);
    burn(x, y + 1);
    burn(x, y - 1);
  }

  return [...burned.values()];
}

/** How far from its cast point a flower heals torn ground, in vertices. */
export const DEFAULT_FLOWER_RADIUS = 3;

/**
 * The original's 花 (docs/original-miracles.md #7): "荒れて建築不能に
 * なった土地を通常の平地へ戻します。沼、地震による亀裂、火山で荒れた
 * 土地などを修復でき……溶岩にも有効".
 *
 * The counter to four separate miracles at once, which is why it is worth
 * more than its own small effect suggests: an earthquake's crevice
 * (plan/archived/0095), a volcano's rock and the lava that ran from it
 * (plan/archived/0096), and the ash a 火柱 leaves behind (#21) all become
 * ordinary ground again. Swamps are ECS
 * entities rather than terrain, so the caller clears those separately with
 * collapseSwampsNear — the same call an earthquake already makes.
 *
 * A crevice is not merely un-flagged: it was carved to the floor, so
 * leaving it there would hand back a lake instead of a field. It comes
 * back just clear of the water, which restores buildable land without
 * doubling as a free terraforming tool.
 *
 * Returns the vertices it healed, so a cast that would do nothing can be
 * refused rather than silently charged for.
 */
export function applyFlower(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_FLOWER_RADIUS,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const healed: { x: number; y: number }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;

      const wasTorn = heightmap.crevice[vy][vx];
      const wasRock = heightmap.rockHardness[vy][vx] > 0;
      const wasBurned = heightmap.scorched[vy][vx];
      if (!wasTorn && !wasRock && !wasBurned) continue;

      if (wasTorn) {
        heightmap.crevice[vy][vx] = false;
        heightmap.vertices[vy][vx] = Math.min(MAX_ELEVATION, heightmap.waterLevel + 1);
      }
      heightmap.rockHardness[vy][vx] = 0;
      heightmap.scorched[vy][vx] = false;
      healed.push({ x: vx, y: vy });
    }
  }

  return healed;
}

/** How far from its cast point a road paves ground, in vertices. */
export const DEFAULT_ROAD_RADIUS = 2;

/** Whether the vertex nearest (x, y) is paved — see Heightmap.road. */
export function isRoad(heightmap: Heightmap, x: number, y: number): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  return heightmap.road[vy][vx];
}

/**
 * The original's 道 (docs/original-miracles.md #11): "道路を作る。上では
 * 信者の移動速度が上がる。毒カビの進行を止める".
 *
 * Paving is refused on ground already lost to 毒カビ — you lay a road
 * *ahead* of an outbreak, not over it. That is the whole shape of the
 * interaction: a road is worth casting before it is obviously needed, and
 * once the rot has arrived the answer is 花 (applyFlower) instead. It keeps
 * `road` and `fungus` mutually exclusive too, so neither layer has to
 * decide which of the two a vertex "really" is.
 *
 * Returns the vertices paved, so a cast that would do nothing can be
 * refused rather than silently charged for.
 */
export function applyRoad(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_ROAD_RADIUS,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const paved: { x: number; y: number }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (heightmap.road[vy][vx]) continue;
      // isBuildable already rejects fungus, water, rock and crevices —
      // exactly the ground a road cannot be laid on.
      if (!isBuildable(heightmap, vx, vy)) continue;
      // 「なお、敵陣や斜面には設置できない」 — the slope half. Paving and
      // walling are both laid *flat*: a road up a hillside and a wall on a
      // gradient are things the original simply will not build. The enemy-
      // territory half needs the world rather than the map, so it is
      // checked where the cast is (main.ts), the same way the per-world
      // terrain-edit territory rule is.
      if (!isLevelVertex(heightmap, vx, vy)) continue;

      heightmap.road[vy][vx] = true;
      paved.push({ x: vx, y: vy });
    }
  }

  return paved;
}

/**
 * Whether the ground at a vertex is level — it and every in-bounds
 * orthogonal neighbour stand at the same height.
 *
 * What 道 and 城壁 are laid on: 「なお、敵陣や斜面には設置できない」. A
 * gradient of even one step counts as a slope, which is strict, and
 * deliberately so — this is the same standard the player already meets to
 * build, so "flat enough for a house" and "flat enough for a road" are one
 * idea rather than two thresholds to remember.
 *
 * **A walled neighbour is not a slope.** A 城壁 lifts the ground it stands
 * on (see applyWall's WALL_ELEVATION_RISE), so measuring that rise as
 * terrain would make a wall's own first segment disqualify its second — and
 * the original describes walls exactly as something you chain: 「通常は手動
 * で延ばして連続した城壁を設置する」. The parapet is the structure, not the
 * hillside, so it is not what "slope" means here. The same reading lets a
 * road run up to a wall and stop rather than being refused beside it.
 */
export function isLevelVertex(heightmap: Heightmap, x: number, y: number): boolean {
  const here = heightmap.vertices[y]?.[x];
  if (here === undefined) return false;

  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    const neighbor = heightmap.vertices[ny]?.[nx];
    if (neighbor === undefined) continue;
    if (heightmap.wall[ny][nx]) continue;
    if (neighbor !== here) return false;
  }
  return true;
}

/**
 * Whether a vertex touches land that is already above water — what the
 * spade can reach on a stage whose 「どこでも↑↓／海上に土地↑↓」 are ×
 * (see game/worlds.ts's openTerraforming).
 *
 * The vertex itself counts, so raising a coast outward works one step at a
 * time; open sea, with nothing dry on any side, does not. That is the
 * difference between widening the island you were given and conjuring a new
 * one wherever you like.
 */
export function touchesLand(heightmap: Heightmap, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const elevation = heightmap.vertices[y + dy]?.[x + dx];
    if (elevation !== undefined && elevation > heightmap.waterLevel) return true;
  }
  return false;
}

/** How far from its cast point a fungus outbreak starts, in vertices. */
export const DEFAULT_FUNGUS_RADIUS = 1;

/**
 * Per fungus-covered neighbour, the chance an empty vertex is taken over in
 * one growth step (see spreadFungus).
 *
 * Deliberately scaled by neighbour count rather than flat: it is what makes
 * the original's "複数設置すると大繁殖" true without special-casing it.
 * One patch grows only along a thin fringe where most empty vertices touch
 * a single fungus vertex; two overlapping patches give their shared front
 * two or three fungus neighbours each, tripling the local growth rate.
 */
export const FUNGUS_SPREAD_CHANCE = 0.1;

/**
 * The chance a *fully exposed* fungus vertex (no fungus neighbours at all)
 * dies back in one growth step, scaled down by how many neighbours it does
 * have — see spreadFungus. A vertex with all four dies never.
 *
 * The graded form matters more than the number. A flat "wither below N
 * neighbours" rule turned out to have no middle setting: at N=2 a single
 * cast grew without bound and swallowed the map on its own; at N=3 even
 * three overlapping casts went extinct within a minute. Scaling by exposure
 * gives the behaviour the original describes instead — measured over 40
 * runs at these values, a lone seed dies out about a quarter of the time
 * and otherwise creeps ("自然消滅することもある"), while three overlapping
 * casts reliably reach a few hundred vertices over several minutes
 * ("複数設置すると大繁殖") — slowly enough that a road laid across its path
 * is a real answer rather than a formality.
 */
export const FUNGUS_WITHER_CHANCE = 0.35;

/** Orthogonal neighbours a vertex has — the divisor of the exposure scaling above. */
const FUNGUS_MAX_NEIGHBORS = 4;

/** Whether the vertex nearest (x, y) is covered in 毒カビ — see Heightmap.fungus. */
export function isFungus(heightmap: Heightmap, x: number, y: number): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  return heightmap.fungus[vy][vx];
}

/**
 * The original's 毒カビ (docs/original-miracles.md #9): seeds an outbreak
 * around a point. What makes it dangerous is not this cast but spreadFungus,
 * which runs every tick afterwards.
 *
 * Returns the vertices seeded, so a cast that would do nothing can be
 * refused rather than silently charged for.
 */
export function applyFungus(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_FUNGUS_RADIUS,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const seeded: { x: number; y: number }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (!canFungusTake(heightmap, vx, vy)) continue;

      heightmap.fungus[vy][vx] = true;
      seeded.push({ x: vx, y: vy });
    }
  }

  return seeded;
}

/**
 * Ground 毒カビ can take over: land it could otherwise be built on (so not
 * water, rock or a crevice, and not somewhere it already grows) and, the
 * point of the whole pair, **not a road**.
 */
function canFungusTake(heightmap: Heightmap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x > heightmap.width || y > heightmap.height) return false;
  if (heightmap.road[y][x]) return false;
  return isBuildable(heightmap, x, y);
}

const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * One growth step of every 毒カビ patch on the map, applied simultaneously
 * (a cellular automaton: growth and withering are both decided against the
 * state at the start of the step, so a vertex taken this step cannot also
 * wither this step).
 *
 * Two opposing rules, straight out of the original's own description, and
 * both keyed on the same thing — how many fungus neighbours a vertex has.
 * Empty ground is taken over at FUNGUS_SPREAD_CHANCE *per fungus
 * neighbour* ("複数設置すると大繁殖"), while a fungus vertex dies back at
 * FUNGUS_WITHER_CHANCE scaled by how exposed it is
 * ("自然消滅することもある"). A lone seed is almost all fringe and often
 * fizzles; two casts laid over each other build an interior that cannot
 * wither at all and a front that grows several times faster. Nothing
 * crosses a road (see canFungusTake).
 *
 * Returns what changed, so the caller can redraw and clear out whatever the
 * new growth swallowed (see systems/fungus.ts).
 */
export function spreadFungus(
  heightmap: Heightmap,
  rng: () => number = Math.random,
): { grown: { x: number; y: number }[]; withered: { x: number; y: number }[] } {
  const stride = heightmap.width + 1;
  const candidates = new Map<number, { x: number; y: number; neighbors: number }>();
  const occupied: { x: number; y: number; neighbors: number }[] = [];

  for (let y = 0; y <= heightmap.height; y++) {
    for (let x = 0; x <= heightmap.width; x++) {
      if (!heightmap.fungus[y][x]) continue;

      let neighbors = 0;
      for (const [dx, dy] of ORTHOGONAL) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx > heightmap.width || ny > heightmap.height) continue;
        if (heightmap.fungus[ny][nx]) {
          neighbors++;
          continue;
        }
        const key = ny * stride + nx;
        const candidate = candidates.get(key);
        if (candidate) candidate.neighbors++;
        else candidates.set(key, { x: nx, y: ny, neighbors: 1 });
      }
      occupied.push({ x, y, neighbors });
    }
  }

  const grown: { x: number; y: number }[] = [];
  for (const { x, y, neighbors } of candidates.values()) {
    if (!canFungusTake(heightmap, x, y)) continue;
    if (rng() >= FUNGUS_SPREAD_CHANCE * neighbors) continue;
    heightmap.fungus[y][x] = true;
    grown.push({ x, y });
  }

  const withered: { x: number; y: number }[] = [];
  for (const { x, y, neighbors } of occupied) {
    const exposure = (FUNGUS_MAX_NEIGHBORS - neighbors) / FUNGUS_MAX_NEIGHBORS;
    if (rng() >= FUNGUS_WITHER_CHANCE * exposure) continue;
    heightmap.fungus[y][x] = false;
    withered.push({ x, y });
  }

  return { grown, withered };
}

/**
 * How far from its cast point one 城壁 cast raises stone, in vertices.
 *
 * One, deliberately — a cast is a *block* of wall (five vertices, a plus
 * shape), not a finished rampart. The original places wall pieces and lets
 * the player chain them into whatever line the ground needs, and a
 * single-tap wall long enough to matter would have to guess a direction
 * the player never gave it. Chaining also makes a wall's real cost its
 * length, which is what turns "wall the enemy in" from an obvious move
 * into an expensive one.
 */
export const DEFAULT_WALL_RADIUS = 1;

/**
 * How much a 城壁 raises the ground it stands on.
 *
 * Purely so it reads as a wall: the barrier itself is the `wall` flag (see
 * Heightmap.wall), and nothing in this game has ever been stopped by steep
 * ground. Three units is enough to throw a clear shaded face at this
 * renderer's lighting (see IsoRenderer's mesh) without punching a spike
 * through the skyline at MAX_ELEVATION.
 */
export const WALL_ELEVATION_RISE = 3;

/** Whether the vertex nearest (x, y) is walled — see Heightmap.wall. */
export function isWall(heightmap: Heightmap, x: number, y: number): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  return heightmap.wall[vy][vx];
}

/**
 * The original's 城壁 (docs/original-miracles.md #12): raises a block of
 * stone that ordinary walkers cannot cross — 「信者の進行を遮る壁。英雄
 * 以外は越えられない」. The crossing rule itself lives in
 * systems/movement.ts, which is the only place that can act on it.
 *
 * Refused on water and on a crevice (nothing to stand on), on ground
 * already walled, and — same rule as applyRoad — on 毒カビ: rot is not a
 * foundation, and you raise a wall ahead of an outbreak rather than over
 * it. Woodland is felled where the wall goes up; a forest is exactly the
 * kind of thing masons clear.
 *
 * Returns the vertices raised, so a cast that would do nothing can be
 * refused rather than silently charged for.
 */
export function applyWall(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_WALL_RADIUS,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const raised: { x: number; y: number }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (heightmap.wall[vy][vx]) continue;
      if (heightmap.crevice[vy][vx]) continue;
      if (heightmap.fungus[vy][vx]) continue;
      if (heightmap.vertices[vy][vx] <= heightmap.waterLevel) continue;
      // 「道と同じく、敵陣や斜面には設置できない」 — see applyRoad, and
      // isLevelVertex on why a wall's own parapet does not count as the
      // slope that would stop the next segment of it.
      if (!isLevelVertex(heightmap, vx, vy)) continue;

      heightmap.wall[vy][vx] = true;
      heightmap.forest[vy][vx] = false;
      heightmap.vertices[vy][vx] = Math.min(MAX_ELEVATION, heightmap.vertices[vy][vx] + WALL_ELEVATION_RISE);
      raised.push({ x: vx, y: vy });
    }
  }

  return raised;
}

/**
 * How far from its cast point a 地下巨石 raises stone, in vertices.
 *
 * Three, for the original's 「発動地点を**大きく**隆起させ」. Measured on
 * flat ground: at radius 2 a cast denies 13 vertices outright and blocks
 * castles on 21; at 3 those become 29 and 37 — a footprint in the same
 * class as a volcano's cone, which is the company this miracle keeps at
 * its price, while killing nobody.
 */
export const DEFAULT_MEGALITH_RADIUS = 3;

/**
 * How far the ground rises at the centre of a 地下巨石, tapering to
 * nothing just past DEFAULT_MEGALITH_RADIUS.
 *
 * The 「大きく隆起させ」 half of the original's #14, and the half that does
 * the real damage. The stone itself denies about a dozen vertices, but the
 * slope it throws up ruins *flatness* much further out — and this game's
 * bigger houses need a flat plot around them (see
 * HOUSE_LEVEL_FLATNESS_REQUIREMENT), so a boulder dropped beside a
 * settlement stops it growing without covering an inch of it. That is
 * 「大規模建築の障害になり」 read as the original says it: an obstacle to
 * *large* building in particular.
 */
export const MEGALITH_HEIGHT = 8;

/**
 * How wide an area a held 地下巨石 cast scatters over — 「発生ボタンを
 * 押し続けると、**一帯に**より多くの巨石を発生させる」.
 *
 * Wider than DEFAULT_MEGALITH_RADIUS so a hold spreads across ground the
 * first stone did not reach; that spreading is the whole difference
 * between holding the button and tapping it repeatedly on one spot.
 */
export const MEGALITH_SCATTER_RADIUS = 6;

/**
 * Vertices within `radius` of (cx, cy) where a 地下巨石 could still be
 * raised — the same per-vertex conditions applyMegalith itself applies.
 *
 * Held casts pick their next centre from this list (see main.ts), which is
 * what makes a hold spread stone over 「一帯」 rather than stack it on the
 * one vertex under the finger. An empty list means the area is used up, so
 * the hold can stop itself instead of charging mana for casts that raise
 * nothing.
 */
export function megalithScatterCandidates(
  heightmap: Heightmap,
  cx: number,
  cy: number,
  radius: number = MEGALITH_SCATTER_RADIUS,
): { x: number; y: number }[] {
  const centerX = Math.round(cx);
  const centerY = Math.round(cy);
  const candidates: { x: number; y: number }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = centerY + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = centerX + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (heightmap.boulder[vy][vx]) continue;
      if (heightmap.crevice[vy][vx]) continue;
      if (heightmap.vertices[vy][vx] <= heightmap.waterLevel) continue;
      candidates.push({ x: vx, y: vy });
    }
  }

  return candidates;
}

/** Whether the vertex nearest (x, y) is covered by a 地下巨石 — see Heightmap.boulder. */
export function isBoulder(heightmap: Heightmap, x: number, y: number): boolean {
  const vx = Math.round(x);
  const vy = Math.round(y);
  if (vx < 0 || vy < 0 || vx > heightmap.width || vy > heightmap.height) return false;
  return heightmap.boulder[vy][vx];
}

/**
 * The original's 地下巨石 (docs/original-miracles.md #14): heaves a dome of
 * cold stone out of the ground, unbuildable and — unlike everything else
 * that ruins ground in this game — not repairable. 花 does not touch it,
 * terraforming does not wear it down; it goes only when the ground under
 * it is put beneath the sea (see raiseVertex).
 *
 * Refused on water: stone raised in the sea is stone already sunk, so a
 * cast there would pay for nothing. Refused on a crevice for the same
 * reason a wall is — there is nothing there to raise.
 *
 * Returns the vertices it raised, so a cast that would do nothing can be
 * refused rather than silently charged for.
 */
export function applyMegalith(
  heightmap: Heightmap,
  centerX: number,
  centerY: number,
  radius: number = DEFAULT_MEGALITH_RADIUS,
): { x: number; y: number }[] {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const raised: { x: number; y: number }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    const vy = cy + dy;
    if (vy < 0 || vy > heightmap.height) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const vx = cx + dx;
      if (vx < 0 || vx > heightmap.width) continue;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      if (heightmap.boulder[vy][vx]) continue;
      if (heightmap.crevice[vy][vx]) continue;
      if (heightmap.vertices[vy][vx] <= heightmap.waterLevel) continue;

      // A dome rather than a plateau: the taper is what makes the slope
      // around the stone, and the slope is what stops the big houses.
      const rise = Math.round(MEGALITH_HEIGHT * (1 - distance / (radius + 1)));
      heightmap.vertices[vy][vx] = Math.min(MAX_ELEVATION, heightmap.vertices[vy][vx] + rise);
      heightmap.boulder[vy][vx] = true;
      heightmap.forest[vy][vx] = false;
      heightmap.wall[vy][vx] = false;
      raised.push({ x: vx, y: vy });
    }
  }

  return raised;
}
