import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, MoveTarget, Owner, Position, Walker, type FactionId } from "../components";
import { goToShrineSystem } from "./goToShrine";

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
    behaviorMode: "goToShrine",
    shrinePosition: { x: 9, y: 9 },
    leaderId,
  });
  return entity;
}

describe("goToShrineSystem", () => {
  it("sends the leader toward the faction's shrinePosition", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    createFactionState(world, "player", leader);

    goToShrineSystem(world, 1);

    expect(world.get(leader, MoveTarget)).toEqual({ x: 9, y: 9 });
  });

  it("sends non-leader walkers toward the leader's current position, not the shrine", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 3, 4);
    const follower = spawnWalker(world, "player", 0, 0);
    createFactionState(world, "player", leader);

    goToShrineSystem(world, 1);

    expect(world.get(follower, MoveTarget)).toEqual({ x: 3, y: 4 });
  });

  it("never routes a faction's followers toward the other faction's leader", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    const follower = spawnWalker(world, "player", 0, 0);
    const enemyLeader = spawnWalker(world, "enemy", 5, 5);
    createFactionState(world, "player", leader);
    createFactionState(world, "enemy", enemyLeader);

    goToShrineSystem(world, 1);

    expect(world.get(follower, MoveTarget)).toEqual({ x: 0, y: 0 }); // toward its own leader, not (5, 5)
  });

  it("does nothing for factions not in goToShrine mode", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    const entity = world.createEntity();
    world.add(entity, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 9, y: 9 },
      leaderId: leader,
    });

    goToShrineSystem(world, 1);

    expect(world.has(leader, MoveTarget)).toBe(false);
  });

  it("does not overwrite an existing MoveTarget", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    world.add(leader, MoveTarget, { x: 1, y: 1 });
    createFactionState(world, "player", leader);

    goToShrineSystem(world, 1);

    expect(world.get(leader, MoveTarget)).toEqual({ x: 1, y: 1 });
  });

  it("ignores walkers that are not in the seeking state", () => {
    const world = new World();
    const leader = spawnWalker(world, "player", 0, 0);
    world.add(leader, Walker, { strength: 1, state: "fighting", speed: 1 });
    createFactionState(world, "player", leader);

    goToShrineSystem(world, 1);

    expect(world.has(leader, MoveTarget)).toBe(false);
  });

  it("does nothing when the faction has no leader assigned yet", () => {
    const world = new World();
    spawnWalker(world, "player", 0, 0);
    createFactionState(world, "player", undefined);

    expect(() => goToShrineSystem(world, 1)).not.toThrow();
  });
});
