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
    createHut(world, 0, 0);
    const house = createHut(world, 1, 1, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: capacity * 3, maxHousesPerFaction: 2 });
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(0);
    expect(world.get(house, House)!.population).toBe(capacity);
  });

  it("resumes spawning once a house is destroyed and the faction drops back under the cap", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const other = createHut(world, 0, 0);
    createHut(world, 1, 1, capacity - 1);

    const system = createHouseGrowthSystem({ growthRate: capacity, maxHousesPerFaction: 2 });
    system(world, 1);
    expect(world.query(Walker)).toHaveLength(0);

    world.destroyEntity(other);
    system(world, 1);

    expect(world.query(Walker)).toHaveLength(1);
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
