import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { FactionState, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { HERO_DEATH_MANA_LOSS } from "../constants";
import { createFaction, findFactionEntity } from "../faction";
import { createHeroLossSystem } from "./heroLoss";

function spawnWalker(world: World, faction: FactionId, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x: 0, y: 0 });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

function setMana(world: World, faction: FactionId, mana: number) {
  const entity = findFactionEntity(world, faction)!;
  world.add(entity, FactionState, { ...world.get(entity, FactionState)!, mana });
}

function manaOf(world: World, faction: FactionId): number {
  return world.get(findFactionEntity(world, faction)!, FactionState)!.mana;
}

describe("createHeroLossSystem", () => {
  it("charges the faction when its hero dies", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    setMana(world, "player", 50);
    const hero = spawnWalker(world, "player", "adonis");
    const system = createHeroLossSystem();

    system(world, 0.1);
    world.destroyEntity(hero);
    system(world, 0.1);

    expect(manaOf(world, "player")).toBe(50 - HERO_DEATH_MANA_LOSS);
  });

  it("charges nothing for an ordinary walker", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    setMana(world, "player", 50);
    const walker = spawnWalker(world, "player");
    const system = createHeroLossSystem();

    system(world, 0.1);
    world.destroyEntity(walker);
    system(world, 0.1);

    expect(manaOf(world, "player")).toBe(50);
  });

  it("charges once per hero, not once per tick afterwards", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    setMana(world, "player", 50);
    const hero = spawnWalker(world, "player", "perseus");
    const system = createHeroLossSystem();

    system(world, 0.1);
    world.destroyEntity(hero);
    system(world, 0.1);
    system(world, 0.1);
    system(world, 0.1);

    expect(manaOf(world, "player")).toBe(50 - HERO_DEATH_MANA_LOSS);
  });

  /**
   * 聖水の泉 takes heroes rather than killing them. Charging the robbed
   * faction for the loss on top of losing the hero itself would be reading
   * "died" out of an entity that is standing right there.
   */
  it("charges nobody when a hero merely changes sides", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    createFaction(world, "enemy", { x: 9, y: 9 });
    setMana(world, "player", 50);
    setMana(world, "enemy", 50);
    const hero = spawnWalker(world, "enemy", "hercules");
    const system = createHeroLossSystem();

    system(world, 0.1);
    world.add(hero, Owner, { faction: "player" });
    system(world, 0.1);

    expect(manaOf(world, "enemy")).toBe(50);
    expect(manaOf(world, "player")).toBe(50);
  });

  it("never drives a faction's mana below zero", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    setMana(world, "player", 3);
    const hero = spawnWalker(world, "player", "odysseus");
    const system = createHeroLossSystem();

    system(world, 0.1);
    world.destroyEntity(hero);
    system(world, 0.1);

    expect(manaOf(world, "player")).toBe(0);
  });

  it("reports the loss so the match record can show it", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    setMana(world, "player", 50);
    const hero = spawnWalker(world, "player", "achilles");
    const lost: FactionId[] = [];
    const system = createHeroLossSystem({ onHeroLost: (faction) => lost.push(faction) });

    system(world, 0.1);
    world.destroyEntity(hero);
    system(world, 0.1);

    expect(lost).toEqual(["player"]);
  });
});
