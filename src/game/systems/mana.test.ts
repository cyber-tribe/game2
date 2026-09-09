import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, House, Owner, Position, Walker } from "../components";
import { FOLLOWER_MANA_RATE, HOUSE_LEVELS, HUT_MANA_RATE_CAP, MAX_MANA } from "../constants";
import { createFaction } from "../faction";
import { manaSystem } from "./mana";

// Defaults to full population (capacity) so a plain createHouse(...) call
// reads as "a fully-grown house at this level", matching the manaRate it
// contributes at steady state — see manaSystem's own doc comment. Tests
// that care about partial population pass it explicitly.
function createHouse(
  world: World,
  faction: "player" | "enemy",
  level: keyof typeof HOUSE_LEVELS,
  population: number = HOUSE_LEVELS[level].capacity,
) {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level, population });
  return entity;
}

function createWalker(world: World, faction: "player" | "enemy", strength = 1) {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength, state: "seeking", speed: 1 });
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

  it("never accumulates past MAX_MANA, however much income or however long it runs", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createHouse(world, "player", "castle");
    createHouse(world, "player", "castle");
    createHouse(world, "player", "castle");

    for (let i = 0; i < 100; i++) manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBe(MAX_MANA);
  });

  it("stops climbing exactly at MAX_MANA rather than overshooting mid-tick", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    world.add(player, FactionState, { ...world.get(player, FactionState)!, mana: MAX_MANA - 1 });
    createHouse(world, "player", "castle"); // manaRate high enough to overshoot in one tick

    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBe(MAX_MANA);
  });

  it("caps how much mana rate hut-level houses contribute, however many there are", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    // Comfortably more huts than it'd take to exceed HUT_MANA_RATE_CAP if
    // hut contribution were uncapped (as it was before this test existed).
    for (let i = 0; i < 50; i++) createHouse(world, "player", "hut");

    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBe(HUT_MANA_RATE_CAP);
  });

  it("doesn't cap a hut count that's already under the cap on its own", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createHouse(world, "player", "hut");

    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBe(HOUSE_LEVELS.hut.manaRate);
    expect(HOUSE_LEVELS.hut.manaRate).toBeLessThan(HUT_MANA_RATE_CAP);
  });

  it("lets lodge-and-above houses add on top of the hut cap, uncapped", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    for (let i = 0; i < 50; i++) createHouse(world, "player", "hut");
    createHouse(world, "player", "lodge");
    createHouse(world, "player", "castle");

    manaSystem(world, 1);

    const expectedRate = HUT_MANA_RATE_CAP + HOUSE_LEVELS.lodge.manaRate + HOUSE_LEVELS.castle.manaRate;
    expect(world.get(player, FactionState)!.mana).toBe(expectedRate);
  });

  it("produces no mana from a freshly settled house with nobody in it yet", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createHouse(world, "player", "castle", 0);

    manaSystem(world, 10);

    expect(world.get(player, FactionState)!.mana).toBe(0);
  });

  it("scales a house's mana contribution by its population fraction of capacity", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createHouse(world, "player", "manor", HOUSE_LEVELS.manor.capacity / 2);

    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBe(HOUSE_LEVELS.manor.manaRate / 2);
  });
});

/**
 * 「マナは信者数と時間経過に応じて蓄積される」. A believer standing in a
 * field is still a believer, and used to produce nothing at all.
 */
describe("manaSystem and followers out of doors", () => {
  it("earns from walkers, not only from houses", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createWalker(world, "player", 3);

    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBeCloseTo(3 * FOLLOWER_MANA_RATE);
  });

  it("counts a merged walker as everyone inside it", () => {
    const world = new World();
    const apart = createFaction(world, "player", { x: 0, y: 0 });
    createWalker(world, "player");
    createWalker(world, "player");
    createWalker(world, "player");

    const together = new World();
    const merged = createFaction(together, "player", { x: 0, y: 0 });
    createWalker(together, "player", 3);

    manaSystem(world, 1);
    manaSystem(together, 1);

    // 集結 and 合体 must not cost a faction its income — see population.ts.
    expect(together.get(merged, FactionState)!.mana).toBeCloseTo(world.get(apart, FactionState)!.mana);
  });

  it("makes walking out of a hut income-neutral", () => {
    const indoors = new World();
    const housed = createFaction(indoors, "player", { x: 0, y: 0 });
    createHouse(indoors, "player", "hut", 10);

    const outdoors = new World();
    const walking = createFaction(outdoors, "player", { x: 0, y: 0 });
    createHouse(outdoors, "player", "hut", 0);
    createWalker(outdoors, "player", 10);

    manaSystem(indoors, 1);
    manaSystem(outdoors, 1);

    expect(outdoors.get(walking, FactionState)!.mana).toBeCloseTo(indoors.get(housed, FactionState)!.mana);
  });

  it("holds walkers under HUT_MANA_RATE_CAP rather than beside it", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    for (let i = 0; i < 10; i++) createHouse(world, "player", "hut");
    createWalker(world, "player", 100);

    manaSystem(world, 1);

    // Ten full huts already sit above the cap; a crowd outside cannot lift
    // a faction past it, or emptying every hut would out-earn upgrading one.
    expect(world.get(player, FactionState)!.mana).toBeCloseTo(HUT_MANA_RATE_CAP);
  });

  it("still pays a faction that owns nothing but people", () => {
    const world = new World();
    const player = createFaction(world, "player", { x: 0, y: 0 });
    createWalker(world, "player", 5);
    createWalker(world, "enemy", 5);

    manaSystem(world, 1);

    expect(world.get(player, FactionState)!.mana).toBeGreaterThan(0);
    expect(world.get(player, FactionState)!.mana).toBeCloseTo(5 * FOLLOWER_MANA_RATE);
  });
});
