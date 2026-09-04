import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { createHeightmap } from "../../world/heightmap";
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

  it("stops spawning once the faction is at its house cap, stalling population at capacity", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createExistingWalker(world, 9, 9); // already has a walker, so the stalemate-escape valve doesn't apply
    createHut(world, 0, 0);
    const house = createHut(world, 1, 1, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: capacity * 3, maxHousesPerFaction: 2 });
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(1); // still just the pre-existing one
    expect(world.get(house, House)!.population).toBe(capacity);
  });

  it("resumes spawning once a house is destroyed and the faction drops back under the cap", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createExistingWalker(world, 9, 9);
    const other = createHut(world, 0, 0);
    createHut(world, 1, 1, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: capacity, maxHousesPerFaction: 2 });
    system(world, 1);
    expect(world.query(Walker)).toHaveLength(1); // still just the pre-existing one

    world.destroyEntity(other);
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(2);
  });

  it("bypasses the house cap for a faction's first walker when it currently has none (stalemate escape valve)", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createHut(world, 0, 0); // grows too, but stays far below capacity this tick — see growthRate below
    const house = createHut(world, 1, 1, capacity - 1); // no pre-existing walker anywhere for "player"

    // Small enough that the (0, 0) house's own growth this tick doesn't
    // also reach capacity — otherwise both houses would overflow on the
    // very same tick and query() iteration order (not this test) would
    // decide which one wins the single escape-valve spawn.
    const system = createHouseGrowthSystem({ growthRate: 1, maxHousesPerFaction: 2 });
    system(world, 1);

    const walkers = world.query(Walker, Position, Owner);
    expect(walkers).toHaveLength(1);
    expect(world.get(walkers[0], Position)).toEqual({ x: 1, y: 1 });
    expect(world.get(house, House)!.population).toBe(0);
  });

  it("only bypasses the cap once — a second overflow on the same tick still respects it", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createHut(world, 0, 0);
    const house = createHut(world, 1, 1, capacity - 1); // no pre-existing walker

    // Enough growth to overflow this one house's capacity twice in a single tick.
    const system = createHouseGrowthSystem({ growthRate: capacity * 2, maxHousesPerFaction: 2 });
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(1); // the escape-valve spawn, not a second one
    expect(world.get(house, House)!.population).toBe(capacity); // the second overflow's worth stalls at capacity
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
