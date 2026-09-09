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
  AUTO_FLATTEN_SIZE,
  planAutoFlatten,
  megalithScatterCandidates,
  MEGALITH_SCATTER_RADIUS,
  applyTsunami,
  applyFireRain,
  applyFlower,
  applyForest,
  applyFungus,
  applyRoad,
  applyWall,
  isLevelVertex,
  touchesLand,
  applyMegalith,
  DEFAULT_MEGALITH_RADIUS,
  isBoulder,
  MEGALITH_HEIGHT,
  isWall,
  WALL_ELEVATION_RISE,
  spreadFungus,
  FUNGUS_SPREAD_CHANCE,
  FUNGUS_WITHER_CHANCE,
  applyVolcano,
  VOLCANO_PUDDLES,
  VOLCANO_PUDDLE_RING,
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
  REEF_LENGTH,
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
      crevice: blankLayer(width, height), scorched: blankLayer(width, height), road: blankLayer(width, height), fungus: blankLayer(width, height), wall: blankLayer(width, height), boulder: blankLayer(width, height), waterLevel };
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

describe("planAutoFlatten", () => {
  /**
   * 「Xボタンで建物を中心に7x7マスの平地を確保」. The size is the promise: a
   * plot this wide is 8x8 vertices, comfortably more than the 5x5 window
   * countFlatNeighbors checks at HOUSE_UPGRADE_FLATNESS_RADIUS, so the
   * house it is aimed at can actually reach 城砦 on it.
   */
  it("plans the full AUTO_FLATTEN_SIZE square around the centre", () => {
    const heightmap = flatHeightmap(30, 30, 3);
    // Every tile bumpy, so none is filtered out for already being level.
    for (let y = 0; y <= 30; y++) {
      for (let x = 0; x <= 30; x++) heightmap.vertices[y][x] = (x + y) % 2 === 0 ? 3 : 5;
    }

    const { tiles } = planAutoFlatten(heightmap, 15, 15, "both");

    expect(tiles).toHaveLength(AUTO_FLATTEN_SIZE * AUTO_FLATTEN_SIZE);
    const half = Math.floor(AUTO_FLATTEN_SIZE / 2);
    expect(tiles.every((t) => Math.abs(t.x - 15) <= half && Math.abs(t.y - 15) <= half)).toBe(true);
  });

  /**
   * The point of aiming at a building: the ground it stands on must not
   * move out from under it. Averaging the whole 7x7 would drag the house's
   * own tile toward whatever the surrounding hills happen to average to.
   */
  it("takes its target elevation from the centre tile, not the whole plot", () => {
    const heightmap = flatHeightmap(30, 30, 2);
    for (let y = 0; y <= 30; y++) {
      for (let x = 0; x <= 30; x++) heightmap.vertices[y][x] = 9;
    }
    for (const [x, y] of [
      [15, 15],
      [16, 15],
      [16, 16],
      [15, 16],
    ]) {
      heightmap.vertices[y][x] = 2;
    }

    const { elevation } = planAutoFlatten(heightmap, 15, 15, "both");

    expect(elevation).toBe(2);
  });

  it("levels the whole plot to that elevation once applied", () => {
    const heightmap = flatHeightmap(30, 30, 9);
    for (const [x, y] of [
      [15, 15],
      [16, 15],
      [16, 16],
      [15, 16],
    ]) {
      heightmap.vertices[y][x] = 2;
    }

    const { elevation, tiles } = planAutoFlatten(heightmap, 15, 15, "both");
    for (const tile of tiles) flattenTile(heightmap, tile.x, tile.y, elevation, "both");

    // The interior of the plot — every vertex whose 4 surrounding tiles are
    // all inside it — is now one flat terrace.
    for (let y = 13; y <= 18; y++) {
      for (let x = 13; x <= 18; x++) expect(heightmap.vertices[y][x]).toBe(2);
    }
  });

  /**
   * Priced as the same work done by hand, so a second press on a plot that
   * is already level is free rather than charging for 49 no-ops. This is
   * also why the target elevation is rounded — a fractional one would leave
   * every tile forever "needing" work.
   */
  it("plans nothing on ground that is already level", () => {
    const heightmap = flatHeightmap(30, 30, 4);

    expect(planAutoFlatten(heightmap, 15, 15, "both").tiles).toEqual([]);
  });

  it("clips the plot to the map rather than running off it", () => {
    const heightmap = flatHeightmap(30, 30, 3);
    for (let y = 0; y <= 30; y++) {
      for (let x = 0; x <= 30; x++) heightmap.vertices[y][x] = (x + y) % 2 === 0 ? 3 : 5;
    }

    const { tiles } = planAutoFlatten(heightmap, 0, 0, "both");

    expect(tiles.every((t) => t.x >= 0 && t.y >= 0)).toBe(true);
    expect(tiles.length).toBeLessThan(AUTO_FLATTEN_SIZE * AUTO_FLATTEN_SIZE);
  });

  /**
   * Some worlds forbid reshaping land inside the enemy's territory. A plot
   * straddling that border levels the part it may and simply leaves the
   * rest — and, since the blocked tiles never enter the plan, is not
   * charged for them either.
   */
  it("drops tiles the caller forbids instead of failing the whole plan", () => {
    const heightmap = flatHeightmap(30, 30, 3);
    for (let y = 0; y <= 30; y++) {
      for (let x = 0; x <= 30; x++) heightmap.vertices[y][x] = (x + y) % 2 === 0 ? 3 : 5;
    }

    const { tiles } = planAutoFlatten(heightmap, 15, 15, "both", AUTO_FLATTEN_SIZE, (tile) => tile.x <= 15);

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.x <= 15)).toBe(true);
  });

  it("under raiseOnly, levels up to the centre tile's highest corner", () => {
    const heightmap = flatHeightmap(30, 30, 3);
    heightmap.vertices[15][15] = 6;

    const { elevation } = planAutoFlatten(heightmap, 15, 15, "raiseOnly");

    expect(elevation).toBe(6);
  });

  it("under lowerOnly, levels down to the centre tile's lowest corner", () => {
    const heightmap = flatHeightmap(30, 30, 3);
    heightmap.vertices[15][15] = 1;

    const { elevation } = planAutoFlatten(heightmap, 15, 15, "lowerOnly");

    expect(elevation).toBe(1);
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

  /**
   * game/quake.ts needs the line itself to hold the ground still shaking
   * (「地震が続いている間は修復が出来ない」), so the tear reports what it
   * tore rather than leaving the caller to guess a centre and a radius.
   */
  it("reports the vertices it tore, in the order it tore them", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    const torn = applyEarthquake(heightmap, 5, 10, 1, 0, 6, straight);

    expect(torn).toEqual([6, 7, 8, 9, 10, 11].map((x) => ({ x, y: 10 })));
  });

  it("reports nothing at all when the crack leaves the map before tearing anything", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    expect(applyEarthquake(heightmap, 20, 10, 1, 0, 6, straight)).toEqual([]);
  });

  it("stops reporting where it stops tearing, at the map's edge", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    const torn = applyEarthquake(heightmap, 17, 10, 1, 0, 6, straight);

    expect(torn).toEqual([18, 19, 20].map((x) => ({ x, y: 10 })));
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

    const covered = applyVolcano(heightmap, 5, 5, 1, 7, 0, 0);

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

    const covered = applyVolcano(heightmap, 15, 15, 1, 7, 20, 0);

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

    applyVolcano(heightmap, 15, 15, 1, 7, 8, 0);

    expect(heightmap.rockHardness[15][22]).toBeGreaterThan(0); // down the valley
    expect(heightmap.rockHardness[22][15]).toBe(0); // across the plateau
  });

  it("spends exactly its volume, no more", () => {
    const heightmap = flatHeightmap(30, 30, 3);

    const covered = applyVolcano(heightmap, 15, 15, 0, 7, 5, 0);

    expect(covered.length).toBe(1 + 5);
  });

  /**
   * 原作「火山の外周には水たまりができ、溶岩流をそこで止める」. Scattered
   * rather than a closed moat — see VOLCANO_PUDDLES.
   */
  describe("its 外周の水たまり", () => {
    it("melts VOLCANO_PUDDLES of them, out on the ring beyond the cone", () => {
      const heightmap = flatHeightmap(40, 40, 6);

      applyVolcano(heightmap, 20, 20, 1, 7, 0, VOLCANO_PUDDLES, () => 0.5);

      const water: { x: number; y: number }[] = [];
      for (let y = 0; y <= 40; y++) {
        for (let x = 0; x <= 40; x++) {
          if (heightmap.vertices[y][x] <= heightmap.waterLevel) water.push({ x, y });
        }
      }

      expect(water).toHaveLength(VOLCANO_PUDDLES);
      for (const { x, y } of water) {
        // Out past the cone's own footprint, on its skirt.
        expect(Math.max(Math.abs(x - 20), Math.abs(y - 20))).toBeGreaterThan(1);
        expect(Math.hypot(x - 20, y - 20)).toBeLessThanOrEqual(1 + VOLCANO_PUDDLE_RING + 1);
      }
    });

    it("reports them as covered, so a house that ends up in one is cleared", () => {
      const heightmap = flatHeightmap(40, 40, 6);

      const covered = applyVolcano(heightmap, 20, 20, 1, 7, 0, VOLCANO_PUDDLES, () => 0.5);

      for (let y = 0; y <= 40; y++) {
        for (let x = 0; x <= 40; x++) {
          if (heightmap.vertices[y][x] <= heightmap.waterLevel) expect(covered).toContainEqual({ x, y });
        }
      }
    });

    it("stops the lava where they are, and lets it out between them", () => {
      const heightmap = flatHeightmap(40, 40, 6);

      applyVolcano(heightmap, 20, 20, 1, 7, 200, VOLCANO_PUDDLES, () => 0.5);

      for (let y = 0; y <= 40; y++) {
        for (let x = 0; x <= 40; x++) {
          // Nothing under water is ever rock — the flow ends there.
          if (heightmap.vertices[y][x] <= heightmap.waterLevel) expect(heightmap.rockHardness[y][x]).toBe(0);
        }
      }

      // ...and the lava still got out: a handful of puddles is not a moat.
      const escaped = heightmap.rockHardness.some((row, y) =>
        row.some((hardness, x) => hardness > 0 && Math.hypot(x - 20, y - 20) > 1 + VOLCANO_PUDDLE_RING + 1),
      );
      expect(escaped).toBe(true);
    });

    it("melts none at all when asked for none", () => {
      const heightmap = flatHeightmap(40, 40, 6);

      applyVolcano(heightmap, 20, 20, 1, 7, 0, 0);

      const anyWater = heightmap.vertices.some((row) => row.some((h) => h <= heightmap.waterLevel));
      expect(anyWater).toBe(false);
    });

    it("leaves ground that was already sea alone rather than reporting it twice", () => {
      const heightmap = flatHeightmap(40, 40, 6);
      for (const row of heightmap.vertices) row.fill(MIN_ELEVATION);

      const covered = applyVolcano(heightmap, 20, 20, 1, 7, 0, VOLCANO_PUDDLES, () => 0.5);

      expect(covered).toHaveLength(9); // the cone only — every puddle site was water already
    });
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

  // 「土地上下不可ステージ」 — the original's third restricted kind.
  it("allows nothing at all under 'neither'", () => {
    expect(isTerrainEditAllowed("neither", 1)).toBe(false);
    expect(isTerrainEditAllowed("neither", -1)).toBe(false);
    expect(isTerrainEditAllowed("neither", 0)).toBe(false);
  });
});

describe("pickTerrainEditRule", () => {
  const weights: Record<TerrainEditRule, number> = { both: 2, raiseOnly: 1, lowerOnly: 1, neither: 0 };

  it("picks the rule whose weighted slice the roll lands in", () => {
    // Slices in Object.entries order: both=[0,2), raiseOnly=[2,3), lowerOnly=[3,4).
    expect(pickTerrainEditRule(weights, () => 0)).toBe("both");
    expect(pickTerrainEditRule(weights, () => 0.49)).toBe("both");
    expect(pickTerrainEditRule(weights, () => 0.51)).toBe("raiseOnly");
    expect(pickTerrainEditRule(weights, () => 0.99)).toBe("lowerOnly");
  });

  it("can deal 土地上下不可 when it carries weight", () => {
    const always: Record<TerrainEditRule, number> = { both: 0, raiseOnly: 0, lowerOnly: 0, neither: 1 };
    expect(pickTerrainEditRule(always, () => 0.5)).toBe("neither");
  });

  it("never picks a rule with zero weight", () => {
    const onlyBoth: Record<TerrainEditRule, number> = { both: 1, raiseOnly: 0, lowerOnly: 0, neither: 0 };
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
    // A north-south channel for the wall to stand in, carved before any
    // reef is laid so each cast can see the open water it runs along.
    for (let y = 8; y <= 32; y++) heightmap.vertices[y][24] = MIN_ELEVATION;
    // Spanning the wave's whole reach: anything shorter is flowed around
    // (see the next test), and beyond this span the radius stops it anyway.
    // REEF_LENGTH vertices per cast, so a handful of taps closes it.
    for (let y = 8 + Math.floor(REEF_LENGTH / 2); y <= 32; y += REEF_LENGTH) {
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
  it("flows around a single reef cast, too short to span the wave", () => {
    const heightmap = flatHeightmap(40, 40, 1);
    for (let y = 8; y <= 32; y++) heightmap.vertices[y][24] = MIN_ELEVATION;
    // One cast — REEF_LENGTH vertices of breakwater, against a wave whose
    // front is 24 vertices across. A line is necessary but not sufficient:
    // "build a seawall" stays a decision about how much of the coast to
    // close, rather than one cheap cast that switches the enemy's most
    // expensive miracle off.
    applyReef(heightmap, 24, 20);

    applyTsunami(heightmap, 20, 20, 12, 6);

    expect(heightmap.vertices[20][26]).toBe(heightmap.waterLevel);
  });
});

describe("megalithScatterCandidates", () => {
  /**
   * 「発生ボタンを押し続けると、一帯により多くの巨石を発生させる」 — a held
   * cast needs somewhere to put the next stone, and the area it may use is
   * wider than one stone's own footprint. Otherwise holding would be
   * indistinguishable from tapping the same spot.
   */
  it("offers vertices across the whole scatter area, wider than one stone", () => {
    const heightmap = flatHeightmap(40, 40, 4);

    const candidates = megalithScatterCandidates(heightmap, 20, 20);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((v) => Math.hypot(v.x - 20, v.y - 20) <= MEGALITH_SCATTER_RADIUS)).toBe(true);
    expect(candidates.some((v) => Math.hypot(v.x - 20, v.y - 20) > DEFAULT_MEGALITH_RADIUS)).toBe(true);
  });

  it("skips vertices that already carry a stone", () => {
    const heightmap = flatHeightmap(40, 40, 4);
    applyMegalith(heightmap, 20, 20);

    const candidates = megalithScatterCandidates(heightmap, 20, 20);

    expect(candidates.some((v) => heightmap.boulder[v.y][v.x])).toBe(false);
    expect(candidates).not.toContainEqual({ x: 20, y: 20 });
  });

  it("skips water and torn ground, where applyMegalith would raise nothing", () => {
    const heightmap = flatHeightmap(40, 40, 4);
    heightmap.vertices[20][21] = MIN_ELEVATION;
    heightmap.crevice[20][19] = true;

    const candidates = megalithScatterCandidates(heightmap, 20, 20);

    expect(candidates).not.toContainEqual({ x: 21, y: 20 });
    expect(candidates).not.toContainEqual({ x: 19, y: 20 });
  });

  /**
   * An empty list is how a held cast knows to stop, rather than spending
   * MEGALITH_MANA_COST per interval on casts that raise nothing.
   */
  it("comes back empty once the whole area is stone", () => {
    const heightmap = flatHeightmap(40, 40, 4);
    for (let y = 20 - MEGALITH_SCATTER_RADIUS; y <= 20 + MEGALITH_SCATTER_RADIUS; y++) {
      for (let x = 20 - MEGALITH_SCATTER_RADIUS; x <= 20 + MEGALITH_SCATTER_RADIUS; x++) {
        heightmap.boulder[y][x] = true;
      }
    }

    expect(megalithScatterCandidates(heightmap, 20, 20)).toEqual([]);
  });

  it("stays inside the map at a corner", () => {
    const heightmap = flatHeightmap(40, 40, 4);

    const candidates = megalithScatterCandidates(heightmap, 0, 0);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((v) => v.x >= 0 && v.y >= 0)).toBe(true);
  });
});

describe("applyReef", () => {
  it("raises rock just above sea level on a water vertex", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);

    expect(applyReef(heightmap, 10, 10)).toContainEqual({ x: 10, y: 10 });
    expect(heightmap.vertices[10][10]).toBe(heightmap.waterLevel + REEF_HEIGHT);
    expect(isRock(heightmap, 10, 10)).toBe(true);
  });

  /**
   * 「海面上に建物が建てられない土地を**線分状に**発生させる」. The shape is the
   * miracle: applyTsunami spreads as a front and flows around a partial
   * barrier, so a single stone shelters nothing. One cast has to produce a
   * length of breakwater or the miracle's stated defensive role is really
   * just an instruction to tap the same coast six times.
   */
  it("lays a line of reef, not a single stone", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);

    const raised = applyReef(heightmap, 10, 10);

    expect(raised).toHaveLength(REEF_LENGTH);
    // A straight line: every vertex on one row or one column, evenly spaced.
    const sameRow = raised.every((v) => v.y === raised[0].y);
    const sameColumn = raised.every((v) => v.x === raised[0].x);
    expect(sameRow || sameColumn).toBe(true);
  });

  it("centres the line on the cast point", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);

    const raised = applyReef(heightmap, 10, 10);

    expect(raised).toContainEqual({ x: 10, y: 10 });
  });

  /**
   * A breakwater lies along the shore it shelters. Cast against a coast
   * running north-south, the segment runs north-south too — the heading
   * that keeps it on water — rather than jutting out into the sea or
   * running aground.
   */
  it("lies along the coast rather than into it", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);
    for (let y = 0; y <= 20; y++) {
      for (let x = 11; x <= 20; x++) heightmap.vertices[y][x] = 3;
    }

    const raised = applyReef(heightmap, 10, 10);

    expect(raised).toHaveLength(REEF_LENGTH);
    expect(raised.every((v) => v.x === 10)).toBe(true);
  });

  it("never overwrites land — the line stops where the shore begins", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);
    // A headland cutting the east-west line short on one side. Land to the
    // north and south as well, so running along the coast is not an option
    // and the segment has to run into the headland to be truncated by it.
    for (let x = 0; x <= 20; x++) {
      heightmap.vertices[9][x] = 3;
      heightmap.vertices[11][x] = 3;
    }
    heightmap.vertices[10][12] = 3;

    const raised = applyReef(heightmap, 10, 10);

    expect(heightmap.vertices[10][12]).toBe(3);
    expect(raised).not.toContainEqual({ x: 12, y: 10 });
    expect(raised).toContainEqual({ x: 10, y: 10 });
  });

  it("is not buildable land — that is the point of a reef", () => {
    const heightmap = flatHeightmap(20, 20, MIN_ELEVATION);

    applyReef(heightmap, 10, 10);

    expect(isBuildable(heightmap, 10, 10)).toBe(false);
  });

  it("refuses dry land, where it would just be a pointless volcano", () => {
    const heightmap = flatHeightmap(10, 10, 5);

    expect(applyReef(heightmap, 5, 5)).toEqual([]);
    expect(heightmap.vertices[5][5]).toBe(5);
  });

  it("refuses vertices outside the map", () => {
    const heightmap = flatHeightmap(10, 10, MIN_ELEVATION);

    expect(applyReef(heightmap, -1, 5)).toEqual([]);
    expect(applyReef(heightmap, 5, 99)).toEqual([]);
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

describe("applyWall", () => {
  it("raises stone around the cast point", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyWall(heightmap, 10, 10, 1);

    expect(isWall(heightmap, 10, 10)).toBe(true);
    expect(isWall(heightmap, 11, 10)).toBe(true);
    expect(isWall(heightmap, 12, 10)).toBe(false);
  });

  it("lifts the ground it stands on, so the wall reads as a wall", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyWall(heightmap, 10, 10, 0);

    expect(heightmap.vertices[10][10]).toBe(5 + WALL_ELEVATION_RISE);
  });

  it("does not stand on water or on a crevice", () => {
    const flooded = flatHeightmap(20, 20, MIN_ELEVATION);
    const torn = flatHeightmap(20, 20, 5);
    torn.crevice[10][10] = true;

    expect(applyWall(flooded, 10, 10, 1)).toEqual([]);
    expect(applyWall(torn, 10, 10, 0)).toEqual([]);
  });

  it("does not stand on 毒カビ — rot is not a foundation, same rule as a road", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.fungus[10][10] = true;

    expect(applyWall(heightmap, 10, 10, 0)).toEqual([]);
  });

  it("fells the woodland it goes up through", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyForest(heightmap, 10, 10, 1);

    applyWall(heightmap, 10, 10, 0);

    expect(isForest(heightmap, 10, 10)).toBe(false);
  });

  it("cannot be built on — a house needs open ground, not a rampart", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyWall(heightmap, 10, 10, 0);

    expect(isBuildable(heightmap, 10, 10)).toBe(false);
  });

  it("reports nothing raised when it raises nothing, so the caller can refuse the cast", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyWall(heightmap, 10, 10, 1);

    expect(applyWall(heightmap, 10, 10, 1)).toEqual([]);
  });

  /**
   * The counter to a wall, and the reason one can be cast at all — see
   * WALL_MANA_COST's own doc comment on the asymmetry.
   */
  it("is cut by a crevice torn through it", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyWall(heightmap, 10, 10, 1);

    applyEarthquake(heightmap, 10, 10, 1, 0, 6, () => 0.5);

    expect(isWall(heightmap, 11, 10)).toBe(false);
  });

  it("is buried by a volcano", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyWall(heightmap, 10, 10, 1);

    applyVolcano(heightmap, 10, 10, 1, 20, 0);

    expect(isWall(heightmap, 10, 10)).toBe(false);
  });
});

describe("applyMegalith", () => {
  it("heaves stone up around the cast point", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyMegalith(heightmap, 10, 10, 2);

    expect(isBoulder(heightmap, 10, 10)).toBe(true);
    expect(isBoulder(heightmap, 12, 10)).toBe(true);
    expect(isBoulder(heightmap, 13, 10)).toBe(false);
  });

  it("raises a dome, highest at the centre — the slope is what stops the big houses", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyMegalith(heightmap, 10, 10, 2);

    expect(heightmap.vertices[10][10]).toBe(5 + MEGALITH_HEIGHT);
    expect(heightmap.vertices[10][11]).toBeGreaterThan(5);
    expect(heightmap.vertices[10][11]).toBeLessThan(heightmap.vertices[10][10]);
  });

  it("cannot be built on", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    applyMegalith(heightmap, 10, 10, 0);

    expect(isBuildable(heightmap, 10, 10)).toBe(false);
  });

  it("does not rise out of the sea or out of a crevice", () => {
    const flooded = flatHeightmap(20, 20, MIN_ELEVATION);
    const torn = flatHeightmap(20, 20, 5);
    torn.crevice[10][10] = true;

    expect(applyMegalith(flooded, 10, 10, 2)).toEqual([]);
    expect(applyMegalith(torn, 10, 10, 0)).toEqual([]);
  });

  it("reports nothing raised when it raises nothing, so the caller can refuse the cast", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyMegalith(heightmap, 10, 10, 2);

    expect(applyMegalith(heightmap, 10, 10, 2)).toEqual([]);
  });

  /**
   * 「海へ沈めるまで消えない」 (docs/original-miracles.md #14) — the one
   * thing that removes it, and the reason it is priced above a wall.
   */
  it("survives being dug at, right down to the water", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyMegalith(heightmap, 10, 10, 0);

    while (heightmap.vertices[10][10] > MIN_ELEVATION) raiseVertex(heightmap, 10, 10, -1);

    expect(heightmap.vertices[10][10]).toBe(MIN_ELEVATION);
    expect(isBoulder(heightmap, 10, 10)).toBe(false);
  });

  it("is still there one step above the water", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyMegalith(heightmap, 10, 10, 0);

    while (heightmap.vertices[10][10] > heightmap.waterLevel + 1) raiseVertex(heightmap, 10, 10, -1);

    expect(isBoulder(heightmap, 10, 10)).toBe(true);
  });

  it("goes the same way when a plot is levelled into the water rather than dug", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyMegalith(heightmap, 10, 10, 0);

    flattenTile(heightmap, 10, 10, MIN_ELEVATION, "both");

    expect(isBoulder(heightmap, 10, 10)).toBe(false);
  });

  it("is buried by a volcano, which turns it into lava rock instead", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyMegalith(heightmap, 10, 10, 1);

    applyVolcano(heightmap, 10, 10, 1, 20, 0);

    expect(isBoulder(heightmap, 10, 10)).toBe(false);
    expect(isRock(heightmap, 10, 10)).toBe(true);
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

/** 道と城壁：「なお、敵陣や斜面には設置できない」——その斜面の側。 */
describe("isLevelVertex", () => {
  it("is true on ground whose neighbours all stand at the same height", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    expect(isLevelVertex(heightmap, 10, 10)).toBe(true);
  });

  it("is false beside a step of even one", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.vertices[10][11] = 6;

    expect(isLevelVertex(heightmap, 10, 10)).toBe(false);
  });

  /**
   * A 城壁 lifts the ground it stands on, so counting that rise as terrain
   * would make a wall's first segment refuse its second — and the original
   * describes walls as something you chain: 「通常は手動で延ばして連続した
   * 城壁を設置する」.
   */
  it("does not read a walled neighbour's own parapet as a slope", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyWall(heightmap, 11, 10, 0);

    expect(heightmap.vertices[10][11]).toBeGreaterThan(5);
    expect(isLevelVertex(heightmap, 10, 10)).toBe(true);
  });
});

describe("道と城壁を斜面に置けないこと", () => {
  it("refuses to pave a slope", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.vertices[10][11] = 7;

    expect(applyRoad(heightmap, 10, 10, 0)).toEqual([]);
  });

  it("refuses to wall a slope", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    heightmap.vertices[10][11] = 7;

    expect(applyWall(heightmap, 10, 10, 0)).toEqual([]);
  });

  it("still lets a wall be chained into a line across level ground", () => {
    const heightmap = flatHeightmap(20, 20, 5);

    for (let y = 8; y <= 12; y++) expect(applyWall(heightmap, 10, y, 0)).toHaveLength(1);
  });
});

/** 「城壁にかかる土地上下ができなくなる」. */
describe("raiseVertex under a 城壁", () => {
  it("cannot lift or lower the ground a wall stands on", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyWall(heightmap, 10, 10, 0);
    const walled = heightmap.vertices[10][10];

    raiseVertex(heightmap, 10, 10, 1);
    raiseVertex(heightmap, 10, 10, -1);

    expect(heightmap.vertices[10][10]).toBe(walled);
  });

  it("leaves the ground beside it editable", () => {
    const heightmap = flatHeightmap(20, 20, 5);
    applyWall(heightmap, 10, 10, 0);

    raiseVertex(heightmap, 12, 10, 1);

    expect(heightmap.vertices[10][12]).toBe(6);
  });
});

/** 「どこでも↑↓」「海上に土地↑↓」 — see game/worlds.ts's openTerraforming. */
describe("touchesLand", () => {
  function seaWithIsland(size: number): Heightmap {
    const heightmap = createHeightmap(size, size, "grass");
    for (const row of heightmap.vertices) row.fill(heightmap.waterLevel);
    heightmap.vertices[10][10] = 3;
    return heightmap;
  }

  it("is true on the land itself", () => {
    expect(touchesLand(seaWithIsland(20), 10, 10)).toBe(true);
  });

  it("is true one step out from a coast, so a shore can be widened", () => {
    const heightmap = seaWithIsland(20);

    expect(touchesLand(heightmap, 11, 10)).toBe(true);
    expect(touchesLand(heightmap, 10, 11)).toBe(true);
  });

  it("is false in open sea", () => {
    expect(touchesLand(seaWithIsland(20), 15, 15)).toBe(false);
  });

  /** Two steps out is open sea: the coast has to be grown, not jumped. */
  it("is false just past the reach of a coast", () => {
    expect(touchesLand(seaWithIsland(20), 12, 10)).toBe(false);
  });
});

