import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { House, Owner, Position, Walker } from "./components";
import { burnFire } from "./fire";

function createHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

function createWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

describe("burnFire", () => {
  it("destroys a house on burned ground", () => {
    const world = new World();
    const house = createHouse(world, 5, 5);

    burnFire(world, [{ x: 5, y: 5 }]);

    expect(world.isAlive(house)).toBe(false);
  });

  it("destroys a walker on burned ground, matching by nearest vertex", () => {
    const world = new World();
    const walker = createWalker(world, 5.4, 5);

    burnFire(world, [{ x: 5, y: 5 }]);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("leaves everything on unburned ground alone", () => {
    const world = new World();
    const house = createHouse(world, 20, 20);

    burnFire(world, [{ x: 5, y: 5 }]);

    expect(world.isAlive(house)).toBe(true);
  });

  /**
   * Burned ground is an irregular region, not a disc — fire runs through
   * woodland (see applyFireRain) — which is why this takes vertices rather
   * than a centre and radius.
   */
  it("destroys what a distant arm of the fire reached", () => {
    const world = new World();
    const house = createHouse(world, 5, 30);

    burnFire(world, [
      { x: 5, y: 5 },
      { x: 5, y: 30 },
    ]);

    expect(world.isAlive(house)).toBe(false);
  });

  it("reports a burned house and a burned walker with different impact types", () => {
    const world = new World();
    createHouse(world, 5, 5);
    createWalker(world, 5, 5);
    const types: string[] = [];

    burnFire(world, [{ x: 5, y: 5 }], (event) => types.push(event.type));

    expect(new Set(types)).toEqual(new Set(["houseBurned", "combatDeath"]));
  });
});
