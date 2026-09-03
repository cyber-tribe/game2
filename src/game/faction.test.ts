import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { FactionState } from "./components";
import { createFaction, findFactionEntity } from "./faction";

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
