import { describe, expect, it } from "vitest";
import { HOUSE_LEVEL_FLATNESS_REQUIREMENT, HOUSE_UPGRADE_FLATNESS_RADIUS } from "../game/constants";
import {
  DEFAULT_TSUNAMI_HEIGHT,
  MAX_ELEVATION,
  MIN_ELEVATION,
  VOLCANO_CRATER_DEPTH,
  VOLCANO_OUTER_DROP,
  VOLCANO_ROCK_HARDNESS,
  applyEarthquake,
  applyReef,
  applyTsunami,
  applyFireRain,
  applyFlower,
  applyForest,
  applyFungus,
  applyRoad,
  spreadFungus,
  FUNGUS_SPREAD_CHANCE,
  FUNGUS_WITHER_CHANCE,
  applyVolcano,
  countFlatNeighbors,
  createHeightmap,
  findLeastFlatVertex,
  flattenTile,
  isBuildable,
  isInWaterPool,
  isForest,
  isFungus,
  isRoad,
  isCrevice,
  isRock,
  REEF_HEIGHT,
  isTerrainEditAllowed,
  pickTerrainEditRule,
  raiseTile,
  raiseVertex,
  sampleElevation,
  type Heightmap,
  type TerrainEditRule,
} from "./heightmap";
function blankLayer(width: number, height: number): boolean[][] {
  return Array.from({ length: height + 1 }, () => new Array<boolean>(width + 1).fill(false));
}

function flatHeightmap(
  width: number,
  height: number,
  elevation: number,
  waterLevel: number = MIN_ELEVATION,
): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () => Array(width + 1).fill(elevation));
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness, forest: blankLayer(width, height),
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), waterLevel };
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

  it("doesn't hand a house a castle's worth of flatness for free", () => {
    // Regression guard for plan/0043-terrain-roughness.md: a too-smooth
    // wave let rounding alone produce large naturally-flat plateaus, so a
    // freshly settled house could already qualify for the top house level
    // (and often most of the way to it) before any terraforming — the
    // "flatten your land to grow a house" loop was already done by
    // worldgen. On a realistically-sized map, essentially no vertex should
    // start out already castle-flat.
    const heightmap = createHeightmap(20, 20, "grass");
    let castleReady = 0;

    for (let y = 0; y <= 20; y++) {
      for (let x = 0; x <= 20; x++) {
        const flat = countFlatNeighbors(heightmap, x, y, HOUSE_UPGRADE_FLATNESS_RADIUS);
        if (flat >= HOUSE_LEVEL_FLATNESS_REQUIREMENT.castle) castleReady++;
      }
    }

    expect(castleReady).toBe(0);
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

describe("raiseTile", () => {
  it("raises all 4 corners of the targeted tile by delta, and no others", () => {
    const heightmap = createHeightmap(3, 3);
    heightmap.vertices[1][1] = 5;
    heightmap.vertices[1][2] = 5;
    heightmap.vertices[2][2] = 5;
    heightmap.vertices[2][1] = 5;
    heightmap.vertices[0][0] = 5;

    raiseTile(heightmap, 1, 1, 3);

    expect(heightmap.vertices[1][1]).toBe(8);
    expect(heightmap.vertices[1][2]).toBe(8);
    expect(heightmap.vertices[2][2]).toBe(8);
    expect(heightmap.vertices[2][1]).toBe(8);
    // A vertex diagonally outside tile (1,1)'s own 4 corners is untouched.
    expect(heightmap.vertices[0][0]).toBe(5);
  });

  it("leaves an already-flat tile perfectly flat (all 4 corners still equal)", () => {
    const heightmap = createHeightmap(3, 3);
    heightmap.vertices[0][0] = 4;
    heightmap.vertices[0][1] = 4;
    heightmap.vertices[1][1] = 4;
    heightmap.vertices[1][0] = 4;

    raiseTile(heightmap, 0, 0, 2);

    const corners = [heightmap.vertices[0][0], heightmap.vertices[0][1], heightmap.vertices[1][1], heightmap.vertices[1][0]];
    expect(new Set(corners).size).toBe(1);
    expect(corners[0]).toBe(6);
  });

  it("clamps each corner independently at MAX_ELEVATION/MIN_ELEVATION, same as raiseVertex", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.vertices[0][0] = MAX_ELEVATION;
    heightmap.vertices[0][1] = 0;

    raiseTile(heightmap, 0, 0, 5);

    expect(heightmap.vertices[0][0]).toBe(MAX_ELEVATION);
    expect(heightmap.vertices[0][1]).toBe(5);
  });

  it("chips rockHardness off every corner it touches", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.rockHardness[0][0] = 3;
    heightmap.rockHardness[1][1] = 2;

    raiseTile(heightmap, 0, 0, 1);

    expect(heightmap.rockHardness[0][0]).toBe(2);
    expect(heightmap.rockHardness[1][1]).toBe(1);
  });
});

describe("flattenTile", () => {
  it("sets all 4 corners of the targeted tile to elevation, and no others", () => {
    const heightmap = createHeightmap(3, 3);
    heightmap.vertices[1][1] = 2;
    heightmap.vertices[1][2] = 9;
    heightmap.vertices[2][2] = 5;
    heightmap.vertices[2][1] = 1;
    heightmap.vertices[0][0] = 7;

    flattenTile(heightmap, 1, 1, 6, "both");

    expect(heightmap.vertices[1][1]).toBe(6);
    expect(heightmap.vertices[1][2]).toBe(6);
    expect(heightmap.vertices[2][2]).toBe(6);
    expect(heightmap.vertices[2][1]).toBe(6);
    // A vertex diagonally outside tile (1,1)'s own 4 corners is untouched.
    expect(heightmap.vertices[0][0]).toBe(7);
  });

  it("clamps to MIN_ELEVATION/MAX_ELEVATION, same as raiseTile", () => {
    const heightmap = createHeightmap(2, 2);

    flattenTile(heightmap, 0, 0, MAX_ELEVATION + 5, "both");
    expect(heightmap.vertices[0][0]).toBe(MAX_ELEVATION);

    flattenTile(heightmap, 0, 0, MIN_ELEVATION - 5, "both");
    expect(heightmap.vertices[0][0]).toBe(MIN_ELEVATION);
  });

  it("under raiseOnly, only ever raises a corner toward elevation, never lowers it", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.vertices[0][0] = 2; // below target — should raise
    heightmap.vertices[0][1] = 9; // above target — must stay put under raiseOnly

    flattenTile(heightmap, 0, 0, 5, "raiseOnly");

    expect(heightmap.vertices[0][0]).toBe(5);
    expect(heightmap.vertices[0][1]).toBe(9);
  });

  it("under lowerOnly, only ever lowers a corner toward elevation, never raises it", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.vertices[0][0] = 8; // above target — should lower
    heightmap.vertices[0][1] = 1; // below target — must stay put under lowerOnly

    flattenTile(heightmap, 0, 0, 5, "lowerOnly");

    expect(heightmap.vertices[0][0]).toBe(5);
    expect(heightmap.vertices[0][1]).toBe(1);
  });

  it("leaves an already-level corner untouched", () => {
    const heightmap = createHeightmap(2, 2);
    heightmap.vertices[0][0] = 5;

    flattenTile(heightmap, 0, 0, 5, "both");

    expect(heightmap.vertices[0][0]).toBe(5);
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

  it("is false once the flooded water level reaches the same height", () => {
    const heightmap = flatHeightmap(2, 2, 1, 1);
    expect(isBuildable(heightmap, 1, 1)).toBe(false);
  });

  it("is true when land still stands above a raised water level", () => {
    const heightmap = flatHeightmap(2, 2, 5, 1);
    expect(isBuildable(heightmap, 1, 1)).toBe(true);
  });
});

describe("isInWaterPool", () => {
  it("is true everywhere on a map that's entirely water", () => {
    const heightmap = flatHeightmap(4, 4, 0); // elevation 0 == waterLevel 0
    expect(isInWaterPool(heightmap, 1.5, 1.5)).toBe(true);
  });

  it("is false everywhere on dry land", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    expect(isInWaterPool(heightmap, 1.5, 1.5)).toBe(false);
  });

  it("is false for a single isolated water tile — a lone wet corner isn't a real pool", () => {
    const heightmap = flatHeightmap(5, 5, 5);
    // Dig just tile (2,2) down to sea level — every neighboring tile stays dry.
    heightmap.vertices[2][2] = 0;
    heightmap.vertices[2][3] = 0;
    heightmap.vertices[3][2] = 0;
    heightmap.vertices[3][3] = 0;

    expect(isInWaterPool(heightmap, 2.5, 2.5)).toBe(false);
  });

  it("is true once 4 tiles form an actual 2x2 square of water", () => {
    const heightmap = flatHeightmap(5, 5, 5);
    // Dig tiles (1,1), (2,1), (1,2), (2,2) — a real 2x2 pool.
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) heightmap.vertices[y][x] = 0;
    }

    expect(isInWaterPool(heightmap, 1.5, 1.5)).toBe(true); // inside the pool
    expect(isInWaterPool(heightmap, 0.5, 0.5)).toBe(false); // dry, no adjoining water block
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

describe("findLeastFlatVertex", () => {
  it("returns null on a perfectly flat neighborhood", () => {
    const heightmap = flatHeightmap(6, 6, 5);
    expect(findLeastFlatVertex(heightmap, 3, 3, 2)).toBeNull();
  });

  it("picks the single vertex that differs most from the center, with delta toward it", () => {
    const heightmap = flatHeightmap(6, 6, 5);
    heightmap.vertices[3][4] = 8; // +3 off center
    heightmap.vertices[2][3] = 3; // -2 off center, smaller gap

    const result = findLeastFlatVertex(heightmap, 3, 3, 2);

    expect(result).toEqual({ x: 4, y: 3, delta: -1 });
  });

  it("returns a delta that raises a vertex lower than the center", () => {
    const heightmap = flatHeightmap(6, 6, 5);
    heightmap.vertices[3][4] = 2;

    expect(findLeastFlatVertex(heightmap, 3, 3, 2)).toEqual({ x: 4, y: 3, delta: 1 });
  });

  it("shrinks the window near the map edge instead of looking out-of-bounds", () => {
    const heightmap = flatHeightmap(4, 4, 5);
    heightmap.vertices[0][3] = 9; // dx=3 is past radius 2 from the (0,0) corner, so out of the scanned window

    expect(findLeastFlatVertex(heightmap, 0, 0, 2)).toBeNull();
  });

  it("rounds fractional coordinates to the nearest vertex", () => {
    const heightmap = flatHeightmap(6, 6, 5);
    heightmap.vertices[3][4] = 9; // one step right of the vertex nearest (3.4, 3.4)

    expect(findLeastFlatVertex(heightmap, 3.4, 3.4, 1)).toEqual({ x: 4, y: 3, delta: -1 });
  });
});

describe("applyEarthquake", () => {
  const straight = () => 0.5; // rng=0.5 -> zero wander, a dead-straight crack

  it("tears a crevice running from the origin along the given direction", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyEarthquake(heightmap, 5, 10, 1, 0, 6, straight);

    for (let x = 6; x <= 11; x++) {
      expect(isCrevice(heightmap, x, 10)).toBe(true);
    }
  });

  it("runs the other way when aimed the other way — the direction is the point", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyEarthquake(heightmap, 15, 10, -1, 0, 6, straight);

    expect(isCrevice(heightmap, 10, 10)).toBe(true);
    expect(isCrevice(heightmap, 20, 10)).toBe(false);
  });

  it("leaves ground off the crack's line untouched — it is a line, not a disc", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyEarthquake(heightmap, 5, 10, 1, 0, 6, straight);

    expect(isCrevice(heightmap, 8, 16)).toBe(false);
    expect(heightmap.vertices[16][8]).toBe(5);
  });

  it("carves the torn ground down to the floor", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyEarthquake(heightmap, 5, 10, 1, 0, 6, straight);

    expect(heightmap.vertices[10][8]).toBe(MIN_ELEVATION);
  });

  it("makes the torn ground unbuildable", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyEarthquake(heightmap, 5, 10, 1, 0, 6, straight);

    expect(isBuildable(heightmap, 8, 10)).toBe(false);
  });

  it("stops at the map edge instead of throwing", () => {
    const heightmap = flatHeightmap(6, 6, 5);

    expect(() => applyEarthquake(heightmap, 3, 3, 1, 0, 20, straight)).not.toThrow();
  });

  it("still does something when given no direction at all", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyEarthquake(heightmap, 5, 10, 0, 0, 4, straight);

    expect(heightmap.crevice.flat().filter(Boolean).length).toBeGreaterThan(0);
  });

  /**
   * The original's "修復されるまで残る": a crevice persists, but is not
   * permanent. Filling it back in closes it — today that is terraforming;
   * the original gives the job to 花 (#7), which does not exist yet.
   */
  it("closes again once the ground is raised back out of the floor", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyEarthquake(heightmap, 5, 10, 1, 0, 6, straight);
    expect(isCrevice(heightmap, 8, 10)).toBe(true);

    raiseVertex(heightmap, 8, 10, 1);

    expect(isCrevice(heightmap, 8, 10)).toBe(false);
  });
});

describe("applyVolcano", () => {
  it("shapes a cone-with-crater within radius, and marks every affected vertex as rock", () => {
    const heightmap = flatHeightmap(10, 10, 3);

    // lavaVolume 0: the cone in isolation. The flow gets its own tests
    // below, and letting it run here would bury the very vertices this one
    // checks are untouched.
    applyVolcano(heightmap, 5, 5, 1, 7, 0);

    // Rim (the 4 orthogonal neighbors, exactly `radius` out) is the peak.
    for (const [dy, dx] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      expect(heightmap.vertices[5 + dy][5 + dx]).toBe(MAX_ELEVATION);
    }
    // Center dips below the rim — a crater floor, not a flat plateau.
    expect(heightmap.vertices[5][5]).toBe(MAX_ELEVATION - VOLCANO_CRATER_DEPTH);
    // Diagonal corners (outside the circular rim but still inside the
    // square footprint — see volcano.ts's own Chebyshev-footprint note)
    // sit lower still: the cone's outer slope.
    for (const [dy, dx] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      expect(heightmap.vertices[5 + dy][5 + dx]).toBe(MAX_ELEVATION - VOLCANO_OUTER_DROP);
    }
    // Every vertex in the footprint (all 9) is rock, regardless of elevation.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(heightmap.rockHardness[5 + dy][5 + dx]).toBe(7);
      }
    }
    expect(heightmap.vertices[5][7]).toBe(3); // outside radius
    expect(heightmap.rockHardness[5][7]).toBe(0);
  });

  it("returns every vertex it covered, so the ECS side can bury what stood there", () => {
    const heightmap = flatHeightmap(10, 10, 3);

    const covered = applyVolcano(heightmap, 5, 5, 1, 7, 0);

    expect(covered).toHaveLength(9); // the 3x3 cone footprint
    expect(covered).toContainEqual({ x: 5, y: 5 });
  });

  it("makes the affected area unbuildable", () => {
    const heightmap = flatHeightmap(6, 6, 3);

    applyVolcano(heightmap, 3, 3, 0, VOLCANO_ROCK_HARDNESS, 0);

    expect(isBuildable(heightmap, 3, 3)).toBe(false);
  });

  it("uses VOLCANO_ROCK_HARDNESS by default", () => {
    const heightmap = flatHeightmap(6, 6, 3);

    applyVolcano(heightmap, 3, 3, 0, undefined, 0);

    expect(heightmap.rockHardness[3][3]).toBe(VOLCANO_ROCK_HARDNESS);
  });

  it("eventually clears once enough terrain edits chip the hardness away", () => {
    const heightmap = flatHeightmap(6, 6, 3);
    applyVolcano(heightmap, 3, 3, 0, 2, 0);

    raiseVertex(heightmap, 3, 3, -1);
    expect(isRock(heightmap, 3, 3)).toBe(true);

    raiseVertex(heightmap, 3, 3, -1);
    expect(isRock(heightmap, 3, 3)).toBe(false);
  });

  it("floods lava beyond the cone, covering far more ground than the cone itself", () => {
    const heightmap = flatHeightmap(30, 30, 3);

    const covered = applyVolcano(heightmap, 15, 15, 1, 7, 20);

    expect(covered.length).toBe(9 + 20);
    expect(covered.filter(({ x, y }) => Math.abs(x - 15) > 1 || Math.abs(y - 15) > 1).length).toBe(20);
  });

  /**
   * The interaction the miracle is played around
   * (docs/original-miracles.md #24): "溶岩は……水地形で止まります". A
   * channel is a firebreak; high ground is not.
   */
  it("stops at water instead of crossing it", () => {
    const heightmap = flatHeightmap(30, 30, 3);
    // A moat two vertices thick, all the way around the volcano.
    for (let y = 0; y <= 30; y++) {
      for (let x = 0; x <= 30; x++) {
        const ring = Math.max(Math.abs(x - 15), Math.abs(y - 15));
        if (ring === 4 || ring === 5) heightmap.vertices[y][x] = MIN_ELEVATION;
      }
    }

    applyVolcano(heightmap, 15, 15, 1, 7, 200);

    expect(heightmap.rockHardness[15][21]).toBe(0); // beyond the moat
    expect(heightmap.rockHardness[19][15]).toBe(0);
  });

  it("runs downhill, taking the low ground before the high", () => {
    const heightmap = flatHeightmap(30, 30, 8);
    // A valley running east from the volcano.
    for (let x = 16; x <= 26; x++) heightmap.vertices[15][x] = 1;

    applyVolcano(heightmap, 15, 15, 1, 7, 8);

    expect(heightmap.rockHardness[15][22]).toBeGreaterThan(0); // down the valley
    expect(heightmap.rockHardness[22][15]).toBe(0); // across the plateau
  });

  it("spends exactly its volume, no more", () => {
    const heightmap = flatHeightmap(30, 30, 3);

    const covered = applyVolcano(heightmap, 15, 15, 0, 7, 5);

    expect(covered.length).toBe(1 + 5);
  });

  it("does not touch vertices outside the map bounds", () => {
    const heightmap = flatHeightmap(4, 4, 3);

    expect(() => applyVolcano(heightmap, 0, 0, 3, undefined, 0)).not.toThrow();
    // (0, 0) is the volcano's own center, which — with a real rim to sit
    // below (radius >= 1) — is the crater floor, not the rim itself.
    expect(heightmap.vertices[0][0]).toBe(MAX_ELEVATION - VOLCANO_CRATER_DEPTH);
  });
});

describe("isTerrainEditAllowed", () => {
  it("allows both directions under 'both'", () => {
    expect(isTerrainEditAllowed("both", 1)).toBe(true);
    expect(isTerrainEditAllowed("both", -1)).toBe(true);
  });

  it("allows only positive deltas under 'raiseOnly'", () => {
    expect(isTerrainEditAllowed("raiseOnly", 1)).toBe(true);
    expect(isTerrainEditAllowed("raiseOnly", -1)).toBe(false);
  });

  it("allows only negative deltas under 'lowerOnly'", () => {
    expect(isTerrainEditAllowed("lowerOnly", -1)).toBe(true);
    expect(isTerrainEditAllowed("lowerOnly", 1)).toBe(false);
  });
});

describe("pickTerrainEditRule", () => {
  const weights: Record<TerrainEditRule, number> = { both: 2, raiseOnly: 1, lowerOnly: 1 };

  it("picks the rule whose weighted slice the roll lands in", () => {
    // Slices in Object.entries order: both=[0,2), raiseOnly=[2,3), lowerOnly=[3,4).
    expect(pickTerrainEditRule(weights, () => 0)).toBe("both");
    expect(pickTerrainEditRule(weights, () => 0.49)).toBe("both");
    expect(pickTerrainEditRule(weights, () => 0.51)).toBe("raiseOnly");
    expect(pickTerrainEditRule(weights, () => 0.99)).toBe("lowerOnly");
  });

  it("never picks a rule with zero weight", () => {
    const onlyBoth: Record<TerrainEditRule, number> = { both: 1, raiseOnly: 0, lowerOnly: 0 };
    for (let roll = 0; roll < 1; roll += 0.1) {
      expect(pickTerrainEditRule(onlyBoth, () => roll)).toBe("both");
    }
  });

  it("defaults to Math.random when no rng is given", () => {
    expect(["both", "raiseOnly", "lowerOnly"]).toContain(pickTerrainEditRule(weights));
  });
});

describe("applyTsunami", () => {
  it("erodes low ground near the origin down to sea level", () => {
    const heightmap = flatHeightmap(20, 20, 2);

    applyTsunami(heightmap, 10, 10);

    expect(heightmap.vertices[10][10]).toBe(heightmap.waterLevel);
  });

  it("leaves ground standing above the wave's crest alone", () => {
    const heightmap = flatHeightmap(20, 20, 2);
    heightmap.vertices[10][12] = DEFAULT_TSUNAMI_HEIGHT + 5;

    applyTsunami(heightmap, 10, 10);

    expect(heightmap.vertices[10][12]).toBe(DEFAULT_TSUNAMI_HEIGHT + 5);
  });

  it("does not move the sea level — this is a local wave, not a flood", () => {
    const heightmap = flatHeightmap(20, 20, 2);
    const before = heightmap.waterLevel;

    applyTsunami(heightmap, 10, 10);

    expect(heightmap.waterLevel).toBe(before);
  });

  it("leaves ground beyond the radius untouched", () => {
    const heightmap = flatHeightmap(40, 40, 2);

    applyTsunami(heightmap, 5, 5, 4);

    expect(heightmap.vertices[5][30]).toBe(2);
  });

  it("weakens with distance, so ground the crest clears near the origin survives further out", () => {
    // At the rim the crest is 0, so anything above sea level survives there
    // however low it is — the wave is a cone, not a cylinder.
    const heightmap = flatHeightmap(40, 40, 1);

    applyTsunami(heightmap, 20, 20, 10, 4);

    expect(heightmap.vertices[20][20]).toBe(heightmap.waterLevel);
    expect(heightmap.vertices[20][29]).toBe(1);
  });

  /**
   * The interaction the whole rework exists for. docs/original-miracles.md:
   * "山や崖を防波堤として作っておけば、その背後を守れます" — a ridge does
   * not merely survive the wave, it shelters what is behind it.
   */
  it("is stopped by a ridge, sheltering the ground behind it", () => {
    const heightmap = flatHeightmap(40, 40, 1);
    for (let y = 0; y <= 40; y++) heightmap.vertices[y][24] = MAX_ELEVATION;

    applyTsunami(heightmap, 20, 20, 12, 6);

    expect(heightmap.vertices[20][22]).toBe(heightmap.waterLevel);
    expect(heightmap.vertices[20][26]).toBe(1);
  });

  /**
   * A reef sits at sea level by construction, so it can never out-top a
   * strong wave — it stops one because rock breaks the wave outright.
   * Without that rule a reef would only defend against the weakest
   * tsunamis, which are exactly the ones nobody needs defending against,
   * and the original's "岩礁にも津波を食い止める効果があります" would be a
   * dead mechanic.
   */
  it("is stopped by a reef wall even though the reef is far shorter than the wave", () => {
    const heightmap = flatHeightmap(40, 40, 1);
    // Spanning the wave's whole reach: anything shorter is flowed around
    // (see the next test), and beyond this span the radius stops it anyway.
    for (let y = 8; y <= 32; y++) {
      heightmap.vertices[y][24] = MIN_ELEVATION;
      applyReef(heightmap, 24, y);
    }

    applyTsunami(heightmap, 20, 20, 12, 6);

    expect(heightmap.vertices[20][26]).toBe(1);
  });

  /**
   * The flip side, and a deliberate design choice rather than an accident:
   * the wave is a spreading front, so it flows *around* a partial barrier.
   * A breakwater has to actually be built as a wall to shelter anything —
   * dropping one reef in the water is not a defence. This is what keeps
   * "build a seawall" a real decision instead of a single cheap cast that
   * switches the enemy's most expensive miracle off.
   */
  it("flows around a reef too short to span the wave, sheltering nothing", () => {
    const heightmap = flatHeightmap(40, 40, 1);
    for (let y = 19; y <= 21; y++) {
      heightmap.vertices[y][24] = MIN_ELEVATION;
      applyReef(heightmap, 24, y);
    }

    applyTsunami(heightmap, 20, 20, 12, 6);

    expect(heightmap.vertices[20][26]).toBe(heightmap.waterLevel);
  });
});

describe("applyReef", () => {
  it("raises rock just above sea level on a water vertex", () => {
    const heightmap = flatHeightmap(10, 10, MIN_ELEVATION);

    expect(applyReef(heightmap, 5, 5)).toBe(true);
    expect(heightmap.vertices[5][5]).toBe(heightmap.waterLevel + REEF_HEIGHT);
    expect(isRock(heightmap, 5, 5)).toBe(true);
  });

  it("is not buildable land — that is the point of a reef", () => {
    const heightmap = flatHeightmap(10, 10, MIN_ELEVATION);

    applyReef(heightmap, 5, 5);

    expect(isBuildable(heightmap, 5, 5)).toBe(false);
  });

  it("refuses dry land, where it would just be a pointless volcano", () => {
    const heightmap = flatHeightmap(10, 10, 5);

    expect(applyReef(heightmap, 5, 5)).toBe(false);
    expect(heightmap.vertices[5][5]).toBe(5);
  });

  it("refuses vertices outside the map", () => {
    const heightmap = flatHeightmap(10, 10, MIN_ELEVATION);

    expect(applyReef(heightmap, -1, 5)).toBe(false);
    expect(applyReef(heightmap, 5, 99)).toBe(false);
  });
});

describe("applyForest", () => {
  it("plants woodland around the cast point", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyForest(heightmap, 10, 10, 2);

    expect(isForest(heightmap, 10, 10)).toBe(true);
    expect(isForest(heightmap, 11, 10)).toBe(true);
  });

  it("leaves ground beyond the radius bare", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyForest(heightmap, 10, 10, 2);

    expect(isForest(heightmap, 15, 10)).toBe(false);
  });

  it("does not grow on water", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);

    expect(applyForest(heightmap, 10, 10, 2)).toEqual([]);
  });

  it("does not grow on volcanic rock", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyVolcano(heightmap, 10, 10, 0);

    applyForest(heightmap, 10, 10, 0);

    expect(isForest(heightmap, 10, 10)).toBe(false);
  });

  it("reports nothing planted when it plants nothing, so the caller can refuse the cast", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyForest(heightmap, 10, 10, 1);

    expect(applyForest(heightmap, 10, 10, 1)).toEqual([]);
  });
});

describe("applyFireRain", () => {
  it("burns a circle of bare ground and stops there", () => {
    const heightmap = flatHeightmap(30, 30, 5);

    const burned = applyFireRain(heightmap, 15, 15, 2);

    expect(burned).toContainEqual({ x: 15, y: 15 });
    expect(burned.some(({ x, y }) => Math.hypot(x - 15, y - 15) > 2)).toBe(false);
  });

  /**
   * The interaction both of these exist for
   * (docs/original-miracles.md): "森を作ってから火の雨を使うと広範囲へ
   * 延焼する". Without it, a forest is a plain growth buff and fire rain is
   * a plain circle — and 29 miracles would just be 29 damage numbers.
   */
  it("runs the length of a forest, far beyond where it fell", () => {
    const heightmap = flatHeightmap(40, 40, 5);
    for (let x = 15; x <= 35; x++) heightmap.forest[20][x] = true;

    const burned = applyFireRain(heightmap, 16, 20, 1);

    expect(burned).toContainEqual({ x: 35, y: 20 });
  });

  it("consumes the woodland it burns through", () => {
    const heightmap = flatHeightmap(40, 40, 5);
    for (let x = 15; x <= 35; x++) heightmap.forest[20][x] = true;

    applyFireRain(heightmap, 16, 20, 1);

    expect(heightmap.forest[20].some(Boolean)).toBe(false);
  });

  it("does not jump a gap in the woodland — the fire needs fuel to carry it", () => {
    const heightmap = flatHeightmap(40, 40, 5);
    for (let x = 15; x <= 20; x++) heightmap.forest[20][x] = true;
    for (let x = 25; x <= 35; x++) heightmap.forest[20][x] = true;

    applyFireRain(heightmap, 16, 20, 1);

    expect(heightmap.forest[20][30]).toBe(true);
  });
});

describe("applyFlower", () => {
  /**
   * The point of this miracle: it is the counter to three others at once
   * (docs/original-miracles.md #7). These first two tests are the loops
   * that plan/archived/0095 and plan/archived/0096 deliberately left open.
   */
  it("closes an earthquake's crevice and gives back buildable land", () => {
    const heightmap = flatHeightmap(30, 30, 5);
    applyEarthquake(heightmap, 10, 15, 1, 0, 6, () => 0.5);
    expect(isBuildable(heightmap, 13, 15)).toBe(false);

    applyFlower(heightmap, 13, 15, 2);

    expect(isCrevice(heightmap, 13, 15)).toBe(false);
    expect(isBuildable(heightmap, 13, 15)).toBe(true);
  });

  it("clears a volcano's rock and the lava that ran from it", () => {
    const heightmap = flatHeightmap(30, 30, 5);
    applyVolcano(heightmap, 15, 15, 1, 7, 0);
    expect(isRock(heightmap, 15, 15)).toBe(true);

    applyFlower(heightmap, 15, 15, 2);

    expect(isRock(heightmap, 15, 15)).toBe(false);
    expect(isBuildable(heightmap, 15, 15)).toBe(true);
  });

  it("lifts a crevice clear of the water rather than leaving a lake behind", () => {
    // A crevice is carved to the floor, which at the default sea level is
    // underwater — un-flagging it alone would hand back a pond.
    const heightmap = flatHeightmap(30, 30, 5);
    applyEarthquake(heightmap, 10, 15, 1, 0, 6, () => 0.5);

    applyFlower(heightmap, 13, 15, 2);

    expect(heightmap.vertices[15][13]).toBeGreaterThan(heightmap.waterLevel);
  });

  it("leaves healthy ground exactly as it was", () => {
    const heightmap = flatHeightmap(30, 30, 5);

    applyFlower(heightmap, 15, 15, 2);

    expect(heightmap.vertices[15][15]).toBe(5);
  });

  it("reports nothing healed when there is nothing to heal, so the caller can refuse the cast", () => {
    const heightmap = flatHeightmap(30, 30, 5);

    expect(applyFlower(heightmap, 15, 15, 2)).toEqual([]);
  });

  it("does not reach past its radius", () => {
    const heightmap = flatHeightmap(30, 30, 5);
    applyVolcano(heightmap, 25, 15, 0, 7, 0);

    applyFlower(heightmap, 15, 15, 2);

    expect(isRock(heightmap, 25, 15)).toBe(true);
  });
});

describe("applyRoad", () => {
  it("paves the ground around the cast point", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyRoad(heightmap, 10, 10, 2);

    expect(isRoad(heightmap, 10, 10)).toBe(true);
    expect(isRoad(heightmap, 11, 10)).toBe(true);
    expect(isRoad(heightmap, 15, 10)).toBe(false);
  });

  it("does not pave water", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);

    expect(applyRoad(heightmap, 10, 10, 2)).toEqual([]);
  });

  it("does not pave ground already lost to 毒カビ — a road is laid ahead of an outbreak, not over it", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.fungus[10][10] = true;

    applyRoad(heightmap, 10, 10, 0);

    expect(isRoad(heightmap, 10, 10)).toBe(false);
  });

  it("reports nothing paved when it paves nothing, so the caller can refuse the cast", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyRoad(heightmap, 10, 10, 1);

    expect(applyRoad(heightmap, 10, 10, 1)).toEqual([]);
  });
});

describe("applyFungus", () => {
  it("seeds rot at the cast point", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyFungus(heightmap, 10, 10, 1);

    expect(isFungus(heightmap, 10, 10)).toBe(true);
  });

  it("does not take root on a road", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyRoad(heightmap, 10, 10, 0);

    expect(applyFungus(heightmap, 10, 10, 0)).toEqual([]);
  });

  it("does not take root on water", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);

    expect(applyFungus(heightmap, 10, 10, 1)).toEqual([]);
  });

  it("makes the ground it covers unbuildable — it swallows buildings, so none can be raised on it", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyFungus(heightmap, 10, 10, 0);

    expect(isBuildable(heightmap, 10, 10)).toBe(false);
  });
});

describe("spreadFungus", () => {
  /**
   * Below every threshold: every reachable vertex is taken, and every
   * vertex with any exposure at all also withers. Tests that only care
   * about where the rot can reach seed a solid 3x3 block, so the front
   * keeps advancing even while the old fringe dies back behind it.
   */
  const spreadsEverywhere = () => 0;
  /** At or above the spread threshold, below the wither one: nothing grows, the fringe dies. */
  const alwaysWithers = () => FUNGUS_SPREAD_CHANCE;

  const seedBlock = (heightmap: Heightmap, cx: number, cy: number) => {
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) heightmap.fungus[y][x] = true;
  };

  it("creeps onto neighbouring ground", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.fungus[10][10] = true;

    spreadFungus(heightmap, spreadsEverywhere);

    expect(isFungus(heightmap, 11, 10)).toBe(true);
    expect(isFungus(heightmap, 10, 11)).toBe(true);
  });

  /**
   * The interaction both 道 and 毒カビ exist for
   * (docs/original-miracles.md #11): "道路を作る……毒カビの進行を止める".
   * A road that merely made walkers faster would be a convenience; a road
   * that quarantines is a decision.
   */
  it("never crosses a road, however certain the spread", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    for (let y = 0; y <= 20; y++) heightmap.road[y][13] = true;
    seedBlock(heightmap, 10, 10);

    for (let step = 0; step < 20; step++) spreadFungus(heightmap, spreadsEverywhere);

    expect(isFungus(heightmap, 13, 10)).toBe(false);
    expect(isFungus(heightmap, 14, 10)).toBe(false);
    // ...while the same rot runs freely the other way.
    expect(isFungus(heightmap, 5, 10)).toBe(true);
  });

  it("does not cross water either", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    for (let y = 0; y <= 20; y++) heightmap.vertices[y][13] = MIN_ELEVATION;
    seedBlock(heightmap, 10, 10);

    for (let step = 0; step < 20; step++) spreadFungus(heightmap, spreadsEverywhere);

    expect(isFungus(heightmap, 14, 10)).toBe(false);
  });

  it("lets an unsupported patch die back on its own — the original's 自然消滅", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.fungus[10][10] = true;

    const { withered } = spreadFungus(heightmap, alwaysWithers);

    expect(withered).toEqual([{ x: 10, y: 10 }]);
    expect(isFungus(heightmap, 10, 10)).toBe(false);
  });

  it("keeps the inside of a solid patch even while its fringe dies back", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) heightmap.fungus[y][x] = true;

    spreadFungus(heightmap, alwaysWithers);

    expect(isFungus(heightmap, 10, 10)).toBe(true);
  });

  /**
   * The die-back is graded by exposure rather than a threshold — a vertex
   * walled in on all four sides is safe however unlucky the roll, which is
   * what lets a dense outbreak persist while a thin one frays away.
   */
  it("never withers a vertex surrounded on all four sides, however bad the roll", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) heightmap.fungus[y][x] = true;

    const { withered } = spreadFungus(heightmap, () => 0);

    expect(withered).not.toContainEqual({ x: 10, y: 10 });
    expect(withered.length).toBeGreaterThan(0);
  });

  /**
   * The original's "複数設置すると大繁殖" — spreading per fungus
   * *neighbour* rather than at a flat rate is what makes two overlapping
   * casts grow several times faster than one, with no special case for it.
   */
  it("grows faster where several patches meet", () => {
    const lone = flatHeightmap(20, 20, 5);
    lone.fungus[10][9] = true;
    const cluster = flatHeightmap(20, 20, 5);
    for (const [x, y] of [[9, 10], [11, 10], [10, 9]]) cluster.fungus[y][x] = true;

    // A rate this vertex reaches only with 2+ fungus neighbours.
    const twoNeighborsOnly = () => FUNGUS_SPREAD_CHANCE * 1.5;
    spreadFungus(lone, twoNeighborsOnly);
    spreadFungus(cluster, twoNeighborsOnly);

    expect(isFungus(lone, 10, 10)).toBe(false);
    expect(isFungus(cluster, 10, 10)).toBe(true);
  });

  it("decides growth and die-back against the same starting state, so nothing grows and dies in one step", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.fungus[10][10] = true;

    // Below both thresholds: everything grows, and every under-supported
    // vertex withers.
    const { grown, withered } = spreadFungus(heightmap, () => 0);

    expect(withered).toEqual([{ x: 10, y: 10 }]);
    for (const { x, y } of grown) expect(isFungus(heightmap, x, y)).toBe(true);
    expect(FUNGUS_WITHER_CHANCE).toBeGreaterThan(0);
  });
});
