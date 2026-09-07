import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { House, Owner, Position, Walker } from "./components";
import {
  HOUSE_LEVELS,
  POPULATION_RELEASE_EFFICIENCY,
  POPULATION_RELEASE_MIN_FRACTION,
  SPROG_FRACTION,
} from "./constants";
import { sprogHouse } from "./populationRelease";

function createHouse(world: World, x: number, y: number, population: number, faction: "player" | "enemy" = "player") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population });
  return entity;
}

describe("sprogHouse", () => {
  it("does nothing when the house has not reached the minimum fraction", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const population = capacity * POPULATION_RELEASE_MIN_FRACTION - 0.01;
    const house = createHouse(world, 0, 0, population);

    expect(sprogHouse(world, house, Infinity)).toBe(false);
    expect(world.query(Walker)).toHaveLength(0);
    expect(world.get(house, House)!.population).toBeCloseTo(population);
  });

  /**
   * 「信者の**一部**が追い出される」 — a part, not all of them. The house is
   * left standing on real progress rather than back at zero, which is what
   * makes this "don't wait for capacity" instead of "cash the house in".
   */
  it("pushes out only part of the population, leaving the rest in the house", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const population = capacity * 0.8;
    const house = createHouse(world, 3, 4, population);

    expect(sprogHouse(world, house, Infinity)).toBe(true);
    expect(world.get(house, House)!.population).toBeCloseTo(population * (1 - SPROG_FRACTION));

    const walkers = world.query(Walker, Position, Owner);
    expect(walkers).toHaveLength(1);
    const [walker] = walkers;
    expect(world.get(walker, Position)).toEqual({ x: 3, y: 4 });
    expect(world.get(walker, Owner)).toEqual({ faction: "player" });
    const walkerComponent = world.get(walker, Walker)!;
    expect(walkerComponent.state).toBe("seeking");
    expect(walkerComponent.strength).toBeCloseTo(0.8 * SPROG_FRACTION * POPULATION_RELEASE_EFFICIENCY);
    expect(walkerComponent.strength).toBeLessThan(1);
  });

  /**
   * The whole point of aiming: only the tapped house empties. game2's
   * previous 送出 emptied every house the faction owned in one press, which
   * left no reason ever to aim at one.
   */
  it("touches only the house it was given", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const target = createHouse(world, 0, 0, capacity);
    const other = createHouse(world, 5, 5, capacity);

    expect(sprogHouse(world, target, Infinity)).toBe(true);

    expect(world.query(Walker)).toHaveLength(1);
    expect(world.get(other, House)!.population).toBe(capacity);
  });

  it("keeps the walker on the same side as the house it left", () => {
    const world = new World();
    const house = createHouse(world, 0, 0, HOUSE_LEVELS.hut.capacity, "enemy");

    expect(sprogHouse(world, house, Infinity)).toBe(true);

    const [walker] = world.query(Walker, Owner);
    expect(world.get(walker, Owner)).toEqual({ faction: "enemy" });
  });

  it("does nothing once the faction is already at its house cap", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const house = createHouse(world, 0, 0, capacity);
    createHouse(world, 1, 1, capacity);

    expect(sprogHouse(world, house, 2)).toBe(false);
    expect(world.query(Walker)).toHaveLength(0);
    expect(world.get(house, House)!.population).toBe(capacity);
  });

  it("counts only the owner's own houses against that cap", () => {
    const world = new World();
    const capacity = HOUSE_LEVELS.hut.capacity;
    const house = createHouse(world, 0, 0, capacity);
    createHouse(world, 1, 1, capacity, "enemy");

    expect(sprogHouse(world, house, 2)).toBe(true);
  });

  it("does nothing for an entity that is not a house", () => {
    const world = new World();
    const entity = world.createEntity();

    expect(sprogHouse(world, entity, Infinity)).toBe(false);
    expect(world.query(Walker)).toHaveLength(0);
  });

  /**
   * Repeated presses run out of steam on their own: each takes only
   * SPROG_FRACTION of what is left, so the house soon sits under
   * POPULATION_RELEASE_MIN_FRACTION and refuses rather than shredding its
   * progress into an unbounded stream of near-worthless walkers. From full,
   * that is two presses (1 → 0.5, still exactly at the floor → 0.25).
   */
  it("runs itself dry after a couple of presses rather than shredding the house", () => {
    const world = new World();
    const house = createHouse(world, 0, 0, HOUSE_LEVELS.hut.capacity);

    expect(sprogHouse(world, house, Infinity)).toBe(true);
    expect(sprogHouse(world, house, Infinity)).toBe(true);
    expect(sprogHouse(world, house, Infinity)).toBe(false);
    expect(world.query(Walker)).toHaveLength(2);
  });
});
