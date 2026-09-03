import { describe, expect, it } from "vitest";
import { defineComponent } from "./component";
import { Scheduler, type System } from "./system";
import { World } from "./world";

interface Position {
  x: number;
  y: number;
}

interface Velocity {
  dx: number;
  dy: number;
}

const Position = defineComponent<Position>("Position");
const Velocity = defineComponent<Velocity>("Velocity");

describe("World", () => {
  it("creates entities with unique ids and marks them alive", () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();

    expect(a).not.toBe(b);
    expect(world.isAlive(a)).toBe(true);
    expect(world.isAlive(b)).toBe(true);
  });

  it("adds, reads, and overwrites components", () => {
    const world = new World();
    const entity = world.createEntity();

    world.add(entity, Position, { x: 1, y: 2 });
    expect(world.has(entity, Position)).toBe(true);
    expect(world.get(entity, Position)).toEqual({ x: 1, y: 2 });

    world.add(entity, Position, { x: 5, y: 6 });
    expect(world.get(entity, Position)).toEqual({ x: 5, y: 6 });
  });

  it("removes a component without affecting other components on the same entity", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Velocity, { dx: 1, dy: 1 });

    world.remove(entity, Position);

    expect(world.has(entity, Position)).toBe(false);
    expect(world.has(entity, Velocity)).toBe(true);
  });

  it("destroys an entity and clears all of its components", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Velocity, { dx: 1, dy: 1 });

    world.destroyEntity(entity);

    expect(world.isAlive(entity)).toBe(false);
    expect(world.has(entity, Position)).toBe(false);
    expect(world.has(entity, Velocity)).toBe(false);
  });

  it("recycles destroyed entity ids", () => {
    const world = new World();
    const first = world.createEntity();
    world.destroyEntity(first);
    const second = world.createEntity();

    expect(second).toBe(first);
  });

  it("queries entities that have every requested component", () => {
    const world = new World();
    const moving = world.createEntity();
    const still = world.createEntity();

    world.add(moving, Position, { x: 0, y: 0 });
    world.add(moving, Velocity, { dx: 1, dy: 0 });
    world.add(still, Position, { x: 3, y: 3 });

    expect(world.query(Position, Velocity)).toEqual([moving]);
    expect([...world.query(Position)].sort((a, b) => a - b)).toEqual(
      [moving, still].sort((a, b) => a - b),
    );
  });

  it("never returns stale data for a destroyed entity that shares its store with a survivor", () => {
    const world = new World();
    const first = world.createEntity();
    const second = world.createEntity();
    world.add(first, Position, { x: 1, y: 1 });
    world.add(second, Position, { x: 2, y: 2 });

    world.destroyEntity(first);

    expect(world.query(Position)).toEqual([second]);
    expect(world.get(second, Position)).toEqual({ x: 2, y: 2 });
  });
});

describe("Scheduler", () => {
  it("runs registered systems in order against the world on each update", () => {
    const world = new World();
    const entity = world.createEntity();
    world.add(entity, Position, { x: 0, y: 0 });
    world.add(entity, Velocity, { dx: 2, dy: 3 });

    const movement: System = (w, dt) => {
      for (const e of w.query(Position, Velocity)) {
        const pos = w.get(e, Position)!;
        const vel = w.get(e, Velocity)!;
        w.add(e, Position, { x: pos.x + vel.dx * dt, y: pos.y + vel.dy * dt });
      }
    };

    const scheduler = new Scheduler().add(movement);
    scheduler.update(world, 1);
    scheduler.update(world, 0.5);

    expect(world.get(entity, Position)).toEqual({ x: 3, y: 4.5 });
  });
});
