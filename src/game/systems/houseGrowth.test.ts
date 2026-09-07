import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { applyForest, createHeightmap, type Heightmap } from "../../world/heightmap";
import { House, Owner, Position, Walker } from "../components";
import { HOUSE_LEVELS, TERRAIN_GROWTH_MULTIPLIER } from "../constants";
import { createHouseGrowthSystem } from "./houseGrowth";

function createHut(world: World, x: number, y: number, population = 0) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, House, { level: "hut", population });
  return entity;
}

/**
 * A pre-existing walker for "player" — many of the cap tests below need at
 * least one already, so houseGrowth's stalemate-escape valve (see its own
 * doc comment: a walkerless faction gets one free spawn regardless of the
 * cap) doesn't mask the plain cap-enforcement behavior they're testing.
 */
function createExistingWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("createHouseGrowthSystem", () => {
  it("accumulates population without spawning below capacity", () => {
    const world = new World();
    const house = createHut(world, 0, 0);

    const system = createHouseGrowthSystem({ growthRate: 1 });
    system(world, 2);

    expect(world.get(house, House)!.population).toBe(2);
    expect(world.query(Walker)).toHaveLength(0);
  });

  it("spawns a walker at the house and carries over the remainder once full", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const house = createHut(world, 5, 7, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: 3 });
    system(world, 1);

    expect(world.get(house, House)!.population).toBe(2);

    const walkers = world.query(Walker, Position, Owner);
    expect(walkers).toHaveLength(1);
    const [walker] = walkers;
    expect(world.get(walker, Position)).toEqual({ x: 5, y: 7 });
    expect(world.get(walker, Owner)).toEqual({ faction: "player" });
    expect(world.get(walker, Walker)!.state).toBe("seeking");
  });

  it("spawns multiple walkers in one tick when growth overflows capacity several times", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const house = createHut(world, 0, 0);

    const system = createHouseGrowthSystem({ growthRate: capacity * 2.5 });
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(2);
    expect(world.get(house, House)!.population).toBeCloseTo(capacity * 0.5);
  });

  it("stops spawning once the faction is at its walker ceiling, stalling population at capacity", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createExistingWalker(world, 9, 9);
    createExistingWalker(world, 8, 8);
    const house = createHut(world, 1, 1, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: capacity * 3, maxWalkersPerFaction: 2 });
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(2); // still just the pre-existing pair
    expect(world.get(house, House)!.population).toBe(capacity);
  });

  it("resumes spawning once a walker dies and the faction drops back under the ceiling", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const doomed = createExistingWalker(world, 9, 9);
    createExistingWalker(world, 8, 8);
    createHut(world, 1, 1, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: capacity, maxWalkersPerFaction: 2 });
    system(world, 1);
    expect(world.query(Walker)).toHaveLength(2);

    world.destroyEntity(doomed);
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(2); // the survivor plus one freshly spawned
  });

  it("keeps producing for a faction with nowhere left to build, however many houses it owns", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    // The old house cap switched production off at a fixed house count,
    // which is what let both factions freeze at once with nothing able to
    // change (plan/0118-terrain-based-house-limit.md). House count is not
    // this system's business any more: walkers it cannot settle are the
    // army it fights with.
    for (let i = 0; i < 20; i++) createHut(world, i, 0, capacity);

    const system = createHouseGrowthSystem({ growthRate: 1, maxWalkersPerFaction: 120 });
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(20);
  });

  it("always spawns for a faction with no walkers at all, whatever its house count", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const house = createHut(world, 1, 1, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: 1, maxWalkersPerFaction: 1 });
    system(world, 1);

    const walkers = world.query(Walker, Position, Owner);
    expect(walkers).toHaveLength(1);
    expect(world.get(walkers[0], Position)).toEqual({ x: 1, y: 1 });
    expect(world.get(house, House)!.population).toBe(0);
  });

  it("treats maxWalkersPerFaction as unlimited when omitted", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const house = createHut(world, 1, 1, capacity * 3);

    createHouseGrowthSystem({ growthRate: 0 })(world, 1);

    expect(world.query(Walker)).toHaveLength(3);
    expect(world.get(house, House)!.population).toBe(0);
  });

  it("scales growthRate by the heightmap's terrain multiplier when one is given", () => {
    const world = new World();
    const house = createHut(world, 0, 0);
    const heightmap = createHeightmap(4, 4, "desert");

    const system = createHouseGrowthSystem({ growthRate: 1, heightmap });
    system(world, 2);

    expect(world.get(house, House)!.population).toBeCloseTo(2 * TERRAIN_GROWTH_MULTIPLIER.desert);
  });

  it("treats growthRate as unscaled when no heightmap is given", () => {
    const world = new World();
    const house = createHut(world, 0, 0);

    const system = createHouseGrowthSystem({ growthRate: 1 });
    system(world, 2);

    expect(world.get(house, House)!.population).toBe(2);
  });
});

describe("forest growth bonus", () => {
  /**
   * The forest's standalone half (docs/original-miracles.md #6, "信者の
   * 成長を促進する効果"). Without it nobody would ever plant one, and the
   * 森 -> 火の雨 interaction would have no forests to burn.
   */
  it("grows a house standing in woodland faster than one on bare ground", () => {
    const flat = (): Heightmap => {
      const heightmap = createHeightmap(10, 10, "grass");
      for (const row of heightmap.vertices) row.fill(5);
      return heightmap;
    };
    const bare = flat();
    const wooded = flat();
    applyForest(wooded, 5, 5, 1);

    const grow = (heightmap: Heightmap) => {
      const world = new World();
      const entity = world.createEntity();
      world.add(entity, Position, { x: 5, y: 5 });
      world.add(entity, Owner, { faction: "player" });
      world.add(entity, House, { level: "hut", population: 0 });
      createHouseGrowthSystem({ heightmap })(world, 1);
      return world.get(entity, House)!.population;
    };

    expect(grow(wooded)).toBeGreaterThan(grow(bare));
  });
});
