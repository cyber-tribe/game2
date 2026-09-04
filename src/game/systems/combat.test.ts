import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { House, KnightCooldown, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { HOUSE_LEVELS, KNIGHT_BURN_COOLDOWN } from "../constants";
import type { ImpactEffectEvent } from "./effects";
import { createHouseCaptureSystem, createWalkerCombatSystem } from "./combat";

function createWalker(
  world: World,
  faction: FactionId,
  x: number,
  y: number,
  strength: number,
  state: WalkerState = "seeking",
) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction });
  world.add(entity, Walker, { strength, state, speed: 1 });
  return entity;
}

describe("walkerCombatSystem", () => {
  it("leaves the stronger walker alive with strength reduced by the loser's, and destroys the loser", () => {
    const world = new World();
    const strong = createWalker(world, "player", 0, 0, 5);
    const weak = createWalker(world, "enemy", 0.1, 0, 2);

    createWalkerCombatSystem()(world, 0);

    expect(world.isAlive(strong)).toBe(true);
    expect(world.get(strong, Walker)!.strength).toBe(3);
    expect(world.isAlive(weak)).toBe(false);
  });

  it("destroys both walkers on an exact tie", () => {
    const world = new World();
    const a = createWalker(world, "player", 0, 0, 4);
    const b = createWalker(world, "enemy", 0, 0, 4);

    createWalkerCombatSystem()(world, 0);

    expect(world.isAlive(a)).toBe(false);
    expect(world.isAlive(b)).toBe(false);
  });

  it("does not fight walkers from the same faction", () => {
    const world = new World();
    const a = createWalker(world, "player", 0, 0, 5);
    const b = createWalker(world, "player", 0, 0, 1);

    createWalkerCombatSystem()(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
  });

  it("does not fight enemy walkers outside combat range", () => {
    const world = new World();
    const a = createWalker(world, "player", 0, 0, 5);
    const b = createWalker(world, "enemy", 10, 10, 1);

    createWalkerCombatSystem()(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
  });

  it("reports a combatDeath impact at the loser's position", () => {
    const world = new World();
    createWalker(world, "player", 0, 0, 5);
    createWalker(world, "enemy", 0.1, 0, 2);

    const impacts: ImpactEffectEvent[] = [];
    createWalkerCombatSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toEqual([{ position: { x: 0.1, y: 0 }, type: "combatDeath" }]);
  });

  it("reports a combatDeath impact for both walkers on an exact tie", () => {
    const world = new World();
    createWalker(world, "player", 0, 0, 4);
    createWalker(world, "enemy", 0, 0, 4);

    const impacts: ImpactEffectEvent[] = [];
    createWalkerCombatSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toHaveLength(2);
    expect(impacts.every((e) => e.type === "combatDeath")).toBe(true);
  });

  it("does not report an impact when nothing fights", () => {
    const world = new World();
    createWalker(world, "player", 0, 0, 5);
    createWalker(world, "player", 1, 1, 5);

    const impacts: ImpactEffectEvent[] = [];
    createWalkerCombatSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toHaveLength(0);
  });
});

describe("houseCaptureSystem", () => {
  function createHouse(world: World, faction: FactionId, x: number, y: number, level: keyof typeof HOUSE_LEVELS = "hut") {
    const entity = world.createEntity();
    world.add(entity, Position, { x, y });
    world.add(entity, Owner, { faction });
    world.add(entity, House, { level, population: 7 });
    return entity;
  }

  it("captures an enemy house when the attacking walker's strength beats its defense", () => {
    const world = new World();
    const house = createHouse(world, "enemy", 0, 0);
    const attacker = createWalker(world, "player", 0, 0, HOUSE_LEVELS.hut.defense + 1);

    const captured: FactionId[] = [];
    createHouseCaptureSystem({ onCapture: (faction) => captured.push(faction) })(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "player" });
    expect(world.get(house, House)).toEqual({ level: "hut", population: 0 });
    expect(world.isAlive(attacker)).toBe(false);
    expect(captured).toEqual(["player"]);
  });

  it("repels a walker too weak to beat the house's defense, leaving the house untouched", () => {
    const world = new World();
    const house = createHouse(world, "enemy", 0, 0);
    const attacker = createWalker(world, "player", 0, 0, HOUSE_LEVELS.hut.defense - 1);

    const captured: FactionId[] = [];
    createHouseCaptureSystem({ onCapture: (faction) => captured.push(faction) })(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "enemy" });
    expect(world.get(house, House)!.population).toBe(7);
    expect(world.isAlive(attacker)).toBe(false);
    expect(captured).toEqual([]);
  });

  it("ignores a walker's own faction's houses", () => {
    const world = new World();
    const house = createHouse(world, "player", 0, 0);
    const walker = createWalker(world, "player", 0, 0, 999);

    createHouseCaptureSystem()(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "player" });
    expect(world.isAlive(walker)).toBe(true);
  });

  it("ignores houses outside combat range", () => {
    const world = new World();
    const house = createHouse(world, "enemy", 20, 20);
    const walker = createWalker(world, "player", 0, 0, 999);

    createHouseCaptureSystem()(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "enemy" });
    expect(world.isAlive(walker)).toBe(true);
  });

  it("a knight burns an enemy house down instead of capturing it, even a strong one", () => {
    const world = new World();
    const house = createHouse(world, "enemy", 0, 0, "castle");
    const knight = createWalker(world, "player", 0, 0, 1, "knight"); // far below castle's defense

    const burned: FactionId[] = [];
    const captured: FactionId[] = [];
    createHouseCaptureSystem({
      onBurn: (faction) => burned.push(faction),
      onCapture: (faction) => captured.push(faction),
    })(world, 0);

    expect(world.isAlive(house)).toBe(false);
    expect(world.isAlive(knight)).toBe(true);
    expect(burned).toEqual(["player"]);
    expect(captured).toEqual([]); // burning is not capturing
  });

  it("a knight survives after burning a house and can keep marching", () => {
    const world = new World();
    createHouse(world, "enemy", 0, 0);
    const knight = createWalker(world, "player", 0, 0, 1, "knight");

    createHouseCaptureSystem()(world, 0);

    expect(world.isAlive(knight)).toBe(true);
  });

  it("puts a knight on KnightCooldown after it burns a house, so it can't instantly march on", () => {
    const world = new World();
    createHouse(world, "enemy", 0, 0);
    const knight = createWalker(world, "player", 0, 0, 1, "knight");

    createHouseCaptureSystem()(world, 0);

    expect(world.get(knight, KnightCooldown)).toEqual({ remaining: KNIGHT_BURN_COOLDOWN });
  });

  it("reports a houseCaptured impact at the house's position on a successful capture", () => {
    const world = new World();
    createHouse(world, "enemy", 3, 4);
    createWalker(world, "player", 3, 4, HOUSE_LEVELS.hut.defense + 1);

    const impacts: ImpactEffectEvent[] = [];
    createHouseCaptureSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toEqual([{ position: { x: 3, y: 4 }, type: "houseCaptured" }]);
  });

  it("reports a combatDeath impact for a walker repelled by a house's defense", () => {
    const world = new World();
    createHouse(world, "enemy", 0, 0);
    createWalker(world, "player", 0, 0, HOUSE_LEVELS.hut.defense - 1);

    const impacts: ImpactEffectEvent[] = [];
    createHouseCaptureSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toEqual([{ position: { x: 0, y: 0 }, type: "combatDeath" }]);
  });

  it("reports a houseBurned impact at the house's position when a knight burns it", () => {
    const world = new World();
    createHouse(world, "enemy", 1, 2, "castle");
    createWalker(world, "player", 1, 2, 1, "knight");

    const impacts: ImpactEffectEvent[] = [];
    createHouseCaptureSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toEqual([{ position: { x: 1, y: 2 }, type: "houseBurned" }]);
  });
});
