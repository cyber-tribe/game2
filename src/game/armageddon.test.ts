import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { triggerArmageddon } from "./armageddon";
import { FactionState, House, Owner, Position, Walker, type FactionId } from "./components";
import { HOUSE_LEVELS } from "./constants";
import { createFaction } from "./faction";

function createHouse(world: World, faction: FactionId, x: number, y: number, level: keyof typeof HOUSE_LEVELS = "hut") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level, population: 7 });
  return entity;
}

describe("triggerArmageddon", () => {
  it("destroys every house on both sides and spawns a walker in its place", () => {
    const world = new World();
    createHouse(world, "player", 2, 2, "manor");
    createHouse(world, "enemy", 8, 8, "castle");

    triggerArmageddon(world, { x: 5, y: 5 });

    expect(world.query(House)).toHaveLength(0);

    const spawned = world.query(Walker, Owner, Position);
    expect(spawned).toHaveLength(2);

    const playerWalker = spawned.find((e) => world.get(e, Owner)!.faction === "player")!;
    expect(world.get(playerWalker, Position)).toEqual({ x: 2, y: 2 });
    expect(world.get(playerWalker, Walker)!.strength).toBe(HOUSE_LEVELS.manor.defense);
    expect(world.get(playerWalker, Walker)!.state).toBe("seeking");

    const enemyWalker = spawned.find((e) => world.get(e, Owner)!.faction === "enemy")!;
    expect(world.get(enemyWalker, Position)).toEqual({ x: 8, y: 8 });
    expect(world.get(enemyWalker, Walker)!.strength).toBe(HOUSE_LEVELS.castle.defense);
  });

  it("leaves existing walkers untouched", () => {
    const world = new World();
    const walker = world.createEntity();
    world.add(walker, Position, { x: 1, y: 1 });
    world.add(walker, Owner, { faction: "player" });
    world.add(walker, Walker, { strength: 42, state: "knight", speed: 1 });

    triggerArmageddon(world, { x: 5, y: 5 });

    expect(world.get(walker, Walker)).toEqual({ strength: 42, state: "knight", speed: 1 });
  });

  it("moves both factions' shrinePosition to the given center and switches both to goToShrine", () => {
    const world = new World();
    createFaction(world, "player", { x: 1, y: 1 }, "settle");
    createFaction(world, "enemy", { x: 9, y: 9 }, "fight");

    triggerArmageddon(world, { x: 5, y: 5 });

    for (const entity of world.query(FactionState)) {
      const state = world.get(entity, FactionState)!;
      expect(state.shrinePosition).toEqual({ x: 5, y: 5 });
      expect(state.behaviorMode).toBe("goToShrine");
    }
  });

  it("does nothing when there are no houses or factions", () => {
    const world = new World();

    expect(() => triggerArmageddon(world, { x: 5, y: 5 })).not.toThrow();
  });
});
