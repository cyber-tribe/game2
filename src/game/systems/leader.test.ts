import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, Owner, Position, Walker } from "../components";
import { leaderSystem } from "./leader";

function spawnWalker(world: World, faction: "player" | "enemy") {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("leaderSystem", () => {
  it("promotes a live walker of the faction when there is no leader yet", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 0, y: 0 },
    });
    const walker = spawnWalker(world, "player");

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBe(walker);
  });

  it("never promotes a walker belonging to the other faction", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 0, y: 0 },
    });
    spawnWalker(world, "enemy");

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBeUndefined();
  });

  it("leaves an existing, still-alive leader in place", () => {
    const world = new World();
    const faction = world.createEntity();
    const leader = spawnWalker(world, "player");
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 0, y: 0 },
      leaderId: leader,
    });
    spawnWalker(world, "player"); // a second walker that must not steal leadership

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBe(leader);
  });

  it("promotes a replacement once the previous leader dies", () => {
    const world = new World();
    const faction = world.createEntity();
    const deadLeader = spawnWalker(world, "player");
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 0, y: 0 },
      leaderId: deadLeader,
    });
    const survivor = spawnWalker(world, "player");
    world.destroyEntity(deadLeader);

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBe(survivor);
  });

  it("does nothing when the faction has no walkers at all", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 0, y: 0 },
    });

    expect(() => leaderSystem(world, 1)).not.toThrow();
    expect(world.get(faction, FactionState)!.leaderId).toBeUndefined();
  });
});
