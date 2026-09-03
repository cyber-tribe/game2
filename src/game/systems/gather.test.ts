import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, Owner, Position, Walker, type FactionId } from "../components";
import { createFaction } from "../faction";
import { gatherSystem } from "./gather";

function createWalker(world: World, faction: FactionId, x: number, y: number, strength: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength, state: "seeking", speed: 1 });
  return entity;
}

describe("gatherSystem", () => {
  it("merges two nearby same-faction walkers into one when the faction is gathering", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "gather");
    const a = createWalker(world, "player", 0, 0, 3);
    const b = createWalker(world, "player", 0.5, 0, 2);

    gatherSystem(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(false);
    expect(world.get(a, Walker)!.strength).toBe(5);
  });

  it("does nothing when the faction is not in gather mode", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "settle");
    const a = createWalker(world, "player", 0, 0, 3);
    const b = createWalker(world, "player", 0.5, 0, 2);

    gatherSystem(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
    expect(world.get(a, Walker)!.strength).toBe(3);
  });

  it("does not merge walkers from different factions even if both are gathering", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "gather");
    createFaction(world, "enemy", { x: 10, y: 10 }, "gather");
    const a = createWalker(world, "player", 0, 0, 3);
    const b = createWalker(world, "enemy", 0.5, 0, 2);

    gatherSystem(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
  });

  it("does not merge walkers farther apart than GATHER_RANGE", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "gather");
    const a = createWalker(world, "player", 0, 0, 3);
    const b = createWalker(world, "player", 10, 10, 2);

    gatherSystem(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
  });

  it("can absorb several nearby walkers into one in a single tick", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "gather");
    const a = createWalker(world, "player", 0, 0, 1);
    createWalker(world, "player", 0.2, 0, 1);
    createWalker(world, "player", 0.4, 0, 1);

    gatherSystem(world, 0);

    expect(world.query(Walker)).toHaveLength(1);
    expect(world.get(a, Walker)!.strength).toBe(3);
  });

  it("leaves fighting/knight walkers alone even under gather mode", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 }, "gather");
    const a = world.createEntity();
    world.add(a, Position, { x: 0, y: 0 });
    world.add(a, Owner, { faction: "player" });
    world.add(a, Walker, { strength: 3, state: "fighting", speed: 1 });
    const b = createWalker(world, "player", 0.2, 0, 2);

    gatherSystem(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
    expect(world.get(a, Walker)!.strength).toBe(3);
  });
});

describe("FactionState behaviorMode sanity", () => {
  it("createFaction defaults new factions to settle mode", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    expect(world.get(player, FactionState)!.behaviorMode).toBe("settle");
  });
});
