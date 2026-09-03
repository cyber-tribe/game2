import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { MoveTarget, Position, Walker } from "../components";
import { createWanderTargetSystem } from "./wanderTarget";

describe("createWanderTargetSystem", () => {
  it("assigns a target to a seeking walker that has none", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const system = createWanderTargetSystem({ radius: 4, rng: () => 0.5 });
    system(world, 1);

    expect(world.has(entity, MoveTarget)).toBe(true);
  });

  it("keeps the target within the configured radius of the walker", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 10, y: 10 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const system = createWanderTargetSystem({ radius: 3, rng: () => Math.random() });
    system(world, 1);

    const target = world.get(entity, MoveTarget)!;
    const distance = Math.hypot(target.x - 10, target.y - 10);
    expect(distance).toBeLessThanOrEqual(3);
  });

  it("does not overwrite an existing target", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
    world.add(entity, MoveTarget, { x: 99, y: 99 });

    const system = createWanderTargetSystem();
    system(world, 1);

    expect(world.get(entity, MoveTarget)).toEqual({ x: 99, y: 99 });
  });

  it("ignores walkers that are not in the seeking state", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "fighting", speed: 1 });

    const system = createWanderTargetSystem();
    system(world, 1);

    expect(world.has(entity, MoveTarget)).toBe(false);
  });
});
