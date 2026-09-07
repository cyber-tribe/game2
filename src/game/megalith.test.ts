import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { House, Owner, Position, Walker } from "./components";
import { raiseMegalith } from "./megalith";

function createHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

function createWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("raiseMegalith", () => {
  it("destroys a house whose ground the stone came up through", () => {
    const world = new World();
    createHouse(world, 5, 5);

    expect(raiseMegalith(world, [{ x: 5, y: 5 }])).toBe(1);
    expect(world.query(House)).toEqual([]);
  });

  it("leaves a house just outside the stone alone", () => {
    const world = new World();
    createHouse(world, 7, 5);

    expect(raiseMegalith(world, [{ x: 5, y: 5 }])).toBe(0);
    expect(world.query(House)).toHaveLength(1);
  });

  /**
   * The line between this and 火山 (see volcano.ts): 地下巨石 takes room to
   * grow, not lives — 「大規模建築の障害になり」, not a weapon.
   */
  it("never harms the people standing on it — they ride the stone up", () => {
    const world = new World();
    createWalker(world, 5, 5);

    raiseMegalith(world, [{ x: 5, y: 5 }]);

    expect(world.query(Walker)).toHaveLength(1);
  });

  it("matches a house by its nearest vertex, the same rounding isBoulder uses", () => {
    const world = new World();
    createHouse(world, 5.4, 4.6);

    expect(raiseMegalith(world, [{ x: 5, y: 5 }])).toBe(1);
  });
});
