import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { House, MoveTarget, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { createFaction } from "../faction";
import { knightTargetingSystem } from "./knight";

function createWalker(world: World, faction: FactionId, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

function createHouse(world: World, faction: FactionId, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

describe("knightTargetingSystem", () => {
  it("sends a target-less knight toward the nearest enemy walker, regardless of behaviorMode", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "settle"); // not "fight"
    const knight = createWalker(world, "player", 0, 0, "knight");
    createWalker(world, "enemy", 20, 20);
    createWalker(world, "enemy", 5, 0);

    knightTargetingSystem(world, 0);

    expect(world.get(knight, MoveTarget)).toEqual({ x: 5, y: 0 });
  });

  it("targets an enemy house when it's the nearest enemy target", () => {
    const world = new World();
    const knight = createWalker(world, "player", 0, 0, "knight");
    createHouse(world, "enemy", 2, 0);

    knightTargetingSystem(world, 0);

    expect(world.get(knight, MoveTarget)).toEqual({ x: 2, y: 0 });
  });

  it("ignores non-knight walkers entirely", () => {
    const world = new World();
    const walker = createWalker(world, "player", 0, 0, "seeking");
    createWalker(world, "enemy", 5, 0);

    knightTargetingSystem(world, 0);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("does not override a knight that already has a target", () => {
    const world = new World();
    const knight = createWalker(world, "player", 0, 0, "knight");
    world.add(knight, MoveTarget, { x: 99, y: 99 });
    createWalker(world, "enemy", 5, 0);

    knightTargetingSystem(world, 0);

    expect(world.get(knight, MoveTarget)).toEqual({ x: 99, y: 99 });
  });

  it("leaves a knight without a target when there is nothing to fight", () => {
    const world = new World();
    const knight = createWalker(world, "player", 0, 0, "knight");

    knightTargetingSystem(world, 0);

    expect(world.has(knight, MoveTarget)).toBe(false);
  });
});
