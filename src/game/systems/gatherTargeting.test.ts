import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { gatherTargetingSystem, hasOtherSeekingWalkers } from "./gatherTargeting";

function spawnWalker(world: World, faction: FactionId, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

function createFactionState(world: World, faction: FactionId, leaderId?: number) {
  const entity = world.createEntity();
  world.add(entity, FactionState, {
    id: faction,
    mana: 0,
    behaviorMode: "gather",
    shrinePosition: { x: 9, y: 9 },
    leaderId,
  });
  return entity;
}

describe("gatherTargetingSystem", () => {
  it("sends every seeking walker toward the shrine when there is no leader yet", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    createFactionState(world, "player", undefined);

    gatherTargetingSystem(world, 1);

    expect(world.get(walker, MoveTarget)).toEqual({ x: 9, y: 9 });
  });

  it("re-targets the leader itself at the shrine too, so it doesn't wander off, while someone is still gathering", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 9, 9); // already at the shrine
    spawnWalker(world, "player", 0, 0); // still on its way — the leader has someone left to wait for
    createFactionState(world, "player", leader);

    gatherTargetingSystem(world, 1);

    // The leader is its own target here (leaderPos === its own position),
    // which is a harmless no-op move that still claims it before
    // createWanderTargetSystem gets a chance to.
    expect(world.get(leader, MoveTarget)).toEqual({ x: 9, y: 9 });
  });

  it("leaves a lone leader target-less once nobody else is left to gather", () => {
    const world = new World();
    const soleWalker = spawnWalker(world, "player", 9, 9); // already at the shrine, no one else around
    createFactionState(world, "player", soleWalker);

    gatherTargetingSystem(world, 1);

    // No self-pin this time — falls through to createWanderTargetSystem/
    // createSettleSystem like any other idle walker (see settle.ts's own
    // matching hasOtherSeekingWalkers check).
    expect(world.has(soleWalker, MoveTarget)).toBe(false);
  });

  it("still leaves the leader target-less when the only other walkers aren't 'seeking' anymore", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 9, 9);
    const knight = spawnWalker(world, "player", 2, 2);
    world.add(knight, Walker, { strength: 1, state: "knight", speed: 1 });
    createFactionState(world, "player", leader);

    gatherTargetingSystem(world, 1);

    expect(world.has(leader, MoveTarget)).toBe(false);
  });

  it("sends non-leader walkers toward the leader's current position, not the shrine", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 3, 4);
    const follower = spawnWalker(world, "player", 0, 0);
    createFactionState(world, "player", leader);

    gatherTargetingSystem(world, 1);

    expect(world.get(follower, MoveTarget)).toEqual({ x: 3, y: 4 });
  });

  it("never routes a faction's followers toward the other faction's leader", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    const follower = spawnWalker(world, "player", 0, 0);
    const enemyLeader = spawnWalker(world, "enemy", 5, 5);
    createFactionState(world, "player", leader);
    createFactionState(world, "enemy", enemyLeader);

    gatherTargetingSystem(world, 1);

    expect(world.get(follower, MoveTarget)).toEqual({ x: 0, y: 0 }); // toward its own leader, not (5, 5)
  });

  it("does nothing for factions not in gather mode", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    const entity = world.createEntity();
    world.add(entity, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 9, y: 9 },
    });

    gatherTargetingSystem(world, 1);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("does not overwrite an existing MoveTarget", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    world.add(walker, MoveTarget, { x: 1, y: 1 });
    createFactionState(world, "player", undefined);

    gatherTargetingSystem(world, 1);

    expect(world.get(walker, MoveTarget)).toEqual({ x: 1, y: 1 });
  });

  it("ignores walkers that are not in the seeking state", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 0, 0);
    world.add(walker, Walker, { strength: 1, state: "fighting", speed: 1 });
    createFactionState(world, "player", undefined);

    gatherTargetingSystem(world, 1);

    expect(world.has(walker, MoveTarget)).toBe(false);
  });

  it("falls back to the shrine if the recorded leader is no longer a valid walker", () => {
    const world = new World();
    const invalidLeader = world.createEntity(); // alive, but never given Position/Walker
    const follower = spawnWalker(world, "player", 0, 0);
    createFactionState(world, "player", invalidLeader);

    gatherTargetingSystem(world, 1);

    expect(world.get(follower, MoveTarget)).toEqual({ x: 9, y: 9 });
  });
});

describe("hasOtherSeekingWalkers", () => {
  it("is true when another seeking walker of the same faction exists", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    spawnWalker(world, "player", 5, 5);

    expect(hasOtherSeekingWalkers(world, "player", leader)).toBe(true);
  });

  it("is false when the only other walker belongs to a different faction", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    spawnWalker(world, "enemy", 5, 5);

    expect(hasOtherSeekingWalkers(world, "player", leader)).toBe(false);
  });

  it("is false when the only other walkers of the faction aren't 'seeking'", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    const knight = spawnWalker(world, "player", 5, 5);
    world.add(knight, Walker, { strength: 1, state: "knight", speed: 1 });

    expect(hasOtherSeekingWalkers(world, "player", leader)).toBe(false);
  });

  it("does not count the excluded entity itself", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);

    expect(hasOtherSeekingWalkers(world, "player", leader)).toBe(false);
  });
});
