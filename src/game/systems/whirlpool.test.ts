import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { MIN_ELEVATION, createHeightmap, sampleElevation, type Heightmap } from "../../world/heightmap";
import { House, Owner, Position, Walker, Whirlpool } from "../components";
import { WHIRLPOOL_MAX_SPLITS, WHIRLPOOL_SPLIT_INTERVAL } from "../constants";
import { createWhirlpool } from "../tornado";
import { createWhirlpoolSystem } from "./whirlpool";

/** Land in the west, open sea from `fromX` east — a coastline to eat. */
function coastline(size: number, fromX: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (let y = 0; y < heightmap.vertices.length; y++) {
    for (let x = 0; x < heightmap.vertices[y].length; x++) {
      heightmap.vertices[y][x] = x >= fromX ? MIN_ELEVATION : 5;
    }
  }
  return heightmap;
}

const straight = () => 0.5;

describe("createWhirlpoolSystem", () => {
  /** 「陸地を削って水へ戻す」 — the only thing on the map that un-makes land. */
  it("grinds the coast it meets down to sea level", () => {
    const heightmap = coastline(40, 20);
    const world = new World();
    createWhirlpool(world, 21, 10, -1, 0);

    const system = createWhirlpoolSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < 8; tick++) system(world, 0.5);

    expect(sampleElevation(heightmap, 19, 10)).toBeLessThanOrEqual(heightmap.waterLevel);
  });

  it("eats inward over time rather than sliding along the shore", () => {
    const heightmap = coastline(60, 30);
    const world = new World();
    createWhirlpool(world, 31, 20, -1, 0);

    const system = createWhirlpoolSystem({ heightmap, rng: straight });
    for (let tick = 0; tick < 60; tick++) system(world, 0.25);

    // Several tiles of coast gone, not just the first vertex it touched.
    expect(sampleElevation(heightmap, 27, 20)).toBeLessThanOrEqual(heightmap.waterLevel);
  });

  it("reports the erosion so the terrain can be redrawn", () => {
    const heightmap = coastline(40, 20);
    const world = new World();
    // Right on the waterline, heading inland: one tick is enough to bite.
    createWhirlpool(world, 20, 10, -1, 0);
    let erosions = 0;

    createWhirlpoolSystem({ heightmap, rng: straight, onErode: () => erosions++ })(world, 0.5);

    expect(erosions).toBeGreaterThan(0);
  });

  it("drowns whoever is standing on the ground it takes", () => {
    const heightmap = coastline(40, 20);
    const world = new World();
    createWhirlpool(world, 20, 10, -1, 0);
    const walker = world.createEntity();
    world.add(walker, Position, { x: 20, y: 10 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 9, state: "seeking", speed: 1 });
    const house = world.createEntity();
    world.add(house, Position, { x: 20, y: 10 });
    world.add(house, Owner, { faction: "player" });
    world.add(house, House, { level: "hut", population: 0 });

    createWhirlpoolSystem({ heightmap, rng: straight })(world, 0.5);

    expect(world.query(Walker)).toHaveLength(0);
    expect(world.query(House)).toHaveLength(0);
  });

  /** 「一定時間で分裂して被害範囲が広がる」 */
  it("splits, and only as many times as it is allowed", () => {
    const heightmap = coastline(60, 10);
    const world = new World();
    createWhirlpool(world, 30, 30, 1, 0);

    const system = createWhirlpoolSystem({ heightmap, rng: straight });
    const tick = 0.25;
    for (let elapsed = 0; elapsed < WHIRLPOOL_SPLIT_INTERVAL + 1; elapsed += tick) system(world, tick);
    expect(world.query(Whirlpool).length).toBeGreaterThan(1);

    // Long enough for every child to have had its own chance to split too,
    // but still inside their shared lifetime.
    for (let elapsed = 0; elapsed < WHIRLPOOL_SPLIT_INTERVAL * 2; elapsed += tick) system(world, tick);
    expect(world.query(Whirlpool).length).toBeLessThanOrEqual(2 ** WHIRLPOOL_MAX_SPLITS);
  });

  it("expires after its lifetime", () => {
    const heightmap = coastline(40, 10);
    const world = new World();
    createWhirlpool(world, 20, 20, 1, 0, 0, 1);

    createWhirlpoolSystem({ heightmap, rng: straight })(world, 1.5);

    expect(world.query(Whirlpool)).toHaveLength(0);
  });

  it("does nothing at all without a heightmap", () => {
    const world = new World();
    createWhirlpool(world, 20, 20, 1, 0);

    createWhirlpoolSystem({ rng: straight })(world, 1);

    expect(world.query(Whirlpool)).toHaveLength(1);
  });
});
