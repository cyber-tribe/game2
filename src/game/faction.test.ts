import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { FactionState, Walker } from "./components";
import { createFaction, findFactionEntity, moveShrine, trySpendMana } from "./faction";

describe("createFaction / findFactionEntity", () => {
  it("creates a faction entity with the given id and shrine, defaulting to settle mode", () => {
    const world = new World();
    const entity = createFaction(world, "player", { x: 4, y: 2 });

    expect(world.get(entity, FactionState)).toEqual({
      id: "player",
      mana: 0,
      behaviorMode: "settle",
      shrinePosition: { x: 4, y: 2 },
    });
  });

  it("accepts an explicit behavior mode", () => {
    const world = new World();
    const entity = createFaction(world, "enemy", { x: 0, y: 0 }, "fight");

    expect(world.get(entity, FactionState)!.behaviorMode).toBe("fight");
  });

  it("finds a faction entity by id", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    const enemy = createFaction(world, "enemy", { x: 1, y: 1 });

    expect(findFactionEntity(world, "player")).toBe(player);
    expect(findFactionEntity(world, "enemy")).toBe(enemy);
  });

  it("returns undefined when no faction with that id exists", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });

    expect(findFactionEntity(world, "enemy")).toBeUndefined();
  });
});

describe("trySpendMana", () => {
  it("deducts the amount and returns true when the faction can afford it", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    world.add(player, FactionState, { ...world.get(player, FactionState)!, mana: 10 });

    expect(trySpendMana(world, "player", 4)).toBe(true);
    expect(world.get(player, FactionState)!.mana).toBe(6);
  });

  it("leaves mana untouched and returns false when the faction can't afford it", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    world.add(player, FactionState, { ...world.get(player, FactionState)!, mana: 2 });

    expect(trySpendMana(world, "player", 4)).toBe(false);
    expect(world.get(player, FactionState)!.mana).toBe(2);
  });

  it("returns false when the faction doesn't exist", () => {
    const world = new World();

    expect(trySpendMana(world, "player", 1)).toBe(false);
  });
});

describe("moveShrine", () => {
  it("replaces the faction's shrinePosition and leaves everything else alone", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 }, "goToShrine");
    const leader = world.createEntity();
    world.add(leader, Walker, { strength: 1, state: "seeking", speed: 1 });
    world.add(player, FactionState, { ...world.get(player, FactionState)!, leaderId: leader });

    expect(moveShrine(world, "player", { x: 7, y: 3 })).toBe(true);
    expect(world.get(player, FactionState)).toEqual({
      id: "player",
      mana: 0,
      behaviorMode: "goToShrine",
      shrinePosition: { x: 7, y: 3 },
      leaderId: leader,
    });
  });

  /**
   * 「ただし、リーダーがいない状態ではこのコマンドは使用できない(リーダーが
   * いない場合は、まず啓示コマンドの「集合」でリーダーを作る必要がある)」 —
   * the magnet is the leader's, so without one there is nothing to move.
   */
  it("refuses to move without a leader, and leaves the flag where it was", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 2, y: 2 }, "goToShrine");

    expect(moveShrine(world, "player", { x: 7, y: 3 })).toBe(false);
    expect(world.get(player, FactionState)!.shrinePosition).toEqual({ x: 2, y: 2 });
  });

  it("refuses once the leader it was pointing at is gone", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 2, y: 2 }, "goToShrine");
    const leader = world.createEntity();
    world.add(leader, Walker, { strength: 1, state: "seeking", speed: 1 });
    world.add(player, FactionState, { ...world.get(player, FactionState)!, leaderId: leader });
    world.destroyEntity(leader);

    expect(moveShrine(world, "player", { x: 7, y: 3 })).toBe(false);
  });

  it("does nothing when the faction doesn't exist", () => {
    const world = new World();

    expect(() => moveShrine(world, "player", { x: 1, y: 1 })).not.toThrow();
  });
});
