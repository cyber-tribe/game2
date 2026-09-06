import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { MoveTarget, Position, Walker } from "../components";
import { ROAD_SPEED_MULTIPLIER } from "../constants";
import { applyRoad, createHeightmap, type Heightmap } from "../../world/heightmap";
import { createMovementSystem, movementSystem } from "./movement";

function createWalkerAt(world: World, x: number, y: number, speed = 1) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed });
  return entity;
}

describe("movementSystem", () => {
  it("steps a walker toward its target without overshooting", () => {
    const world = new World();
    const entity = createWalkerAt(world, 0, 0, 2);
    world.add(entity, MoveTarget, { x: 10, y: 0 });

    movementSystem(world, 1);

    expect(world.get(entity, Position)).toEqual({ x: 2, y: 0 });
    expect(world.has(entity, MoveTarget)).toBe(true);
  });

  it("snaps to the target and clears MoveTarget on arrival", () => {
    const world = new World();
    const entity = createWalkerAt(world, 0, 0, 5);
    world.add(entity, MoveTarget, { x: 3, y: 4 });

    movementSystem(world, 1);

    expect(world.get(entity, Position)).toEqual({ x: 3, y: 4 });
    expect(world.has(entity, MoveTarget)).toBe(false);
  });

  it("moves diagonally along the correct heading", () => {
    const world = new World();
    const entity = createWalkerAt(world, 0, 0, Math.sqrt(2));
    world.add(entity, MoveTarget, { x: 10, y: 10 });

    movementSystem(world, 1);

    const pos = world.get(entity, Position)!;
    expect(pos.x).toBeCloseTo(1);
    expect(pos.y).toBeCloseTo(1);
  });

  it("ignores walkers that have no MoveTarget", () => {
    const world = new World();
    const entity = createWalkerAt(world, 5, 5);

    movementSystem(world, 1);

    expect(world.get(entity, Position)).toEqual({ x: 5, y: 5 });
  });
});

describe("createMovementSystem on a road", () => {
  function flatHeightmap(size: number, elevation: number): Heightmap {
    const heightmap = createHeightmap(size, size, "grass");
    for (const row of heightmap.vertices) row.fill(elevation);
    return heightmap;
  }

  /**
   * The original's 道: "上では信者の移動速度が上がる"
   * (docs/original-miracles.md #11).
   */
  it("moves a walker standing on paving faster than one on bare ground", () => {
    const heightmap = flatHeightmap(20, 5);
    applyRoad(heightmap, 5, 5, 2);
    const world = new World();
    const paved = createWalkerAt(world, 5, 5, 2);
    world.add(paved, MoveTarget, { x: 19, y: 5 });
    const bare = createWalkerAt(world, 5, 15, 2);
    world.add(bare, MoveTarget, { x: 19, y: 15 });

    createMovementSystem({ heightmap })(world, 1);

    expect(world.get(paved, Position)!.x - 5).toBeCloseTo((world.get(bare, Position)!.x - 5) * ROAD_SPEED_MULTIPLIER);
  });

  it("slows back down once the walker steps off the far end", () => {
    const heightmap = flatHeightmap(20, 5);
    applyRoad(heightmap, 5, 5, 1);
    const world = new World();
    const walker = createWalkerAt(world, 9, 5, 2);
    world.add(walker, MoveTarget, { x: 19, y: 5 });

    createMovementSystem({ heightmap })(world, 1);

    expect(world.get(walker, Position)!.x).toBeCloseTo(11);
  });

  it("walks at the plain speed with no heightmap at all", () => {
    const world = new World();
    const walker = createWalkerAt(world, 0, 0, 2);
    world.add(walker, MoveTarget, { x: 10, y: 0 });

    movementSystem(world, 1);

    expect(world.get(walker, Position)).toEqual({ x: 2, y: 0 });
  });
});
