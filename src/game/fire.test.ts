import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { House, Owner, Position, Walker, type WalkerState } from "./components";
import { burnFire } from "./fire";

function createHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

function createWalker(world: World, x: number, y: number, state: WalkerState = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
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

describe("burnFire — アキレス", () => {
  /**
   * 「火が効かず焼死しない」 (docs/original-miracles.md #23) — the other
   * half of fire rain, and so the answer to a forest turned against its
   * owner (docs/original-miracles.md's 森 → 火の雨).
   */
  it("leaves an アキレス standing in the fire", () => {
    const world = new World();
    const hero = createWalker(world, 5, 5, "achilles");

    burnFire(world, [{ x: 5, y: 5 }]);

    expect(world.isAlive(hero)).toBe(true);
  });

  it("still burns every other hero", () => {
    const world = new World();
    for (const state of ["perseus", "hercules", "odysseus", "guardian"] as const) {
      createWalker(world, 5, 5, state);
    }

    burnFire(world, [{ x: 5, y: 5 }]);

    expect(world.query(Walker)).toHaveLength(0);
  });

  /** The hero survives; what they were defending does not. */
  it("burns the house an アキレス is standing on all the same", () => {
    const world = new World();
    createWalker(world, 5, 5, "achilles");
    createHouse(world, 5, 5);

    burnFire(world, [{ x: 5, y: 5 }]);

    expect(world.query(House)).toHaveLength(0);
  });
});
