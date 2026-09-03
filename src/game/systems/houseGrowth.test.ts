import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { House, Owner, Position, Walker } from "../components";
import { HOUSE_LEVELS } from "../constants";
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
});
