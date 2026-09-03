import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, House, Owner, Position } from "../components";
import { HOUSE_LEVELS } from "../constants";
import { createFaction } from "../faction";
import { manaSystem } from "./mana";

function createHouse(world: World, faction: "player" | "enemy", level: keyof typeof HOUSE_LEVELS) {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level, population: 0 });
  return entity;
}

describe("manaSystem", () => {
  it("accumulates mana at the combined rate of a faction's own houses", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createHouse(world, "player", "hut");
    createHouse(world, "player", "lodge");

    manaSystem(world, 2);

    const expectedRate = HOUSE_LEVELS.hut.manaRate + HOUSE_LEVELS.lodge.manaRate;
    expect(world.get(player, FactionState)!.mana).toBe(expectedRate * 2);
  });

  it("ignores houses belonging to another faction", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createFaction(world, "enemy", { x: 10, y: 10 });
    createHouse(world, "enemy", "castle");

    manaSystem(world, 5);

    expect(world.get(player, FactionState)!.mana).toBe(0);
  });

  it("accrues mana independently per faction in the same tick", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    const enemy = createFaction(world, "enemy", { x: 10, y: 10 });
    createHouse(world, "player", "hut");
    createHouse(world, "enemy", "manor");

    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBe(HOUSE_LEVELS.hut.manaRate);
    expect(world.get(enemy, FactionState)!.mana).toBe(HOUSE_LEVELS.manor.manaRate);
  });

  it("keeps accumulating across multiple ticks", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createHouse(world, "player", "hut");

    manaSystem(world, 1);
    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBe(HOUSE_LEVELS.hut.manaRate * 2);
  });
});
