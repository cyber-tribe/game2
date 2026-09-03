import { describe, expect, it } from "vitest";
import {
  MAX_ELEVATION,
  MIN_ELEVATION,
  VOLCANO_ROCK_HARDNESS,
  applyEarthquake,
  applyVolcano,
  countFlatNeighbors,
  createHeightmap,
  isBuildable,
  isRock,
  raiseVertex,
  sampleElevation,
  type Heightmap,
} from "./heightmap";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness };
}

describe("createHeightmap", () => {
  it("produces a (height+1) x (width+1) vertex grid with non-negative heights", () => {
    const heightmap = createHeightmap(4, 3);

    expect(heightmap.vertices).toHaveLength(4);
    for (const row of heightmap.vertices) {
      expect(row).toHaveLength(5);
      for (const value of row) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("raiseVertex", () => {
  it("adds delta to the targeted vertex only", () => {
    const heightmap = createHeightmap(2, 2);
    const before = heightmap.vertices[1][1];

    raiseVertex(heightmap, 1, 1, 3);

    expect(heightmap.vertices[1][1]).toBe(before + 3);
    expect(heightmap.vertices[0][0]).not.toBe(before + 3);
  });

  it("clamps at MIN_ELEVATION when lowering below it", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.vertices[0][0] = 1;

    raiseVertex(heightmap, 0, 0, -5);

    expect(heightmap.vertices[0][0]).toBe(MIN_ELEVATION);
  });

  it("clamps at MAX_ELEVATION when raising above it", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.vertices[0][0] = MAX_ELEVATION - 1;

    raiseVertex(heightmap, 0, 0, 5);

    expect(heightmap.vertices[0][0]).toBe(MAX_ELEVATION);
  });

  it("does nothing when the coordinates are out of bounds", () => {
    const heightmap = createHeightmap(2, 2);

    expect(() => raiseVertex(heightmap, 99, 99, 1)).not.toThrow();
  });

  it("chips one point off a vertex's rockHardness, if any", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.rockHardness[0][0] = 3;

    raiseVertex(heightmap, 0, 0, 1);

    expect(heightmap.rockHardness[0][0]).toBe(2);
  });

  it("leaves rockHardness at 0 alone (never goes negative)", () => {
    const heightmap = createHeightmap(2, 2);

    raiseVertex(heightmap, 0, 0, 1);

    expect(heightmap.rockHardness[0][0]).toBe(0);
  });
});

describe("sampleElevation", () => {
  it("returns the exact vertex height at integer coordinates", () => {
    const heightmap = createHeightmap(4, 4);
    heightmap.vertices[2][3] = 7;

    expect(sampleElevation(heightmap, 3, 2)).toBe(7);
  });

  it("bilinearly interpolates between the four surrounding vertices", () => {
    const heightmap = flatHeightmap(2, 2, 0);
    heightmap.vertices[0][0] = 0;
    heightmap.vertices[0][1] = 10;
    heightmap.vertices[1][0] = 0;
    heightmap.vertices[1][1] = 10;

    expect(sampleElevation(heightmap, 0.5, 0)).toBeCloseTo(5);
    expect(sampleElevation(heightmap, 1, 0)).toBeCloseTo(10);
  });

  it("clamps out-of-range coordinates to the grid edge", () => {
    const heightmap = flatHeightmap(2, 2, 3);

    expect(sampleElevation(heightmap, -5, -5)).toBe(3);
    expect(sampleElevation(heightmap, 99, 99)).toBe(3);
  });
});

describe("isBuildable", () => {
  it("is false at or below sea level", () => {
    const heightmap = flatHeightmap(2, 2, MIN_ELEVATION);
    expect(isBuildable(heightmap, 1, 1)).toBe(false);
  });

  it("is true above sea level", () => {
    const heightmap = flatHeightmap(2, 2, MIN_ELEVATION + 1);
    expect(isBuildable(heightmap, 1, 1)).toBe(true);
  });

  it("is false on volcano rock even above sea level", () => {
    const heightmap = flatHeightmap(2, 2, MIN_ELEVATION + 1);
    heightmap.rockHardness[1][1] = 5;

    expect(isBuildable(heightmap, 1, 1)).toBe(false);
  });
});

describe("isRock", () => {
  it("is false where rockHardness is 0", () => {
    const heightmap = flatHeightmap(2, 2, 5);
    expect(isRock(heightmap, 1, 1)).toBe(false);
  });

  it("is true where rockHardness is above 0", () => {
    const heightmap = flatHeightmap(2, 2, 5);
    heightmap.rockHardness[1][1] = 1;

    expect(isRock(heightmap, 1, 1)).toBe(true);
  });

  it("rounds fractional coordinates to the nearest vertex", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    heightmap.rockHardness[2][2] = 1;

    expect(isRock(heightmap, 2.4, 1.6)).toBe(true);
  });
});

describe("countFlatNeighbors", () => {
  it("counts every vertex in radius on a perfectly flat map, including the center", () => {
    const heightmap = flatHeightmap(6, 6, 5);
    expect(countFlatNeighbors(heightmap, 3, 3, 2)).toBe(5 * 5);
  });

  it("excludes vertices whose height differs from the center", () => {
    const heightmap = flatHeightmap(6, 6, 5);
    heightmap.vertices[3][4] = 9; // one neighbor raised out of the 5x5 window

    expect(countFlatNeighbors(heightmap, 3, 3, 2)).toBe(5 * 5 - 1);
  });

  it("shrinks the window near the map edge instead of counting out-of-bounds vertices", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    // center at the corner (0,0): only the 3x3 quadrant inside the map counts
    expect(countFlatNeighbors(heightmap, 0, 0, 2)).toBe(3 * 3);
  });

  it("rounds fractional coordinates to the nearest vertex", () => {
    const heightmap = flatHeightmap(6, 6, 5);
    heightmap.vertices[3][3] = 9;

    expect(countFlatNeighbors(heightmap, 3.4, 3.4, 0)).toBe(1);
  });
});

describe("applyEarthquake", () => {
  it("perturbs every vertex within radius and leaves the rest untouched", () => {
    const heightmap = flatHeightmap(10, 10, 5);

    applyEarthquake(heightmap, 5, 5, 2, 3, () => 1); // rng=1 -> delta always +maxDelta

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        expect(heightmap.vertices[5 + dy][5 + dx]).toBe(8);
      }
    }
    expect(heightmap.vertices[5][8]).toBe(5); // outside radius
    expect(heightmap.vertices[8][5]).toBe(5); // outside radius
  });

  it("can lower vertices too, clamped at MIN_ELEVATION", () => {
    const heightmap = flatHeightmap(6, 6, 2);

    applyEarthquake(heightmap, 3, 3, 1, 5, () => 0); // rng=0 -> delta always -maxDelta

    expect(heightmap.vertices[3][3]).toBe(MIN_ELEVATION);
  });

  it("clamps at MAX_ELEVATION when the swing would push a vertex too high", () => {
    const heightmap = flatHeightmap(6, 6, MAX_ELEVATION - 1);

    applyEarthquake(heightmap, 3, 3, 0, 5, () => 1); // rng=1 -> delta always +maxDelta

    expect(heightmap.vertices[3][3]).toBe(MAX_ELEVATION);
  });

  it("does not touch vertices outside the map bounds", () => {
    const heightmap = flatHeightmap(4, 4, 5);

    expect(() => applyEarthquake(heightmap, 0, 0, 3, 4, () => 1)).not.toThrow();
    expect(heightmap.vertices[0][0]).toBe(9);
  });
});

describe("applyVolcano", () => {
  it("raises every vertex within radius to MAX_ELEVATION and marks it as rock", () => {
    const heightmap = flatHeightmap(10, 10, 3);

    applyVolcano(heightmap, 5, 5, 1, 7);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(heightmap.vertices[5 + dy][5 + dx]).toBe(MAX_ELEVATION);
        expect(heightmap.rockHardness[5 + dy][5 + dx]).toBe(7);
      }
    }
    expect(heightmap.vertices[5][7]).toBe(3); // outside radius
    expect(heightmap.rockHardness[5][7]).toBe(0);
  });

  it("makes the affected area unbuildable", () => {
    const heightmap = flatHeightmap(6, 6, 3);

    applyVolcano(heightmap, 3, 3, 0);

    expect(isBuildable(heightmap, 3, 3)).toBe(false);
  });

  it("uses VOLCANO_ROCK_HARDNESS by default", () => {
    const heightmap = flatHeightmap(6, 6, 3);

    applyVolcano(heightmap, 3, 3, 0);

    expect(heightmap.rockHardness[3][3]).toBe(VOLCANO_ROCK_HARDNESS);
  });

  it("eventually clears once enough terrain edits chip the hardness away", () => {
    const heightmap = flatHeightmap(6, 6, 3);
    applyVolcano(heightmap, 3, 3, 0, 2);

    raiseVertex(heightmap, 3, 3, -1);
    expect(isRock(heightmap, 3, 3)).toBe(true);

    raiseVertex(heightmap, 3, 3, -1);
    expect(isRock(heightmap, 3, 3)).toBe(false);
  });

  it("does not touch vertices outside the map bounds", () => {
    const heightmap = flatHeightmap(4, 4, 3);

    expect(() => applyVolcano(heightmap, 0, 0, 3)).not.toThrow();
    expect(heightmap.vertices[0][0]).toBe(MAX_ELEVATION);
  });
});
