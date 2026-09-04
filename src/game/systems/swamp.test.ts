import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { Owner, Position, Swamp, Walker } from "../components";
import { createSwamp } from "../swamp";
import type { ImpactEffectEvent } from "./effects";
import { createSwampSystem } from "./swamp";

function createWalker(world: World, x: number, y: number, state: "seeking" | "knight" = "seeking") {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "player" });
  world.add(entity, Walker, { strength: 1, state, speed: 1 });
  return entity;
}

describe("swampSystem", () => {
  it("drowns a walker within the swamp's radius and decrements its capacity", () => {
    const world = new World();
    const swamp = createSwamp(world, 5, 5, 1, 3);
    const walker = createWalker(world, 5.2, 5);

    createSwampSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(false);
    expect(world.isAlive(swamp)).toBe(true);
    expect(world.get(swamp, Swamp)!.remainingCapacity).toBe(2);
  });

  it("leaves a walker outside the radius untouched", () => {
    const world = new World();
    createSwamp(world, 5, 5, 1, 3);
    const walker = createWalker(world, 20, 20);

    createSwampSystem()(world, 0);

    expect(world.isAlive(walker)).toBe(true);
  });

  it("dries up and disappears once its capacity is exhausted", () => {
    const world = new World();
    const swamp = createSwamp(world, 5, 5, 1, 2);
    createWalker(world, 5, 5);
    createWalker(world, 5.1, 5);
    createWalker(world, 20, 20); // outside radius, should survive

    createSwampSystem()(world, 0);

    expect(world.isAlive(swamp)).toBe(false);
    expect(world.query(Walker)).toHaveLength(1);
  });

  it("does nothing when there is no swamp", () => {
    const world = new World();
    const walker = createWalker(world, 5, 5);

    expect(() => createSwampSystem()(world, 0)).not.toThrow();
    expect(world.isAlive(walker)).toBe(true);
  });

  it("lets a knight walk through a swamp unharmed", () => {
    const world = new World();
    const swamp = createSwamp(world, 5, 5, 1, 3);
    const knight = createWalker(world, 5, 5, "knight");

    createSwampSystem()(world, 0);

    expect(world.isAlive(knight)).toBe(true);
    expect(world.get(swamp, Swamp)!.remainingCapacity).toBe(3);
  });

  it("reports a drowned impact at the walker's position", () => {
    const world = new World();
    createSwamp(world, 5, 5, 1, 3);
    createWalker(world, 5.2, 5);

    const impacts: ImpactEffectEvent[] = [];
    createSwampSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toEqual([{ position: { x: 5.2, y: 5 }, type: "drowned" }]);
  });

  it("does not report an impact for a knight passing through", () => {
    const world = new World();
    createSwamp(world, 5, 5, 1, 3);
    createWalker(world, 5, 5, "knight");

    const impacts: ImpactEffectEvent[] = [];
    createSwampSystem({ onImpact: (event) => impacts.push(event) })(world, 0);

    expect(impacts).toHaveLength(0);
  });
});
