export type TerrainType = "grass" | "desert" | "snow" | "rock";

export interface Heightmap {
  width: number;
  height: number;
  terrain: TerrainType;
  /** Vertex heights, indexed [y][x], size (height+1) x (width+1). */
  vertices: number[][];
}

/** Elevation is clamped to this range — 0 is sea level. */
export const MIN_ELEVATION = 0;
export const MAX_ELEVATION = 20;

/**
 * Simple smooth pseudo-random heightmap for prototyping the renderer.
 * Real terrain generation belongs to a later worldgen step.
 */
export function createHeightmap(
  width: number,
  height: number,
  terrain: TerrainType = "grass",
): Heightmap {
  const vertices: number[][] = [];
  for (let y = 0; y <= height; y++) {
    const row: number[] = [];
    for (let x = 0; x <= width; x++) {
      const wave =
        Math.sin(x * 0.35) * 1.5 +
        Math.cos(y * 0.3) * 1.5 +
        Math.sin((x + y) * 0.15) * 2;
      row.push(Math.max(0, Math.round(wave + 3)));
    }
    vertices.push(row);
  }
  return { width, height, terrain, vertices };
}

/**
 * Raises (positive delta) or lowers (negative delta) a single vertex,
 * clamped to [MIN_ELEVATION, MAX_ELEVATION]. Mutates the heightmap in
 * place — per docs/game-system.md this is the most basic divine power,
 * meant to be called once per player click, not per frame.
 */
export function raiseVertex(heightmap: Heightmap, x: number, y: number, delta: number): void {
  const row = heightmap.vertices[y];
  if (!row || row[x] === undefined) return;
  row[x] = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, row[x] + delta));
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

/**
 * Sea level and below can't be built on or safely settled — per
 * docs/game-system.md, "海には建物を建てられず、通常の民は入ると溺れる".
 */
export function isBuildable(heightmap: Heightmap, x: number, y: number): boolean {
  return sampleElevation(heightmap, x, y) > MIN_ELEVATION;
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

/** Radius (in vertices) and per-vertex height swing of a default earthquake. */
export const DEFAULT_EARTHQUAKE_RADIUS = 3;
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
