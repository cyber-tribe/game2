import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { FactionState, Owner, Position, Walker } from "./components";
import { createFaction } from "./faction";
import { guardianify, knightify } from "./hero";

function spawnWalker(world: World, faction: "player" | "enemy") {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("knightify", () => {
  it("turns the faction's current leader into a knight", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    knightify(world, "player");

    expect(world.get(leader, Walker)!.state).toBe("knight");
  });

  it("leaves the leader's strength/speed untouched", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 7, state: "seeking", speed: 2.5 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    knightify(world, "player");

    expect(world.get(leader, Walker)).toEqual({ strength: 7, state: "knight", speed: 2.5 });
  });

  it("does nothing when the faction has no leader assigned", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    spawnWalker(world, "player");

    expect(() => knightify(world, "player")).not.toThrow();
  });

  it("does nothing when the leader is already a knight", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "knight", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    knightify(world, "player");

    expect(world.get(leader, Walker)).toEqual({ strength: 3, state: "knight", speed: 1 });
  });

  it("does nothing when the faction doesn't exist", () => {
    const world = new World();

    expect(() => knightify(world, "player")).not.toThrow();
  });

  it("does nothing when the leader entity is no longer alive", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });
    world.destroyEntity(leader);

    expect(() => knightify(world, "player")).not.toThrow();
  });

  it("re-specializes an existing guardian leader into a knight", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "guardian", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    knightify(world, "player");

    expect(world.get(leader, Walker)!.state).toBe("knight");
  });
});

describe("guardianify", () => {
  it("turns the faction's current leader into a guardian", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    guardianify(world, "player");

    expect(world.get(leader, Walker)!.state).toBe("guardian");
  });

  it("does nothing when the leader is already a guardian", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "guardian", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    guardianify(world, "player");

    expect(world.get(leader, Walker)).toEqual({ strength: 3, state: "guardian", speed: 1 });
  });

  it("re-specializes an existing knight leader into a guardian", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "knight", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    guardianify(world, "player");

    expect(world.get(leader, Walker)!.state).toBe("guardian");
  });

  it("does nothing when the faction has no leader assigned", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    spawnWalker(world, "player");

    expect(() => guardianify(world, "player")).not.toThrow();
  });

  it("does nothing when the faction doesn't exist", () => {
    const world = new World();

    expect(() => guardianify(world, "player")).not.toThrow();
  });
});
