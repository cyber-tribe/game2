import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { Position, Swamp } from "./components";
import { createSwamp } from "./swamp";
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
