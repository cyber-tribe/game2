import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { Detour, MoveTarget, Position, Walker } from "../components";
import { ROAD_SPEED_MULTIPLIER } from "../constants";
import { applyRoad, applyWall, createHeightmap, type Heightmap } from "../../world/heightmap";
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

describe("createMovementSystem against a 城壁", () => {
  function flatHeightmap(size: number, elevation: number): Heightmap {
    const heightmap = createHeightmap(size, size, "grass");
    for (const row of heightmap.vertices) row.fill(elevation);
    return heightmap;
  }

  /** A north-south wall from (x, yFrom) to (x, yTo), the way a player chains casts. */
  function wallLine(heightmap: Heightmap, x: number, yFrom: number, yTo: number): void {
    for (let y = yFrom; y <= yTo; y++) applyWall(heightmap, x, y, 0);
  }

  function run(world: World, heightmap: Heightmap, ticks: number, step = 0.25): void {
    const system = createMovementSystem({ heightmap });
    for (let i = 0; i < ticks; i++) system(world, step);
  }

  /** The original's 城壁: 「信者の進行を遮る壁」 (docs/original-miracles.md #12). */
  it("never lets an ordinary walker stand on the wall", () => {
    const heightmap = flatHeightmap(20, 5);
    wallLine(heightmap, 10, 8, 12);
    const world = new World();
    const walker = createWalkerAt(world, 5, 10, 2);
    world.add(walker, MoveTarget, { x: 15, y: 10 });

    const system = createMovementSystem({ heightmap });
    for (let i = 0; i < 200; i++) {
      system(world, 0.25);
      const pos = world.get(walker, Position)!;
      expect(heightmap.wall[Math.round(pos.y)][Math.round(pos.x)]).toBe(false);
    }
  });

  it("walks around the end of the wall and reaches the far side", () => {
    const heightmap = flatHeightmap(20, 5);
    wallLine(heightmap, 10, 8, 12);
    const world = new World();
    const walker = createWalkerAt(world, 5, 10, 2);
    world.add(walker, MoveTarget, { x: 15, y: 10 });

    run(world, heightmap, 200);

    expect(world.get(walker, Position)!.x).toBeGreaterThan(11);
  });

  it("stops committing to a side once the straight line is open again", () => {
    const heightmap = flatHeightmap(20, 5);
    wallLine(heightmap, 10, 8, 12);
    const world = new World();
    const walker = createWalkerAt(world, 5, 10, 2);
    world.add(walker, MoveTarget, { x: 15, y: 10 });

    // Nine steps of 0.5 puts the walker at the foot of the wall.
    run(world, heightmap, 10);
    expect(world.has(walker, Detour)).toBe(true);

    run(world, heightmap, 200);
    expect(world.has(walker, Detour)).toBe(false);
  });

  /** 「英雄以外は越えられない」 — the exception is the whole second half of #12. */
  it("lets a hero walk straight over it", () => {
    const heightmap = flatHeightmap(20, 5);
    wallLine(heightmap, 10, 8, 12);
    const world = new World();
    const hero = createWalkerAt(world, 5, 10, 2);
    world.add(hero, Walker, { strength: 20, state: "hercules", speed: 2 });
    world.add(hero, MoveTarget, { x: 15, y: 10 });

    run(world, heightmap, 12);

    const pos = world.get(hero, Position)!;
    expect(pos.x).toBeCloseTo(11);
    expect(pos.y).toBeCloseTo(10);
  });

  /**
   * A cast can raise stone around someone standing there. Ignoring walls
   * for that one step is what keeps that from being a way to entomb a
   * walker forever in a game where nothing else removes a wall for free.
   */
  it("lets a walker caught inside the stone walk out of it", () => {
    const heightmap = flatHeightmap(20, 5);
    applyWall(heightmap, 10, 10, 1);
    const world = new World();
    const walker = createWalkerAt(world, 10, 10, 2);
    world.add(walker, MoveTarget, { x: 15, y: 10 });

    run(world, heightmap, 200);

    expect(world.get(walker, Position)!.x).toBeGreaterThan(11);
  });

  /**
   * Local steering, not a path search (see stepAroundWalls): a walker
   * boxed in on every side simply stops, which is a fair thing for a wall
   * to be able to do.
   */
  it("stays put when every direction is walled", () => {
    const heightmap = flatHeightmap(20, 5);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        applyWall(heightmap, 10 + dx, 10 + dy, 0);
      }
    }
    const world = new World();
    const walker = createWalkerAt(world, 10, 10, 1);
    world.add(walker, MoveTarget, { x: 15, y: 10 });

    run(world, heightmap, 10, 1);

    expect(world.get(walker, Position)).toEqual({ x: 10, y: 10 });
  });
});
