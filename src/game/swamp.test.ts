import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { Position, Swamp } from "./components";
import { collapseSwampsNear, createSwamp } from "./swamp";
import { SWAMP_CAPACITY, SWAMP_RADIUS } from "./constants";

describe("createSwamp", () => {
  it("places a Swamp entity at the given position with the default radius/capacity", () => {
    const world = new World();
    const entity = createSwamp(world, 3, 4);

    expect(world.get(entity, Position)).toEqual({ x: 3, y: 4 });
    expect(world.get(entity, Swamp)).toEqual({ radius: SWAMP_RADIUS, remainingCapacity: SWAMP_CAPACITY });
  });

  it("accepts an explicit radius and capacity", () => {
    const world = new World();
    const entity = createSwamp(world, 0, 0, 2.5, 9);

    expect(world.get(entity, Swamp)).toEqual({ radius: 2.5, remainingCapacity: 9 });
  });
});

describe("collapseSwampsNear", () => {
  it("destroys a swamp whose radius overlaps the earthquake's footprint", () => {
    const world = new World();
    const swamp = createSwamp(world, 5, 5, 1);

    collapseSwampsNear(world, 6, 5, 1);

    expect(world.isAlive(swamp)).toBe(false);
  });

  it("leaves a swamp alone once the two radii no longer overlap", () => {
    const world = new World();
    const swamp = createSwamp(world, 5, 5, 1);

    collapseSwampsNear(world, 20, 20, 1);

    expect(world.isAlive(swamp)).toBe(true);
  });

  it("collapses every swamp within range, not just the first", () => {
    const world = new World();
    const near = createSwamp(world, 5, 5, 1);
    const alsoNear = createSwamp(world, 5, 6, 1);
    const far = createSwamp(world, 20, 20, 1);

    collapseSwampsNear(world, 5, 5, 1);

    expect(world.isAlive(near)).toBe(false);
    expect(world.isAlive(alsoNear)).toBe(false);
    expect(world.isAlive(far)).toBe(true);
  });
});
