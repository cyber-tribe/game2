import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { House, Owner, Position, Walker } from "./components";
import { fieldPopulation, housedPopulation, totalPopulation, walkerFollowers } from "./population";

function createWalker(world: World, faction: "player" | "enemy", strength = 1) {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength, state: "seeking", speed: 1 });
  return entity;
}

function createHouse(world: World, faction: "player" | "enemy", population: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population });
  return entity;
}

describe("walkerFollowers", () => {
  it("reads a walker's strength as a head count", () => {
    expect(walkerFollowers({ strength: 7, state: "seeking", speed: 1 })).toBe(7);
  });
});

describe("totalPopulation", () => {
  it("adds up houses and walkers", () => {
    const world = new World();
    createHouse(world, "player", 12);
    createWalker(world, "player", 3);

    expect(housedPopulation(world, "player")).toBe(12);
    expect(fieldPopulation(world, "player")).toBe(3);
    expect(totalPopulation(world, "player")).toBe(15);
  });

  it("ignores the other faction entirely", () => {
    const world = new World();
    createHouse(world, "enemy", 40);
    createWalker(world, "enemy", 9);
    createWalker(world, "player", 2);

    expect(totalPopulation(world, "player")).toBe(2);
    expect(totalPopulation(world, "enemy")).toBe(49);
  });

  /**
   * The reason walkerFollowers exists. Merging is how a faction builds an
   * army — 「多数の信者を合体させ、強力なヒーローを生み出すのに不可欠な
   * 操作」 — and it must not read as a massacre.
   */
  it("is unchanged by merging: eight people are eight people, apart or together", () => {
    const apart = new World();
    for (let i = 0; i < 8; i++) createWalker(apart, "player");

    const together = new World();
    createWalker(together, "player", 8);

    expect(totalPopulation(together, "player")).toBe(totalPopulation(apart, "player"));
  });
});
