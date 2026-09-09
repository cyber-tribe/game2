import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { applyFungus, applyRoad, createHeightmap, isFungus, type Heightmap } from "../../world/heightmap";
import { FUNGUS_GROWTH_INTERVAL } from "../constants";
import { House, Owner, Position, Walker } from "../components";
import { createFungusSystem } from "./fungus";

function flatHeightmap(size: number, elevation: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (const row of heightmap.vertices) row.fill(elevation);
  return heightmap;
}

function spawnWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  world.add(entity, Owner, { faction: "player" });
  return entity;
}

function spawnHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, House, { level: "hut", population: 1 });
  world.add(entity, Owner, { faction: "player" });
  return entity;
}

/** Below every threshold: everything reachable is taken, everything exposed withers. */
const alwaysGrows = () => 0;

describe("createFungusSystem", () => {
  it("swallows a walker standing in the rot", () => {
    const heightmap = flatHeightmap(20, 5);
    applyFungus(heightmap, 10, 10, 1);
    const world = new World();
    spawnWalker(world, 10, 10);

    createFungusSystem({ heightmap })(world, 0.1);

    expect(world.query(Walker)).toHaveLength(0);
  });

  it("swallows a house the rot has reached — 建物や信者を飲み込む", () => {
    const heightmap = flatHeightmap(20, 5);
    applyFungus(heightmap, 10, 10, 1);
    const world = new World();
    spawnHouse(world, 10, 10);

    createFungusSystem({ heightmap })(world, 0.1);

    expect(world.query(House)).toHaveLength(0);
  });

  it("leaves everything on clean ground alone", () => {
    const heightmap = flatHeightmap(20, 5);
    applyFungus(heightmap, 10, 10, 1);
    const world = new World();
    spawnWalker(world, 3, 3);
    spawnHouse(world, 4, 4);

    createFungusSystem({ heightmap })(world, 0.1);

    expect(world.query(Walker)).toHaveLength(1);
    expect(world.query(House)).toHaveLength(1);
  });

  it("grows the rot on its own clock, not once per tick", () => {
    const heightmap = flatHeightmap(40, 5);
    applyFungus(heightmap, 20, 20, 1);
    const system = createFungusSystem({ heightmap });
    const before = countFungus(heightmap);

    // Many ticks, but nowhere near one growth interval between them.
    for (let tick = 0; tick < 50; tick++) system(new World(), FUNGUS_GROWTH_INTERVAL / 100);

    expect(countFungus(heightmap)).toBe(before);
  });

  /**
   * Deterministic on purpose. Growth is genuinely stochastic, so leaving
   * it to Math.random makes the assertion a coin flip — an earlier version
   * of this test seeded a solid block, hoped it would grow, and duly
   * failed in CI at exactly 25 vertices out of 25. `alwaysGrows` takes
   * every reachable vertex and withers every exposed one, so a lone seed
   * becomes exactly its four neighbours: growth, and nothing depending on
   * the tuning constants.
   */
  it("does grow once a whole interval has passed", () => {
    const heightmap = flatHeightmap(40, 5);
    heightmap.fungus[20][20] = true;
    const system = createFungusSystem({ heightmap, rng: alwaysGrows });

    system(new World(), FUNGUS_GROWTH_INTERVAL);

    expect(isFungus(heightmap, 21, 20)).toBe(true);
    expect(isFungus(heightmap, 19, 20)).toBe(true);
    expect(isFungus(heightmap, 20, 21)).toBe(true);
    expect(isFungus(heightmap, 20, 19)).toBe(true);
    expect(countFungus(heightmap)).toBe(4);
  });

  /**
   * The pair's whole reason for existing — see docs/original-miracles.md
   * #11. Run with `alwaysGrows`, so the rot floods every vertex it can
   * reach rather than merely happening not to get this far: what is left
   * clean on the far side is clean because the road stopped it.
   */
  it("never grows across a road", () => {
    const heightmap = flatHeightmap(40, 5);
    for (let y = 0; y <= 40; y++) applyRoad(heightmap, 25, y, 0);
    for (let y = 18; y <= 22; y++) for (let x = 18; x <= 22; x++) heightmap.fungus[y][x] = true;
    const system = createFungusSystem({ heightmap, rng: alwaysGrows });

    for (let step = 0; step < 200; step++) system(new World(), FUNGUS_GROWTH_INTERVAL);

    for (let y = 0; y <= 40; y++) {
      for (let x = 25; x <= 40; x++) expect(isFungus(heightmap, x, y)).toBe(false);
    }
  });

  it("reports a growth step that changed the map, so the terrain can be redrawn", () => {
    const heightmap = flatHeightmap(40, 5);
    for (let y = 18; y <= 22; y++) for (let x = 18; x <= 22; x++) heightmap.fungus[y][x] = true;
    let spreads = 0;
    const system = createFungusSystem({ heightmap, rng: alwaysGrows, onSpread: () => spreads++ });

    for (let step = 0; step < 20; step++) system(new World(), FUNGUS_GROWTH_INTERVAL);

    expect(spreads).toBeGreaterThan(0);
  });

  it("does nothing at all without a heightmap", () => {
    const world = new World();
    spawnWalker(world, 10, 10);

    createFungusSystem()(world, FUNGUS_GROWTH_INTERVAL);

    expect(world.query(Walker)).toHaveLength(1);
  });
});

function countFungus(heightmap: Heightmap): number {
  return heightmap.fungus.reduce((total, row) => total + row.filter(Boolean).length, 0);
}

/** 毒カビ is 植物, and behaves as a 沼 does — so アドニス walks through it. */
describe("fungusSystem and the plant school's own hero", () => {
  it("does not swallow アドニス", () => {
    const heightmap = flatHeightmap(20, 5);
    const world = new World();
    const adonis = world.createEntity();
    world.add(adonis, Position, { x: 10, y: 10 });
    world.add(adonis, Owner, { faction: "player" });
    world.add(adonis, Walker, { strength: 1, state: "adonis", speed: 1 });
    applyFungus(heightmap, 10, 10);

    createFungusSystem({ heightmap })(world, 0.1);

    expect(world.isAlive(adonis)).toBe(true);
  });
});

