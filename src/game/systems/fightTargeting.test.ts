import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { House, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { createFaction } from "../faction";
import { fightTargetingSystem } from "./fightTargeting";

function createWalker(world: World, faction: FactionId, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

function createHouse(world: World, faction: FactionId, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

describe("fightTargetingSystem", () => {
  it("sends a target-less seeking walker toward the nearest enemy walker", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "fight");
    const attacker = createWalker(world, "player", 0, 0);
    createWalker(world, "enemy", 20, 20);
    createWalker(world, "enemy", 5, 0);

    fightTargetingSystem(world, 0);

    expect(world.get(attacker, MoveTarget)).toEqual({ x: 5, y: 0 });
  });

  it("targets an enemy house when it's the nearest enemy target", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "fight");
    const attacker = createWalker(world, "player", 0, 0);
    createWalker(world, "enemy", 20, 20);
    createHouse(world, "enemy", 2, 0);

    fightTargetingSystem(world, 0);

    expect(world.get(attacker, MoveTarget)).toEqual({ x: 2, y: 0 });
  });

  it("does nothing when the faction is not in fight mode", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "settle");
    const walker = createWalker(world, "player", 0, 0);
    createWalker(world, "enemy", 5, 0);

    fightTargetingSystem(world, 0);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("does not override a walker that already has a target", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "fight");
    const walker = createWalker(world, "player", 0, 0);
    world.add(walker, MoveTarget, { x: 99, y: 99 });
    createWalker(world, "enemy", 5, 0);

    fightTargetingSystem(world, 0);

    expect(world.get(walker, MoveTarget)).toEqual({ x: 99, y: 99 });
  });

  it("leaves a walker without a target when there is nothing to fight", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "fight");
    const walker = createWalker(world, "player", 0, 0);

    fightTargetingSystem(world, 0);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });
});
