import { describe, expect, it } from "vitest";
import {
  MAX_ELEVATION,
  MIN_ELEVATION,
  countFlatNeighbors,
  createHeightmap,
  isBuildable,
  raiseVertex,
  sampleElevation,
  type Heightmap,
} from "./heightmap";

function flatHeightmap(width: number, height: number, elevation: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  return { width, height, terrain: "grass", vertices };
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
