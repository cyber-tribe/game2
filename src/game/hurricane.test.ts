import { describe, expect, it } from "vitest";
import { World } from "../ecs";
import { applyEarthquake, createHeightmap, type Heightmap } from "../world/heightmap";
import { House, Owner, Position, Walker } from "./components";
import { HURRICANE_PUSH } from "./constants";
import { applyHurricane } from "./hurricane";
import { createSwamp } from "./swamp";
import { createCreviceSystem } from "./systems/crevice";
import { createSwampSystem } from "./systems/swamp";

function spawnWalker(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, Walker, { strength: 1, state: "seeking", speed: 1 });
  return entity;
}

function spawnHouse(world: World, x: number, y: number) {
  const entity = world.createEntity();
  world.add(entity, Position, { x, y });
  world.add(entity, Owner, { faction: "enemy" });
  world.add(entity, House, { level: "hut", population: 0 });
  return entity;
}

function flatHeightmap(size: number, elevation: number): Heightmap {
  const heightmap = createHeightmap(size, size, "grass");
  for (const row of heightmap.vertices) row.fill(elevation);
  return heightmap;
}

describe("applyHurricane", () => {
  it("throws a walker along the wind", () => {
    const world = new World();
    const walker = spawnWalker(world, 12, 10);

    applyHurricane(world, { x: 10, y: 10 }, 1, 0);

    expect(world.get(walker, Position)).toEqual({ x: 12 + HURRICANE_PUSH, y: 10 });
  });

  it("flattens houses in its path", () => {
    const world = new World();
    spawnHouse(world, 14, 10);

    const { destroyed } = applyHurricane(world, { x: 10, y: 10 }, 1, 0);

    expect(destroyed).toBe(1);
    expect(world.query(House)).toHaveLength(0);
  });

  it("leaves everything behind it alone — it has a direction", () => {
    const world = new World();
    const behind = spawnWalker(world, 6, 10);
    spawnHouse(world, 5, 10);

    const { blown, destroyed } = applyHurricane(world, { x: 10, y: 10 }, 1, 0);

    expect(blown).toBe(0);
    expect(destroyed).toBe(0);
    expect(world.get(behind, Position)).toEqual({ x: 6, y: 10 });
  });

  it("leaves everything beside its corridor alone", () => {
    const world = new World();
    const aside = spawnWalker(world, 14, 20);

    applyHurricane(world, { x: 10, y: 10 }, 1, 0);

    expect(world.get(aside, Position)).toEqual({ x: 14, y: 20 });
  });

  it("does not reach past its length", () => {
    const world = new World();
    const far = spawnWalker(world, 40, 10);

    applyHurricane(world, { x: 10, y: 10 }, 1, 0);

    expect(world.get(far, Position)).toEqual({ x: 40, y: 10 });
  });

  it("blows diagonally when aimed diagonally", () => {
    const world = new World();
    const walker = spawnWalker(world, 12, 12);

    applyHurricane(world, { x: 10, y: 10 }, 1, 1);

    const pos = world.get(walker, Position)!;
    expect(pos.x).toBeCloseTo(12 + HURRICANE_PUSH / Math.SQRT2);
    expect(pos.y).toBeCloseTo(12 + HURRICANE_PUSH / Math.SQRT2);
  });

  it("kills nobody by itself", () => {
    const world = new World();
    spawnWalker(world, 12, 10);

    applyHurricane(world, { x: 10, y: 10 }, 1, 0);

    expect(world.query(Walker)).toHaveLength(1);
  });
});

/**
 * The interaction the original names: 「吹き飛ばす先に沼や亀裂を用意して
 * 即死地形へ押し込む」 (docs/original-miracles.md's interaction table).
 *
 * Neither of these tests reaches into applyHurricane for a special case,
 * and that is the point — the hurricane moves people, and the hazards that
 * were already there do the rest on the next tick.
 */
describe("applyHurricane — pushed into what was waiting", () => {
  it("pushes a walker into a swamp laid downwind", () => {
    const world = new World();
    const walker = spawnWalker(world, 12, 10);
    createSwamp(world, 12 + HURRICANE_PUSH, 10);

    applyHurricane(world, { x: 10, y: 10 }, 1, 0);
    createSwampSystem()(world, 0.1);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("pushes a walker into an earthquake's crevice", () => {
    const heightmap = flatHeightmap(40, 5);
    // Aimed to run through (16, 10) — where the gust below lands the
    // walker. applyEarthquake steps before it tears, so it starts short of
    // the landing spot rather than on it.
    applyEarthquake(heightmap, 16, 8, 0, 1, 8, () => 0.5);
    const world = new World();
    const walker = spawnWalker(world, 12, 10);

    applyHurricane(world, { x: 10, y: 10 }, 1, 0);
    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.isAlive(walker)).toBe(false);
  });

  it("leaves the same walker alive when there is nothing downwind", () => {
    const heightmap = flatHeightmap(40, 5);
    const world = new World();
    const walker = spawnWalker(world, 12, 10);

    applyHurricane(world, { x: 10, y: 10 }, 1, 0);
    createSwampSystem()(world, 0.1);
    createCreviceSystem({ heightmap })(world, 0.1);

    expect(world.isAlive(walker)).toBe(true);
  });
});
