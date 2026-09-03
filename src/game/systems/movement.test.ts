import { describe, expect, it } from "vitest";
import { World } from "../../ecs";
import { MoveTarget, Position, Walker } from "../components";
import { movementSystem } from "./movement";

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
