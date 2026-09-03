import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import type { Heightmap } from "../../world/heightmap";
import { MoveTarget, Position, Walker } from "../components";
import { createWanderTargetSystem } from "./wanderTarget";

function halfWaterHeightmap(width: number, height: number, landFromX: number): Heightmap {
  const vertices = Array.from({ length: height + 1 }, () =>
    Array.from({ length: width + 1 }, (_, x) => (x >= landFromX ? 5 : 0)),
  );
  const rockHardness = Array.from({ length: height + 1 }, () => Array(width + 1).fill(0));
  return { width, height, terrain: "grass", vertices, rockHardness };
}

function queueRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

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

  it("retries past a water candidate to land on buildable ground when given a heightmap", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 5, y: 5 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const heightmap = halfWaterHeightmap(10, 10, 5); // land only where x >= 5
    // 1st attempt: due west, full radius -> clamps to x=0 (water).
    // 2nd attempt: due east, full radius -> clamps to x=10 (land).
    const rng = queueRng([0.5, 1, 0, 1]);
    const system = createWanderTargetSystem({ radius: 10, rng, heightmap });
    system(world, 1);

    expect(world.get(entity, MoveTarget)).toEqual({ x: 10, y: 5 });
  });

  it("still returns a bounded target if every retry lands in water", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 5, y: 5 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const heightmap = halfWaterHeightmap(10, 10, 999); // entirely water
    const system = createWanderTargetSystem({ radius: 10, rng: () => 0.5, maxAttempts: 3, heightmap });

    expect(() => system(world, 1)).not.toThrow();

    const target = world.get(entity, MoveTarget)!;
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.x).toBeLessThanOrEqual(10);
    expect(target.y).toBeGreaterThanOrEqual(0);
    expect(target.y).toBeLessThanOrEqual(10);
  });

  it("clamps the final target to the heightmap's bounds", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });

    const heightmap = halfWaterHeightmap(10, 10, 0); // land everywhere
    const system = createWanderTargetSystem({ radius: 10, rng: () => 0.75, heightmap });
    system(world, 1);

    const target = world.get(entity, MoveTarget)!;
    expect(target.x).toBe(0);
    expect(target.y).toBe(0);
  });
});
