import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { House, Owner, Position, Walker } from "./components";
import { HOUSE_LEVELS, POPULATION_RELEASE_EFFICIENCY, POPULATION_RELEASE_MIN_FRACTION } from "./constants";
import { releasePopulation } from "./populationRelease";

function createHouse(world: World, x: number, y: number, population: number, faction: "player" | "enemy" = "player") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population });
  return entity;
}

describe("releasePopulation", () => {
  it("does nothing when no house has reached the minimum fraction", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const house = createHouse(world, 0, 0, capacity * POPULATION_RELEASE_MIN_FRACTION - 0.01);

    const released = releasePopulation(world, "player", Infinity);

    expect(released).toBe(0);
    expect(world.query(Walker)).toHaveLength(0);
    expect(world.get(house, House)!.population).toBeCloseTo(capacity * POPULATION_RELEASE_MIN_FRACTION - 0.01);
  });

  it("empties a house at/above the minimum fraction into a weaker walker", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const population = capacity * 0.7;
    const house = createHouse(world, 3, 4, population);

    const released = releasePopulation(world, "player", Infinity);

    expect(released).toBe(1);
    expect(world.get(house, House)!.population).toBe(0);

    const walkers = world.query(Walker, Position, Owner);
    expect(walkers).toHaveLength(1);
    const [walker] = walkers;
    expect(world.get(walker, Position)).toEqual({ x: 3, y: 4 });
    expect(world.get(walker, Owner)).toEqual({ faction: "player" });
    const walkerComponent = world.get(walker, Walker)!;
    expect(walkerComponent.state).toBe("seeking");
    expect(walkerComponent.strength).toBeCloseTo(0.7 * POPULATION_RELEASE_EFFICIENCY);
    expect(walkerComponent.strength).toBeLessThan(1);
  });

  it("releases from every qualifying house of the faction in one call", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createHouse(world, 0, 0, capacity);
    createHouse(world, 1, 1, capacity * 0.9);
    createHouse(world, 2, 2, capacity * 0.1); // below the threshold

    const released = releasePopulation(world, "player", Infinity);

    expect(released).toBe(2);
    expect(world.query(Walker)).toHaveLength(2);
  });

  it("ignores houses belonging to another faction", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createHouse(world, 0, 0, capacity, "enemy");

    const released = releasePopulation(world, "player", Infinity);

    expect(released).toBe(0);
    expect(world.query(Walker)).toHaveLength(0);
  });

  it("does nothing once the faction is already at its house cap", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    createHouse(world, 0, 0, capacity);
    createHouse(world, 1, 1, capacity);

    const released = releasePopulation(world, "player", 2);

    expect(released).toBe(0);
    expect(world.query(Walker)).toHaveLength(0);
  });
});
