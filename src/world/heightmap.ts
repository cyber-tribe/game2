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
