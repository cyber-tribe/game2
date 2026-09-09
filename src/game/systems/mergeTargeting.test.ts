import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { Charmed, FactionState, MoveTarget, Owner, Position, Walker, type BehaviorMode, type FactionId } from "../components";
import { MERGE_SEEK_RADIUS } from "../constants";
import { mergeTargetingSystem } from "./mergeTargeting";

function spawnWalker(world: World, faction: FactionId, x: number, y: number, state: Walker["state"] = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

function createFactionState(world: World, faction: FactionId, behaviorMode: BehaviorMode = "merge") {
  const entity = world.createEntity();
  world.add(entity, FactionState, { id: faction, mana: 0, behaviorMode, shrinePosition: { x: 0, y: 0 } });
  return entity;
}

describe("mergeTargetingSystem", () => {
  it("walks a merge-mode walker toward another of its own", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    spawnWalker(world, "player", 3, 0);
    createFactionState(world, "player");

    mergeTargetingSystem(world, 1);

    expect(world.get(walker, MoveTarget)).toEqual({ x: 3, y: 0 });
  });

  it("picks the nearest partner, so a crowd closes inward pair by pair", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    spawnWalker(world, "player", 5, 0);
    spawnWalker(world, "player", 2, 0);
    createFactionState(world, "player");

    mergeTargetingSystem(world, 1);

    expect(world.get(walker, MoveTarget)).toEqual({ x: 2, y: 0 });
  });

  it("leaves a walker with nobody in range alone — 「近くに他の信者がいない場合は定住に同じ」", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    spawnWalker(world, "player", MERGE_SEEK_RADIUS + 1, 0);
    createFactionState(world, "player");

    mergeTargetingSystem(world, 1);

    // No target of its own: wanderTarget then settle take it from here,
    // which is exactly what 定住 does.
    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("never sends a walker at the enemy", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    spawnWalker(world, "enemy", 2, 0);
    createFactionState(world, "player");

    mergeTargetingSystem(world, 1);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("ignores factions under any other order", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    spawnWalker(world, "player", 2, 0);
    createFactionState(world, "player", "settle");

    mergeTargetingSystem(world, 1);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("does not re-target a walker that already has somewhere to be", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    world.add(walker, MoveTarget, { x: 20, y: 20 });
    spawnWalker(world, "player", 2, 0);
    createFactionState(world, "player");

    mergeTargetingSystem(world, 1);

    expect(world.get(walker, MoveTarget)).toEqual({ x: 20, y: 20 });
  });

  it("neither moves nor is aimed at a walker トロイのヘレン is dragging", () => {
    const world = new World();
    const helenVictim = spawnWalker(world, "player", 0, 0);
    world.add(helenVictim, Charmed, { by: 999 });
    const free = spawnWalker(world, "player", 2, 0);
    createFactionState(world, "player");

    mergeTargetingSystem(world, 1);

    expect(world.has(helenVictim, MoveTarget)).toBe(false);
    expect(world.has(free, MoveTarget)).toBe(false);
  });

  it("leaves walkers that are not seeking out of it — heroes keep their own errands", () => {
    const world = new World();
    const hero = spawnWalker(world, "player", 0, 0, "hercules");
    spawnWalker(world, "player", 2, 0);
    createFactionState(world, "player");

    mergeTargetingSystem(world, 1);

    expect(world.has(hero, MoveTarget)).toBe(false);
  });
});
