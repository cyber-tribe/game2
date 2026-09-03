export type TerrainType = "grass" | "desert" | "snow" | "rock";

export interface Heightmap {
  width: number;
  height: number;
  terrain: TerrainType;
  /** Vertex heights, indexed [y][x], size (height+1) x (width+1). */
  vertices: number[][];
}

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
