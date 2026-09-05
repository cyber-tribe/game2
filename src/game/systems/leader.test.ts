import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { GATHER_RANGE } from "../constants";
import { FactionState, Owner, Position, Walker } from "../components";
import { leaderSystem } from "./leader";

const SHRINE = { x: 0, y: 0 };

function spawnWalker(world: World, faction: "player" | "enemy", position = { ...SHRINE }) {
  const entity = world.createEntity();
  world.add(entity, Position, position);
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("leaderSystem", () => {
  it("promotes a walker of the faction that has reached the shrine, while gathering", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "gather",
      shrinePosition: SHRINE,
    });
    const walker = spawnWalker(world, "player");

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBe(walker);
  });

  it("does not promote anyone outside gather mode, even standing right at the shrine", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: SHRINE,
    });
    spawnWalker(world, "player");

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBeUndefined();
  });

  it("does not promote a walker that hasn't reached the shrine yet", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "gather",
      shrinePosition: SHRINE,
    });
    spawnWalker(world, "player", { x: GATHER_RANGE + 5, y: 0 }); // still on its way

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBeUndefined();
  });

  it("promotes whichever gathering walker is nearest the shrine", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "gather",
      shrinePosition: SHRINE,
    });
    spawnWalker(world, "player", { x: 1, y: 0 }); // farther, still within range
    const closest = spawnWalker(world, "player", { x: 0.2, y: 0 });

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBe(closest);
  });

  it("never promotes a walker belonging to the other faction", () => {
    const world = new World();
    const faction = world.createEntity();
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "gather",
      shrinePosition: SHRINE,
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
      shrinePosition: SHRINE,
      leaderId: leader,
    });
    spawnWalker(world, "player"); // a second walker that must not steal leadership

    leaderSystem(world, 1);

    expect(world.get(faction, FactionState)!.leaderId).toBe(leader);
  });

  it("promotes a replacement once the previous leader dies, while gathering", () => {
    const world = new World();
    const faction = world.createEntity();
    const deadLeader = spawnWalker(world, "player");
    world.add(faction, FactionState, {
      id: "player",
      mana: 0,
      behaviorMode: "gather",
      shrinePosition: SHRINE,
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
      behaviorMode: "gather",
      shrinePosition: SHRINE,
    });

    expect(() => leaderSystem(world, 1)).not.toThrow();
    expect(world.get(faction, FactionState)!.leaderId).toBeUndefined();
  });
});
