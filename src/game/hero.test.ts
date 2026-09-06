import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { FactionState, Owner, Position, Walker } from "./components";
import { createFaction } from "./faction";
import { promoteHero } from "./hero";

function spawnWalker(world: World, faction: "player" | "enemy") {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("promoteHero", () => {
  it("turns the faction's current leader into ペルセウス", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "perseus");

    expect(world.get(leader, Walker)!.state).toBe("perseus");
  });

  /**
   * ペルセウス is the original's "基準の英雄" and was game2's 騎士 before
   * the heroes had names, so it must still move no number at all — the
   * other three are priced and balanced against exactly this.
   */
  it("leaves the leader's strength/speed untouched for ペルセウス", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 7, state: "seeking", speed: 2.5 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "perseus");

    expect(world.get(leader, Walker)).toMatchObject({ strength: 7, state: "perseus", speed: 2.5 });
  });

  it("doubles ヘラクレス's strength and speeds オディッセウス up", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 4, state: "seeking", speed: 1.5 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "hercules");
    expect(world.get(leader, Walker)).toMatchObject({ strength: 8, speed: 1.5 });

    promoteHero(world, "player", "odysseus");
    expect(world.get(leader, Walker)).toMatchObject({ strength: 4, speed: 2.7 });
  });

  /**
   * Without a remembered base, cycling through the hero miracles would
   * compound their multipliers — and the cheapest route to the strongest
   * ヘラクレス would be to buy every other hero first.
   */
  it("re-derives the traits from the base rather than compounding them", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 4, state: "seeking", speed: 1.5 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "hercules");
    promoteHero(world, "player", "odysseus");
    promoteHero(world, "player", "hercules");

    expect(world.get(leader, Walker)).toMatchObject({ strength: 8, speed: 1.5 });
  });

  it("does nothing when the faction has no leader assigned", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    spawnWalker(world, "player");

    expect(() => promoteHero(world, "player", "perseus")).not.toThrow();
  });

  it("does nothing when the leader is already that hero", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "perseus", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "perseus");

    expect(world.get(leader, Walker)).toEqual({ strength: 3, state: "perseus", speed: 1 });
  });

  it("does nothing when the faction doesn't exist", () => {
    const world = new World();

    expect(() => promoteHero(world, "player", "perseus")).not.toThrow();
  });

  it("does nothing when the leader entity is no longer alive", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });
    world.destroyEntity(leader);

    expect(() => promoteHero(world, "player", "perseus")).not.toThrow();
  });

  it("re-specializes an existing 守護者 leader into ペルセウス", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "guardian", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "perseus");

    expect(world.get(leader, Walker)!.state).toBe("perseus");
  });
});

describe("promoteHero — 守護者", () => {
  it("turns the faction's current leader into a guardian", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "guardian");

    expect(world.get(leader, Walker)!.state).toBe("guardian");
  });

  it("does nothing when the leader is already a guardian", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "guardian", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "guardian");

    expect(world.get(leader, Walker)).toEqual({ strength: 3, state: "guardian", speed: 1 });
  });

  it("re-specializes an existing ペルセウス leader into 守護者", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    const leader = spawnWalker(world, "player");
    world.add(leader, Walker, { strength: 3, state: "perseus", speed: 1 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, leaderId: leader });

    promoteHero(world, "player", "guardian");

    expect(world.get(leader, Walker)!.state).toBe("guardian");
  });

  it("does nothing when the faction has no leader assigned", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    spawnWalker(world, "player");

    expect(() => promoteHero(world, "player", "guardian")).not.toThrow();
  });

  it("does nothing when the faction doesn't exist", () => {
    const world = new World();

    expect(() => promoteHero(world, "player", "guardian")).not.toThrow();
  });
});
