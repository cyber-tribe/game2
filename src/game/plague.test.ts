import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { triggerArmageddon } from "./armageddon";
import { FactionState, House, Infected, Owner, Position, Walker } from "./components";
import { PLAGUE_DURATION } from "./constants";
import { createFaction, findFactionEntity } from "./faction";
import { seedPlague } from "./plague";
import { manaSystem } from "./systems/mana";
import { createPlagueSystem } from "./systems/plague";
import { createSettleSystem } from "./systems/settle";

function spawnWalker(world: World, faction: "player" | "enemy", x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

function spawnHouse(world: World, faction: "player" | "enemy", x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, House, { level: "hut", population: 4 });
  return entity;
}

const always = () => 0;
const never = () => 1;

describe("seedPlague", () => {
  it("infects walkers and houses around the cast point", () => {
    const world = new World();
    const walker = spawnWalker(world, "enemy", 10, 10);
    const house = spawnHouse(world, "enemy", 11, 10);

    expect(seedPlague(world, { x: 10, y: 10 })).toBe(2);
    expect(world.has(walker, Infected)).toBe(true);
    expect(world.has(house, Infected)).toBe(true);
  });

  it("leaves anyone outside the radius alone", () => {
    const world = new World();
    const far = spawnWalker(world, "enemy", 30, 30);

    seedPlague(world, { x: 10, y: 10 });

    expect(world.has(far, Infected)).toBe(false);
  });

  /**
   * A disease that checked banners would not be a disease. The risk that it
   * comes back around is what makes casting it near your own people a
   * decision rather than a free debuff.
   */
  it("does not care whose people they are", () => {
    const world = new World();
    const mine = spawnWalker(world, "player", 10, 10);

    seedPlague(world, { x: 10, y: 10 });

    expect(world.has(mine, Infected)).toBe(true);
  });

  it("reports nothing infected on empty ground, so the cast can be refused", () => {
    const world = new World();

    expect(seedPlague(world, { x: 10, y: 10 })).toBe(0);
  });
});

describe("createPlagueSystem", () => {
  it("spreads to a healthy neighbour", () => {
    const world = new World();
    seedPlague(world, { x: 10, y: 10 }, 0);
    const carrier = spawnWalker(world, "enemy", 10, 10);
    world.add(carrier, Infected, { remaining: PLAGUE_DURATION });
    const neighbour = spawnWalker(world, "enemy", 11, 10);

    createPlagueSystem({ rng: always })(world, 1);

    expect(world.has(neighbour, Infected)).toBe(true);
  });

  it("does not reach someone standing well clear", () => {
    const world = new World();
    const carrier = spawnWalker(world, "enemy", 10, 10);
    world.add(carrier, Infected, { remaining: PLAGUE_DURATION });
    const far = spawnWalker(world, "enemy", 30, 10);

    createPlagueSystem({ rng: always })(world, 1);

    expect(world.has(far, Infected)).toBe(false);
  });

  it("lets a carrier recover, so a plague burns out instead of ending the match", () => {
    const world = new World();
    const carrier = spawnWalker(world, "enemy", 10, 10);
    world.add(carrier, Infected, { remaining: 1 });

    createPlagueSystem({ rng: never })(world, 1.5);

    expect(world.has(carrier, Infected)).toBe(false);
  });

  it("infects a house from a passing walker and a walker from a sick house", () => {
    const world = new World();
    const carrier = spawnWalker(world, "enemy", 10, 10);
    world.add(carrier, Infected, { remaining: PLAGUE_DURATION });
    const house = spawnHouse(world, "enemy", 10.5, 10);
    const system = createPlagueSystem({ rng: always });

    system(world, 1);
    expect(world.has(house, Infected)).toBe(true);

    world.remove(carrier, Infected);
    const visitor = spawnWalker(world, "enemy", 10.5, 10);
    system(world, 1);
    expect(world.has(visitor, Infected)).toBe(true);
  });
});

describe("病原菌 — what being infected costs", () => {
  /** 「感染者はマナを供給できず」 */
  it("stops an infected house earning mana, without destroying it", () => {
    const world = new World();
    const faction = createFaction(world, "player", { x: 0, y: 0 });
    world.add(faction, FactionState, { ...world.get(faction, FactionState)!, mana: 0 });
    const house = spawnHouse(world, "player", 5, 5);

    manaSystem(world, 1);
    const earned = world.get(findFactionEntity(world, "player")!, FactionState)!.mana;
    expect(earned).toBeGreaterThan(0);

    world.add(house, Infected, { remaining: PLAGUE_DURATION });
    manaSystem(world, 1);

    expect(world.get(findFactionEntity(world, "player")!, FactionState)!.mana).toBe(earned);
    expect(world.isAlive(house)).toBe(true);
  });

  /** 「ハルマゲドンにも参加できない」, and 「即死ではなく」 — they sit it out, they do not die. */
  it("keeps infected houses standing and out of the final battle", () => {
    const world = new World();
    createFaction(world, "player", { x: 0, y: 0 });
    const sick = spawnHouse(world, "player", 5, 5);
    world.add(sick, Infected, { remaining: PLAGUE_DURATION });
    spawnHouse(world, "player", 9, 9);

    triggerArmageddon(world, { x: 20, y: 20 });

    // Counted by component rather than by the healthy house's own handle:
    // World hands a freed id straight back out, and the walker the healthy
    // house turns into takes that very id.
    expect(world.query(House)).toEqual([sick]);
    expect(world.has(sick, Infected)).toBe(true);
    expect(world.query(Walker)).toHaveLength(1);
  });

  it("carries the infection into the house a sick walker founds", () => {
    const world = new World();
    const walker = spawnWalker(world, "player", 5, 5);
    world.add(walker, Infected, { remaining: PLAGUE_DURATION });

    createSettleSystem()(world, 1);

    const houses = world.query(House);
    expect(houses).toHaveLength(1);
    expect(world.has(houses[0], Infected)).toBe(true);
  });
});
