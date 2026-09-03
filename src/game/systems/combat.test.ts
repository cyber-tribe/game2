import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { House, Owner, Position, Walker, type FactionId, type WalkerState } from "../components";
import { HOUSE_LEVELS } from "../constants";
import { houseCaptureSystem, walkerCombatSystem } from "./combat";

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

    walkerCombatSystem(world, 0);

    expect(world.isAlive(strong)).toBe(true);
    expect(world.get(strong, Walker)!.strength).toBe(3);
    expect(world.isAlive(weak)).toBe(false);
  });

  it("destroys both walkers on an exact tie", () => {
    const world = new World();
    const a = createWalker(world, "player", 0, 0, 4);
    const b = createWalker(world, "enemy", 0, 0, 4);

    walkerCombatSystem(world, 0);

    expect(world.isAlive(a)).toBe(false);
    expect(world.isAlive(b)).toBe(false);
  });

  it("does not fight walkers from the same faction", () => {
    const world = new World();
    const a = createWalker(world, "player", 0, 0, 5);
    const b = createWalker(world, "player", 0, 0, 1);

    walkerCombatSystem(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
  });

  it("does not fight enemy walkers outside combat range", () => {
    const world = new World();
    const a = createWalker(world, "player", 0, 0, 5);
    const b = createWalker(world, "enemy", 10, 10, 1);

    walkerCombatSystem(world, 0);

    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
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

    houseCaptureSystem(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "player" });
    expect(world.get(house, House)).toEqual({ level: "hut", population: 0 });
    expect(world.isAlive(attacker)).toBe(false);
  });

  it("repels a walker too weak to beat the house's defense, leaving the house untouched", () => {
    const world = new World();
    const house = createHouse(world, "enemy", 0, 0);
    const attacker = createWalker(world, "player", 0, 0, HOUSE_LEVELS.hut.defense - 1);

    houseCaptureSystem(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "enemy" });
    expect(world.get(house, House)!.population).toBe(7);
    expect(world.isAlive(attacker)).toBe(false);
  });

  it("ignores a walker's own faction's houses", () => {
    const world = new World();
    const house = createHouse(world, "player", 0, 0);
    const walker = createWalker(world, "player", 0, 0, 999);

    houseCaptureSystem(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "player" });
    expect(world.isAlive(walker)).toBe(true);
  });

  it("ignores houses outside combat range", () => {
    const world = new World();
    const house = createHouse(world, "enemy", 20, 20);
    const walker = createWalker(world, "player", 0, 0, 999);

    houseCaptureSystem(world, 0);

    expect(world.get(house, Owner)).toEqual({ faction: "enemy" });
    expect(world.isAlive(walker)).toBe(true);
  });

  it("a knight burns an enemy house down instead of capturing it, even a strong one", () => {
    const world = new World();
    const house = createHouse(world, "enemy", 0, 0, "castle");
    const knight = createWalker(world, "player", 0, 0, 1, "knight"); // far below castle's defense

    houseCaptureSystem(world, 0);

    expect(world.isAlive(house)).toBe(false);
    expect(world.isAlive(knight)).toBe(true);
  });

  it("a knight survives after burning a house and can keep marching", () => {
    const world = new World();
    createHouse(world, "enemy", 0, 0);
    const knight = createWalker(world, "player", 0, 0, 1, "knight");

    houseCaptureSystem(world, 0);

    expect(world.isAlive(knight)).toBe(true);
  });
});
